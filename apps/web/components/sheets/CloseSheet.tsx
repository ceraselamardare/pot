"use client"
// Close the Pot (P-9; ux-spec §4.14; design-direction 02 §7). One sheet (?sheet=close), four faces:
//  - propose: what each person would get back (hub preview_close / the sdk prorata twin) in a RefundTable,
//    the remainder rule, open requests, "what happens next", then [Ask the group to close] (propose_close + the
//    asker's own approval) and a named way out, [Keep the Pot open]. Money that moved in the last minute →
//    ERR_POT_BUSY → `close.busy` + [Try again]; a close already in flight → `close.in_flight`;
//  - vote: what the group is approving, decoded from the close proposal itself, [Approve closing] (a 300 Tgas
//    vote on its FunctionCall kind) and [Say no];
//  - waiting: "Sent to the group. Your approval is counted. It needs 1 more." + the ApprovalTimeline;
//  - closed: a calm moment (no burst: one celebration only), the glyph with a check, and honest copy: the money
//    is in your Pot account; there is no cash-out in the MVP.
import { Check, Clock, Info, X } from "lucide-react"
import { useReducer } from "react"
import { Glyph } from "@/components/brand/Glyph"
import { inWords } from "@/components/pot/Feed"
import { RefundTable, type RefundRow } from "@/components/pot/RefundTable"
import { ApprovalTimeline } from "@/components/pot/RequestCard"
import { Button } from "@/components/ui/button"
import { Sheet } from "@/components/sheets/Sheet"
import { t, type MessageKey } from "@/i18n/t"
import { announce, useOnline } from "@/lib/client/browser"
import { proposeClose, voteClose } from "@/lib/client/actions"
import { ActionError, isTransportError } from "@/lib/client/errors"
import type { PotVM } from "@/lib/client/mock/types"
import { formatUsd } from "@/lib/client/money"
import { useNow } from "@/lib/client/time"

type ErrorKey = "close.busy" | "close.error" | "close.in_flight" | "close.cooldown" | "close.payouts_pending" | "close.nothing" | "close.links_pending" | "relayer.cap"

type Phase =
  | { tag: "idle" }
  | { tag: "busy"; what: "ask" | "approve" | "decline" }
  | { tag: "error"; key: ErrorKey }
  | { tag: "sent" }
  | { tag: "voted" }
  | { tag: "declined" }
  | { tag: "done" }

type Ev = { type: "set"; phase: Phase } | { type: "reset" }
const reducer = (_: Phase, e: Ev): Phase => (e.type === "reset" ? { tag: "idle" } : e.phase)

/** ERR_* (inner failure) or relay reason → the sheet's copy. */
export function closeErrorKey(e: unknown): ErrorKey {
  const code = e instanceof ActionError ? e.reason : ""
  switch (code) {
    case "ERR_POT_BUSY":
      return "close.busy"
    case "ERR_CLOSE_IN_PROGRESS":
      return "close.in_flight"
    case "ERR_CLOSE_COOLDOWN":
      return "close.cooldown"
    case "ERR_PAYOUTS_PENDING":
      return "close.payouts_pending"
    case "ERR_NO_CONTRIBUTIONS":
      return "close.nothing"
    case "ERR_LINKS_PENDING":
      return "close.links_pending"
  }
  if (e instanceof ActionError && e.cls === "rate_limited") return "relayer.cap"
  return "close.error"
}

export function CloseSheet({ pot, open, onClose }: { pot: PotVM; open: boolean; onClose: () => void }) {
  const online = useOnline()
  const now = useNow()
  const [phase, dispatch] = useReducer(reducer, { tag: "idle" })
  const close = pot.close ?? null
  const me = pot.me?.person.id ?? null
  const live = close && close.status === "needs"
  const mode: "propose" | "vote" | "waiting" | "closed" =
    pot.status === "closed" || phase.tag === "done"
      ? "closed"
      : phase.tag === "sent" || phase.tag === "voted" || phase.tag === "declined" || (live && (close.mine || close.myVote !== null))
        ? "waiting"
        : live
          ? "vote"
          : "propose"

  const putIn = (id: string) => pot.members.find((m) => m.person.id === id)?.contributed ?? null
  const rows: RefundRow[] =
    (mode === "vote" || mode === "waiting" || (mode === "closed" && close?.status === "approved")) && close && close.payouts.length
      ? withEveryone(pot, close.payouts.map((p) => ({ person: p.person, putIn: putIn(p.person.id), back: p.amount })))
      : pot.closePreview && mode === "propose"
        ? withEveryone(pot, pot.closePreview.payouts.map((p) => ({ person: p.person, putIn: putIn(p.person.id), back: p.amount })))
        : pot.members.map((m) => ({ person: m.person, putIn: m.contributed, back: m.getsBack }))
  const myRefund = rows.find((r) => r.person.id === me)?.back ?? 0n

  const done = () => {
    dispatch({ type: "reset" })
    onClose()
  }

  const ask = async () => {
    if (!online || phase.tag === "busy") return
    dispatch({ type: "set", phase: { tag: "busy", what: "ask" } })
    try {
      const r = await proposeClose(pot.slug)
      if (r.status === "approved") {
        announce(t("close.done.self", { refund: formatUsd(myRefund) }))
        dispatch({ type: "set", phase: { tag: "done" } })
      } else {
        announce(t("close.sent", { remaining: Math.max(0, pot.k - 1) }))
        dispatch({ type: "set", phase: { tag: "sent" } })
      }
    } catch (e) {
      dispatch({ type: "set", phase: { tag: "error", key: isTransportError(e) && !(e instanceof ActionError && e.cls === "rate_limited") ? "close.error" : closeErrorKey(e) } })
    }
  }

  const cast = async (v: "Approve" | "Reject") => {
    if (!close || !online || phase.tag === "busy") return
    dispatch({ type: "set", phase: { tag: "busy", what: v === "Approve" ? "approve" : "decline" } })
    if (v === "Approve") announce(t("approve.optimistic", { count: close.approvals.length + 1, k: close.k }))
    try {
      const r = await voteClose(pot.slug, close.proposalId, v)
      if (r === "approved") {
        announce(t("close.done.self", { refund: formatUsd(myRefund) }))
        dispatch({ type: "set", phase: { tag: "done" } })
      } else if (v === "Reject" || r === "declined") {
        announce(t("close.declined.self"))
        dispatch({ type: "set", phase: { tag: "declined" } })
      } else dispatch({ type: "set", phase: { tag: "voted" } })
    } catch (e) {
      dispatch({ type: "set", phase: { tag: "error", key: closeErrorKey(e) } })
    }
  }

  const blockedKey: MessageKey | null =
    mode !== "propose"
      ? null
      : pot.closingInFlight
        ? "close.in_flight"
        : pot.balance <= 0n
          ? "close.nothing"
          : pot.closePreview?.blockedReason === "payouts_pending"
            ? "close.payouts_pending"
            : pot.closePreview?.blockedReason === "links_pending"
              ? "close.links_pending"
              : null

  const title =
    mode === "closed"
      ? t("close.done.title")
      : (mode === "vote" || (mode === "waiting" && !close?.mine && phase.tag !== "sent")) && close
        ? t("close.approve.title", { name: close.proposer.name, potName: pot.name })
        : t("close.title", { potName: pot.name })
  const busy = phase.tag === "busy"

  const footer =
    mode === "propose" ? (
      <div className="flex flex-col gap-2">
        <ErrorLine phase={phase} potName={pot.name} />
        {blockedKey && phase.tag !== "error" && (
          <p className="flex items-start gap-2 text-body-sm text-ink" data-close-blocked={blockedKey}>
            <Clock aria-hidden className="mt-0.5 size-4 shrink-0 text-waiting" strokeWidth={2.25} />
            {t(blockedKey as "close.in_flight")}
          </p>
        )}
        <Button
          variant="primary"
          className="w-full"
          onClick={ask}
          disabled={busy || !!blockedKey}
          aria-disabled={!online || undefined}
          aria-busy={busy || undefined}
          data-close-cta
        >
          {phase.tag === "error" && phase.key === "close.busy" ? t("close.retry") : t("close.cta")}
        </Button>
        <Button variant="ghost" className="w-full" onClick={done}>
          {t("close.keep")}
        </Button>
      </div>
    ) : mode === "vote" ? (
      <div className="flex flex-col gap-2">
        <ErrorLine phase={phase} potName={pot.name} />
        <Button variant="primary" className="w-full" onClick={() => cast("Approve")} disabled={busy} aria-busy={(busy && phase.what === "approve") || undefined} data-close-approve>
          {busy && phase.what === "approve" ? t("approve.cta.approving") : t("close.approve.cta")}
        </Button>
        <Button className="w-full" onClick={() => cast("Reject")} disabled={busy} data-close-decline>
          {t("close.decline.cta")}
        </Button>
      </div>
    ) : (
      <Button variant="primary" className="w-full" onClick={done} data-close-done>
        {t("spend.done")}
      </Button>
    )

  return (
    <Sheet open={open} onClose={done} title={title} label={title} footer={footer}>
      <div className="flex flex-col gap-4 pt-1" data-close-sheet={mode}>
        {mode === "closed" ? (
          <ClosedMoment refund={myRefund} contributed={pot.me?.contributed ?? 0n} />
        ) : (
          <>
            {mode === "propose" && <p className="text-body text-ink">{t("close.body")}</p>}
            {mode === "vote" && <p className="text-body text-ink">{t("close.approve.refund", { refund: formatUsd(myRefund) })}</p>}
            <p className="text-body-sm text-ink-muted">{t("close.math", { balance: formatUsd(rows.reduce((s, r) => s + r.back, 0n)) })}</p>
          </>
        )}

        <RefundTable rows={rows} me={me} caption={mode === "closed" ? t("close.table.caption.done") : t("close.table.caption")} />

        {mode === "propose" && pot.closePreview && pot.closePreview.dust > 0n && pot.lastContributor && (
          <p className="text-body-sm text-ink-muted">{t("close.dust", { lastContributor: pot.closePreview.dustTo?.name ?? pot.lastContributor.name })}</p>
        )}
        {mode === "propose" && (pot.closePreview?.openRequests ?? 0) > 0 && (
          <p className="text-body-sm text-ink">{t("close.open_requests", { n: pot.closePreview!.openRequests })}</p>
        )}
        {(mode === "propose" || mode === "vote") && (
          <p className="flex items-start gap-2 rounded-md bg-surface-sunken p-3 text-body-sm text-ink">
            <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-ink" strokeWidth={2} />
            {t("close.next")}
          </p>
        )}

        {mode === "waiting" && (
          <p className="flex items-start gap-2 rounded-md bg-surface-sunken p-3 text-body text-ink" data-close-status="sent">
            {phase.tag === "declined" || close?.myVote === "Reject" ? (
              <>
                <X aria-hidden className="mt-0.5 size-5 shrink-0 text-declined" strokeWidth={2.5} />
                {t("close.declined.self")}
              </>
            ) : (
              <>
                <Clock aria-hidden className="mt-0.5 size-5 shrink-0 text-waiting" strokeWidth={2.25} />
                {close?.mine || phase.tag === "sent"
                  ? t("close.sent", { remaining: Math.max(0, (close?.k ?? pot.k) - (close?.approvals.length ?? 1)) })
                  : t("approve.optimistic", { count: close?.approvals.length ?? 0, k: close?.k ?? pot.k })}
              </>
            )}
          </p>
        )}
        {(mode === "vote" || mode === "waiting") && close && (
          <>
            <ApprovalTimeline
              r={{ approvals: close.approvals, declines: close.declines ?? [], pending: close.pending ?? [], requester: close.proposer, k: close.k }}
              me={me}
              optimistic={busy && phase.what === "approve"}
            />
            {close.expiresAt && (
              <p className="text-body-sm text-ink-muted">{t("approve.expires", { relativeTime: inWords(close.expiresAt, now) })}</p>
            )}
          </>
        )}
      </div>
    </Sheet>
  )
}

/** Everyone who put money in appears, even with a $0.00 payout (the hub omits zero transfers). */
function withEveryone(pot: PotVM, rows: RefundRow[]): RefundRow[] {
  const out = [...rows]
  for (const m of pot.members) if (!out.some((r) => r.person.id === m.person.id)) out.push({ person: m.person, putIn: m.contributed, back: 0n })
  return out
}

function ErrorLine({ phase, potName }: { phase: Phase; potName: string }) {
  if (phase.tag !== "error") return null
  return (
    <p role="alert" className="flex items-start gap-2 text-body-sm text-ink" data-close-error={phase.key}>
      <X aria-hidden className="mt-0.5 size-4 shrink-0 text-declined" strokeWidth={2.5} />
      {phase.key === "close.busy" ? t("close.busy", { potName }) : t(phase.key as "close.error")}
    </p>
  )
}

/** The calm closed moment: no burst. The glyph (eggplant Day, marigold Night) with an `approved` check badge. */
export function ClosedMoment({ refund, contributed }: { refund: bigint; contributed: bigint }) {
  return (
    <div className="flex flex-col items-center gap-3 py-2 text-center" data-close-status="done">
      <span className="relative inline-block">
        <Glyph className="h-16 w-auto" />
        <span className="absolute -right-2 -bottom-1 grid size-7 place-items-center rounded-pill bg-approved text-surface ring-2 ring-surface">
          <Check aria-hidden className="size-4" strokeWidth={3} />
        </span>
      </span>
      <p className="text-body text-ink" data-close-refund>
        {contributed > 0n || refund > 0n ? t("close.done.amount", { refund: formatUsd(refund) }) : t("close.done.none")}
      </p>
      {refund > 0n && <p className="max-w-80 text-body-sm text-ink-muted">{t("close.done.where")}</p>}
    </div>
  )
}
