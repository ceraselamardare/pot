"use client"
// Spend (ux-spec §4.9, §6.3-6.4; design-direction 02 §3-4). The rule is visible before, during and after the tap:
//  - before: a neutral RulePreview sentence under the amount (never brand-soft: that's for the real approval),
//  - during: "Checking Pot rules…" with the typing dots for at least 1.2 s,
//  - after: "Approved by Pot rules" on brand-soft + the one 600 ms burst, then "Sending…", then "$84 sent to you".
// A vote request shows "Sent to the group" and the approval timeline (the requester's approval is counted, D-61).
// Two steps (2026-11-01 declutter, so a 390 × 844 phone never scrolls the main path): 1 "How much?" = the amount,
// the keypad, a compact [Scan receipt] chip by the amount and the decision in one line (a goal lock shows here,
// before anyone types); 2 "What's it for?" = the reason chips, who gets paid, the receipt in one row, the note, and
// the decision line pinned over the ask. The why (the limit, trust, what you'd get back) sits behind its ⓘ.
import { Check, Clock, X } from "lucide-react"
import { useEffect, useReducer, useRef, useState } from "react"
import { Celebration } from "@/components/money/Celebration"
import { AmountDisplay, Keypad } from "@/components/money/Keypad"
import { MoneyText } from "@/components/money/MoneyText"
import { TypingDots } from "@/components/feedback/TypingDots"
import { Avatar } from "@/components/pot/Avatar"
import { Chip, Segmented } from "@/components/pot/Controls"
import { ApprovalTimeline } from "@/components/pot/RequestCard"
import { StatusChip } from "@/components/pot/StatusChip"
import { ReceiptLink } from "@/components/receipt/ReceiptLink"
import { Button } from "@/components/ui/button"
import { Sheet, SheetBack } from "@/components/sheets/Sheet"
import { t, tLines } from "@/i18n/t"
import { announce, useOnline } from "@/lib/client/browser"
import { requestSpend, type SpendResult } from "@/lib/client/actions"
import { useRequest } from "@/lib/client/data"
import { isTransportError } from "@/lib/client/errors"
import {
  APPROVED_MS,
  MIN_CHECKING_MS,
  SENDING_MS,
  SLOW_MS,
  STILL_CHECKING_MS,
  initialSpend,
  isResult,
  spendReducer,
  type SpendState,
} from "@/lib/client/machines/spend"
import { CATEGORIES } from "@/lib/client/mock/fixtures"
import type { Category, PotVM } from "@/lib/client/mock/types"
import { formatUsd, keypadDisplay, parseKeypad, type Micro } from "@/lib/client/money"
import { refundAfterSpend } from "@/lib/client/refund"
import { previewSpend, type SpendPreview } from "@/lib/client/rules"
import { DecisionLine, RulePreview } from "@/components/sheets/RulePreview"
import { LinkShareActions, useLinkShare, type LinkShareState } from "@/components/paylink/LinkShare"
import { LinkReady, PayLinkFields, payLinksOn } from "@/components/paylink/PayLinkFields"
import { requestLinkSpend } from "@/lib/client/paylink/actions"
import { cn } from "@/lib/client/cn"
import { keptReceipt, ReceiptCard, ReceiptInputs, ReceiptStart, useReceiptSnap, type ReceiptFill } from "@/components/sheets/ReceiptSnap"
import { useReceiptsEnabled } from "@/lib/client/receipts/read"
import { pushSheetStep, replaceSheetParams, sheetStepBack, useSheetParams } from "@/lib/client/sheet"

export { RulePreview }

// pay_link (hub 1.1.0): "Someone else": the payee is whoever holds the link (components/paylink)
type SpendType = "reimburse" | "pay_member" | "pay_link"
/** ?sheet=spend&step=details: step 2 "What's it for?" */
const STEP_PARAM = "details"

export function useSpendMachine() {
  const [state, dispatch] = useReducer(spendReducer, initialSpend)
  const tag = state.tag
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    const at = (ms: number, e: Parameters<typeof dispatch>[0]) => timers.push(setTimeout(() => dispatch(e), ms))
    if (tag === "checking") {
      at(MIN_CHECKING_MS, { type: "MIN_ELAPSED" })
      at(STILL_CHECKING_MS, { type: "STILL_CHECKING" })
      at(SLOW_MS, { type: "SLOW" })
    }
    if (tag === "approved") at(APPROVED_MS, { type: "APPROVED_SHOWN" })
    if (tag === "sending") at(SENDING_MS, { type: "SENDING_SHOWN" })
    return () => timers.forEach(clearTimeout)
  }, [tag])
  return [state, dispatch] as const
}

export function SpendSheet({ pot, open, onClose }: { pot: PotVM; open: boolean; onClose: () => void }) {
  const me = pot.me!
  const online = useOnline()
  const [state, dispatch] = useSpendMachine()
  const [value, setValue] = useState("")
  const [type, setType] = useState<SpendType>("reimburse")
  const [receiver, setReceiver] = useState<string | null>(null)
  const [category, setCategory] = useState<Category | null>(null)
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState("")
  /** the request's transaction from the relay (its receipt on the result card) */
  const [txHash, setTxHash] = useState<string | undefined>()
  // pay by link: who it's for (optional) and, once sent, the link's secret (this device only)
  const [label, setLabel] = useState("")
  const [linkSecret, setLinkSecret] = useState<string | null>(null)
  const isLink = type === "pay_link"
  // two steps: 1 "How much?" (amount + keypad + Scan receipt), 2 "What's it for?" (reason, who, note, the ask).
  // Step 2 is its own history entry (?step=details), so the browser's Back and the in-sheet [Back] agree.
  const [step, setStep] = useState<1 | 2>(1)
  const { params } = useSheetParams()
  const urlStep = params.get("step") === STEP_PARAM ? 2 : 1
  const amount = parseKeypad(value)
  const others = pot.members.filter((m) => !m.isMe)
  const to = type === "reimburse" ? me.person.id : (receiver ?? others[0]?.person.id ?? me.person.id)
  const toPerson = pot.members.find((m) => m.person.id === to)?.person ?? me.person
  const goalBlocks = !!pot.goalDetail?.spendsBlocked
  const previewFor = (a: Micro) =>
    previewSpend({
      amount: a,
      balance: pot.balance,
      rules: pot.rules,
      memberCount: pot.members.length,
      used: me.spentInstant,
      contributed: me.contributed,
      // a link's payee counts as allowed (the escrow); the rules still decide instant / one OK / the group
      receiverIsMember: isLink || pot.members.some((m) => m.person.id === to),
      // hub 1.1.0: earned trust raises my limit, one OK covers the middle tier, an all-or-nothing goal holds every spend
      ...(pot.extras ? { extras: { trust: pot.extras.trust, oneOkCap: pot.extras.oneOkCap }, trustLevel: me.trust?.level ?? 0 } : {}),
      goalBlocks,
    })
  const preview = previewFor(amount)
  /** the amount can go on to step 2: something typed, and the rules could take it (not the goal, not over the balance) */
  const canNextWith = (a: Micro) => {
    const p = previewFor(a)
    return p.path === "instant" || p.path === "vote"
  }
  // the tier of the request just sent (its result card words one OK and the group differently)
  const [sentTier, setSentTier] = useState<SpendPreview["tier"]>(undefined)
  const canSubmit = (preview.path === "instant" || preview.path === "vote") && online && (!isLink || payLinksOn(pot))
  // R-33 M-6: once it's paid, what you'd get back if the Pot closed (only for a spend the rules would take)
  const refundAfter = amount > 0n && (preview.path === "instant" || preview.path === "vote") ? refundAfterSpend(pot, amount) : null
  const amountWhole = formatUsd(amount, "whole")
  const cta =
    preview.path === "empty"
      ? t("spend.cta.empty")
      : preview.reason === "goal"
        ? t("spend.goal_blocked")
        : preview.path === "vote" && preview.tier === "one_ok"
        ? t("spend.cta.one_ok")
        : preview.path === "vote" || preview.path === "blocked"
        ? t("spend.cta.vote")
        : isLink
          ? t("paylink.cta", { amount: amountWhole })
          : type === "pay_member"
          ? t("spend.cta.pay_member", { amount: amountWhole, name: toPerson.name })
          : t("spend.cta.instant", { amount: amountWhole })

  // a new opening = a fresh form (also after the browser's Back closed it); the amount can come from a link
  // (?sheet=spend&amount=84) and a link to step 2 (&step=details) opens there when it has an amount
  const result = isResult(state)
  const [filled, setFilled] = useState<ReceiptFill>({})
  // (starts closed, so a sheet that mounts open, a deep link, counts as an opening)
  const [seen, setSeen] = useState({ open: false, urlStep })
  const [opening, setOpening] = useState(0)
  const [closing, setClosing] = useState(false)
  if (seen.open !== open || seen.urlStep !== urlStep) {
    setSeen({ open, urlStep })
    if (open && !seen.open) {
      const raw = params.get("amount")
      const a = raw && /^\d{1,6}(\.\d{1,2})?$/.test(raw) && parseKeypad(raw) > 0n ? raw : ""
      dispatch({ type: "RESET" })
      setValue(a)
      setType("reimburse")
      setReceiver(null)
      setCategory(null)
      setNote("")
      setNoteOpen(false)
      setTxHash(undefined)
      setLabel("")
      setLinkSecret(null)
      setFilled({})
      setStep(urlStep === 2 && a ? 2 : 1)
      setOpening((n) => n + 1)
      setClosing(false)
    } else if (open && seen.open) {
      // the browser's Back / Forward between the steps; Back from a request's result closes the sheet
      if (result && urlStep === 1) setClosing(true)
      else setStep(urlStep === 2 && amount > 0n ? 2 : 1)
    }
  }
  useEffect(() => {
    if (closing) onClose()
  }, [closing, onClose])
  // the URL says step 2 but there's nothing to ask about yet (a link without an amount): say step 1 there too
  useEffect(() => {
    if (open && !closing && urlStep === 2 && step === 1 && !result) replaceSheetParams((p) => p.delete("step"))
  }, [open, closing, urlStep, step, result])

  // "Scan receipt": `filled` is what the last reading put in, so Remove can take back only the fields the person
  // hasn't changed since. Its state lives here, so it survives the step change.
  const receipts = useReceiptsEnabled()
  const stepRef = useRef(step)
  useEffect(() => {
    stepRef.current = step
  })
  const fillFromReceipt = (f: ReceiptFill) => {
    setFilled((x) => ({ ...x, ...f }))
    if (f.amount !== undefined) setValue(f.amount)
    if (f.category !== undefined) setCategory(f.category)
    if (f.note !== undefined) {
      setNote(f.note)
      setNoteOpen(false)
    }
  }
  const snap = useReceiptSnap({
    slug: pot.slug,
    resetKey: opening,
    onFill: fillFromReceipt,
    // a reading that fills a dollar amount the rules could take goes straight on to "What's it for?", all filled
    onRead: (f) => {
      fillFromReceipt(f)
      if (stepRef.current === 1 && f.amount !== undefined && canNextWith(parseKeypad(f.amount))) {
        next()
        return true
      }
      return false
    },
    onClear: () => {
      const clearsAmount = filled.amount !== undefined && value === filled.amount
      if (clearsAmount) setValue("")
      if (filled.category !== undefined && category === filled.category) setCategory(null)
      if (filled.note !== undefined && note === filled.note) setNote("")
      setFilled({})
      // nothing left to ask for on step 2: back to the keypad
      if (clearsAmount && stepRef.current === 2) back()
    },
  })

  const next = () => {
    setStep(2)
    if (urlStep !== 2) pushSheetStep((p) => p.set("step", STEP_PARAM))
  }
  const back = () => {
    if (urlStep === 2) sheetStepBack((p) => p.delete("step"))
    else setStep(1)
  }
  // a running request keeps going after ✕; the feed updates (spend.slow). The next opening starts fresh.
  const close = onClose

  const submit = async () => {
    if (!canSubmit || state.tag !== "editing") return
    dispatch({ type: "SUBMIT", expected: preview.path === "instant" ? "instant" : "vote" })
    setSentTier(preview.tier)
    try {
      // the receipt the person kept (never the photo): fixed now, its fingerprint goes with the request
      const receipt = receipts ? keptReceipt(snap) : null
      const input = {
        amount,
        category: category ?? "other",
        note: note.trim() || undefined,
        ...(receipt ? { receipt } : {}),
      }
      // pay by link: a fresh link key here; its secret stays on this device (lib/client/paylink)
      let r: SpendResult
      if (isLink) {
        const lr = await requestLinkSpend(pot.slug, { ...input, label })
        setLinkSecret(lr.secret)
        r = lr
      } else r = await requestSpend(pot.slug, { ...input, receiver: to })
      setTxHash(r.txHash)
      dispatch({ type: "RESULT", outcome: { id: r.id, path: r.path, payout: r.payout } })
      // testnet two-phase answer: the early reply says "approved", the final one says whether it was sent
      if (r.path === "instant" && r.payout === "pending") void r.final.then((payout) => dispatch({ type: "PAYOUT", payout }))
    } catch (e) {
      dispatch({ type: "ERROR", key: isTransportError(e) ? "spend.error.relayer" : "spend.error.generic" })
    }
  }

  // pay by link: the Share card (body in the result, actions in the footer) once the link holds the money
  const linkId = isLink && "outcome" in state && state.outcome ? state.outcome.id : null
  const linkReq = useRequest(pot.slug, linkId)
  const share = useLinkShare({
    slug: pot.slug,
    requestId: linkId ?? 0,
    secret: linkSecret ?? "",
    amount,
    potName: pot.name,
    from: me.person.name,
    label: linkReq?.link?.label ?? null,
    expiresAt: linkReq?.link?.expiresAt ?? 0,
  })
  const linkReady = isLink && !!linkSecret && state.tag === "sent"
  const decision = (
    <DecisionLine
      preview={preview}
      pot={pot}
      used={me.spentInstant}
      details={
        refundAfter !== null
          ? [
              <p key="refund" className="tabular-nums" data-spend-refund>
                {t("spend.refund_after", { refund: formatUsd(refundAfter, "whole") })}
              </p>,
            ]
          : []
      }
    />
  )
  const primaryClass = "w-full disabled:border-transparent disabled:bg-surface-sunken disabled:text-ink-muted disabled:opacity-100"
  const canNext = canNextWith(amount)
  return (
    <Sheet
      open={open}
      onClose={close}
      title={t("spend.title", { potName: pot.name })}
      keyboard
      stepKey={step}
      footer={
        result && linkReady ? (
          <div className="flex flex-col gap-2">
            <LinkShareActions s={share} />
            <Button variant="ghost" className="w-full" onClick={close}>
              {t("spend.done")}
            </Button>
          </div>
        ) : result ? (
          state.tag === "sent" ||
          state.tag === "voteSent" ||
          state.tag === "becameVote" ||
          state.tag === "approvedNotSent" ||
          state.tag === "refused" ||
          (state.tag === "sending" && state.shown) ||
          (state.tag === "checking" && state.slow) ? (
            <Button variant="primary" className="w-full" onClick={close}>
              {t("spend.done")}
            </Button>
          ) : null
        ) : step === 1 ? (
          <div className="flex flex-col gap-3" data-spend-step="1">
            <Button variant="primary" disabled={!canNext} onClick={next} className={primaryClass} data-spend-next>
              {preview.reason === "goal" ? t("spend.goal_blocked") : t("spend.next")}
            </Button>
            <Keypad value={value} onChange={setValue} onSubmit={() => canNext && next()} disabled={goalBlocks} />
          </div>
        ) : (
          <div className="flex flex-col gap-2" data-spend-step="2">
            {decision}
            {state.tag === "editing" && state.error && (
              <p role="alert" className="flex items-start gap-2 text-body-sm text-ink">
                <X aria-hidden className="mt-0.5 size-4 shrink-0 text-declined" strokeWidth={2.5} />
                {t(state.error)}
              </p>
            )}
            {!online && <p className="text-body-sm text-ink-muted">{t("spend.offline")}</p>}
            <Button
              variant="primary"
              disabled={!canSubmit || state.tag === "submittingVote"}
              aria-busy={state.tag === "submittingVote" || undefined}
              onClick={submit}
              className={cn("mt-1", primaryClass)}
            >
              {state.tag === "submittingVote" ? <TypingDots size="sm" /> : null}
              {cta}
            </Button>
            <SheetBack onClick={back} disabled={state.tag === "submittingVote"} />
          </div>
        )
      }
    >
      {receipts && <ReceiptInputs snap={snap} />}
      {result ? (
        <ResultCard state={state} amount={amount} category={category ?? "other"} pot={pot} receiverName={type === "pay_member" ? toPerson.name : null} txHash={txHash} tier={sentTier} link={isLink ? (linkReady ? share : "pending") : null} />
      ) : step === 1 ? (
        <div className="flex flex-col items-center gap-4 pt-1" data-spend-body="1">
          <AmountDisplay value={value} label={t("spend.amount.label")} />
          {receipts && !goalBlocks && <ReceiptStart snap={snap} />}
          <div className="w-full">{decision}</div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 pt-1" data-spend-body="2">
          <p data-money data-spend-amount className="font-display text-title text-ink tabular-nums">
            <span className="sr-only">{t("spend.amount.label")} </span>
            {keypadDisplay(value)}
          </p>
          <div>
            <h3 id="reason-label" data-step-heading tabIndex={-1} className="mb-2 text-body-sm text-ink-muted outline-none">
              {t("spend.reason.label")}
            </h3>
            <div role="group" aria-labelledby="reason-label" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
              {CATEGORIES.map((c) => (
                <Chip key={c} selected={category === c} onClick={() => setCategory(category === c ? null : c)}>
                  {t(`spend.reason.chip.${c}`)}
                </Chip>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-body-sm text-ink-muted" aria-hidden>
              {t("paylink.who.label")}
            </p>
            <Segmented<SpendType>
              label={t("paylink.who.label")}
              value={type}
              onChange={setType}
              options={[
                { value: "reimburse", label: t("paylink.who.me") },
                { value: "pay_member", label: t("paylink.who.member") },
                { value: "pay_link", label: t("paylink.who.link") },
              ]}
            />
          </div>
          {type === "pay_member" && (
            <div role="radiogroup" aria-label={t("spend.pay_member.label")} className="-mt-1 flex gap-3 overflow-x-auto pb-1">
              {others.map((m) => {
                const on = m.person.id === to
                return (
                  <button
                    key={m.person.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setReceiver(m.person.id)}
                    className="flex min-w-16 flex-col items-center gap-1 rounded-md p-1"
                  >
                    <span className={cn("relative rounded-pill p-0.5", on ? "ring-2 ring-ink" : "ring-2 ring-transparent")}>
                      <Avatar person={m.person} size="lg" />
                      {on && (
                        <span className="absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-pill bg-ink text-surface">
                          <Check aria-hidden className="size-3" strokeWidth={3} />
                        </span>
                      )}
                    </span>
                    <span className="text-body-sm text-ink">{m.person.name}</span>
                  </button>
                )
              })}
            </div>
          )}
          {isLink && <PayLinkFields pot={pot} label={label} onLabel={setLabel} />}
          {receipts && <ReceiptCard snap={snap} />}
          {noteOpen ? (
            <label className="flex flex-col gap-1.5">
              <span className="text-body-sm text-ink-muted">{t("spend.note.label")}</span>
              <input
                autoFocus
                value={note}
                maxLength={80}
                enterKeyHint="done"
                onChange={(e) => setNote(e.target.value)}
                onBlur={() => setNoteOpen(note.trim().length > 0)}
                placeholder={t("spend.note.placeholder")}
                className="h-13 rounded-sm border border-line-strong bg-surface-sunken px-3 text-body text-ink placeholder:text-ink-muted"
              />
            </label>
          ) : (
            <button type="button" onClick={() => setNoteOpen(true)} className="-ml-1 min-h-11 self-start rounded-sm px-1 text-label text-link underline-offset-4 hover:underline">
              {note.trim() ? note : `+ ${t("spend.note.add")}`}
            </button>
          )}
        </div>
      )}
    </Sheet>
  )
}

function ResultCard({
  state,
  amount,
  category,
  pot,
  receiverName,
  txHash,
  tier,
  link,
}: {
  /** hub 1.1.0: the tier the request was sent in (one OK words its result differently) */
  tier?: SpendPreview["tier"]
  /** pay by link: the Share card once the link holds the money ("pending" until then); null for other spends */
  link?: LinkShareState | "pending" | null
  state: SpendState
  amount: Micro
  category: Category
  pot: PotVM
  receiverName: string | null
  /** the relay's transaction for this request (a quiet receipt once it's settled) */
  txHash?: string
}) {
  const statusRef = useRef<HTMLParagraphElement>(null)
  const outcome = "outcome" in state ? state.outcome : null
  const request = useRequest(pot.slug, outcome?.id ?? null)
  const amountWhole = formatUsd(amount, "whole")
  const sentLine = link
    ? t("paylink.ready.title", { amount: amountWhole })
    : receiverName
      ? t("spend.sent.member", { amount: amountWhole, name: receiverName })
      : t("spend.sent", { amount: amountWhole })
  const tag = state.tag
  useEffect(() => {
    if (tag === "sent") {
      announce(`${t("spend.approved")}. ${sentLine}.`) // the one announcement for the whole beat (ux-spec §6.3)
      statusRef.current?.focus()
    }
    if (tag === "voteSent" || tag === "becameVote") statusRef.current?.focus()
    if (tag === "refused") {
      announce(tLines("spend.refused").join(". "))
      statusRef.current?.focus()
    }
  }, [tag, sentLine])

  if (state.tag === "refused") {
    const [title, body] = tLines("spend.refused")
    return (
      <div className="flex flex-col gap-5 pt-2" data-spend-result="refused">
        <div className="flex flex-col items-center gap-1 text-center">
          <MoneyText micro={amount} variant="hero" className="text-ink-muted" strike />
          <span className="text-body-sm text-ink-muted">{t(`spend.reason.chip.${category}`)}</span>
        </div>
        <div className="flex items-start gap-3 rounded-md bg-surface-sunken p-3">
          <X aria-hidden className="mt-0.5 size-5 shrink-0 text-declined" strokeWidth={2.5} />
          <div>
            <p ref={statusRef} tabIndex={-1} className="text-label text-ink outline-none">
              {title}
            </p>
            {body && <p className="mt-0.5 text-body-sm text-ink-muted">{body}</p>}
          </div>
        </div>
      </div>
    )
  }

  if (state.tag === "voteSent" || state.tag === "becameVote") {
    const oneOk = (request?.tier ?? tier) === "one_ok"
    const [title, body] = link
      ? oneOk
        ? tLines("paylink.one_ok_sent")
        : tLines("paylink.vote_sent", { k: pot.k, n: pot.n })
      : state.tag === "becameVote" && !oneOk
        ? tLines("spend.became_vote")
        : oneOk
          ? tLines("spend.one_ok_sent")
          : tLines("spend.vote_sent", { k: pot.k, n: pot.n })
    return (
      <div className="flex flex-col gap-5 pt-2" data-spend-result="vote">
        <div className="flex flex-col items-center gap-1 text-center">
          <MoneyText micro={amount} variant="hero" className="text-ink" />
          <span className="text-body-sm text-ink-muted">{t(`spend.reason.chip.${category}`)}</span>
        </div>
        <div className="flex items-start gap-3 rounded-md bg-surface-sunken p-3">
          <Clock aria-hidden className="mt-0.5 size-5 shrink-0 text-waiting" strokeWidth={2.25} />
          <div>
            <p ref={statusRef} tabIndex={-1} className="text-label text-ink outline-none">
              {title}
            </p>
            {body && <p className="mt-0.5 text-body-sm text-ink-muted">{body}</p>}
          </div>
        </div>
        {request && !oneOk && <ApprovalTimeline r={request} me={pot.me?.person.id ?? null} />}
        <ReceiptLink txHash={txHash ?? request?.txHash} what={title} className="self-center" />
      </div>
    )
  }

  const checking = state.tag === "checking"
  const approvedish = state.tag === "approved" || state.tag === "sending" || state.tag === "sent" || state.tag === "approvedNotSent"
  return (
    <div className="flex flex-col gap-5 pt-2" aria-busy={checking || undefined} data-spend-result={state.tag}>
      <div className="flex flex-col items-center gap-1 text-center">
        <MoneyText micro={amount} variant="hero" className="text-ink" />
        <span className="text-body-sm text-ink-muted">{t(`spend.reason.chip.${category}`)}</span>
      </div>
      <div
        className={cn(
          "relative flex min-h-16 items-center gap-3 rounded-md px-4 py-3 transition-colors duration-200 ease-standard",
          approvedish ? "bg-brand-soft" : "bg-surface-sunken",
        )}
        data-capsule
      >
        <Celebration play={state.tag === "approved"} />
        {checking ? (
          <>
            <TypingDots still={state.still} className="text-ink-muted" />
            <p className="text-label text-ink">{state.still ? t("spend.still_checking") : t("spend.checking")}</p>
          </>
        ) : (
          <>
            <span className="pot-pop grid size-7 shrink-0 place-items-center rounded-pill bg-surface">
              <Check aria-hidden className="size-5 text-approved" strokeWidth={2.75} />
            </span>
            <div>
              <p className="text-label text-ink">{t("spend.approved")}</p>
              <p className="text-body-sm text-ink-muted">{t("feed.instant.rule", { instantLimit: formatUsd(pot.rules.instantCap, "whole") })}</p>
            </div>
          </>
        )}
      </div>
      {checking && state.slow && <p className="text-center text-body-sm text-ink-muted">{t("spend.slow")}</p>}
      {link && link !== "pending" && state.tag === "sent" ? (
        <LinkReady s={link} statusRef={statusRef} />
      ) : link && (state.tag === "sending" || state.tag === "sent") ? (
        <div className="flex items-center justify-between gap-3 px-1">
          <p ref={statusRef} tabIndex={-1} className="text-body text-ink outline-none" data-spend-status>
            {t("paylink.checking")}
          </p>
          <StatusChip status="sending" />
        </div>
      ) : null}
      {!link && (state.tag === "sending" || state.tag === "sent") && (
        <div className="flex items-center justify-between gap-3 px-1">
          <p ref={statusRef} tabIndex={-1} className="text-body text-ink outline-none" data-spend-status>
            {state.tag === "sent"
              ? sentLine
              : receiverName
                ? t("spend.sending.member", { amount: amountWhole, name: receiverName })
                : t("spend.sending", { amount: amountWhole })}
          </p>
          <StatusChip status={state.tag === "sent" ? "sent" : "sending"} />
        </div>
      )}
      {state.tag === "sent" && <ReceiptLink txHash={txHash ?? request?.txHash} what={sentLine} className="self-center" />}
      {state.tag === "approvedNotSent" && (
        <div className="flex items-start gap-3 rounded-md bg-surface-sunken p-3">
          <X aria-hidden className="mt-0.5 size-5 shrink-0 text-declined" strokeWidth={2.5} />
          <div>
            <p ref={statusRef} tabIndex={-1} className="text-label text-ink outline-none">
              {t("feed.failed", { amount: amountWhole })}
            </p>
            <p className="text-body-sm text-ink-muted">{t("feed.failed.sub")}</p>
          </div>
        </div>
      )}
    </div>
  )
}
