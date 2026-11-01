// Invite crypto with near-api-js (noble ed25519 underneath), D-08 / contracts-spec §3.7. Works
// where WebCrypto has no Ed25519 (the root module's *WebCrypto twins need it). Ed25519 is
// deterministic (RFC 8032), so both paths produce identical signatures.

import { KeyPairEd25519, PublicKey } from "near-api-js"
import { base58Encode, base64Decode, base64Encode } from "../encoding.ts"
import { claimMessageBytes, generateInviteSeed, invitePkToParam, joinMessageBytes, secretToSeed, seedToSecret } from "../invite.ts"
import type { PublicKeyStr } from "../types/ids.ts"

export interface InviteKey {
  /** 32-byte seed: the private half; only ever in the link fragment */
  seed: Uint8Array
  /** base64url seed for `#<secret>` (43 chars) */
  secret: string
  /** "ed25519:<b58>" for hub calls (add_invite, create_pot, join) */
  publicKey: PublicKeyStr
  /** "<b58>" for the `?i=` param */
  param: string
}

const keyPairFromSeed = (seed: Uint8Array): KeyPairEd25519 => {
  if (seed.length !== 32) throw new Error("invite seed must be 32 bytes")
  return new KeyPairEd25519(base58Encode(seed))
}

export function inviteKeyFromSeed(seed: Uint8Array): InviteKey {
  const publicKey = keyPairFromSeed(seed).getPublicKey().toString() as PublicKeyStr
  return { seed, secret: seedToSecret(seed), publicKey, param: invitePkToParam(publicKey) }
}

/** A new invite keypair (random seed). */
export const generateInvite = (): InviteKey => inviteKeyFromSeed(generateInviteSeed())

/**
 * Signs `pot-join:v1:<dao>:<joiner>` with the invite seed (or the link's `#secret`).
 * Returns the `join` args: invitePk "ed25519:…" and signature = padded base64 (88 chars).
 */
export function signJoin(seedOrSecret: Uint8Array | string, daoId: string, joiner: string): { invitePk: PublicKeyStr; signature: string } {
  const seed = typeof seedOrSecret === "string" ? secretToSeed(seedOrSecret) : seedOrSecret
  const kp = keyPairFromSeed(seed)
  const { signature } = kp.sign(joinMessageBytes(daoId, joiner))
  return { invitePk: kp.getPublicKey().toString() as PublicKeyStr, signature: base64Encode(signature) }
}

/** Verifies a join signature as the hub's `env::ed25519_verify` does. */
export function verifyJoin(invitePk: PublicKeyStr | string, daoId: string, joiner: string, signatureB64: string): boolean {
  try {
    const sig = base64Decode(signatureB64)
    if (sig.length !== 64) return false
    return PublicKey.from(invitePk).verify(joinMessageBytes(daoId, joiner), sig)
  } catch {
    return false
  }
}

/** hub 1.1.0: a new pay-by-link key (same shape as an invite key: the secret goes in the #fragment). */
export const generateClaimKey = (): InviteKey => generateInvite()

/** Signs `pot-claim:v1:<hub>:<dao>:<request_id>:<receiver>` with the link seed (or `#secret`) → padded base64. */
export function signClaim(seedOrSecret: Uint8Array | string, hubId: string, daoId: string, requestId: number, receiver: string): string {
  const seed = typeof seedOrSecret === "string" ? secretToSeed(seedOrSecret) : seedOrSecret
  return base64Encode(keyPairFromSeed(seed).sign(claimMessageBytes(hubId, daoId, requestId, receiver)).signature)
}

/** Verifies a claim signature as the hub's `env::ed25519_verify` does. */
export function verifyClaim(claimPk: PublicKeyStr | string, hubId: string, daoId: string, requestId: number, receiver: string, signatureB64: string): boolean {
  try {
    const sig = base64Decode(signatureB64)
    if (sig.length !== 64) return false
    return PublicKey.from(claimPk).verify(claimMessageBytes(hubId, daoId, requestId, receiver), sig)
  } catch {
    return false
  }
}
