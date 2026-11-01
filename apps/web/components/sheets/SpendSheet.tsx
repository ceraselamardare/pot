"use client"
// Spend (ux-spec §4.9, §6.3-6.4; design-direction 02 §3-4). The rule is visible before, during and after the tap:
//  - before: a neutral RulePreview sentence under the amount (never brand-soft: that's for the real approval),
//  - during: "Checking Pot rules…" with the typing dots for at least 1.2 s,
//  - after: "Approved by Pot rules" on brand-soft + the one 600 ms burst, then "Sending…", then "$84 sent to you".
// A vote request shows "Sent to the group" and the approval timeline (the requester's approval is counted, D-61).
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
import { Sheet } from "@/components/sheets/Sheet"
import { t, tLines } from "@/i18n/t"
import { announce, useOnline } from "@/lib/client/browser"
import { requestSpend } from "@/lib/client/actions"
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
import { formatUsd, parseKeypad, type Micro } from "@/lib/client/money"
import { refundAfterSpend } from "@/lib/client/refund"
import { previewSpend } from "@/lib/client/rules"
import { RulePreview } from "@/components/sheets/RulePreview"
import { cn } from "@/lib/client/cn"

export { RulePreview }

type SpendType = "reimburse" | "pay_member"

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
  const amount = parseKeypad(value)
  const others = pot.members.filter((m) => !m.isMe)
  const to = type === "reimburse" ? me.person.id : (receiver ?? others[0]?.person.id ?? me.person.id)
  const toPerson = pot.members.find((m) => m.person.id === to)?.person ?? me.person
  const preview = previewSpend({
    amount,
    balance: pot.balance,
    rules: pot.rules,
    memberCount: pot.members.length,
    used: me.spentInstant,
    contributed: me.contributed,
    receiverIsMember: pot.members.some((m) => m.person.id === to),
  })
  const canSubmit = (preview.path === "instant" || preview.path === "vote") && online
  // R-33 M-6: once it's paid, what you'd get back if the Pot closed (only for a spend the rules would take)
  const refundAfter = amount > 0n && (preview.path === "instant" || preview.path === "vote") ? refundAfterSpend(pot, amount) : null
  const amountWhole = formatUsd(amount, "whole")
  const cta =
    preview.path === "empty"
      ? t("spend.cta.empty")
      : preview.path === "vote" || preview.path === "blocked"
        ? t("spend.cta.vote")
        : type === "pay_member"
          ? t("spend.cta.pay_member", { amount: amountWhole, name: toPerson.name })
          : t("spend.cta.instant", { amount: amountWhole })

  const reset = () => {
    dispatch({ type: "RESET" })
    setValue("")
    setType("reimburse")
    setReceiver(null)
    setCategory(null)
    setNote("")
    setNoteOpen(false)
    setTxHash(undefined)
  }
  const close = () => {
    // a running request keeps going; the feed updates (spend.slow)
    reset()
    onClose()
  }
  const submit = async () => {
    if (!canSubmit || state.tag !== "editing") return
    dispatch({ type: "SUBMIT", expected: preview.path === "instant" ? "instant" : "vote" })
    try {
      const r = await requestSpend(pot.slug, {
        amount,
        category: category ?? "other",
        note: note.trim() || undefined,
        receiver: to,
      })
      setTxHash(r.txHash)
      dispatch({ type: "RESULT", outcome: { id: r.id, path: r.path, payout: r.payout } })
      // testnet two-phase answer: the early reply says "approved", the final one says whether it was sent
      if (r.path === "instant" && r.payout === "pending") void r.final.then((payout) => dispatch({ type: "PAYOUT", payout }))
    } catch (e) {
      dispatch({ type: "ERROR", key: isTransportError(e) ? "spend.error.relayer" : "spend.error.generic" })
    }
  }

  const result = isResult(state)
  return (
    <Sheet
      open={open}
      onClose={close}
      title={t("spend.title", { potName: pot.name })}
      keyboard
      footer={
        result ? (
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
        ) : (
          <div className="flex flex-col gap-3">
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
              className="w-full disabled:border-transparent disabled:bg-surface-sunken disabled:text-ink-muted disabled:opacity-100"
            >
              {state.tag === "submittingVote" ? <TypingDots size="sm" /> : null}
              {cta}
            </Button>
            {!noteOpen && <Keypad value={value} onChange={setValue} onSubmit={submit} />}
          </div>
        )
      }
    >
      {result ? (
        <ResultCard state={state} amount={amount} category={category ?? "other"} pot={pot} receiverName={type === "pay_member" ? toPerson.name : null} txHash={txHash} />
      ) : (
        <div className="flex flex-col gap-4 pt-1">
          <Segmented<SpendType>
            label={t("spend.type.label")}
            value={type}
            onChange={setType}
            options={[
              { value: "reimburse", label: t("spend.type.reimburse") },
              { value: "pay_member", label: t("spend.type.pay_member") },
            ]}
          />
          {type === "pay_member" && (
            <div role="radiogroup" aria-label={t("spend.pay_member.label")} className="flex gap-3 overflow-x-auto pb-1">
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
          <AmountDisplay value={value} label={t("spend.amount.label")} />
          <RulePreview preview={preview} pot={pot} used={me.spentInstant} />
          {refundAfter !== null && (
            <p className="-mt-2 text-body-sm text-ink-muted tabular-nums" data-spend-refund>
              {t("spend.refund_after", { refund: formatUsd(refundAfter, "whole") })}
            </p>
          )}
          <div>
            <p className="mb-2 text-body-sm text-ink-muted" id="reason-label">
              {t("spend.reason.label")}
            </p>
            <div role="group" aria-labelledby="reason-label" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
              {CATEGORIES.map((c) => (
                <Chip key={c} selected={category === c} onClick={() => setCategory(category === c ? null : c)}>
                  {t(`spend.reason.chip.${c}`)}
                </Chip>
              ))}
            </div>
          </div>
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
}: {
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
  const sentLine = receiverName ? t("spend.sent.member", { amount: amountWhole, name: receiverName }) : t("spend.sent", { amount: amountWhole })
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
    const [title, body] =
      state.tag === "becameVote" ? tLines("spend.became_vote") : tLines("spend.vote_sent", { k: pot.k, n: pot.n })
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
        {request && <ApprovalTimeline r={request} me={pot.me?.person.id ?? null} />}
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
      {(state.tag === "sending" || state.tag === "sent") && (
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
