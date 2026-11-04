// The mock data source's deposit API (NEXT_PUBLIC_DATA_SOURCE=mock): the server's simulator timeline
// (server/features/oneclick/sim.ts, pure) run in the browser over localStorage, with the same response shapes, so
// the stepper, the network picker and the one-tap add are exercised without a server. Deterministic e2e hooks:
// localStorage['pot.mock.xcPaused'] = "base,…" pauses networks; localStorage['pot.mock.xcUnavailable'] = "op:USDT,…"
// marks coins temporarily unavailable. Coins whose price moves are priced offline at the config's reference prices
// (origins.ts refUsd, 2026-11-04), the way the server falls back when 1Click can't be reached.
import { SIM_QR_TEXT, stepOf } from "@/server/features/oneclick/assets"
import { assetOf, COIN_NAME, defaultCoin, offlineCoinNumbers, slippageFor, XC_CHAINS, XC_CONFIG } from "@/server/features/oneclick/origins"
import { jitterFor, planSimSend, shortenedDeadline, simAmountOut, simProfile, simSent, simStatus, type SimState } from "@/server/features/oneclick/sim"
import type { DepositApi, DepositView, QuoteNumbers, SimScenario, XcChain, XcCoin } from "./types"

const KEY = "pot.mock.deposits"
const SIM_MAX = 500_000_000n

interface MockIntent {
  id: string
  pot: string
  chain: XcChain
  coin?: XcCoin
  /** USD micro asked for (absent on older records: = amountIn) */
  usdTarget?: string
  /** the coin's base units */
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

const err = (reason: string, why?: string) => Object.assign(new Error(reason), { reason, cls: "specific", ...(why ? { why } : {}) })

function numbers(chain: XcChain, amount: bigint, coin: XcCoin = defaultCoin(chain)): QuoteNumbers {
  const asset = assetOf(chain, coin)
  if (asset && !asset.stable) return offlineCoinNumbers(chain, asset, amount)
  const out = simAmountOut(amount)
  return {
    amountIn: amount.toString(),
    minAmountIn: ((amount * 99n) / 100n).toString(),
    amountOut: out.toString(),
    minAmountOut: ((out * 99n) / 100n).toString(),
    timeEstimateSec: XC_CONFIG[chain].typicalSeconds,
    refundFee: "0",
    withdrawFee: "0",
  }
}

function refresh(i: MockIntent, now: number): MockIntent {
  if (["SUCCESS", "ADDED", "REFUNDED", "FAILED", "EXPIRED"].includes(i.status)) return i
  const v = simStatus(
    i.sim,
    { chain: i.chain, required: BigInt(i.numbers.minAmountIn), quoted: BigInt(i.amountIn), quotedOut: BigInt(i.numbers.amountOut), deadlineMs: i.deadline, createdAt: i.createdAt },
    now,
  )
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
  const asset = assetOf(i.chain, i.coin ?? "USDC") ?? assetOf(i.chain, defaultCoin(i.chain))!
  return {
    mode: "simulated",
    id: i.id,
    pot: i.pot,
    chain: i.chain,
    coin: asset.coin,
    decimals: asset.decimals,
    stable: asset.stable,
    usdTarget: i.usdTarget ?? i.amountIn,
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
    ...(i.sim
      ? {
          scenario: i.sim.scenario,
          simulated: { sent: i.sim.sends.length > 0, sentAmount: simSent(i.sim).toString(), ...(i.sim.sends[0] ? { sentAt: new Date(i.sim.sends[0].at).toISOString() } : {}) },
        }
      : {}),
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
    const list = (k: string) => {
      try {
        return (localStorage.getItem(k) ?? "").split(",").map((s) => s.trim())
      } catch {
        return []
      }
    }
    const paused = list("pot.mock.xcPaused")
    const unavailable = list("pot.mock.xcUnavailable")
    return {
      mode: "simulated",
      chains: XC_CHAINS.map((id) => {
        const c = XC_CONFIG[id]
        const coins = c.assets.map((a) => ({
          coin: a.coin,
          name: COIN_NAME[a.coin],
          stable: a.stable,
          decimals: a.decimals,
          status: unavailable.includes(`${id}:${a.coin}`) ? ("unavailable" as const) : ("ok" as const),
          minAmount: (c.minUsd > 1_000_000n ? c.minUsd : 1_000_000n).toString(),
        }))
        const open = coins.some((x) => x.status === "ok")
        return {
          id,
          label: c.label,
          status: paused.includes(id) || !open ? ("paused" as const) : c.speed === "fast" ? ("ok" as const) : ("slower" as const),
          speed: c.speed,
          minAmount: (c.minUsd > 1_000_000n ? c.minUsd : 1_000_000n).toString(),
          typicalSeconds: c.typicalSeconds,
          coins,
        }
      }),
    }
  },
  async price(req) {
    await delay(200)
    const usd = BigInt(req.amount)
    const asset = assetOf(req.chain, req.coin)
    if (!asset) throw err("bad_request")
    if (usd < XC_CONFIG[req.chain].minUsd || usd < 1_000_000n) throw err("amount_too_low")
    if (usd > SIM_MAX) throw err("amount_too_high")
    return {
      mode: "simulated",
      chain: req.chain,
      coin: asset.coin,
      decimals: asset.decimals,
      stable: asset.stable,
      usdTarget: usd.toString(),
      slippageBps: slippageFor(asset),
      quote: numbers(req.chain, usd, asset.coin),
      quotedAt: new Date().toISOString(),
    }
  },
  async quote(req) {
    await delay(250)
    const amount = BigInt(req.amount)
    const coin = req.coin ?? defaultCoin(req.chain)
    const asset = assetOf(req.chain, coin)
    if (!asset) throw err("bad_request")
    if (amount < 1_000_000n || amount < XC_CONFIG[req.chain].minUsd) throw err("amount_too_low")
    if (amount > SIM_MAX) throw err("amount_too_high")
    const coinFields = { coin, decimals: asset.decimals, stable: asset.stable, usdTarget: amount.toString() }
    if (req.dry) return { mode: "simulated", ...coinFields, quote: numbers(req.chain, amount, coin) }
    const all = load()
    const prior = all.find((x) => x.idempotencyKey === req.idempotencyKey)
    const now = Date.now()
    const rec: MockIntent = prior ?? {
      id: `dp_${Array.from(crypto.getRandomValues(new Uint8Array(13)), (b) => (b % 36).toString(36)).join("")}${now.toString(36)}`.slice(0, 29).padEnd(29, "0"),
      pot: req.pot,
      chain: req.chain,
      coin,
      usdTarget: amount.toString(),
      amountIn: numbers(req.chain, amount, coin).amountIn,
      numbers: numbers(req.chain, amount, coin),
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
      ...coinFields,
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
      const quoted = BigInt(i.amountIn)
      // the server's rules (sim.ts planSimSend): a second tap while the top-up is on its way is the same top-up
      const plan = planSimSend(
        i.sim,
        { status: i.status, scenario, required: BigInt(i.numbers.minAmountIn), quoted, cap: quoted, deadlineMs: i.deadline, ...(req.amount !== undefined ? { amount: BigInt(req.amount) } : {}) },
        now,
      )
      if (plan.kind === "already_sent") return i
      if (plan.kind === "refused") throw err(plan.why === "amount_too_high" ? "amount_too_high" : "bad_request", plan.why)
      const amount = plan.amount
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
