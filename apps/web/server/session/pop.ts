// Device-key proof of possession (api-spec §4.2): Ed25519 directly over the UTF-8 message, sig base64url,
// |now − ts| ≤ 120 s, single use via used_proof(sha256(purpose ‖ publicKey ‖ ts)). Safari's Ed25519
// signatures are randomized, so the replay key is never the signature itself.
import "server-only"
import type { DbOrTx } from "@/db/client"
import { usedProof, type PROOF_PURPOSES } from "@/db/schema"
import { ApiError } from "../http/errors"
import { ed25519Verify, fromB64url, parseEd25519PublicKey, sha256Hex } from "../util/crypto"

export type ProofPurpose = (typeof PROOF_PURPOSES)[number]
export interface Pop {
  ts: number
  sig: string
}

export const popMessages = {
  session: (idToken: string, ts: number) =>
    `pot-session-v1|${Buffer.from(sha256Hex(idToken), "hex").toString("base64url")}|${ts}`,
  device_login: (accountId: string, ts: number) => `pot-device-login-v1|${accountId}|${ts}`,
  device_add: (accountId: string, ts: number) => `pot-device-add-v1|${accountId}|${ts}`,
  device_pair: (accountId: string, ts: number) => `pot-device-pair-v1|${accountId}|${ts}`,
  dev_session: (devicePublicKey: string, ts: number) => `pot-dev-session-v1|${devicePublicKey}|${ts}`,
}

/** Insert a single-use proof; false when it was used before. */
export async function spendProof(db: DbOrTx, purpose: ProofPurpose, hash: string): Promise<boolean> {
  const rows = await db.insert(usedProof).values({ hash, purpose }).onConflictDoNothing().returning({ hash: usedProof.hash })
  return rows.length > 0
}

export async function verifyPop(
  db: DbOrTx,
  opts: { purpose: ProofPurpose; message: string; publicKey: string; pop: Pop; nowMs?: number },
): Promise<void> {
  const now = opts.nowMs ?? Date.now()
  const { ts, sig } = opts.pop
  if (!Number.isSafeInteger(ts) || Math.abs(now - ts) > 120_000)
    throw new ApiError("device_proof_invalid", { detail: { cause: "ts" } })
  const pk = parseEd25519PublicKey(opts.publicKey)
  let sigBytes: Uint8Array
  try {
    sigBytes = fromB64url(sig)
  } catch {
    throw new ApiError("device_proof_invalid", { detail: { cause: "sig" } })
  }
  if (!pk || !ed25519Verify(sigBytes, new TextEncoder().encode(opts.message), pk))
    throw new ApiError("device_proof_invalid", { detail: { cause: "sig" } })
  const fresh = await spendProof(db, opts.purpose, sha256Hex(`${opts.purpose}|${opts.publicKey}|${ts}`))
  if (!fresh) throw new ApiError("device_proof_invalid", { detail: { cause: "replay" } })
}
