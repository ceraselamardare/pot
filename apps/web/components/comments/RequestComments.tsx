"use client"
// Comments on a request: the short thread in the request sheet (Approve / own / settled), so the group can talk
// about a spend inside Pot. "Comments · N", then avatar + name + relative time + text, oldest first (newest at the
// bottom), then a one-line composer that grows to four lines (Enter sends, Shift+Enter breaks a line), 280
// characters with a counter near the limit. [Send] is SECONDARY: the sheet's one marigold stays Approve (or Done).
// Sending is optimistic: the row shows "Sending…" at once and "Not sent. [Try again] [Discard]" if it fails; a
// retry reuses the same key, so the server never posts it twice. The author can delete their own comment (soft:
// "Comment removed"). The section's own status region (inside the modal) announces sends, deletes and failures.
import { MessageCircle, RotateCcw, SendHorizontal, Trash2, X } from "lucide-react"
import { useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react"
import { toast } from "sonner"
import { Avatar } from "@/components/pot/Avatar"
import { Bone } from "@/components/feedback/States"
import { Button } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { cleanComment, COMMENT_MAX, commentLength } from "@/lib/comment-text"
import { useOnline } from "@/lib/client/browser"
import { cn } from "@/lib/client/cn"
import { deleteComment, newCommentKey, sendComment, useComments } from "@/lib/client/comments"
import type { CommentVM, PersonVM, PotVM, RequestVM } from "@/lib/client/mock/types"
import { ago, useNow } from "@/lib/client/time"

/** Show the counter once this few characters are left. */
const COUNTER_FROM = 40
const MAX_LINES = 4

interface Pending {
  key: string
  body: string
  at: number
  status: "sending" | "failed"
}

export function RequestComments({ pot, r }: { pot: PotVM; r: Pick<RequestVM, "id" | "slug"> }) {
  const thread = useComments(pot, r.id)
  const now = useNow()
  const online = useOnline()
  const me = pot.me?.person ?? null
  const [draft, setDraft] = useState("")
  const [pending, setPending] = useState<Pending[]>([])
  const [deleting, setDeleting] = useState<string | null>(null)
  const [said, setSaid] = useState("")
  const box = useRef<HTMLTextAreaElement>(null)
  const headingId = `comments-${r.slug}-${r.id}`
  const hintId = `${headingId}-hint`
  const counterId = `${headingId}-counter`

  const say = (text: string) => setSaid((prev) => (prev === text ? `${text}\u200b` : text))

  // grow with the text, up to MAX_LINES (then it scrolls)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const cs = getComputedStyle(el)
    const px = (v: string) => parseFloat(v) || 0
    el.style.height = "auto"
    const border = el.offsetHeight - el.clientHeight
    const maxH = (px(cs.lineHeight) || 24) * MAX_LINES + px(cs.paddingTop) + px(cs.paddingBottom) + border
    const want = el.scrollHeight + border
    if (want > 0) el.style.height = `${Math.min(want, maxH)}px`
    el.style.overflowY = want > maxH ? "auto" : "hidden"
  }, [draft])

  const items = thread.state === "ready" ? thread.items : []
  const shown = items.filter((c) => !c.deleted).length + pending.length
  const length = commentLength(draft.trim())
  const left = COMMENT_MAX - length
  const canSend = length > 0 && left >= 0

  const deliver = async (p: Pending) => {
    setPending((list) => list.map((x) => (x.key === p.key ? { ...x, status: "sending" } : x)))
    if (!online) {
      setPending((list) => list.map((x) => (x.key === p.key ? { ...x, status: "failed" } : x)))
      say(t("comments.error.offline"))
      return
    }
    try {
      await sendComment(r.slug, r.id, p.body, p.key)
      setPending((list) => list.filter((x) => x.key !== p.key))
      say(t("comments.sent"))
    } catch {
      setPending((list) => list.map((x) => (x.key === p.key ? { ...x, status: "failed" } : x)))
      say(t("comments.error.send"))
    }
  }

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    const c = cleanComment(draft)
    if (!c.ok) return
    const p: Pending = { key: newCommentKey(), body: c.value, at: Date.now(), status: "sending" }
    setPending((list) => [...list, p])
    setDraft("")
    box.current?.focus()
    void deliver(p)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (canSend) submit()
    }
  }

  const remove = async (c: CommentVM) => {
    setDeleting(c.id)
    try {
      await deleteComment(r.slug, r.id, c.id)
      say(t("comments.deleted"))
    } catch {
      toast.error(t("comments.error.delete"))
      say(t("comments.error.delete"))
    } finally {
      setDeleting(null)
      // the button is gone with the text: keep focus inside the thread
      box.current?.focus()
    }
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 border-t border-line pt-4" data-comments={r.id}>
      <h3 id={headingId} className="font-display text-label text-ink">
        {shown > 0 ? t("comments.heading.count", { n: shown }) : t("comments.heading")}
      </h3>
      <p role="status" aria-live="polite" className="sr-only" data-comments-live>
        {said}
      </p>

      {thread.state === "loading" ? (
        <div className="flex flex-col gap-3" aria-hidden>
          <Bone className="h-10 w-full rounded-md" />
          <span className="sr-only">{t("comments.loading")}</span>
        </div>
      ) : thread.state === "error" && pending.length === 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-body-sm text-ink-muted">{t("comments.error.load")}</p>
          <Button size="sm" variant="ghost" onClick={thread.retry}>
            <RotateCcw aria-hidden strokeWidth={2} />
            {t("comments.error.retry")}
          </Button>
        </div>
      ) : items.length === 0 && pending.length === 0 ? (
        <p className="text-body-sm text-ink-muted" data-comments-empty>
          {t("comments.empty")}
        </p>
      ) : (
        <ol className="flex flex-col gap-3" data-comments-list>
          {items.map((c) => (
            <CommentRow
              key={c.id}
              author={c.author}
              mine={c.mine}
              body={c.body}
              deleted={c.deleted}
              when={ago(c.createdAt, now)}
              at={c.createdAt}
              id={c.id}
              action={
                c.mine && !c.deleted ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="-my-2 -mr-2 px-3 text-ink-muted"
                    aria-label={t("comments.delete.label", { time: ago(c.createdAt, now) })}
                    disabled={deleting === c.id}
                    aria-busy={deleting === c.id || undefined}
                    onClick={() => remove(c)}
                    data-comment-delete
                  >
                    <Trash2 aria-hidden strokeWidth={2} className="size-4" />
                    {t("comments.delete")}
                  </Button>
                ) : null
              }
            />
          ))}
          {me &&
            pending.map((p) => (
              <CommentRow
                key={p.key}
                author={me}
                mine
                body={p.body}
                deleted={false}
                when={p.status === "sending" ? t("comments.sending") : t("comments.failed")}
                at={p.at}
                pending={p.status}
                footer={
                  p.status === "failed" ? (
                    <span className="mt-1 flex flex-wrap gap-1">
                      <Button size="sm" variant="ghost" className="-ml-3 text-link" onClick={() => void deliver(p)} data-comment-retry>
                        <RotateCcw aria-hidden strokeWidth={2} className="size-4" />
                        {t("comments.retry")}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setPending((list) => list.filter((x) => x.key !== p.key))}>
                        <X aria-hidden strokeWidth={2} className="size-4" />
                        {t("comments.discard")}
                      </Button>
                    </span>
                  ) : null
                }
              />
            ))}
        </ol>
      )}

      {me && (
        <form onSubmit={submit} className="flex flex-col gap-1.5" data-comment-form>
          <label htmlFor={`${headingId}-box`} className="sr-only">
            {t("comments.composer.label")}
          </label>
          <div className="flex items-end gap-2">
            <textarea
              id={`${headingId}-box`}
              ref={box}
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              enterKeyHint="send"
              autoComplete="off"
              placeholder={t("comments.composer.placeholder")}
              aria-describedby={left <= COUNTER_FROM ? `${hintId} ${counterId}` : hintId}
              aria-invalid={left < 0 || undefined}
              className="min-h-12 min-w-0 flex-1 resize-none rounded-sm border border-line-strong bg-surface-sunken px-3 py-2.5 text-body text-ink placeholder:text-ink-muted"
            />
            <Button type="submit" disabled={!canSend} className="shrink-0 px-4" data-comment-send>
              <SendHorizontal aria-hidden strokeWidth={2} />
              {t("comments.send")}
            </Button>
          </div>
          <div className="flex items-start justify-between gap-3 text-body-sm text-ink-muted">
            <p id={hintId}>{t("comments.composer.hint", { potName: pot.name })}</p>
            {left <= COUNTER_FROM && (
              <p id={counterId} className={cn("shrink-0 tabular-nums", left < 0 && "text-declined")} data-comment-counter>
                {left >= 0 ? t("comments.left", { n: left }) : t("comments.over", { n: -left })}
              </p>
            )}
          </div>
        </form>
      )}
    </section>
  )
}

function CommentRow({
  author,
  mine,
  body,
  deleted,
  when,
  at,
  id,
  action,
  footer,
  pending,
}: {
  author: PersonVM
  mine: boolean
  body: string | null
  deleted: boolean
  when: string
  at: number
  id?: string
  action?: ReactNode
  footer?: ReactNode
  pending?: Pending["status"]
}) {
  return (
    <li className="flex items-start gap-3" data-comment={id ?? "pending"} data-comment-state={pending ?? (deleted ? "removed" : "sent")}>
      <Avatar person={author} size="sm" className={cn("mt-0.5", deleted && "opacity-60")} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-body-sm text-ink-muted">
            <span className="text-label text-ink">{mine ? t("comments.you") : author.name}</span>
            <span aria-hidden>·</span>
            {pending === "failed" ? (
              <span className="inline-flex items-center gap-1 text-declined">
                <X aria-hidden className="size-4" strokeWidth={2.5} />
                {when}
              </span>
            ) : (
              <time dateTime={new Date(at).toISOString()}>{when}</time>
            )}
          </p>
          {action}
        </div>
        {deleted ? (
          <p className="mt-0.5 text-body-sm text-ink-muted italic">{t("comments.removed")}</p>
        ) : (
          <p className={cn("mt-0.5 text-body break-words whitespace-pre-wrap text-ink", pending === "sending" && "text-ink-muted")}>{body}</p>
        )}
        {footer}
      </div>
    </li>
  )
}

/** A request card's quiet comment count (Lucide MessageCircle + the number), only when there are any. */
export function CommentCount({ n, className }: { n: number | undefined; className?: string }) {
  if (!n) return null
  return (
    <span className={cn("inline-flex items-center gap-1 text-body-sm text-ink-muted tabular-nums", className)} data-comment-count={n}>
      <MessageCircle aria-hidden className="size-4" strokeWidth={2} />
      <span aria-hidden>{n}</span>
      <span className="sr-only">{t("comments.count", { n })}</span>
    </span>
  )
}
