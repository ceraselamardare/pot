// X-04 wire types: compile-time shape checks against api-spec plus the runtime tables.
import { describe, expect, expectTypeOf, it } from "vitest"
import type { ApiReq, ApiRes, ApiRouteKey, FeedApiItem, RelayOk, RelayReq, RelayResult, SessionHint } from "./api.ts"
import { OP_KEY_RE, REASONS, REASON_HTTP_STATUS, RELAY_INTENT_TYPES, isDemoRelayReq, isErr, isRelayPending } from "./api.ts"
import { ACTION_INTENT_TYPES } from "./intents.ts"
import { intentToWire } from "../actions/build.ts"
import { newOpKey } from "../validate.ts"

describe("API wire types (X-04)", () => {
  it("every §1.2 reason has an HTTP status", () => {
    expect(new Set(REASONS).size).toBe(REASONS.length)
    expect(Object.keys(REASON_HTTP_STATUS).sort()).toEqual([...REASONS].sort())
    expect(REASON_HTTP_STATUS.not_signed_in).toBe(401)
    expect(REASON_HTTP_STATUS.quota_exceeded).toBe(429)
    expect(REASON_HTTP_STATUS.pairing_expired).toBe(410)
  })

  it("relay intents = action intents minus add_device_key (rev5: no withdraw)", () => {
    expect([...RELAY_INTENT_TYPES].sort()).toEqual(ACTION_INTENT_TYPES.filter((t) => t !== "add_device_key").sort())
    expect(OP_KEY_RE.test(newOpKey())).toBe(true)
  })

  it("route map shapes", () => {
    expectTypeOf<ApiReq<"POST /api/relay">>().toEqualTypeOf<RelayReq>()
    expectTypeOf<ApiRes<"POST /api/faucet">>().toHaveProperty("txHash")
    expectTypeOf<ApiReq<"POST /api/notes">>().toHaveProperty("kind").toEqualTypeOf<"memo" | "decline_reason">()
    expectTypeOf<ApiRes<"GET /api/pots/[pot]/feed">>().toHaveProperty("items").toEqualTypeOf<FeedApiItem[]>()
    expectTypeOf<ApiRes<"GET /api/session">>().toHaveProperty("session")
    expectTypeOf<Extract<RelayResult, { type: "spend" }>>().toHaveProperty("payout")
    expectTypeOf<RelayOk>().toHaveProperty("final").toEqualTypeOf<boolean>()
    expectTypeOf<SessionHint>().toHaveProperty("kind")
    const keys: ApiRouteKey[] = ["POST /api/session/dev", "GET /api/demo/state", "POST /api/oneclick/simulate", "GET /api/health"]
    expect(keys).toHaveLength(4)
  })

  it("guards", () => {
    const demo: RelayReq = { demo: { intent: intentToWire({ type: "propose_close", pot: "lisbon-trip.pots.potapp.testnet" as never }) }, idempotencyKey: newOpKey() }
    expect(isDemoRelayReq(demo)).toBe(true)
    expect(isErr({ ok: false })).toBe(true)
    expect(isRelayPending({ ok: true, requestId: "r", status: "pending", relayId: "rl", txHash: "h" })).toBe(true)
    // JSON-safe: a demo body survives JSON round-trips
    expect(JSON.parse(JSON.stringify(demo))).toEqual(demo)
  })
})
