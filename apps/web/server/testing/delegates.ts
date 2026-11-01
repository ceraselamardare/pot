// Test helpers: real NEP-366 delegates built in-test with a KeyPair signer (near-api-js 7.3.1).
import {
  actions,
  buildDelegateAction,
  encodeSignedDelegate,
  KeyPair,
  KeyPairSigner,
  PublicKey,
  type Action,
} from "near-api-js"

export const TGAS = 1_000_000_000_000n
export const HUB = "pots.potapp.testnet"
export const USDC = "usdc.potapp.testnet"
export const DAO = `lisbon-trip.${HUB}`
export const USER = "u-abcd1234.users.potapp.testnet"

export const newKey = () => KeyPair.fromRandom("ed25519")

export function fc(method: string, args: unknown, gasTgas: bigint | number = 100, deposit = 0n): Action {
  const bytes = typeof args === "string" ? new TextEncoder().encode(args) : new TextEncoder().encode(JSON.stringify(args))
  return actions.functionCall(method, bytes, BigInt(gasTgas) * TGAS, deposit)
}

export async function signDelegate(opts: {
  key: KeyPair
  sender?: string
  receiver: string
  actions: Action[]
  nonce?: bigint
  maxBlockHeight?: bigint
}): Promise<{ b64: string; bytes: Uint8Array }> {
  const da = buildDelegateAction({
    senderId: opts.sender ?? USER,
    receiverId: opts.receiver,
    actions: opts.actions,
    nonce: opts.nonce ?? 1001n,
    maxBlockHeight: opts.maxBlockHeight ?? 1_000_100n,
    publicKey: PublicKey.from(opts.key.getPublicKey().toString()),
  })
  const { signedDelegate } = await new KeyPairSigner(opts.key).signDelegateAction(da)
  const bytes = encodeSignedDelegate(signedDelegate)
  return { b64: Buffer.from(bytes).toString("base64"), bytes }
}

export const addFullAccessKey = (pk: string) => actions.addFullAccessKey(PublicKey.from(pk))
export const transfer = (n: bigint) => actions.transfer(n)
