// Invite links (D-08): `/j/<slug>?i=<invite public key>#<secret>`. The secret is a 32-byte ed25519 seed in
// base64url (43 chars) and lives only in the fragment, which never reaches a server. The public key is
// already public on-chain via add_invite. Generated locally with @pot/sdk (WebCrypto Ed25519, noble fallback
// for browsers without it); the seed is never sent anywhere (D-31).
import { buildInviteLink, generateInviteSeed, publicKeyFromBytes, seedToSecret, webCryptoInviteKey, type PublicKeyStr } from "@pot/sdk"

export interface InviteKeys {
  pk: string
  secret: string
}

export async function generateInvite(): Promise<InviteKeys> {
  const seed = generateInviteSeed()
  try {
    const key = await webCryptoInviteKey(seed)
    return { pk: key.publicKey, secret: key.secret }
  } catch {
    const { ed25519 } = await import("@noble/curves/ed25519.js")
    return { pk: publicKeyFromBytes(ed25519.getPublicKey(seed)), secret: seedToSecret(seed) }
  }
}

export function inviteLink(origin: string, slug: string, invite: InviteKeys): string {
  return buildInviteLink({ origin, slug, invitePk: invite.pk as PublicKeyStr, secret: invite.secret })
}

export const INVITE_SECRET_RE = /^[A-Za-z0-9_-]{43}$/
