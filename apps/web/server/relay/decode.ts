// Canonical decode of a SignedDelegate (api-spec §3.2 step 4) and its local signature check (step 8), on top of
// @pot/sdk/sign: its strict borsh reader is canonical by construction (trailing bytes, bad tags, invalid
// UTF-8, Delegate/DelegateV2 tags ≥ 8 are all rejected). near-api-js's schema decode is kept only to get the
// object `actions.signedDelegate()` needs for the outer tx, and must re-encode byte-identically.
import { deserialize } from "borsh"
import { encodeSignedDelegate, SCHEMA, type SignedDelegate } from "near-api-js"
import { decodeSignedDelegate as sdkDecode, verifySignedDelegate, type DecodedSignedDelegate } from "@pot/sdk/sign"
import { ApiError } from "../http/errors"
import { sha256Hex } from "../util/crypto"

export const MAX_DELEGATE_BYTES = 4096

export type DecodedAction =
  | {
      kind: "functionCall"
      method: string
      argsBytes: Uint8Array
      /** parsed JSON args, or undefined when the bytes aren't UTF-8 JSON */
      args: unknown
      gas: bigint
      deposit: bigint
    }
  | { kind: "addKey"; publicKey: string; fullAccess: boolean }
  | { kind: "other"; name: string }

export interface DecodedDelegate {
  bytes: Uint8Array
  /** hex sha256 of the transport bytes (relay_log.delegate_hash) */
  hash: string
  /** the near-api-js object, wrapped as-is into the relayer's outer tx */
  raw: SignedDelegate
  sdk: DecodedSignedDelegate
  senderId: string
  receiverId: string
  nonce: bigint
  maxBlockHeight: bigint
  publicKey: string
  keyType: "ed25519" | "secp256k1" | "other"
  actions: DecodedAction[]
}

const bad = (cause: string) => new ApiError("bad_request", { detail: { field: "signedDelegate", cause } })

export function decodeSignedDelegate(b64: string): DecodedDelegate {
  if (!b64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) throw bad("base64")
  const bytes = new Uint8Array(Buffer.from(b64, "base64"))
  if (bytes.length === 0 || bytes.length > MAX_DELEGATE_BYTES) throw bad("size")
  let sdk: DecodedSignedDelegate
  let raw: SignedDelegate
  try {
    sdk = sdkDecode(bytes)
    raw = deserialize(SCHEMA.SignedDelegate, bytes) as unknown as SignedDelegate
    const again = encodeSignedDelegate(raw)
    if (again.length !== bytes.length || again.some((b, i) => b !== bytes[i])) throw new Error("non-canonical")
  } catch {
    throw bad("decode")
  }
  const actions: DecodedAction[] = sdk.actions.map((a) => {
    if (a.type === "FunctionCall")
      return { kind: "functionCall", method: a.method, argsBytes: a.args, args: a.argsJson ?? undefined, gas: a.gas, deposit: a.deposit }
    if (a.type === "AddKey") return { kind: "addKey", publicKey: a.publicKey, fullAccess: a.accessKey.permission === "FullAccess" }
    return { kind: "other", name: a.type }
  })
  const keyType = sdk.publicKey.startsWith("ed25519:") ? "ed25519" : sdk.publicKey.startsWith("secp256k1:") ? "secp256k1" : "other"
  return {
    bytes,
    hash: sha256Hex(bytes),
    raw,
    sdk,
    senderId: sdk.senderId,
    receiverId: sdk.receiverId,
    nonce: sdk.nonce,
    maxBlockHeight: sdk.maxBlockHeight,
    publicKey: sdk.publicKey,
    keyType,
    actions,
  }
}

/** ed25519.verify(sig, sha256(NEP-461 prefix ‖ borsh(DelegateAction)), public_key), via @pot/sdk/sign. */
export async function verifyDelegateSignature(d: DecodedDelegate): Promise<boolean> {
  return verifySignedDelegate(d.sdk)
}
