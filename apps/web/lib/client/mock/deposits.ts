// Money-in details in the mock world (the API's twin: server/features/deposits.ts): one money-in row's details by
// the key its row has (a contribution's stand-in transaction hash, or a pay-in's ref). Members only, like the API:
// anyone else gets null. Pure.
import { depositKeyKind, topupFor, xcTimeline, xcTook } from "@/lib/deposits"
import { toneOf } from "@/lib/gifts"
import { networkLabel, personOf, type DepositDetailsVM, type DepositSourceVM } from "../deposits/vm"
import { cents } from "../money"
import { topupsOf } from "./topups"
import type { EventRec, PotVM, World, XcAddRecord } from "./types"
import { potView } from "./world"

function xcSource(x: XcAddRecord, addedAt: number): DepositSourceVM {
  const timeline = xcTimeline({ address: x.addressAt, sent: x.sentAt, converting: x.convertingAt, arrived: x.arrivedAt, added: addedAt })
  return {
    kind: "xc",
    // the mock is always the testnet demo: no origin transaction, no NEAR Intents page
    simulated: true,
    chain: x.chain,
    network: networkLabel(x.chain),
    coin: x.coin,
    decimals: x.decimals,
    stable: x.stable,
    sent: x.sent ? BigInt(x.sent) : null,
    usdTarget: BigInt(x.usdTarget),
    arrived: x.arrived ? BigInt(x.arrived) : null,
    refunded: x.refunded ? BigInt(x.refunded) : null,
    refundReason: x.refundReason ?? null,
    timeline,
    took: xcTook(timeline),
    originTx: null,
    intentsUrl: null,
  }
}

const sourceOf = (e: EventRec): DepositSourceVM =>
  e.source === "xc" && e.xc ? xcSource(e.xc, e.at) : e.source === "pot_dollars" ? { kind: "pot_dollars" } : { kind: "demo" }

/** The ask an add counted toward (lib/deposits.ts topupFor over the mock's asks). */
function topupOf(w: World, view: PotVM, who: string, at: number, me: string): DepositDetailsVM["topup"] {
  const asks = topupsOf(w, view.slug).map((r) => ({
    id: r.id,
    by: r.by,
    createdAt: r.createdAt,
    endedAt: r.cancelledAt ?? null,
    dueAt: r.dueAt,
    asked: r.baselines.map((b) => b.id),
    perPerson: r.perPerson,
    mode: r.mode,
  }))
  const a = topupFor(asks, who, at)
  return a ? { id: a.id, by: personOf(view, a.by), mine: a.by === me, perPerson: cents(a.perPerson), mode: a.mode } : null
}

export function mockDepositDetails(w: World, slug: string, key: string, me: string | null, now: number): DepositDetailsVM | null {
  if (!me) return null
  const view = potView(w, slug, me, now)
  if (!view || !view.me) return null
  const kind = depositKeyKind(key)
  if (kind === "tx") {
    const item = view.feed.find((f) => f.kind === "contribution" && f.txHash === key)
    if (!item || item.kind !== "contribution") return null
    const e = w.pots[slug]!.events.find((x) => x.id === item.key)
    if (!e) return null
    return {
      key,
      kind: "added",
      who: item.actor,
      amount: item.amount,
      at: item.at,
      status: "added",
      txHash: key,
      source: sourceOf(e),
      topup: topupOf(w, view, e.actor, e.at, me),
    }
  }
  if (kind === "payin") {
    const g = view.gifts?.items.find((x) => x.ref === key)
    const rec = (w.gifts ?? []).find((x) => x.ref === key && x.pot === slug)
    if (!g || !rec) return null
    const link = rec.linkId ? (w.giftLinks ?? []).find((l) => l.id === rec.linkId) : undefined
    return {
      key,
      kind: "payin",
      who: g.from,
      amount: g.amount,
      at: g.at,
      status: "added",
      ...(g.txHash ? { txHash: g.txHash } : {}),
      source: {
        kind: "payin",
        tone: toneOf(rec.tone),
        note: g.note,
        showPublic: g.showPublic,
        link: rec.linkId ? { by: link ? personOf(view, link.createdBy) : null, amount: link?.amount != null ? cents(link.amount) : null, createdAt: link?.createdAt ?? g.at } : null,
      },
      topup: null,
    }
  }
  return null
}
