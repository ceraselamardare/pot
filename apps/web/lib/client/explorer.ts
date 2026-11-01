// Quiet explorer links (receipts): `${NEXT_PUBLIC_EXPLORER}/txns/<hash>` for a transaction, `/address/<id>` for an
// account (the Pot's own account). Only a real, settled transaction gets a receipt: a NEAR transaction hash is
// base58 of 32 bytes (43-44 characters); optimistic or pending items have none, so they get no link.
import { sdkConfig } from "./config"

const BASE58_32 = /^[1-9A-HJ-NP-Za-km-z]{43,44}$/

/** Is this a NEAR transaction hash (base58, 32 bytes)? */
export function isTxHash(hash: string | null | undefined): hash is string {
  return typeof hash === "string" && BASE58_32.test(hash)
}

const base = () => sdkConfig().explorerUrl.replace(/\/$/, "")

/** The explorer page of a transaction, or null without a real hash. */
export function explorerTxUrl(hash: string | null | undefined): string | null {
  return isTxHash(hash) ? `${base()}/txns/${hash}` : null
}

/** The explorer page of an account (a Pot, a person). */
export function explorerAccountUrl(account: string): string {
  return `${base()}/address/${account}`
}
