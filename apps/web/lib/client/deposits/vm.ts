// Money-in details as the sheet reads them (components/deposits/DepositDetailsSheet.tsx): one view model for both
// data sources. Testnet maps GET /api/pots/[pot]/deposits/[key] (detailsFromWire); the mock world builds it directly
// (lib/client/mock/deposits.ts). Pure, no I/O.
import type { DepositDetailsWire, DepositSourceWire, XcMoment } from "@/lib/deposits-api"
import { xcTook } from "@/lib/deposits"
import type { PayInTone } from "@/lib/gifts"
import { XC_CONFIG, type XcChain } from "@/server/features/oneclick/origins"
import { t } from "@/i18n/t"
import { nameFromAccount } from "../live/vm"
import { initialsOf } from "../mock/world"
import type { AddSourceVM, PersonVM, PotVM } from "../mock/types"
import type { Micro } from "../money"

export type DepositSourceVM =
  | { kind: "demo" }
  | { kind: "pot_dollars" }
  | { kind: "balance" }
  | {
      kind: "payin"
      tone: PayInTone
      note: string | null
      showPublic: boolean
      /** null = the public page */
      link: { by: PersonVM | null; amount: Micro | null; createdAt: number } | null
    }
  | {
      kind: "xc"
      simulated: boolean
      chain: string
      /** "Base" */
      network: string
      coin: string
      decimals: number
      stable: boolean
      /** the coin's base units */
      sent: bigint | null
      usdTarget: Micro
      arrived: Micro | null
      refunded: bigint | null
      refundReason: string | null
      timeline: { step: XcMoment; at: number | null }[]
      /** sent → arrived, ms */
      took: number | null
      originTx: { url: string | null } | null
      intentsUrl: string | null
    }

export interface DepositDetailsVM {
  key: string
  kind: "added" | "payin"
  who: PersonVM
  amount: Micro
  at: number
  status: "added" | "pending" | "failed"
  txHash?: string
  source: DepositSourceVM
  topup: { id: string; by: PersonVM; mine: boolean; perPerson: Micro; mode: "each" | "total" } | null
}

export const networkLabel = (chain: string): string => (XC_CONFIG as Record<string, { label: string } | undefined>)[chain]?.label ?? chain

/** A person by account: the Pot's member when they are one, else a plain person with the best name we have. */
export function personOf(pot: Pick<PotVM, "members">, account: string, name?: string | null): PersonVM {
  const m = pot.members.find((x) => x.person.id === account)?.person
  if (m && !name) return m
  const n = name ?? m?.name ?? nameFromAccount(account) ?? t("person.fallback")
  return { id: account, name: n, initials: initialsOf(n), joinIndex: m?.joinIndex ?? null, avatar: name ? null : (m?.avatar ?? null) }
}

function sourceFromWire(s: DepositSourceWire, pot: Pick<PotVM, "members">, profiles: Record<string, { name: string }>): DepositSourceVM {
  switch (s.kind) {
    case "demo":
    case "pot_dollars":
    case "balance":
      return { kind: s.kind }
    case "payin":
      return {
        kind: "payin",
        tone: s.tone,
        note: s.note,
        showPublic: s.showPublic,
        link: s.link
          ? { by: personOf(pot, s.link.createdBy, pot.members.some((m) => m.person.id === s.link!.createdBy) ? null : (profiles[s.link.createdBy]?.name ?? null)), amount: s.link.amount === null ? null : BigInt(s.link.amount), createdAt: Date.parse(s.link.createdAt) }
          : null,
      }
    case "xc": {
      const timeline = s.timeline.map((x) => ({ step: x.step, at: x.at ? Date.parse(x.at) : null }))
      return {
        kind: "xc",
        simulated: s.mode === "simulated",
        chain: s.chain,
        network: networkLabel(s.chain as XcChain),
        coin: s.coin,
        decimals: s.decimals,
        stable: s.stable,
        sent: s.sent === null ? null : BigInt(s.sent),
        usdTarget: BigInt(s.usdTarget),
        arrived: s.arrived === null ? null : BigInt(s.arrived),
        refunded: s.refunded === null ? null : BigInt(s.refunded),
        refundReason: s.refundReason,
        timeline,
        took: xcTook(timeline),
        originTx: s.originTx ? { url: s.originTx.url } : null,
        intentsUrl: s.intentsUrl,
      }
    }
  }
}

/** The API's answer → the sheet's view model (names: the Pot's members first, then the response's profiles). */
export function detailsFromWire(d: DepositDetailsWire, profiles: Record<string, { name: string }>, pot: Pick<PotVM, "members">, meId: string | null): DepositDetailsVM {
  const isMember = (a: string) => pot.members.some((m) => m.person.id === a)
  const who =
    d.source.kind === "payin"
      ? personOf(pot, d.who, d.source.name ?? (isMember(d.who) ? null : (profiles[d.who]?.name ?? null)))
      : personOf(pot, d.who, isMember(d.who) ? null : (profiles[d.who]?.name ?? null))
  return {
    key: d.key,
    kind: d.kind,
    who,
    amount: BigInt(d.amount),
    at: Date.parse(d.at),
    status: d.status,
    ...(d.txHash ? { txHash: d.txHash } : {}),
    source: sourceFromWire(d.source, pot, profiles),
    topup: d.topup
      ? {
          id: d.topup.id,
          by: personOf(pot, d.topup.by, isMember(d.topup.by) ? null : (profiles[d.topup.by]?.name ?? null)),
          mine: d.topup.by === meId,
          perPerson: BigInt(d.topup.perPerson),
          mode: d.topup.mode,
        }
      : null,
  }
}

/** The row's short source words ("Demo dollars", "ETH on Base") and the phrase its accessible name uses. */
export function rowSourceWords(src: AddSourceVM | undefined, network: (chain: string) => string = networkLabel): { short: string; said: string } | null {
  if (!src) return null
  if (src.kind === "xc") {
    const coin = src.coin ?? "USDC"
    const net = src.chain ? network(src.chain) : ""
    return net ? { short: t("xc.dd.pair", { coin, network: net }), said: t("xc.dd.row", { coin, network: net }) } : { short: t("xc.dd.title"), said: t("xc.dd.title") }
  }
  const w = t(src.kind === "pot_dollars" ? "moneyin.row.pot_dollars" : "moneyin.row.demo")
  return { short: w, said: w }
}
