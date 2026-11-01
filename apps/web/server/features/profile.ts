// PATCH /api/me (api-spec §2.1): the signed-in person's off-chain profile. So far only the brand avatar
// (brand/avatars/README.md): one of pot-01..pot-10, or null to go back to initials. The value is validated twice:
// by the request schema (server/http/schemas.ts) and by the app_user_avatar_ck CHECK (migration 0002).
import "server-only"
import type * as Api from "@pot/sdk/api"
import { eq } from "drizzle-orm"
import type { DbOrTx } from "@/db/client"
import { appUser } from "@/db/schema"
import { avatarOrNull, type AvatarId } from "@/lib/avatars"
import { ApiError } from "../http/errors"
import type { SessionCtx } from "../session/store"

export interface ProfilePatchIn {
  avatar?: AvatarId | null
}

export async function updateProfile(db: DbOrTx, s: SessionCtx, patch: ProfilePatchIn): Promise<Api.ProfileRes["profile"]> {
  const set: Partial<typeof appUser.$inferInsert> = { updatedAt: new Date() }
  if (patch.avatar !== undefined) set.avatar = patch.avatar
  const [u] = await db.update(appUser).set(set).where(eq(appUser.id, s.user.id)).returning()
  if (!u) throw new ApiError("not_signed_in")
  return { displayName: u.displayName, avatarTint: u.avatarTint, notifyEmail: u.notifyEmail, avatar: avatarOrNull(u.avatar) }
}
