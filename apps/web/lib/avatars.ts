// Brand avatars (brand/avatars/README.md): ten pictures a person may pick in You → Profile instead of their
// initials. Isomorphic (server routes validate with it, components render with it). null = initials on the
// member colour, exactly as before (brand README §4).
import type { AvatarId } from "@pot/sdk/api"
import type { MessageKey } from "@/i18n/t"

export type { AvatarId }

export const AVATAR_IDS = [
  "pot-01",
  "pot-02",
  "pot-03",
  "pot-04",
  "pot-05",
  "pot-06",
  "pot-07",
  "pot-08",
  "pot-09",
  "pot-10",
] as const satisfies readonly AvatarId[]

export function isAvatarId(v: unknown): v is AvatarId {
  return typeof v === "string" && (AVATAR_IDS as readonly string[]).includes(v)
}

/** A stored value → a known avatar or null (unknown ids fall back to initials, never a broken image). */
export const avatarOrNull = (v: unknown): AvatarId | null => (isAvatarId(v) ? v : null)

/** Served from public/avatars (static, cacheable, no runtime). */
export const avatarSrc = (id: AvatarId): string => `/avatars/${id}.svg`

/** The picker's label for each picture (en.json `avatar.*`). */
export const avatarLabelKey = (id: AvatarId) => `avatar.${id}` as Extract<MessageKey, `avatar.${AvatarId}`>
