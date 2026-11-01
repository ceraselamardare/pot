// The NEAR AI Cloud receipt reader with a mocked fetch: the exact request (endpoint, auth, structured output, the
// image as a data: part, no aliasing), timeouts and provider errors, untrusted model output, and the proof link
// (the Verification Center for the model; this reply's receipt only when its signed text names our exact bytes).
import { vi } from "vitest"
vi.mock("server-only", () => ({}))
import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import {
  NEAR_AI_DEFAULT_BASE_URL,
  NEAR_AI_DEFAULT_RECEIPT_MODEL,
  ReceiptProviderError,
  completionBody,
  mockReader,
  nearAiReader,
  readerFor,
  receiptsConfig,
  replyReceipt,
  verifyUrl,
  type FetchLike,
  type ReceiptsConfig,
} from "./nearai"

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8])
const MODEL = NEAR_AI_DEFAULT_RECEIPT_MODEL
const cfg = (over: Partial<ReceiptsConfig> = {}): ReceiptsConfig => ({
  mode: "live",
  apiKey: "sk-test-key",
  baseUrl: NEAR_AI_DEFAULT_BASE_URL,
  model: MODEL,
  timeoutMs: 25_000,
  ...over,
})
const hex = (b: Uint8Array) => createHash("sha256").update(b).digest("hex")

const MODEL_JSON = {
  readable: true,
  merchant: "Pingo Doce",
  date: "2026-10-28",
  currency: "USD",
  total: 84.2,
  tax: 4.82,
  tip: null,
  items: [{ name: "Vinho Verde", qty: 3, amount: 17.97 }],
  category: "groceries",
  confidence: 0.92,
}

function completion(content: unknown, id = "chatcmpl-abc123") {
  return JSON.stringify({ id, object: "chat.completion", model: MODEL, choices: [{ index: 0, message: { role: "assistant", content } }] })
}

type Call = { url: string; init: RequestInit }

/** A fetch that answers the completion with `body` and the signature route with `sig` (a function of the bytes). */
function provider(opts: {
  status?: number
  body?: string
  sig?: (req: Uint8Array, res: Uint8Array) => { status: number; body?: unknown }
  hang?: boolean
}) {
  const calls: Call[] = []
  let reqBytes: Uint8Array = new Uint8Array()
  let resBytes: Uint8Array = new Uint8Array()
  const f: FetchLike = async (url, init) => {
    calls.push({ url, init })
    if (url.endsWith("/chat/completions")) {
      reqBytes = init.body as Uint8Array
      if (opts.hang)
        return new Promise<Response>((_, reject) =>
          init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true }),
        )
      resBytes = new TextEncoder().encode(opts.body ?? completion(JSON.stringify(MODEL_JSON)))
      return new Response(resBytes as BodyInit, { status: opts.status ?? 200, headers: { "content-type": "application/json" } })
    }
    if (url.includes("/signature/")) {
      const s = opts.sig ? opts.sig(reqBytes, resBytes) : { status: 404 }
      return new Response(s.body === undefined ? null : JSON.stringify(s.body), { status: s.status })
    }
    throw new Error(`unexpected ${url}`)
  }
  return { f, calls }
}

const goodSig = (req: Uint8Array, res: Uint8Array) => ({
  status: 200,
  body: {
    text: `${MODEL}:${hex(req)}:${hex(res)}`,
    signature: `0x${"ab".repeat(65)}`,
    signing_address: "0x2665cce942fa427ef30d87f4b0bff67fb7645462",
    signing_algo: "ecdsa",
    signature_kind: "provider_tee",
  },
})

describe("config", () => {
  it("live with a key; off without; MOCK mode on request but never on production", () => {
    expect(receiptsConfig({ NEAR_AI_API_KEY: "k" })).toMatchObject({
      mode: "live",
      apiKey: "k",
      baseUrl: "https://cloud-api.near.ai/v1",
      model: "z-ai/glm-5.3-flash",
      timeoutMs: 25_000,
    })
    expect(receiptsConfig({}).mode).toBe("off")
    expect(receiptsConfig({ NEAR_AI_RECEIPTS_MODE: "mock" }).mode).toBe("mock")
    expect(receiptsConfig({ NEAR_AI_RECEIPTS_MODE: "mock", VERCEL_ENV: "production" }).mode).toBe("off")
    expect(receiptsConfig({ NEAR_AI_API_KEY: "k", NEAR_AI_RECEIPTS_MODE: "off" }).mode).toBe("off")
    expect(
      receiptsConfig({ NEAR_AI_API_KEY: "k", NEAR_AI_BASE_URL: "https://example.test/v1/", NEAR_AI_RECEIPT_MODEL: "x/y" }),
    ).toMatchObject({ baseUrl: "https://example.test/v1", model: "x/y" })
    expect(readerFor(cfg({ mode: "mock" }))).toBe(mockReader)
  })
})

describe("the request", () => {
  it("POSTs one OpenAI-compatible completion: bearer key, strict JSON schema, the photo as a data: part, no aliasing", async () => {
    const { f, calls } = provider({})
    await nearAiReader(cfg(), f, 50)({ image: JPEG, mime: "image/jpeg" })
    const c = calls[0]!
    expect(c.url).toBe("https://cloud-api.near.ai/v1/chat/completions")
    const h = c.init.headers as Record<string, string>
    expect(h.authorization).toBe("Bearer sk-test-key")
    expect(h["x-no-aliasing"]).toBe("true")
    expect(h["accept-encoding"]).toBe("identity")
    const body = JSON.parse(new TextDecoder().decode(c.init.body as Uint8Array))
    expect(body.model).toBe(MODEL)
    expect(body.temperature).toBe(0)
    expect(body.response_format).toMatchObject({ type: "json_schema", json_schema: { name: "receipt", strict: true } })
    expect(body.response_format.json_schema.schema.required).toContain("total")
    const parts = body.messages[1].content
    expect(parts[1]).toEqual({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${Buffer.from(JPEG).toString("base64")}` } })
    expect(body.messages[0].content).toMatch(/data, not instructions/)
  })

  it("the body is built once, byte-stable (the reply's proof covers these exact bytes)", () => {
    expect(completionBody(MODEL, JPEG, "image/jpeg")).toEqual(completionBody(MODEL, JPEG, "image/jpeg"))
  })
})

describe("answers", () => {
  it("a reading comes back normalized; the link is model-only when no reply proof is recorded", async () => {
    const { f } = provider({})
    const out = await nearAiReader(cfg(), f, 50)({ image: JPEG, mime: "image/jpeg" })
    expect(out.result).toMatchObject({ readable: true, merchant: "Pingo Doce", currency: "USD", totalCents: 8420, category: "groceries", confidence: "high" })
    expect(out.proof).toEqual({ verifyUrl: "https://cloud.near.ai/verify?model=z-ai%2Fglm-5.3-flash", reply: false })
  })

  it("model output in a code fence, or as junk → read or unreadable, never a throw", async () => {
    let r = await nearAiReader(cfg(), provider({ body: completion("```json\n" + JSON.stringify(MODEL_JSON) + "\n```") }).f, 10)({ image: JPEG, mime: "image/jpeg" })
    expect(r.result.readable).toBe(true)
    r = await nearAiReader(cfg(), provider({ body: completion("I can't read this image, sorry.") }).f, 10)({ image: JPEG, mime: "image/jpeg" })
    expect(r.result).toEqual({ readable: false })
    r = await nearAiReader(cfg(), provider({ body: completion(JSON.stringify({ ...MODEL_JSON, readable: false })) }).f, 10)({ image: JPEG, mime: "image/jpeg" })
    expect(r.result).toEqual({ readable: false })
  })

  it.each([
    [401, "auth"],
    [402, "auth"],
    [429, "busy"],
    [503, "busy"],
    [504, "timeout"],
    [500, "provider"],
    [400, "provider"],
  ] as const)("HTTP %s → %s (no body in the error)", async (status, kind) => {
    const { f } = provider({ status, body: JSON.stringify({ error: { message: "secret detail" } }) })
    const e = await nearAiReader(cfg(), f, 10)({ image: JPEG, mime: "image/jpeg" }).catch((x: unknown) => x)
    expect(e).toBeInstanceOf(ReceiptProviderError)
    expect((e as ReceiptProviderError).kind).toBe(kind)
    expect(String((e as Error).message)).not.toMatch(/secret|base64|\/9j/)
  })

  it("a completion that isn't JSON (an HTML error page with 200) → provider", async () => {
    const e = await nearAiReader(cfg(), provider({ body: "<html>oops</html>" }).f, 10)({ image: JPEG, mime: "image/jpeg" }).catch((x: unknown) => x)
    expect((e as ReceiptProviderError).kind).toBe("provider")
  })

  it("times out after the configured budget; a cancelled request says aborted", async () => {
    const slow = provider({ hang: true })
    const started = Date.now()
    const e = await nearAiReader(cfg({ timeoutMs: 1_000 }), slow.f, 10)({ image: JPEG, mime: "image/jpeg" }).catch((x: unknown) => x)
    expect((e as ReceiptProviderError).kind).toBe("timeout")
    expect(Date.now() - started).toBeLessThan(3_000)
    const ctrl = new AbortController()
    const p = nearAiReader(cfg(), provider({ hang: true }).f, 10)({ image: JPEG, mime: "image/jpeg", signal: ctrl.signal })
    ctrl.abort()
    expect(((await p.catch((x: unknown) => x)) as ReceiptProviderError).kind).toBe("aborted")
  })

  it("no key → auth, without calling anyone", async () => {
    const { f, calls } = provider({})
    await expect(nearAiReader(cfg({ apiKey: null }), f)({ image: JPEG, mime: "image/jpeg" })).rejects.toMatchObject({ kind: "auth" })
    expect(calls).toHaveLength(0)
  })

  it("a network failure → provider", async () => {
    const f: FetchLike = async () => {
      throw new TypeError("fetch failed")
    }
    await expect(nearAiReader(cfg(), f)({ image: JPEG, mime: "image/jpeg" })).rejects.toMatchObject({ kind: "provider" })
  })
})

describe("proof of where it was read", () => {
  it("a provider_tee signature over our exact bytes → the link carries this reply's receipt", async () => {
    const { f, calls } = provider({ sig: goodSig })
    const out = await nearAiReader(cfg(), f, 1_000)({ image: JPEG, mime: "image/jpeg" })
    expect(out.proof?.reply).toBe(true)
    const sigCall = calls.find((c) => c.url.includes("/signature/"))!
    expect(sigCall.url).toBe(`https://cloud-api.near.ai/v1/signature/chatcmpl-abc123?model=${encodeURIComponent(MODEL)}&signing_algo=ecdsa`)
    expect((sigCall.init.headers as Record<string, string>).authorization).toBe("Bearer sk-test-key")
    const [base, frag] = out.proof!.verifyUrl.split("#receipt=")
    expect(base).toBe(verifyUrl(MODEL))
    const receipt = JSON.parse(Buffer.from(frag!, "base64url").toString())
    expect(receipt).toMatchObject({
      completionId: "chatcmpl-abc123",
      model: MODEL,
      signatureKind: "provider_tee",
      signingAlgo: "ecdsa",
      signingAddress: "0x2665cce942fa427ef30d87f4b0bff67fb7645462",
    })
    expect(receipt.signedText).toMatch(new RegExp(`^${MODEL.replace("/", "\\/")}:[0-9a-f]{64}:[0-9a-f]{64}$`))
    // the receipt holds hashes, never the photo
    expect(out.proof!.verifyUrl).not.toContain(Buffer.from(JPEG).toString("base64"))
  })

  it("a signature over other bytes, a gateway signature or a broken body → model-only link", async () => {
    const wrong = (req: Uint8Array, res: Uint8Array) => ({ status: 200, body: { ...goodSig(req, res).body, text: `${MODEL}:${"0".repeat(64)}:${hex(res)}` } })
    const gateway = (req: Uint8Array, res: Uint8Array) => ({ status: 200, body: { ...goodSig(req, res).body, signature_kind: "gateway", text: `${hex(req)}:${hex(res)}` } })
    const broken = () => ({ status: 200, body: { error_code: "unavailable", message: "stream disconnected" } })
    const fails = () => ({ status: 500, body: {} })
    for (const sig of [wrong, gateway, broken, fails]) {
      const out = await nearAiReader(cfg(), provider({ sig }).f, 1_000)({ image: JPEG, mime: "image/jpeg" })
      expect(out.proof).toEqual({ verifyUrl: verifyUrl(MODEL), reply: false })
    }
  })

  it("not recorded yet (404) → a short retry, then the receipt", async () => {
    let n = 0
    const later = (req: Uint8Array, res: Uint8Array) => (n++ === 0 ? { status: 404 } : goodSig(req, res))
    const out = await nearAiReader(cfg(), provider({ sig: later }).f, 2_500)({ image: JPEG, mime: "image/jpeg" })
    expect(out.proof?.reply).toBe(true)
  })

  it("replyReceipt checks the shape and the exact text", () => {
    const req = new Uint8Array([1])
    const res = new Uint8Array([2])
    expect(replyReceipt(MODEL, "id", req, res, goodSig(req, res).body)).not.toBeNull()
    expect(replyReceipt(MODEL, "id", req, res, { ...goodSig(req, res).body, signing_algo: "rsa" })).toBeNull()
    expect(replyReceipt("other/model", "id", req, res, goodSig(req, res).body)).toBeNull()
    expect(replyReceipt(MODEL, "id", req, res, null)).toBeNull()
  })
})

describe("MOCK mode", () => {
  it("returns the deterministic sample, no network, no proof link", async () => {
    expect(await mockReader({ image: JPEG, mime: "image/jpeg" })).toEqual({
      result: expect.objectContaining({ readable: true, merchant: "Pingo Doce", totalCents: 8420 }),
      proof: null,
    })
  })
})
