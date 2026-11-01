// DELETE /api/pots/[pot]/requests/[id]/comments/[commentId]: the author removes their own comment (soft: the thread
// keeps "Comment removed"; the text is wiped). Someone else's comment answers 404 like a missing one. Idempotent.
import { getDb } from "@/db/client"
import { getConfig } from "@/server/config"
import { getHub } from "@/server/deps"
import { deleteComment } from "@/server/features/comments"
import { checkCsrf, route } from "@/server/http/context"
import { requireSession } from "@/server/session/store"

export const maxDuration = 10

export const DELETE = route<{ pot: string; id: string; commentId: string }>(
  "DELETE /api/pots/[pot]/requests/[id]/comments/[commentId]",
  async (ctx, { pot, id, commentId }) => {
    checkCsrf(ctx.req)
    const cfg = getConfig()
    const s = await requireSession(getDb(), ctx.req, cfg, { activeDevice: true })
    const r = await deleteComment({ db: getDb(), hub: getHub(), cfg }, s, pot, id, commentId)
    return ctx.json(r)
  },
)
