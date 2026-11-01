// NEAR AI Cloud receipt reader (docs.near.ai/cloud, verified 2026-11-01): OpenAI-compatible
// POST {base}/chat/completions with `Authorization: Bearer <NEAR_AI_API_KEY>`, an image_url data: part and
// `response_format: json_schema` (strict structured output; the default z-ai/glm-5.3-flash lists
// "structured_outputs" in GET /v1/models). The model runs in an attested TEE (Intel TDX + NVIDIA confidential
// computing): GET /v1/attestation/report?model=… returns its model_attestations (intel_quote, nvidia_payload,
// signing_address), and GET /v1/signature/{chat_id} a per-reply signature over
// "<model>:<sha256(request bytes)>:<sha256(response bytes)>" (signature_kind provider_tee).
//
// Proof we hand the person: the public Verification Center (cloud.near.ai/verify?model=…) checks the model's
// hardware evidence in their browser. When this reply's signature is available and its signed text names the
// exact bytes we sent and received (checked here: only we hold them), the link also carries the reply receipt
// (#receipt=<base64url JSON>, a URL fragment the browser never sends). We don't claim more than that.
//
// Privacy (D-61, no uploads): the image lives only in this request's memory. It is never logged, stored or
// written to disk; errors carry status codes only, never bodies.
import "server-only"
import { z } from "zod"
import {
  RECEIPT_JSON_SCHEMA,
  RECEIPT_PROMPT,
  mockReceipt,
  normalizeReceipt,
  parseModelJson,
  type ReceiptProof,
  type ReceiptResult,
} from "@/lib/receipt"
import { sha256Hex } from "../../util/crypto"

export const NEAR_AI_DEFAULT_BASE_URL = "https://cloud-api.near.ai/v1"
export const NEAR_AI_DEFAULT_RECEIPT_MODEL = "z-ai/glm-5.3-flash" // NEAR-hosted (private), image input; Qwen3-VL hung on 2026-11-01
export const NEAR_AI_VERIFY_URL = "https://cloud.near.ai/verify"
/** The provider gets this long for one reading; the route answers with a timeout after it (the client falls back). */
export const RECEIPT_PROVIDER_TIMEOUT_MS = 25_000
/** Extra time we wait for the reply's signature (it can take a moment to be recorded); then the link is model-only. */
export const RECEIPT_PROOF_BUDGET_MS = 2_500

export type ReceiptsMode = "off" | "mock" | "live"

type Env = Record<string, string | undefined>

export interface ReceiptsConfig {
  mode: ReceiptsMode
  apiKey: string | null
  baseUrl: string
  model: string
  timeoutMs: number
}

/**
 * Env → config. Live when NEAR_AI_API_KEY is set (server only; never NEXT_PUBLIC). NEAR_AI_RECEIPTS_MODE=mock serves
 * the deterministic sample (tests, local builds without a key; refused on production), =off turns the feature off.
 */
export function receiptsConfig(env: Env = process.env): ReceiptsConfig {
  const apiKey = env.NEAR_AI_API_KEY?.trim() || null
  const forced = env.NEAR_AI_RECEIPTS_MODE?.trim().toLowerCase()
  const production = env.VERCEL_ENV === "production"
  const mode: ReceiptsMode = forced === "off" ? "off" : forced === "mock" ? (production ? "off" : "mock") : apiKey ? "live" : "off"
  const timeout = Number(env.NEAR_AI_RECEIPT_TIMEOUT_MS)
  return {
    mode,
    apiKey,
    baseUrl: (env.NEAR_AI_BASE_URL?.trim() || NEAR_AI_DEFAULT_BASE_URL).replace(/\/+$/, ""),
    model: env.NEAR_AI_RECEIPT_MODEL?.trim() || NEAR_AI_DEFAULT_RECEIPT_MODEL,
    timeoutMs: Number.isFinite(timeout) && timeout >= 1_000 && timeout <= 60_000 ? timeout : RECEIPT_PROVIDER_TIMEOUT_MS,
  }
}

export const receiptsEnabled = (env: Env = process.env) => receiptsConfig(env).mode !== "off"

export type ProviderFailure = "timeout" | "busy" | "auth" | "provider" | "aborted"

/** Why the provider didn't give us a reading. The message is the kind only: never a body, never the image. */
export class ReceiptProviderError extends Error {
  constructor(
    readonly kind: ProviderFailure,
    readonly status?: number,
  ) {
    super(`receipt provider: ${kind}${status ? ` ${status}` : ""}`)
  }
}

export interface ReaderInput {
  image: Uint8Array
  mime: "image/jpeg" | "image/png" | "image/webp"
  signal?: AbortSignal
}

export interface ReaderOutput {
  result: ReceiptResult
  proof: ReceiptProof | null
}

export type ReceiptReader = (input: ReaderInput) => Promise<ReaderOutput>

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>

/** The completion request body, built once: its exact bytes are what the reply's signature covers. */
export function completionBody(model: string, image: Uint8Array, mime: string): Uint8Array {
  const body = {
    model,
    temperature: 0,
    max_tokens: 1500,
    stream: false,
    response_format: { type: "json_schema", json_schema: { name: "receipt", strict: true, schema: RECEIPT_JSON_SCHEMA } },
    messages: [
      { role: "system", content: RECEIPT_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: "Read this receipt." },
          { type: "image_url", image_url: { url: `data:${mime};base64,${Buffer.from(image).toString("base64")}` } },
        ],
      },
    ],
  }
  return new TextEncoder().encode(JSON.stringify(body))
}

const completionRes = z.object({
  id: z.string().min(1).max(200),
  choices: z.array(z.object({ message: z.object({ content: z.unknown() }).passthrough() }).passthrough()).min(1),
})

const signatureRes = z.object({
  text: z.string().max(1000),
  signature: z.string().max(400),
  signing_address: z.string().max(200),
  signing_algo: z.enum(["ecdsa", "ed25519"]),
  signature_kind: z.string().max(40).optional(),
})

/** cloud.near.ai/verify for the model; with this reply's receipt in the fragment when it binds to our bytes. */
export function verifyUrl(model: string, receipt?: Record<string, string>): string {
  const base = `${NEAR_AI_VERIFY_URL}?model=${encodeURIComponent(model)}`
  return receipt ? `${base}#receipt=${Buffer.from(JSON.stringify(receipt)).toString("base64url")}` : base
}

/**
 * The reply's signature, accepted only when it is a model-TEE (provider_tee) signature whose text is exactly
 * "<model>:<sha256(our request bytes)>:<sha256(the response bytes)>". Anything else → null (model-only link).
 */
export function replyReceipt(model: string, completionId: string, reqBytes: Uint8Array, resBytes: Uint8Array, sig: unknown): Record<string, string> | null {
  const p = signatureRes.safeParse(sig)
  if (!p.success) return null
  const s = p.data
  if (s.signature_kind !== undefined && s.signature_kind !== "provider_tee") return null
  const expected = `${model}:${sha256Hex(reqBytes)}:${sha256Hex(resBytes)}`
  if (s.text !== expected) return null
  return {
    completionId,
    model,
    signatureKind: "provider_tee",
    signingAlgo: s.signing_algo,
    signingAddress: s.signing_address,
    signedText: s.text,
    signature: s.signature,
  }
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true })
  })

async function fetchReplyReceipt(
  cfg: ReceiptsConfig,
  doFetch: FetchLike,
  completionId: string,
  reqBytes: Uint8Array,
  resBytes: Uint8Array,
  budgetMs: number,
): Promise<Record<string, string> | null> {
  const deadline = AbortSignal.timeout(budgetMs)
  const url = `${cfg.baseUrl}/signature/${encodeURIComponent(completionId)}?model=${encodeURIComponent(cfg.model)}&signing_algo=ecdsa`
  for (let attempt = 0; attempt < 3 && !deadline.aborted; attempt++) {
    try {
      const res = await doFetch(url, {
        method: "GET",
        headers: { authorization: `Bearer ${cfg.apiKey}`, accept: "application/json" },
        signal: deadline,
      })
      if (res.status === 404) {
        // not recorded yet: a short, bounded retry (docs: response-signatures)
        await sleep(600, deadline)
        continue
      }
      if (!res.ok) return null
      return replyReceipt(cfg.model, completionId, reqBytes, resBytes, await res.json())
    } catch {
      return null
    }
  }
  return null
}

/** The live reader: one completion, then (best effort, bounded) the reply's proof. */
export function nearAiReader(cfg: ReceiptsConfig, doFetch: FetchLike = fetch, proofBudgetMs = RECEIPT_PROOF_BUDGET_MS): ReceiptReader {
  return async ({ image, mime, signal }) => {
    if (!cfg.apiKey) throw new ReceiptProviderError("auth")
    const reqBytes = completionBody(cfg.model, image, mime)
    const timeout = AbortSignal.timeout(cfg.timeoutMs)
    const both = signal ? AbortSignal.any([timeout, signal]) : timeout
    let res: Response
    let resBytes: Uint8Array
    try {
      res = await doFetch(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${cfg.apiKey}`,
          "content-type": "application/json",
          accept: "application/json",
          // the signature covers the uncompressed bytes of the canonical model's own reply (docs: response-signatures)
          "accept-encoding": "identity",
          "x-no-aliasing": "true",
        },
        body: reqBytes as BodyInit,
        signal: both,
      })
      resBytes = new Uint8Array(await res.arrayBuffer())
    } catch {
      if (timeout.aborted) throw new ReceiptProviderError("timeout")
      if (signal?.aborted) throw new ReceiptProviderError("aborted")
      throw new ReceiptProviderError("provider")
    }
    if (!res.ok) {
      if (res.status === 401 || res.status === 403 || res.status === 402) throw new ReceiptProviderError("auth", res.status)
      if (res.status === 429 || res.status === 503) throw new ReceiptProviderError("busy", res.status)
      if (res.status === 504 || res.status === 408) throw new ReceiptProviderError("timeout", res.status)
      throw new ReceiptProviderError("provider", res.status)
    }
    let parsed: z.infer<typeof completionRes>
    try {
      const c = completionRes.safeParse(JSON.parse(new TextDecoder().decode(resBytes)))
      if (!c.success) throw new Error("shape")
      parsed = c.data
    } catch {
      throw new ReceiptProviderError("provider", res.status)
    }
    const result = normalizeReceipt(parseModelJson(parsed.choices[0]!.message.content))
    const receipt = await fetchReplyReceipt(cfg, doFetch, parsed.id, reqBytes, resBytes, proofBudgetMs)
    return { result, proof: { verifyUrl: verifyUrl(cfg.model, receipt ?? undefined), reply: !!receipt } }
  }
}

/** MOCK mode: the deterministic sample (no network, no proof link). */
export const mockReader: ReceiptReader = async () => ({ result: mockReceipt(), proof: null })

export function readerFor(cfg: ReceiptsConfig): ReceiptReader {
  return cfg.mode === "live" ? nearAiReader(cfg) : mockReader
}
