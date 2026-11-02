// Gift actions on the live data source: every write to our API carries a JSON body, because checkCsrf refuses a
// write without `content-type: application/json` (a body-less DELETE was refused on testnet, 2026-11-02).
import { vi } from "vitest"
const h = vi.hoisted(() => ({ api: vi.fn() }))
vi.mock("../config", async (orig) => ({ ...(await orig<typeof import("../config")>()), IS_LIVE: true }))
vi.mock("../live/api", () => ({ api: h.api }))
vi.mock("../live/chain", () => ({ chain: () => ({}) }))
vi.mock("./chain", () => ({ sendGiftTransfer: vi.fn(), setGiftsOnChain: vi.fn() }))
vi.mock("../query", () => ({ queryClient: () => ({ invalidateQueries: vi.fn() }) }))
import { describe, expect, it } from "vitest"
import { revokeGiftLink } from "./actions"

describe("revokeGiftLink (live)", () => {
  it("sends DELETE with a JSON body so the server's same-origin check accepts it", async () => {
    h.api.mockResolvedValue({ status: 200, data: { ok: true } })
    await revokeGiftLink("lisbon-trip", "gl_abc")
    expect(h.api).toHaveBeenCalledWith("DELETE", "/api/pots/lisbon-trip/gift-links/gl_abc", {})
  })
})
