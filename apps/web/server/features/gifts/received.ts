// Gifts: the hub said `gift_received{pot,from,amount,ref}` (hub 1.2.0). The relayer calls onGiftReceived when it sees
// the event: the gift row turns `received` once (its link's `uses` counts it once), and every active member except the
// giver gets a push ("Ana sent Lisbon Trip a gift · $10 ☕"). Never the note in the push. A ref we don't know (a gift
// sent with a raw ref) still pushes, as "Someone".
import "server-only"
import { and, eq, ne, sql } from "drizzle-orm"
import type { Db } from "@/db/client"
import { gift, giftLink } from "@/db/schema"
import { GIFT_REF_RE } from "@/lib/gifts"
import type { HubReader } from "../../chain/hub"
import type { Config } from "../../config"
import { notify, type NotifyReport } from "../../notify/notify"
import type { PushSender } from "../../notify/webpush"
import { errText } from "../../util/errtext"

export interface GiftReceivedEvent {
  pot: string
  /** the account the money came from (the event's `from`) */
  from: string
  /** Micro string */
  amount: string
  ref: string
  txHash?: string
  at?: Date
}

export interface GiftReceivedResult {
  /** our row turned received now (false: unknown ref, someone else's ref, or already received) */
  marked: boolean
  push: NotifyReport | null
}

/**
 * Mark the gift received (idempotent: only a row that isn't `received` yet changes, and only then does its link's
 * `uses` go up) and push the members. Matches our row only when the Pot and the sender are the ones it was started
 * for; the event's amount is the truth. Never throws for the push (logged); DB errors on the mark do throw.
 */
export async function onGiftReceived(
  deps: { db: Db; hub: HubReader; cfg: Config; sender: PushSender | null },
  ev: GiftReceivedEvent,
): Promise<GiftReceivedResult> {
  const { db } = deps
  let marked = false
  if (GIFT_REF_RE.test(ev.ref) && /^[1-9][0-9]{0,38}$/.test(ev.amount)) {
    marked = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(gift)
        .set({ status: "received", receivedAt: ev.at ?? new Date(), amount: ev.amount, ...(ev.txHash ? { txHash: ev.txHash } : {}) })
        .where(and(eq(gift.ref, ev.ref), eq(gift.potId, ev.pot), eq(gift.giverAccount, ev.from), ne(gift.status, "received")))
        .returning({ linkId: gift.linkId })
      if (!row) return false
      if (row.linkId) await tx.update(giftLink).set({ uses: sql`${giftLink.uses} + 1` }).where(eq(giftLink.id, row.linkId))
      return true
    })
  }
  let push: NotifyReport | null = null
  if (deps.sender) {
    try {
      push = await notify(deps, { type: "gift_received", pot: ev.pot, ref: ev.ref, from: ev.from, amount: ev.amount })
    } catch (e) {
      console.error(JSON.stringify({ level: "error", where: "notify", event: "gift_received", err: errText(e, 200) }))
    }
  }
  return { marked, push }
}
