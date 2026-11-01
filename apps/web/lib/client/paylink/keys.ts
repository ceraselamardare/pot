// Link keys in the browser (pay by link, hub 1.1.0). Same shape as invite keys (lib/client/invite.ts, D-08): a fresh
// 32-byte ed25519 seed whose base64url form (43 chars) is the link's #secret. Generated and used only on this
// device: the requester's browser makes the key and sends the public half with request_spend; the claimer's browser
// signs `pot-claim:v1:<hub>:<pot>:<id>:<receiver>` with the secret from the #fragment. The secret is never sent.
// WebCrypto Ed25519 first, @noble/curves when the browser has none (both deterministic: identical signatures).
import { base64Encode, claimMessageBytes, publicKeyFromBytes, secretToSeed, signClaimWebCrypto, webCryptoInviteKey } from "@pot/sdk"
import { generateInvite, type InviteKeys } from "../invite"

export type LinkKeys = InviteKeys

/** A new link key: `{ pk: "ed25519:…", secret }`. */
export const generateLinkKey = (): Promise<LinkKeys> => generateInvite()

/** The link key's public half, from the #secret (to tell a wrong or stale link from a good one before signing). */
export async function publicKeyOfSecret(secret: string): Promise<string> {
  const seed = secretToSeed(secret)
  try {
    return (await webCryptoInviteKey(seed)).publicKey
  } catch {
    const { ed25519 } = await import("@noble/curves/ed25519.js")
    return publicKeyFromBytes(ed25519.getPublicKey(seed))
  }
}

/**
 * The `claim_link` signature: raw ed25519 over the claim message, standard padded base64 (88 chars), exactly what
 * the hub's `env::ed25519_verify` checks. `receiver` is the claimer's own account (the money goes there).
 */
export async function signClaimLink(secret: string, hubId: string, daoId: string, requestId: number, receiver: string): Promise<string> {
  const seed = secretToSeed(secret)
  try {
    return await signClaimWebCrypto(seed, hubId, daoId, requestId, receiver)
  } catch {
    const { ed25519 } = await import("@noble/curves/ed25519.js")
    return base64Encode(ed25519.sign(claimMessageBytes(hubId, daoId, requestId, receiver), seed))
  }
}
