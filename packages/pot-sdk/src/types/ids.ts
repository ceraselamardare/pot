// Branded ids (frontend-architecture §1.4). Brands are compile-time only; use the as* helpers at
// trust boundaries (env, URL params, RPC results) and the is* guards where input is untrusted.

declare const brand: unique symbol
declare const daoBrand: unique symbol

export type Brand<T, B extends string> = T & { readonly [brand]: B }
export type AccountId = Brand<string, "AccountId">
/** `${slug}.pots.<root>` (D-02); the `pot` arg everywhere. Assignable to AccountId. */
export type DaoId = AccountId & { readonly [daoBrand]: true }
export type Slug = Brand<string, "Slug">
/** DAO proposal id (u64 on chain, small in practice). */
export type ProposalId = number
/** Hub request id (u32). */
export type RequestId = number
export type PublicKeyStr = `ed25519:${string}`

/** Every view carries the block it was read at (frontend-architecture §3.5). */
export interface Viewed<T> {
  value: T
  blockHeight: number
}

/** NEAR account id rules (api-spec §0.3): 2-64 chars, lowercase, `-`/`_` separators inside parts. */
export const ACCOUNT_ID_RE = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/
export const isAccountId = (s: string): s is AccountId => s.length >= 2 && s.length <= 64 && ACCOUNT_ID_RE.test(s)

export const asAccountId = (s: string): AccountId => s as AccountId
export const asDaoId = (s: string): DaoId => s as DaoId
export const asSlug = (s: string): Slug => s as Slug

export const isPublicKeyStr = (s: string): s is PublicKeyStr => /^ed25519:[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(s)
export function asPublicKeyStr(s: string): PublicKeyStr {
  if (!isPublicKeyStr(s)) throw new Error(`not an ed25519 public key string: ${s}`)
  return s
}
