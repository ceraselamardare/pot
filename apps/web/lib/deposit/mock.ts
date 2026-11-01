// The mock data source's deposit API (NEXT_PUBLIC_DATA_SOURCE=mock): the server's simulator timeline
// (server/features/oneclick/sim.ts, pure) run in the browser over localStorage, with the same response shapes, so
// the stepper, the network picker and the one-tap add are exercised without a server. Deterministic e2e hooks:
// localStorage['pot.mock.xcPaused'] = "base,…" pauses networks.
import { CHAIN_LABEL, MIN_AMOUNT, SIM_QR_TEXT, stepOf, TYPICAL_SECONDS, XC_CHAINS } from "@/server/features/oneclick/assets"
import { jitterFor, shortenedDeadline, simAmountOut, simProfile, simStatus, type SimState } from "@/server/features/oneclick/sim"
import type { DepositApi, DepositView, QuoteNumbers, SimScenario, XcChain } from "./types"

const KEY = "pot.mock.deposits"
const SIM_MAX = 500_000_000n

interface MockIntent {
  id: string
  pot: string
  chain: XcChain
  amountIn: string
  numbers: QuoteNumbers
  depositAddress: string
  deadline: number
  createdAt: number
  sim: (SimState & { keys: string[] }) | null
  status: DepositView["status"]
  processingSince?: number
  amountOut?: string
  depositedAmount?: string
  refundedAmount?: string
  refundReason?: string | null
  destinationTxHash?: string
  addedRelayId?: string
  updatedAt: number
  idempotencyKey: string
}

function load(): MockIntent[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as MockIntent[]
  } catch {
    return []
  }
}
function save(all: MockIntent[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {}
}

const err = (reason: string) => Object.assign(new Error(reason), { reason, cls: "specific" })

function numbers(chain: XcChain, amount: bigint): QuoteNumbers {
  const out = simAmountOut(amount)
  return {
    amountIn: amount.toString(),
    minAmountIn: ((amount * 99n) / 100n).toString(),
    amountOut: out.toString(),
    minAmountOut: ((out * 99n) / 100n).toString(),
    timeEstimateSec: TYPICAL_SECONDS[chain],
    refundFee: "0",
    withdrawFee: "0",
  }
}

function refresh(i: MockIntent, now: number): MockIntent {
  if (["SUCCESS", "ADDED", "REFUNDED", "FAILED", "EXPIRED"].includes(i.status)) return i
  const v = simStatus(i.sim, { chain: i.chain, required: BigInt(i.numbers.minAmountIn), quoted: BigInt(i.amountIn), deadlineMs: i.deadline, createdAt: i.createdAt }, now)
  return {
    ...i,
    status: v.status,
    processingSince: v.processingSince ?? i.processingSince,
    depositedAmount: v.depositedAmount?.toString() ?? i.depositedAmount,
    refundedAmount: v.refundedAmount?.toString() ?? i.refundedAmount,
    refundReason: v.refundReason ?? i.refundReason ?? null,
    // the mock "delivery" lands at once
    ...(v.status === "SUCCESS" ? { amountOut: v.amountOut?.toString(), destinationTxHash: `mock-${i.id.slice(-8)}` } : {}),
    updatedAt: v.updatedAt,
  }
}

function view(i: MockIntent): DepositView {
  return {
    mode: "simulated",
    id: i.id,
    pot: i.pot,
    chain: i.chain,
    status: i.status,
    step: stepOf(i.status, i.processingSince ? 3 : 1),
    amountIn: i.amountIn,
    minAmountIn: i.numbers.minAmountIn,
    amountOutQuoted: i.numbers.amountOut,
    ...(i.depositedAmount ? { depositedAmount: i.depositedAmount } : {}),
    ...(i.amountOut ? { amountOut: i.amountOut } : {}),
    ...(i.refundedAmount ? { refundedAmount: i.refundedAmount } : {}),
    refundReason: i.refundReason ?? null,
    ...(i.destinationTxHash ? { destinationTxHash: i.destinationTxHash } : {}),
    depositAddress: i.depositAddress,
    qrText: SIM_QR_TEXT,
    ...(i.sim ? { scenario: i.sim.scenario, simulated: { sent: i.sim.sends.length > 0 } } : {}),
    deadline: new Date(i.deadline).toISOString(),
    updatedAt: new Date(i.updatedAt).toISOString(),
    ...(i.processingSince ? { processingSince: new Date(i.processingSince).toISOString() } : {}),
    ...(i.addedRelayId ? { addedRelayId: i.addedRelayId } : {}),
    createdAt: new Date(i.createdAt).toISOString(),
  }
}

function update(id: string, fn: (i: MockIntent) => MockIntent): MockIntent {
  const all = load()
  const idx = all.findIndex((x) => x.id === id)
  if (idx < 0) throw err("not_found")
  all[idx] = fn(all[idx]!)
  save(all)
  return all[idx]!
}

const delay = (ms = 120) => new Promise((r) => setTimeout(r, ms))

export const mockDeposits: DepositApi & { markAdded(id: string): Promise<DepositView> } = {
  async chains() {
    await delay(60)
    let paused: string[] = []
    try {
      paused = (localStorage.getItem("pot.mock.xcPaused") ?? "").split(",").map((s) => s.trim())
    } catch {}
    return {
      mode: "simulated",
      chains: XC_CHAINS.map((id) => ({
        id,
        label: CHAIN_LABEL[id],
        status: paused.includes(id) ? ("paused" as const) : id === "eth" ? ("slower" as const) : ("ok" as const),
        minAmount: MIN_AMOUNT[id].toString(),
        typicalSeconds: TYPICAL_SECONDS[id],
      })),
    }
  },
  async quote(req) {
    await delay(250)
    const amount = BigInt(req.amount)
    if (amount < 1_000_000n) throw err("amount_too_low")
    if (amount > SIM_MAX) throw err("amount_too_high")
    if (req.dry) return { mode: "simulated", quote: numbers(req.chain, amount) }
    const all = load()
    const prior = all.find((x) => x.idempotencyKey === req.idempotencyKey)
    const now = Date.now()
    const rec: MockIntent = prior ?? {
      id: `dp_${Array.from(crypto.getRandomValues(new Uint8Array(13)), (b) => (b % 36).toString(36)).join("")}${now.toString(36)}`.slice(0, 29).padEnd(29, "0"),
      pot: req.pot,
      chain: req.chain,
      amountIn: amount.toString(),
      numbers: numbers(req.chain, amount),
      depositAddress: `SIMULATED-${req.chain}-${Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, "0")).join("")}`,
      deadline: now + 2 * 3600_000,
      createdAt: now,
      sim: null,
      status: "PENDING_DEPOSIT",
      updatedAt: now,
      idempotencyKey: req.idempotencyKey,
    }
    if (!prior) save([...all, rec])
    return {
      mode: "simulated",
      depositIntentId: rec.id,
      quote: rec.numbers,
      depositAddress: rec.depositAddress,
      deadline: new Date(rec.deadline).toISOString(),
      qrText: SIM_QR_TEXT,
    }
  },
  async status(id) {
    await delay(40)
    return view(update(id, (i) => refresh(i, Date.now())))
  },
  async list(pot) {
    await delay(40)
    const now = Date.now()
    const all = load().map((i) => (i.pot === pot ? refresh(i, now) : i))
    save(all)
    return {
      deposits: all
        .filter((i) => i.pot === pot && (i.sim?.sends.length ?? 0) > 0 && (i.status !== "ADDED" || now - i.updatedAt < 3600_000))
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 5)
        .map(view),
    }
  },
  async simulate(req) {
    await delay(150)
    const now = Date.now()
    let profile = { pendingSec: 0, processingSec: 0 }
    const rec = update(req.depositIntentId, (i0) => {
      const i = refresh(i0, now)
      const jitter = i.sim?.jitter ?? jitterFor(i.id)
      profile = simProfile(i.chain, jitter)
      if (i.sim?.keys.includes(req.idempotencyKey)) return i
      const scenario: SimScenario = i.sim?.scenario ?? req.scenario ?? "ok"
      const sent = (i.sim?.sends ?? []).reduce((a, s) => a + BigInt(s.amount), 0n)
      if (i.sim && i.sim.sends.length > 0 && !(scenario === "partial" && i.status === "INCOMPLETE_DEPOSIT")) throw err("bad_request")
      const quoted = BigInt(i.amountIn)
      const required = BigInt(i.numbers.minAmountIn)
      const amount =
        req.amount !== undefined ? BigInt(req.amount) : scenario === "expired" ? 0n : sent > 0n ? required - sent : scenario === "partial" ? (quoted * 8n) / 10n : quoted
      if (sent + amount > quoted) throw err("amount_too_high")
      const sim: SimState & { keys: string[] } = {
        scenario,
        jitter,
        sends: scenario === "expired" ? [] : [...(i.sim?.sends ?? []), { at: now, amount: amount.toString() }],
        keys: [...(i.sim?.keys ?? []), req.idempotencyKey],
        ...(i.sim?.deadlineMs ? { deadlineMs: i.sim.deadlineMs } : {}),
      }
      if (!i.sim && (scenario === "partial" || scenario === "expired")) sim.deadlineMs = shortenedDeadline(i.chain, jitter, now)
      return { ...i, sim, deadline: sim.deadlineMs ?? i.deadline, updatedAt: now }
    })
    return { startedAt: new Date(rec.sim?.sends[0]?.at ?? now).toISOString(), profile }
  },
  async markAdded(id) {
    return view(update(id, (i) => ({ ...i, status: "ADDED", addedRelayId: "mock", updatedAt: Date.now() })))
  },
}
