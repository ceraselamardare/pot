// Alert and notification dedupe (data-model §3.4).
import { sql } from "drizzle-orm"
import type { DbOrTx } from "./client"

/** True when this caller should send the alert (at most one per key per hour). */
export async function claimAlert(db: DbOrTx, key: string): Promise<boolean> {
  const res = await db.execute(sql`
    INSERT INTO alert_state (key, last_sent_at) VALUES (${key}, now())
    ON CONFLICT (key) DO UPDATE SET last_sent_at = now()
    WHERE alert_state.last_sent_at < now() - interval '1 hour'
    RETURNING 'send' AS send`)
  return res.rows.length > 0
}
