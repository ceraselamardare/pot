// Opt-in live check against NEAR AI Cloud (a paid call, ~$0.001): LIVE_NEARAI=1 with NEAR_AI_API_KEY set.
//   LIVE_NEARAI=1 NEAR_AI_API_KEY=… pnpm --filter web exec vitest run server/features/receipts/nearai.live.test.ts
// Reads the e2e fixture photo (the $84.20 Pingo Doce sample) with the configured model and checks the reading and
// the proof link. No chain, no DB, no testnet lock needed. Skipped otherwise.
import { vi } from "vitest"
vi.mock("server-only", () => ({}))
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { nearAiReader, receiptsConfig } from "./nearai"

const LIVE = process.env.LIVE_NEARAI === "1" && !!process.env.NEAR_AI_API_KEY

describe.skipIf(!LIVE)("NEAR AI Cloud (live)", () => {
  it(
    "reads the fixture receipt: $84.20 at Pingo Doce, groceries; the link names the model",
    async () => {
      const cfg = receiptsConfig()
      expect(cfg.mode).toBe("live")
      const image = new Uint8Array(readFileSync(fileURLToPath(new URL("../../../e2e/fixtures/receipts/receipt-pingo-doce.jpg", import.meta.url))))
      const started = Date.now()
      const out = await nearAiReader(cfg)({ image, mime: "image/jpeg" })
      console.log(JSON.stringify({ ms: Date.now() - started, result: out.result, proof: out.proof && { reply: out.proof.reply, verify: out.proof.verifyUrl.split("#")[0] } }))
      expect(out.result).toMatchObject({ readable: true, totalCents: 8420, currency: "USD", category: "groceries" })
      if (out.result.readable) expect(out.result.merchant?.toLowerCase()).toContain("pingo doce")
      expect(out.proof?.verifyUrl).toMatch(/^https:\/\/cloud\.near\.ai\/verify\?model=/)
    },
    60_000,
  )
})
