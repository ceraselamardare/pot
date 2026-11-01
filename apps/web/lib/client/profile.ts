"use client"
// The signed-in person's profile, for both data sources (lib/client/config.ts). So far: the brand avatar
// (You → Profile → Avatar, brand/avatars/README.md).
//  - mock: the persistent mock world (lib/client/mock/store.ts setAvatar);
//  - testnet: PATCH /api/me, then the session cache (my own seats update at once) and every Pot bundle (the feed
//    profiles carry everyone's avatar) are refreshed.
import type { Api } from "@pot/sdk"
import type { AvatarId } from "@/lib/avatars"
import { IS_LIVE } from "./config"
import { api } from "./live/api"
import { SESSION_KEY, type SessionInfo } from "./live/session"
import * as mock from "./mock/store"
import { queryClient } from "./query"

export async function saveMyAvatar(avatar: AvatarId | null): Promise<AvatarId | null> {
  if (!IS_LIVE) {
    await mock.setAvatar(avatar)
    return avatar
  }
  const { data } = await api<Api.ProfileRes>("PATCH", "/api/me", { avatar } satisfies Api.ProfilePatch)
  const saved = data.profile.avatar ?? null
  const qc = queryClient()
  qc.setQueryData<SessionInfo | null>(SESSION_KEY, (s) => (s ? { ...s, avatar: saved } : s))
  void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === "pot" && q.queryKey[2] === "bundle" })
  return saved
}
