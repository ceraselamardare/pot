// The receipt route (05 §4.3): what happened on NEAR, one receipt at a time. Two drawings of the same receipts:
//  - The ordered list (`<ol>`, one `<li>` per receipt) is the accessible version and the narrow layout. Each item
//    reads "3 · Pot Hub → USDC", then the call, then its gas/deposit/result chips; a callback is indented and says
//    where it comes back from. Above 32 rem of card width it stays in the DOM, visually hidden (screen readers and
//    the no-JS HTML keep it), and the lane diagram takes over.
//  - The lane diagram (aria-hidden, card ≥ 32 rem) is a sequence diagram meant for a non-engineer:
//    · lane heads on top (sticky under the page header while a long chain scrolls), one per account in the
//      transaction in a fixed order (Phone, Relayer, the person, Pot Hub, Pot, USDC), each with a 1 px lifeline.
//      The Pot Hub's head gets the landing's 4 px marigold top edge: the only marigold in the hood.
//    · each receipt is a generous row: an arrow from the caller's lane to the callee's, its label centred ON the
//      arrow (above it) in an opaque chip that sits in front of the lifelines (so a line never runs through text);
//      a batch lists its actions stacked inside that chip; gas, deposit and result sit under the arrow, centred.
//    · a callback (`.then`) is drawn as a dashed RETURN arrow, from the account that answered back to the one that
//      asked, with a "callback" tag.
//    · the receipt just before this step's slice is shown first, dimmed ("before this step"), so every slice starts
//      from where the last one stopped; the current step's arrows carry a marigold trace (demo.css).
// Gas refunds hide in a closed <details>.
import { Banknote, Check, CornerDownLeft, Fuel, ListChecks, Plus, Send, Smartphone, Users } from "lucide-react"
import { Fragment, type CSSProperties, type ReactNode } from "react"
import { MoneyText } from "@/components/money/MoneyText"
import { Avatar } from "@/components/pot/Avatar"
import { t } from "@/i18n/t"
import { cn } from "@/lib/client/cn"
import { Disclosure, HoodCard, IconTile, PAGE_NIGHT, SimChip } from "../Bits"
import { nearOf, partyName, partyOf, personVM, shortHash, tgasOf } from "../data"
import type { Receipt, ReceiptAction, SimTx } from "@/app/demo/_data/types"

type LaneKind = "device" | "relayer" | "person" | "hub" | "pot" | "usdc" | "other"
interface Lane {
  account: string
  kind: LaneKind
}

const ORDER: Record<LaneKind, number> = { device: 0, relayer: 1, person: 2, hub: 3, pot: 4, usdc: 5, other: 6 }
const DEVICE = "device"
/** not copy: the endpoint and an arrow glyph */
const RELAY_POST = "POST /api/relay"
const ARROW = "→"

function laneKind(account: string): LaneKind {
  if (account === DEVICE) return "device"
  const p = partyOf(account)
  if (p.kind === "person") return "person"
  if (p.kind === "relayer" || p.kind === "hub" || p.kind === "pot" || p.kind === "usdc") return p.kind
  return "other"
}

export function lanesOf(tx: SimTx): Lane[] {
  const accts = new Set<string>()
  if (tx.kind === "delegate") accts.add(DEVICE)
  for (const r of tx.receipts) {
    if (r.refund) continue
    if (r.predecessor !== "system") accts.add(r.predecessor)
    accts.add(r.receiver)
  }
  return [...accts].map((account) => ({ account, kind: laneKind(account) })).sort((a, b) => ORDER[a.kind] - ORDER[b.kind])
}

function LaneIcon({ account, small }: { account: string; small?: boolean }) {
  const p = partyOf(account)
  const kind = laneKind(account)
  if (p.kind === "person") return <Avatar person={personVM(p.persona)} size="xs" />
  const Icon = kind === "device" ? Smartphone : kind === "relayer" ? Send : kind === "hub" ? ListChecks : kind === "pot" ? Users : Banknote
  return (
    <IconTile className={cn("size-6 [&_svg]:size-3.5", small && "size-5 [&_svg]:size-3")}>
      <Icon aria-hidden strokeWidth={2} />
    </IconTile>
  )
}

const laneName = (account: string) => (account === DEVICE ? t("demo.party.device") : partyName(account))
/** the lane heads are narrow: "USDC" instead of "USDC (test)" (the full name is in the list) */
const laneShort = (account: string) => (partyOf(account).kind === "usdc" ? t("demo.party.usdc.short") : laneName(account))

// ---------------------------------------------------------------------------------------------------------
// Who talks to whom

interface Hop {
  r: Receipt
  /** where the arrow starts and ends (a callback runs from the account that answered back to the one that asked) */
  from: string
  to: string
  callback: boolean
  /** a callback with no earlier call to come back from: a loop on its own lane */
  loop: boolean
  context: boolean
}

/** A `.then` receipt runs on the account that made the call; it fires when the callee (B) has answered. The call is
 *  the nearest earlier, non-callback receipt from that account to another one; for parallel reads, the farthest
 *  lane of the group (the arrow then passes over the others). */
function callbackSource(tx: SimTx, r: Receipt, lanes: Lane[]): string | null {
  const all = tx.receipts.filter((x) => !x.refund && x.n < r.n)
  for (let i = all.length - 1; i >= 0; i--) {
    const x = all[i]!
    if (x.then || x.predecessor !== r.receiver || x.receiver === r.receiver) continue
    if (!x.parallelGroup) return x.receiver
    const pos = (a: string) => lanes.findIndex((l) => l.account === a)
    const home = pos(r.receiver)
    const group = all.filter((y) => y.parallelGroup === x.parallelGroup).map((y) => y.receiver)
    return group.sort((a, b) => Math.abs(pos(b) - home) - Math.abs(pos(a) - home))[0] ?? x.receiver
  }
  return null
}

function hopOf(tx: SimTx, r: Receipt, lanes: Lane[], context = false): Hop {
  if (r.then) {
    const src = callbackSource(tx, r, lanes)
    if (src) return { r, from: src, to: r.receiver, callback: true, loop: false, context }
    return { r, from: r.receiver, to: r.receiver, callback: true, loop: true, context }
  }
  return { r, from: r.predecessor, to: r.receiver, callback: false, loop: r.predecessor === r.receiver, context }
}

// ---------------------------------------------------------------------------------------------------------
// What a receipt says

function actionLabel(a: ReceiptAction): string {
  if ("FunctionCall" in a) return a.FunctionCall.method
  if ("Transfer" in a) return a.Transfer.deposit === "0" ? "Transfer 0" : `Transfer ${nearOf(a.Transfer.deposit)} NEAR`
  if ("CreateAccount" in a) return "CreateAccount"
  if ("UseGlobalContract" in a) return `UseGlobalContract ${a.UseGlobalContract.hash.slice(0, 8)}…`
  return "Delegate"
}

/** `ft_balance_of(Lisbon Trip)`, `ft_transfer(Maya, $84.00)`, `act_proposal(#2, VoteApprove)`. */
function callSummary(a: ReceiptAction): string {
  if (!("FunctionCall" in a)) return actionLabel(a)
  const args = (a.FunctionCall.args ?? {}) as Record<string, unknown>
  const parts: string[] = []
  for (const key of ["pot", "receiver_id", "account_id", "sender_id", "member_id"]) {
    const v = args[key]
    if (typeof v === "string") parts.push(partyName(v))
  }
  if (typeof args.id === "number") parts.push(`#${args.id}`)
  if (typeof args.proposal_id === "number") parts.push(`#${args.proposal_id}`)
  if (typeof args.action === "string") parts.push(args.action)
  if (typeof args.amount === "string" && /^\d+$/.test(args.amount)) parts.push(`$${(Number(args.amount) / 1e6).toFixed(2)}`)
  return parts.length ? `${a.FunctionCall.method}(${[...new Set(parts)].join(", ")})` : a.FunctionCall.method
}

/** Line-break hints: before "(" and after ", " (never inside a method name). */
function Breakable({ text }: { text: string }) {
  const parts = text.split(/(?=\()|(?<=, )/)
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 ? <wbr /> : null}
          {p}
        </Fragment>
      ))}
    </>
  )
}

function moneyOf(r: Receipt): bigint | null {
  for (const a of r.actions) {
    if (!("FunctionCall" in a)) continue
    const m = a.FunctionCall.method
    const amount = (a.FunctionCall.args as { amount?: unknown } | null)?.amount
    if ((m === "ft_transfer" || m === "ft_transfer_call") && typeof amount === "string" && /^\d+$/.test(amount)) return BigInt(amount)
  }
  return null
}

/** A return value in a few words: `2`, `"450000000"`, `status Approved`, `ok`, `proposal #2 (Approved)`. */
function resultSummary(result: string): string {
  if (!result.startsWith("{") && !result.startsWith("[")) return result
  try {
    const v = JSON.parse(result) as Record<string, unknown>
    if (typeof v.id === "number" && typeof v.status === "string") return `#${v.id} ${v.status}`
    if (typeof v.status === "string") return `status ${v.status}`
    if (v.ok === true) return "ok"
    if (Array.isArray(v.roles)) return "policy"
    if (typeof v.total === "string" && /^\d+$/.test(v.total)) return `${nearOf(v.total)} NEAR`
    return `${Object.keys(v).slice(0, 2).join(", ")}…`
  } catch {
    return result.slice(0, 24)
  }
}

/** 05 §4.3.1: bg-surface-sunken pill, body-sm, tabular, ink. Opaque, so a lifeline behind it stops at its edge. */
function Chip({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <span
      data-route-chip
      className={cn(
        "inline-flex h-6 max-w-full min-w-0 items-center gap-1 rounded-pill bg-surface-sunken px-2 text-body-sm whitespace-nowrap text-ink tabular-nums [&_svg]:size-3.5 [&_svg]:shrink-0",
        PAGE_NIGHT.inset,
      )}
    >
      {icon}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  )
}

/** Gas, deposit, who pays it, "in parallel", the result: the small print under the arrow. */
function Notes({ r, center, end }: { r: Receipt; center?: boolean; end?: boolean }) {
  if (r.n === 0) return null
  const out: ReactNode[] = []
  const fc = r.actions.find((a): a is Extract<ReceiptAction, { FunctionCall: unknown }> => "FunctionCall" in a)
  if (fc) out.push(<Chip key="gas" icon={<Fuel aria-hidden strokeWidth={2} />}>{t(r.approx ? "demo.unit.tgas_approx" : "demo.unit.tgas", { n: tgasOf(fc.FunctionCall.gas) })}</Chip>)
  for (const [i, a] of r.actions.entries()) {
    const dep = "Transfer" in a ? a.Transfer.deposit : "FunctionCall" in a ? a.FunctionCall.deposit : "0"
    if (dep !== "0" && !("Transfer" in a)) out.push(<Chip key={`d${i}`} icon={<Plus aria-hidden strokeWidth={2} />}>{`${nearOf(dep)} NEAR`.replace("yocto NEAR", "yocto")}</Chip>)
  }
  // a deposit the caller doesn't pay itself (the person's 1 yocto: the relayer covers it)
  if (r.depositPaidBy)
    out.push(
      <Chip key="payer">
        {partyOf(r.depositPaidBy).kind === "relayer" ? t("demo.route.paid_by_relayer") : t("demo.route.paid_by", { name: partyName(r.depositPaidBy) })}
      </Chip>,
    )
  if (r.parallelGroup) out.push(<Chip key="par">{t("demo.route.parallel")}</Chip>)
  if (r.result !== undefined)
    out.push(
      <Chip key="res" icon={<Check aria-hidden strokeWidth={2} />}>
        {t("demo.route.returned", { value: resultSummary(r.result) })}
      </Chip>,
    )
  return out.length ? (
    <span className={cn("flex max-w-full flex-wrap gap-1.5", center && "justify-center", end && "justify-end")} data-route-notes>
      {out}
    </span>
  ) : null
}

/** What the receipt does: the method (banknote + amount for money), a batch's actions stacked, a callback's tag. */
function Call({ hop, center }: { hop: Hop; center?: boolean }) {
  const { r } = hop
  const money = moneyOf(r)
  const batch = r.actions.length > 1
  const line = "flex min-w-0 flex-wrap items-center gap-x-1.5 text-body-sm text-ink"
  if (r.n === 0)
    return (
      <span className={cn("flex flex-col", center && "items-center")}>
        <span className="text-body-sm font-semibold text-ink">{RELAY_POST}</span>
        <span className="text-body-sm text-ink-muted">{t("demo.route.offchain.tag")}</span>
      </span>
    )
  if (r.actions.length === 1 && "Delegate" in r.actions[0]!) {
    const p = partyOf(r.receiver)
    return <span className="text-body-sm text-ink">{t("demo.route.delegate", { name: p.kind === "person" ? partyName(r.receiver) : "" })}</span>
  }
  return (
    <span className={cn("flex min-w-0 flex-col gap-0.5", center && "items-center")}>
      {hop.callback ? (
        <span className="inline-flex items-center gap-1 text-body-sm text-ink-muted" data-callback-tag>
          <CornerDownLeft aria-hidden className="size-3.5" strokeWidth={2} />
          {t("demo.route.callback")}
        </span>
      ) : null}
      {batch ? <span className="text-body-sm text-ink-muted">{t("demo.route.batch", { count: r.actions.length })}</span> : null}
      <span className={cn("flex min-w-0 flex-col", batch && "divide-y divide-line", center && "items-center")} data-actions={r.actions.length}>
        {r.actions.map((a, i) => (
          <span key={i} className={cn(line, batch && "py-0.5", center && "justify-center")}>
            {money !== null && i === 0 ? <Banknote aria-hidden className="size-4 shrink-0" strokeWidth={2} /> : null}
            <span className="font-semibold [overflow-wrap:anywhere]">
              <Breakable text={callSummary(a)} />
            </span>
            {money !== null && i === 0 ? <MoneyText micro={money} variant="inline" className="text-body-sm text-ink" /> : null}
          </span>
        ))}
      </span>
    </span>
  )
}

// ---------------------------------------------------------------------------------------------------------
// The lane diagram

/** The label and the notes get at least this many lanes of room (about 21 rem in a 6-lane diagram at 1280). */
const MIN_LABEL_LANES = 4

function LaneRow({ hop, lanes, k }: { hop: Hop; lanes: Lane[]; k: number }) {
  const L = lanes.length
  const idx = (account: string) => Math.max(0, lanes.findIndex((l) => l.account === account))
  const a = idx(hop.from)
  const b = idx(hop.to)
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  const span = hi - lo + 1
  // the label and the notes are centred on the arrow and may use as many lanes on each side as there are on both.
  // Near an edge that leaves too little room (an arrow into the last lane), they borrow lanes from the open side and
  // lean against the edge instead, still over the arrow.
  const ext = Math.min(lo, L - 1 - hi)
  let left = lo - ext
  let right = hi + ext
  let lean: "center" | "start" | "end" = "center"
  while (right - left + 1 < Math.min(MIN_LABEL_LANES, L)) {
    if (left > 0 && (right >= L - 1 || lean === "end")) {
      left--
      lean = "end"
    } else if (right < L - 1) {
      right++
      lean = "start"
    } else break
  }
  const around: CSSProperties = { gridColumn: `${left + 2} / ${right + 3}` }
  const justify = lean === "center" ? "justify-center" : lean === "end" ? "justify-end" : "justify-start"
  const arrow: CSSProperties = hop.loop
    ? { gridColumn: `${lo + 2} / ${lo + 3}`, marginLeft: "50%" }
    : { gridColumn: `${lo + 2} / ${hi + 3}`, marginInline: `calc(100% / ${2 * span})` }
  const dashed = hop.callback || hop.r.n === 0
  const muted = hop.context
  return (
    <div
      data-lane-row={hop.r.n}
      data-context={muted ? "" : undefined}
      data-callback={hop.callback ? "" : undefined}
      style={{ gridTemplateColumns: `2rem repeat(${L}, minmax(0, 1fr))`, gridTemplateRows: "auto 1.25rem auto", ["--i" as string]: Math.min(k, 6) }}
      className={cn("relative grid", muted ? "py-2 [&_*]:text-ink-muted" : "py-4")}
    >
      <span
        className={cn(
          "grid size-6 place-items-center self-center justify-self-start rounded-pill text-body-sm tabular-nums",
          muted ? "text-ink-muted" : cn("bg-surface-sunken text-ink", PAGE_NIGHT.inset),
        )}
        style={{ gridColumn: 1, gridRow: 2 }}
      >
        {hop.r.n || "·"}
      </span>

      <span className={cn("z-10 flex min-w-0 px-1 pb-2", justify)} style={{ ...around, gridRow: 1 }}>
        {muted ? (
          <span data-route-label className={cn("max-w-full rounded-md bg-surface px-2 py-0.5 text-center", PAGE_NIGHT.card)}>
            <span className="block text-body-sm">{t("demo.route.earlier")}</span>
            <Call hop={hop} center />
          </span>
        ) : (
          <span
            data-route-label
            className={cn("max-w-full rounded-md border border-line bg-surface-sunken px-3 py-1.5 text-center shadow-[0_1px_0_var(--pot-line)]", PAGE_NIGHT.inset)}
          >
            <Call hop={hop} center />
          </span>
        )}
      </span>

      <span className="relative z-10" style={{ ...arrow, gridRow: 2 }} data-arrow={hop.callback ? "callback" : "call"}>
        {hop.loop ? (
          <span className={cn("absolute inset-y-0 left-0 w-5 rounded-r-md border-2 border-l-0 border-dashed", muted ? "border-line" : "border-line-strong")} />
        ) : (
          <>
            <span
              className={cn(
                "absolute inset-x-0 top-1/2 -translate-y-1/2",
                dashed ? cn("border-t-2 border-dashed", muted ? "border-line" : "border-line-strong") : cn("h-0.5", muted ? "bg-line" : "bg-line-strong"),
              )}
            />
            <span
              className={cn(
                "absolute top-1/2 size-0 -translate-y-1/2 border-y-[6px] border-y-transparent",
                b > a ? cn("-right-0.5 border-l-[9px]", muted ? "border-l-line" : "border-l-line-strong") : cn("-left-0.5 border-r-[9px]", muted ? "border-r-line" : "border-r-line-strong"),
              )}
            />
            {muted ? null : <span data-trace className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-brand" style={{ transformOrigin: b > a ? "0 50%" : "100% 50%" }} />}
          </>
        )}
      </span>

      {muted ? null : (
        <span className={cn("z-10 flex min-w-0 px-1 pt-2", justify)} style={{ ...around, gridRow: 3 }}>
          <Notes r={hop.r} center={lean === "center"} end={lean === "end"} />
        </span>
      )}
    </div>
  )
}

function LaneDiagram({ hops, lanes }: { hops: Hop[]; lanes: Lane[] }) {
  const cols: CSSProperties = { gridTemplateColumns: `2rem repeat(${lanes.length}, minmax(0, 1fr))` }
  return (
    <div aria-hidden className="relative mt-4 hidden @min-[32rem]/card:block" data-route-diagram>
      {/* the lane heads: sticky under the page header while the chain scrolls */}
      <div
        className={cn("sticky top-14 z-20 -mx-2 grid border-b border-line bg-surface px-2 py-2 lg:top-16", PAGE_NIGHT.card)}
        style={cols}
        data-route-lanes
      >
        <span />
        {lanes.map((l) => (
          <span
            key={l.account}
            title={l.account === DEVICE ? undefined : l.account}
            className={cn(
              "mx-0.5 flex min-w-0 flex-col items-center gap-1 rounded-md border border-line bg-surface-sunken px-1 py-2 text-center",
              PAGE_NIGHT.inset,
              l.kind === "device" && "border-dashed border-line-strong",
              l.kind === "hub" && "shadow-[inset_0_4px_0_var(--pot-brand)]",
            )}
            data-lane={l.kind}
          >
            <LaneIcon account={l.account} />
            <span className="max-w-full truncate text-body-sm font-semibold text-ink">{laneShort(l.account)}</span>
          </span>
        ))}
      </div>

      <div className="relative">
        {/* lifelines, behind the rows */}
        <div className="pointer-events-none absolute inset-0 grid px-0" style={cols}>
          <span />
          {lanes.map((l) => (
            <span key={l.account} className="flex justify-center">
              <span data-lifeline className={cn("w-px", l.kind === "device" ? "border-l border-dashed border-line-strong" : "bg-line")} />
            </span>
          ))}
        </div>
        <div className="relative flex flex-col">
          {hops.map((h, k) => (
            <LaneRow key={`${h.r.n}-${k}`} hop={h} lanes={lanes} k={k} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------
// The list (screen readers, no CSS, narrow cards)

function ListItem({ hop }: { hop: Hop }) {
  const { r } = hop
  const fromTo = hop.callback
    ? t("demo.route.callback_from_to", { from: laneName(hop.from), to: laneName(hop.to) })
    : t("demo.route.from_to", { from: laneName(hop.from), to: laneName(hop.to) })
  return (
    <li data-receipt={r.n} data-then={r.then ? "" : undefined} className="relative flex gap-3 border-t border-line py-3 first:border-t-0">
      <span className={cn("grid size-6 shrink-0 place-items-center rounded-pill bg-surface-sunken text-body-sm text-ink tabular-nums", PAGE_NIGHT.inset)}>
        {r.n || "·"}
      </span>
      <span className={cn("flex min-w-0 flex-1 flex-col gap-1.5", hop.callback && "border-l-2 border-line pl-3")}>
        <span className="text-label text-ink">
          <span className="sr-only">{fromTo}</span>
          <span aria-hidden className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
            {hop.callback ? <CornerDownLeft className="size-4 shrink-0 text-ink-muted" strokeWidth={2} /> : null}
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <LaneIcon account={hop.from} small />
              {laneName(hop.from)}
            </span>
            <span className="text-ink-muted">{ARROW}</span>
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <LaneIcon account={hop.to} small />
              {laneName(hop.to)}
            </span>
          </span>
        </span>
        {r.n === 0 ? <span className="text-body-sm text-ink">{t("demo.route.offchain")}</span> : <Call hop={hop} />}
        <Notes r={r} />
      </span>
    </li>
  )
}

// ---------------------------------------------------------------------------------------------------------

/** The off-chain step before receipt 1: the phone posts the signed request to the relayer. */
function deviceRow(tx: SimTx): Receipt {
  return { n: 0, predecessor: DEVICE, receiver: tx.signer, actions: [{ FunctionCall: { method: RELAY_POST, args: {}, gas: "0", deposit: "0" } }] }
}

export function ReceiptRoute({
  tx,
  rows,
  id,
  card = false,
  showRefunds,
}: {
  tx: SimTx
  /** the receipt numbers this beat explains (in order) */
  rows: number[]
  /** unique heading id */
  id: string
  /** render as its own card (the beat's card is the route) or as a figure under another card */
  card?: boolean
  /** the slice that ends the chain also offers the gas refunds */
  showRefunds: boolean
}) {
  const lanes = lanesOf(tx)
  const all = tx.receipts.filter((r) => !r.refund)
  const shown = all.filter((r) => rows.includes(r.n))
  const list: Receipt[] = [...(tx.kind === "delegate" && rows.includes(1) ? [deviceRow(tx)] : []), ...shown]
  const hops = list.map((r) => hopOf(tx, r, lanes))
  // the receipt right before this slice, dimmed, so the slice starts where the last one stopped
  const prev = shown[0] ? all.filter((r) => r.n < shown[0]!.n).at(-1) : undefined
  const drawn = prev ? [hopOf(tx, prev, lanes, true), ...hops] : hops
  const refunds = tx.receipts.filter((r) => r.refund)
  const first = shown[0]?.n ?? 1
  const lastN = shown[shown.length - 1]?.n ?? first

  const caption = first === lastN ? t("demo.route.row", { n: first, total: all.length }) : t("demo.route.rows", { from: first, to: lastN, total: all.length })

  const body = (
    <div className="mt-3" data-route={tx.id}>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm text-ink-muted">
        <span className="tabular-nums">{caption}</span>
        <span aria-hidden>·</span>
        <span className="tabular-nums" title={tx.hash}>
          {shortHash(tx.hash)}
        </span>
        <SimChip />
      </p>

      <LaneDiagram hops={drawn} lanes={lanes} />

      <ol className="mt-2 flex flex-col @min-[32rem]/card:sr-only" aria-label={t("demo.route.list")} data-route-list>
        {hops.map((h, k) => (
          <ListItem key={`${h.r.n}-${k}`} hop={h} />
        ))}
      </ol>

      {showRefunds && refunds.length ? (
        <Disclosure summary={t("demo.refunds.show", { count: refunds.length })} data-refunds>
          <ol className="flex flex-col gap-1">
            {refunds.map((r) => (
              <li key={r.n} className="flex gap-3 text-body-sm text-ink-muted tabular-nums">
                <span className="w-6 shrink-0 text-center">{r.n}</span>
                <span>
                  {t("demo.route.refund")} · {"Transfer" in r.actions[0]! ? `${nearOf(r.actions[0].Transfer.deposit)} NEAR` : ""}
                </span>
              </li>
            ))}
          </ol>
        </Disclosure>
      ) : null}
    </div>
  )

  if (!card) return body
  return (
    <HoodCard id={id} icon={<IconTile><Send aria-hidden strokeWidth={2} /></IconTile>} title={t("demo.card.route")}>
      {body}
    </HoodCard>
  )
}
