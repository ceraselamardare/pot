// B-11 retention (data-model §4; api-spec §5.3 step 7): batched deletes (≤ 5,000 rows per statement and
// table per run). deposit_intent is left to the 1Click owner (integrations); app_user/device are kept.
import "server-only"
import { sql, type SQL } from "drizzle-orm"
import type { DbOrTx } from "@/db/client"
import { errText } from "../util/errtext"

const BATCH = 5_000

/** `DELETE … WHERE ctid IN (SELECT ctid … LIMIT 5000)`: bounded, index-friendly, no long locks. */
const del = (table: string, where: SQL) =>
  sql`DELETE FROM ${sql.identifier(table)} WHERE ctid IN (SELECT ctid FROM ${sql.identifier(table)} WHERE ${where} LIMIT ${BATCH})`

export const RETENTION: { name: string; stmt: SQL }[] = [
  { name: "session", stmt: del("session", sql`expires_at < now() - interval '30 days' OR revoked_at < now() - interval '30 days'`) },
  { name: "used_proof", stmt: del("used_proof", sql`used_at < now() - interval '1 day'`) },
  { name: "device_pairing", stmt: del("device_pairing", sql`expires_at < now() - interval '7 days'`) },
  { name: "relay_log", stmt: del("relay_log", sql`created_at < now() - interval '90 days'`) },
  {
    name: "relay_log.response",
    stmt: sql`UPDATE relay_log SET response = NULL WHERE ctid IN (SELECT ctid FROM relay_log
              WHERE response IS NOT NULL AND created_at < now() - interval '7 days' LIMIT ${BATCH})`,
  },
  {
    name: "quota_usage",
    stmt: del(
      "quota_usage",
      sql`(period_start < now() - interval '35 days') OR (period_start < now() - interval '1 day' AND period_start <> date_trunc('day', period_start))`,
    ),
  },
  { name: "error_log", stmt: del("error_log", sql`at < now() - interval '14 days'`) },
  {
    name: "push_subscription",
    stmt: del(
      "push_subscription",
      sql`expiration_time < now() AND coalesce(last_ok_at, created_at) < now() - interval '60 days'`,
    ),
  },
  { name: "notification_log", stmt: del("notification_log", sql`created_at < now() - interval '30 days'`) },
  { name: "note", stmt: del("note", sql`kind = 'memo' AND matched_at IS NULL AND created_at < now() - interval '24 hours'`) },
  { name: "tg_link_token", stmt: del("tg_link_token", sql`expires_at < now() - interval '1 day'`) },
]

export async function runRetention(db: DbOrTx): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  for (const r of RETENTION) {
    try {
      const res = await db.execute(r.stmt)
      out[r.name] = res.rowCount ?? 0
    } catch (e) {
      out[r.name] = -1
      console.error(JSON.stringify({ level: "error", where: "retention", table: r.name, err: errText(e, 200) }))
    }
  }
  return out
}
