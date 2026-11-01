// Team alerts (architecture §4.4): deduped to one per key per hour, sent to ALERT_WEBHOOK_URL (Discord/Slack
// incoming webhook) when set, else a `level: "alert"` log line. Bodies carry no secrets or user data.
import "server-only"
import type { DbOrTx } from "@/db/client"
import { claimAlert } from "@/db/alert"
import { logLine } from "./log"

export async function sendAlert(db: DbOrTx, key: string, text: string): Promise<boolean> {
  if (!(await claimAlert(db, key).catch(() => false))) return false
  const url = process.env.ALERT_WEBHOOK_URL
  logLine({ level: "alert", key, text })
  if (url) {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: `[pot] ${key}: ${text}`, text: `[pot] ${key}: ${text}` }),
      signal: AbortSignal.timeout(5_000),
    }).catch(() => undefined)
  }
  return true
}
