// Wire-format validators shared by the routes (api-spec §0.3).
export const OPKEY_RE = /^[0-9a-hjkmnp-tv-z]{16}$/
export const MICRO_RE = /^(0|[1-9][0-9]{0,15})$/
export const ACCOUNT_RE = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/
export const PK_RE = /^ed25519:[1-9A-HJ-NP-Za-km-z]{43,44}$/
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

export const isAccountId = (s: unknown): s is string =>
  typeof s === "string" && s.length >= 2 && s.length <= 64 && ACCOUNT_RE.test(s)

/** `<slug>.<hub>` with a valid slug and exactly one label above the hub. */
export function daoSlug(daoId: string, hubId: string): string | null {
  if (!hubId || !daoId.endsWith(`.${hubId}`)) return null
  const slug = daoId.slice(0, -hubId.length - 1)
  return SLUG_RE.test(slug) && slug.length >= 2 && slug.length <= 32 && isAccountId(daoId) ? slug : null
}
