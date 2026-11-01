// LIVE testnet, READ-ONLY: the refund preview's math against the deployed preview hub (notes/deploy.md). No keys, no
// transactions: only view calls (get_pot, get_members, preview_close, usdc ft_balance_of).
//   LIVE_TESTNET=1 scripts/with-testnet-lock.sh pnpm --filter web exec vitest run lib/client/refund.live.test.ts
// For each Pot it builds the Pot screen's view model exactly as the app does (livePotVM over the same reads as
// lib/client/live/queries.ts fetchBundle) and checks, for every member as "me":
//  - the hero's "You'd get back" (myShare) == the hub's get_members(balance).would_get_back;
//  - lib/client/refund.ts over that view model == would_get_back for everyone (pro-rata + the remainder);
//  - the Spend preview (withSpend) == the hub's own preview_close at the lower balance, for odd amounts too.
import { describe, expect, it } from "vitest"
import { createChainViews, testnetConfig, type ClosePreview, type DaoId, type PotView } from "@pot/sdk"
import { livePotVM, type LiveBundle } from "./live/vm"
import { refundBasis, refundOf, refunds, withSpend } from "./refund"

const live = process.env.LIVE_TESTNET === "1"
const HUB = process.env.LIVE_HUB_ID ?? "pots.potprev.testnet"
const POTS = (process.env.LIVE_REFUND_POTS ?? "lisbon-trip,lisbon-qg6e,lisbon-fhq8,lisbon-fpcz,deposit-trip-pzc9-tega").split(",")

describe.skipIf(!live)("LIVE (read-only) refund preview vs the preview hub", () => {
  const cfg = testnetConfig("potprev", { hubId: HUB, usdcId: process.env.LIVE_USDC_ID ?? "usdc.potprev.testnet" })
  const c = createChainViews(cfg)

  it.each(POTS)("%s", async (slug) => {
    const dao = `${slug}.${HUB}` as DaoId
    const view = (await c.hub.getPot(dao)).value as PotView | null
    if (!view) return console.warn(`${dao}: not found, skipped`)
    const balance = (await c.usdc.balanceOf(dao)).value
    const [members, closePreview] = await Promise.all([
      c.hub.getMembers(dao, balance).then((v) => v.value),
      view.status === "open" ? c.hub.previewClose(dao, balance).then((v) => v.value as ClosePreview) : Promise.resolve(null),
    ])
    const active = members.filter((m) => m.status === "active")
    const bundle: LiveBundle = { dao, view, balance, members, requests: [], proposals: {}, feed: null, invite: null, closePreview }
    const lines: string[] = []
    for (const m of active) {
      const pot = livePotVM(bundle, { me: m.account, now: Date.now(), goalEach: null })
      expect(pot.myShare, `${slug}: ${m.account} hero share`).toBe(m.wouldGetBack)
      if (view.status !== "open") continue
      const b = refundBasis(pot)!
      expect(b.unit).toBe(1n)
      for (const x of active) expect(refundOf(b, x.account), `${slug}: ${x.account} as seen by ${m.account}`).toBe(x.wouldGetBack)
    }
    if (view.status === "open" && active.length) {
      const pot = livePotVM(bundle, { me: active[0]!.account, now: Date.now(), goalEach: null })
      const b = refundBasis(pot)!
      // the hub's own hypothetical: preview_close at the balance a paid spend would leave
      for (const s of [1n, 84_000_000n, 33_333_333n, balance / 3n + 7n, balance - 1n].filter((s) => s > 0n && s < balance)) {
        const hub = (await c.hub.previewClose(dao, balance - s)).value
        const want = Object.fromEntries(hub.payouts.map((p) => [p.account, p.amount.toString()]))
        const got = Object.fromEntries([...refunds(withSpend(b, s))].map(([k, v]) => [k, v.toString()]))
        expect(got, `${slug}: spend ${s}`).toEqual(want)
        lines.push(`spend ${s}: ${JSON.stringify(got)}`)
      }
    }
    console.log(`${slug} (${view.status}) balance ${balance}: ${active.map((m) => `${m.account.split(".")[0]} in ${m.contributed} back ${m.wouldGetBack}`).join(", ")}\n  ${lines.join("\n  ")}`)
  }, 60_000)
})
