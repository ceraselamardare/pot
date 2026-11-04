// The live deposit API: our /api/oneclick/* routes (api-spec §2.7). Same shapes as the mock (lib/deposit/mock.ts).
import { api } from "@/lib/client/live/api"
import type { ChainsRes, DepositApi, DepositView, PriceRes, QuoteRes } from "./types"

export const liveDeposits: DepositApi = {
  async chains() {
    return (await api<ChainsRes>("GET", "/api/oneclick/chains")).data
  },
  async quote(req) {
    return (await api<QuoteRes>("POST", "/api/oneclick/quote", req)).data
  },
  async price(req) {
    return (await api<PriceRes>("POST", "/api/oneclick/price", req)).data
  },
  async status(id, relayId) {
    const q = relayId ? `?relayId=${encodeURIComponent(relayId)}` : ""
    return (await api<DepositView>("GET", `/api/oneclick/status/${encodeURIComponent(id)}${q}`)).data
  },
  async list(pot) {
    return (await api<{ deposits: DepositView[] }>("GET", `/api/oneclick/status?pot=${encodeURIComponent(pot)}`)).data
  },
  async simulate(req) {
    return (await api<{ startedAt: string; profile: { pendingSec: number; processingSec: number } }>("POST", "/api/oneclick/simulate", req)).data
  },
}
