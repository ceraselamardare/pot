"use client"
// Comments on a request (the thread in the request sheet). One facade over both data sources:
//  - mock: the browser mock world (mock/world.ts commentsOf, mock/store.ts postComment/deleteComment);
//  - testnet: our API, GET/POST /api/pots/[pot]/requests/[id]/comments and DELETE …/comments/[commentId]
//    (members only, checked on the server), polled every 10 s while the sheet is open (visible tab only).
// Off-chain only: nothing here signs or sends a transaction. The composer's optimistic rows live in the component.
import type { Api } from "@pot/sdk"
import { newOpKey } from "@pot/sdk"
import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { t } from "@/i18n/t"
import { avatarOrNull } from "@/lib/avatars"
import { IS_LIVE, daoOf } from "./config"
import { api } from "./live/api"
import { qk } from "./live/queries"
import { refreshQuery } from "./live/refresh"
import { nameFromAccount } from "./live/vm"
import * as store from "./mock/store"
import { useWorld } from "./mock/store"
import type { CommentVM, PersonVM, PotVM } from "./mock/types"
import { commentsOf, initialsOf } from "./mock/world"
import { queryClient } from "./query"

export type CommentsState = { state: "loading" } | { state: "error"; retry: () => void } | { state: "ready"; items: CommentVM[] }

/** How often an open thread reads again (testnet). */
export const COMMENTS_POLL_MS = 10_000

const path = (slug: string, requestId: number) => `/api/pots/${encodeURIComponent(daoOf(slug))}/requests/${requestId}/comments`
export const commentsKey = (slug: string, requestId: number) => [...qk.pot(daoOf(slug)), "comments", requestId] as const

/** A new op key for one send (a retry reuses it, so the server never posts it twice). */
export const newCommentKey = (): string => newOpKey()

function useMockComments(pot: PotVM, requestId: number): CommentsState {
  const world = useWorld()
  const me = pot.me?.person.id ?? null
  return useMemo((): CommentsState => {
    if (!world) return { state: "loading" }
    return { state: "ready", items: commentsOf(world, pot.slug, requestId, me) ?? [] }
  }, [world, pot.slug, requestId, me])
}

/** API rows → view models: names and colours from the Pot's members, else the authors' profiles. */
export function commentVMs(res: Pick<Api.CommentsRes, "comments" | "profiles">, pot: Pick<PotVM, "members" | "me">): CommentVM[] {
  const byId = new Map<string, PersonVM>(pot.members.map((m) => [m.person.id, m.person]))
  const me = pot.me?.person.id ?? null
  const personOf = (account: string): PersonVM => {
    const hit = byId.get(account)
    if (hit) return hit
    const name = res.profiles[account]?.name ?? nameFromAccount(account) ?? t("person.fallback")
    return { id: account, name, initials: initialsOf(name) || "•", joinIndex: null, avatar: avatarOrNull(res.profiles[account]?.avatar) }
  }
  return res.comments.map((c) => ({
    id: c.id,
    author: personOf(c.author),
    body: c.deleted ? null : c.body,
    createdAt: Date.parse(c.createdAt),
    deleted: c.deleted,
    mine: c.author === me,
  }))
}

function useLiveComments(pot: PotVM, requestId: number): CommentsState {
  const q = useQuery({
    queryKey: commentsKey(pot.slug, requestId),
    queryFn: async () => (await api<Api.CommentsRes>("GET", path(pot.slug, requestId))).data,
    staleTime: 5_000,
    refetchInterval: COMMENTS_POLL_MS,
    retry: 1,
  })
  return useMemo((): CommentsState => {
    if (q.data) return { state: "ready", items: commentVMs(q.data, pot) }
    if (q.isError) return { state: "error", retry: () => void q.refetch() }
    return { state: "loading" }
  }, [q, pot])
}

/** The thread of one request, oldest first (newest at the bottom). */
export const useComments: (pot: PotVM, requestId: number) => CommentsState = IS_LIVE ? useLiveComments : useMockComments

/** After a send or a delete: read the thread again, and the Pot's bundle for the cards' comment counts. */
function refreshAfterWrite(slug: string, requestId: number) {
  const qc = queryClient()
  void refreshQuery(qc, commentsKey(slug, requestId))
  void refreshQuery(qc, qk.bundle(daoOf(slug)))
}

/** Send one comment (`body` already cleaned). `key` makes a retry safe. */
export async function sendComment(slug: string, requestId: number, body: string, key: string): Promise<void> {
  if (!IS_LIVE) {
    await store.postComment(slug, requestId, body, key)
    return
  }
  const { data } = await api<Api.CommentPostRes>("POST", path(slug, requestId), { body, idempotencyKey: key })
  queryClient().setQueryData<Api.CommentsRes>(commentsKey(slug, requestId), (prev) =>
    prev && !prev.comments.some((c) => c.id === data.comment.id) ? { ...prev, comments: [...prev.comments, data.comment] } : prev,
  )
  refreshAfterWrite(slug, requestId)
}

/** Remove the signed-in person's own comment (soft: the thread shows "Comment removed"). */
export async function deleteComment(slug: string, requestId: number, id: string): Promise<void> {
  if (!IS_LIVE) {
    await store.deleteComment(slug, requestId, id)
    return
  }
  const { data } = await api<Api.CommentDeleteRes>("DELETE", `${path(slug, requestId)}/${encodeURIComponent(id)}`, {})
  queryClient().setQueryData<Api.CommentsRes>(commentsKey(slug, requestId), (prev) =>
    prev ? { ...prev, comments: prev.comments.map((c) => (c.id === data.comment.id ? data.comment : c)) } : prev,
  )
  refreshAfterWrite(slug, requestId)
}
