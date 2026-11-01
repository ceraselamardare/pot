// The proposal card (05 §4.6): the Sputnik proposal at this beat, who can decide it, and the threshold math.
// Status pill = icon + word + colour (StatusChip, mapped from Sputnik). Seats: one avatar per member in join order;
// approved = a check badge + the hidden word "approved", not yet = a dashed ring + "not yet": never colour alone.
// A 2 px ink rule after the k-th seat says "needs k". The rulebot row is the Hub's tile with its sentence.
import { Check, ListChecks } from "lucide-react"
import type { ProposalJson, VoteMeter as Meter } from "@/app/demo/_data/types"
import { Avatar } from "@/components/pot/Avatar"
import { StatusChip, type ChipStatus } from "@/components/pot/StatusChip"
import { t, type MessageKey } from "@/i18n/t"
import { cn } from "@/lib/client/cn"
import { tk } from "../copy"
import { formatUsd } from "@/lib/client/money"
import { Disclosure, HoodCard, IconTile, PAGE_NIGHT, RawJson } from "../Bits"
import { partyName, personaOf, personVM } from "../data"

const STATUS: Record<ProposalJson["status"], { chip: ChipStatus; key: MessageKey }> = {
  InProgress: { chip: "needs", key: "demo.status.in_progress" },
  Approved: { chip: "approved", key: "demo.status.approved" },
  Failed: { chip: "failed", key: "demo.status.failed" },
  Rejected: { chip: "declined", key: "demo.status.rejected" },
  Expired: { chip: "expired", key: "demo.status.expired" },
  Removed: { chip: "declined", key: "demo.status.rejected" },
  Moved: { chip: "expired", key: "demo.status.expired" },
}

function decodeB64Json(s: string): Record<string, unknown> | null {
  try {
    const bin = atob(s)
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>
  } catch {
    return null
  }
}

/** "Transfer · $84.00 USDC (test) → Maya", "Add Leo as a member", "One call to USDC (test) with 3 refunds inside". */
function kindLine(kind: unknown): { line: string; refunds: { to: string; amount: bigint }[] } {
  const k = (kind ?? {}) as Record<string, Record<string, unknown>>
  if (k.Transfer) {
    const amount = BigInt(String(k.Transfer.amount ?? "0"))
    return { line: t("demo.proposal.transfer", { amount: formatUsd(amount), name: partyName(String(k.Transfer.receiver_id)) }), refunds: [] }
  }
  if (k.AddMemberToRole) return { line: t("demo.proposal.add_member", { name: partyName(String(k.AddMemberToRole.member_id)) }), refunds: [] }
  if (k.FunctionCall) {
    const actions = (k.FunctionCall.actions ?? []) as { args: string }[]
    const refunds = actions
      .map((a) => decodeB64Json(a.args))
      .filter((a): a is Record<string, unknown> => a !== null)
      .map((a) => ({ to: String(a.receiver_id), amount: BigInt(String(a.amount ?? "0")) }))
    return { line: t("demo.proposal.call", { receiver: partyName(String(k.FunctionCall.receiver_id)), count: actions.length }), refunds }
  }
  return { line: "", refunds: [] }
}

/** The seats of the deciding role, with the "needs k" marker after the k-th one. */
export function VoteMeter({ seats: all, k }: { seats: Meter["seats"]; k: number }) {
  // approvals first (each group in join order), so the "needs k" rule reads as a line to cross
  const seats = [...all.filter((s) => s.vote === "approve"), ...all.filter((s) => s.vote !== "approve")]
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2" data-vote-meter>
      {seats.map((s, i) => {
        const persona = personaOf(s.account)
        const yes = s.vote === "approve"
        return (
          <li key={s.account} className="flex items-center gap-2">
            <span className="relative inline-grid" data-seat={yes ? "approve" : "none"}>
              {persona ? (
                <Avatar person={personVM(persona)} size="sm" className={cn(!yes && "outline-2 outline-offset-2 outline-line-strong outline-dashed")} />
              ) : (
                <IconTile className={cn(!yes && "outline-2 outline-offset-2 outline-line-strong outline-dashed")}>
                  <ListChecks aria-hidden strokeWidth={2} />
                </IconTile>
              )}
              {yes ? (
                <span className="d-pop absolute -right-1 -bottom-1 grid size-3.5 place-items-center rounded-pill bg-approved text-surface ring-2 ring-surface">
                  <Check aria-hidden className="size-2.5" strokeWidth={3} />
                </span>
              ) : null}
              <span className="sr-only">
                {partyName(s.account)} {yes ? t("demo.proposal.seat.yes") : t("demo.proposal.seat.no")}
              </span>
            </span>
            {i === k - 1 && k < seats.length ? (
              <span className="flex items-center gap-1.5 text-body-sm text-ink" data-needs>
                <span aria-hidden className="h-6 w-0.5 rounded-pill bg-ink" />
                {t("demo.proposal.needs", { k })}
              </span>
            ) : null}
          </li>
        )
      })}
      {k >= seats.length ? (
        <li className="flex items-center gap-1.5 text-body-sm text-ink" data-needs>
          <span aria-hidden className="h-6 w-0.5 rounded-pill bg-ink" />
          {t("demo.proposal.needs", { k })}
        </li>
      ) : null}
    </ol>
  )
}

export function ProposalCard({ id, proposal, meter, members }: { id: string; proposal: ProposalJson; meter: Meter; members: string[] }) {
  const st = STATUS[proposal.status]
  const { line, refunds } = kindLine(proposal.kind)
  const memberSeats: Meter["seats"] =
    meter.role === "member" ? meter.seats : members.map((account, joinIndex) => ({ account, joinIndex, vote: "none" as const }))
  const count = t("approve.progress", { count: meter.approvals, k: meter.k })
  const rulebotText = tk(`demo.proposal.rulebot.${meter.rulebot}`)
  const math =
    meter.role === "rulebot"
      ? t("demo.proposal.math.rulebot")
      : meter.rulebot === "wrong_kind"
        ? t("demo.proposal.math.call", { n: meter.members.n, k: meter.members.k })
        : t("demo.proposal.math.members", { n: meter.math.groupSize, k: meter.math.threshold })
  return (
    <HoodCard
      id={id}
      data-card="proposal"
      data-proposal={proposal.id}
      icon={
        <IconTile>
          <ListChecks aria-hidden strokeWidth={2} />
        </IconTile>
      }
      title={
        <>
          {t("demo.card.proposal", { id: proposal.id })}
          <span className="block text-body-sm font-normal text-ink-muted font-sans">{t("demo.proposal.dao")}</span>
        </>
      }
      aside={<StatusChip status={st.chip}>{tk(st.key)}</StatusChip>}
    >
      <p className="mt-3 text-body font-semibold text-ink tabular-nums" data-proposal-kind>
        {line}
      </p>
      <p className="mt-1 text-body-sm text-ink-muted tabular-nums">
        <q>{proposal.description}</q> · {t("demo.proposal.filed", { name: partyName(proposal.proposer) })}
      </p>
      {refunds.length ? (
        <ul className="mt-2 flex flex-col gap-1" data-proposal-refunds>
          {refunds.map((r) => (
            <li key={r.to} className="flex items-center gap-2 text-body-sm text-ink tabular-nums">
              {personaOf(r.to) ? <Avatar person={personVM(personaOf(r.to)!)} size="xs" /> : null}
              {t("demo.proposal.refund_row", { name: partyName(r.to), amount: formatUsd(r.amount) })}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 rounded-md border border-line p-3">
        <h4 className="text-label text-ink">{t("demo.proposal.who")}</h4>
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-col gap-2 @[28rem]/card:flex-row @[28rem]/card:items-center @[28rem]/card:justify-between">
            <p className="text-body-sm text-ink @[28rem]/card:w-36 @[28rem]/card:shrink-0">{t("demo.proposal.members", { n: meter.members.n })}</p>
            <div className="min-w-0 flex-1">
              {meter.role === "member" ? (
                <VoteMeter seats={memberSeats} k={meter.k} />
              ) : (
                <p className="text-body-sm text-ink-muted">{t("demo.proposal.members.idle")}</p>
              )}
            </div>
            {meter.role === "member" ? (
              <span className="shrink-0 self-start text-label text-ink tabular-nums @[28rem]/card:self-center" data-proposal-count>
                {count}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-3 border-t border-line pt-3">
            <span className="text-body-sm text-ink @[28rem]/card:w-36 @[28rem]/card:shrink-0">{t("demo.proposal.rulebot")}</span>
            {meter.role === "rulebot" ? (
              <VoteMeter seats={meter.seats} k={meter.k} />
            ) : (
              <IconTile className={PAGE_NIGHT.inset}>
                <ListChecks aria-hidden strokeWidth={2} />
              </IconTile>
            )}
            <span className="min-w-0 text-body-sm text-ink-muted" data-rulebot={meter.rulebot}>
              {rulebotText}
            </span>
          </div>
        </div>
      </div>

      <Disclosure summary={t("demo.proposal.how", { k: meter.k })}>
        <p className="text-body-sm text-ink tabular-nums">{math}</p>
      </Disclosure>
      <RawJson label={t("demo.card.proposal", { id: proposal.id })} value={proposal} />
    </HoodCard>
  )
}
