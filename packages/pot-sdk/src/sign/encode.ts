// SignedDelegate transport encoding (kb/meta-tx-relayer.md "Wire format"):
//   transport = base64(borsh(SignedDelegateAction)), no prefix
//   signed bytes = u32_le(2^30 + 366) ‖ borsh(DelegateAction)   (NEP-461 prefix 6e 01 00 40)
//   signature = ed25519(sha256(signed bytes))
// The decoder is a strict, dependency-free borsh reader (canonical by construction: it rejects
// trailing bytes, invalid UTF-8, bad enum/option tags) for the action subset NEAR defines up to
// tag 7; Delegate (8) and later tags are rejected (DelegateV2 is rejected on chain from p87).

import { base58Encode, base64Decode, concatBytes } from "../encoding.ts"
import type { PublicKeyStr } from "../types/ids.ts"

export const NEP461_DELEGATE_PREFIX = 1_073_742_190 // 2^30 + 366
export const NEP461_PREFIX_BYTES = Uint8Array.from([0x6e, 0x01, 0x00, 0x40])

export type DecodedAccessKeyPermission = "FullAccess" | { FunctionCall: { allowance: bigint | null; receiverId: string; methodNames: string[] } }

export type DecodedAction =
  | { type: "CreateAccount" }
  | { type: "DeployContract"; codeLength: number }
  | { type: "FunctionCall"; method: string; args: Uint8Array; argsJson: unknown; gas: bigint; deposit: bigint }
  | { type: "Transfer"; deposit: bigint }
  | { type: "Stake"; stake: bigint; publicKey: string }
  | { type: "AddKey"; publicKey: string; accessKey: { nonce: bigint; permission: DecodedAccessKeyPermission } }
  | { type: "DeleteKey"; publicKey: string }
  | { type: "DeleteAccount"; beneficiaryId: string }

export interface DecodedSignedDelegate {
  senderId: string
  receiverId: string
  actions: DecodedAction[]
  nonce: bigint
  maxBlockHeight: bigint
  /** "ed25519:<b58>" (or "secp256k1:<b58>") */
  publicKey: PublicKeyStr | string
  signature: { keyType: "ed25519" | "secp256k1"; data: Uint8Array }
  /** borsh(DelegateAction), without the NEP-461 prefix */
  delegateActionBytes: Uint8Array
  /** the full transport bytes */
  bytes: Uint8Array
}

export class DelegateDecodeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DelegateDecodeError"
  }
}

const utf8Strict = new TextDecoder("utf-8", { fatal: true })

class Reader {
  private o = 0
  private readonly b: Uint8Array
  private readonly view: DataView
  constructor(b: Uint8Array) {
    this.b = b
    this.view = new DataView(b.buffer, b.byteOffset, b.byteLength)
  }
  get offset(): number {
    return this.o
  }
  private need(n: number): void {
    if (this.o + n > this.b.length) throw new DelegateDecodeError("unexpected end of input")
  }
  u8(): number {
    this.need(1)
    return this.b[this.o++] as number
  }
  u32(): number {
    this.need(4)
    const v = this.view.getUint32(this.o, true)
    this.o += 4
    return v
  }
  u64(): bigint {
    this.need(8)
    const v = this.view.getBigUint64(this.o, true)
    this.o += 8
    return v
  }
  u128(): bigint {
    const lo = this.u64()
    const hi = this.u64()
    return (hi << 64n) | lo
  }
  bytes(n: number): Uint8Array {
    this.need(n)
    const v = this.b.slice(this.o, this.o + n)
    this.o += n
    return v
  }
  vecU8(): Uint8Array {
    return this.bytes(this.u32())
  }
  string(): string {
    const raw = this.vecU8()
    try {
      return utf8Strict.decode(raw)
    } catch {
      throw new DelegateDecodeError("invalid UTF-8 in string")
    }
  }
  done(): void {
    if (this.o !== this.b.length) throw new DelegateDecodeError(`${this.b.length - this.o} trailing bytes`)
  }
}

function readPublicKey(r: Reader): string {
  const t = r.u8()
  if (t === 0) return `ed25519:${base58Encode(r.bytes(32))}`
  if (t === 1) return `secp256k1:${base58Encode(r.bytes(64))}`
  throw new DelegateDecodeError(`unsupported public key type ${t}`)
}

function readAction(r: Reader): DecodedAction {
  const tag = r.u8()
  switch (tag) {
    case 0:
      return { type: "CreateAccount" }
    case 1:
      return { type: "DeployContract", codeLength: r.vecU8().length }
    case 2: {
      const method = r.string()
      const args = r.vecU8()
      const gas = r.u64()
      const deposit = r.u128()
      let argsJson: unknown = null
      try {
        argsJson = JSON.parse(utf8Strict.decode(args))
      } catch {
        argsJson = null
      }
      return { type: "FunctionCall", method, args, argsJson, gas, deposit }
    }
    case 3:
      return { type: "Transfer", deposit: r.u128() }
    case 4: {
      const stake = r.u128()
      return { type: "Stake", stake, publicKey: readPublicKey(r) }
    }
    case 5: {
      const publicKey = readPublicKey(r)
      const nonce = r.u64()
      const p = r.u8()
      let permission: DecodedAccessKeyPermission
      if (p === 1) permission = "FullAccess"
      else if (p === 0) {
        const opt = r.u8()
        if (opt > 1) throw new DelegateDecodeError("bad Option tag")
        const allowance = opt === 1 ? r.u128() : null
        const receiverId = r.string()
        const n = r.u32()
        const methodNames: string[] = []
        for (let i = 0; i < n; i++) methodNames.push(r.string())
        permission = { FunctionCall: { allowance, receiverId, methodNames } }
      } else throw new DelegateDecodeError(`bad access key permission tag ${p}`)
      return { type: "AddKey", publicKey, accessKey: { nonce, permission } }
    }
    case 6:
      return { type: "DeleteKey", publicKey: readPublicKey(r) }
    case 7:
      return { type: "DeleteAccount", beneficiaryId: r.string() }
    default:
      throw new DelegateDecodeError(`action tag ${tag} is not allowed inside a delegate`)
  }
}

/** Decodes base64 (or raw bytes) of a SignedDelegateAction. Throws DelegateDecodeError. */
export function decodeSignedDelegate(input: string | Uint8Array): DecodedSignedDelegate {
  let bytes: Uint8Array
  try {
    bytes = typeof input === "string" ? base64Decode(input) : input
  } catch {
    throw new DelegateDecodeError("invalid base64")
  }
  const r = new Reader(bytes)
  const senderId = r.string()
  const receiverId = r.string()
  const n = r.u32()
  if (n > 100) throw new DelegateDecodeError("too many actions")
  const actions: DecodedAction[] = []
  for (let i = 0; i < n; i++) actions.push(readAction(r))
  const nonce = r.u64()
  const maxBlockHeight = r.u64()
  const publicKey = readPublicKey(r)
  const delegateEnd = r.offset
  const sigType = r.u8()
  let signature: DecodedSignedDelegate["signature"]
  if (sigType === 0) signature = { keyType: "ed25519", data: r.bytes(64) }
  else if (sigType === 1) signature = { keyType: "secp256k1", data: r.bytes(65) }
  else throw new DelegateDecodeError(`unsupported signature type ${sigType}`)
  r.done()
  return { senderId, receiverId, actions, nonce, maxBlockHeight, publicKey, signature, delegateActionBytes: bytes.slice(0, delegateEnd), bytes }
}

/** The bytes whose sha256 the key signs: NEP-461 prefix ‖ borsh(DelegateAction). */
export const delegateSigningBytes = (delegateActionBytes: Uint8Array): Uint8Array => concatBytes(NEP461_PREFIX_BYTES, delegateActionBytes)

/** sha256 of the signing bytes (WebCrypto). */
export async function delegateHash(delegateActionBytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", new Uint8Array(delegateSigningBytes(delegateActionBytes))))
}
