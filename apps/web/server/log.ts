// error_log writes (data-model §2.3): 5xx responses, inner failures and follow-up failures, kept 14 days
// because Hobby keeps runtime logs for 1 hour. `detail` must already be redacted (no tokens, emails,
// cookies, push keys, invite secrets).
import "server-only"
import { getDb } from "@/db/client"
import { errorLog } from "@/db/schema"

export async function logError(entry: {
  route: string
  requestId?: string
  reason?: string
  userId?: string
  relayId?: string
  detail?: Record<string, unknown>
}): Promise<void> {
  try {
    await getDb().insert(errorLog).values({
      route: entry.route,
      requestId: entry.requestId,
      reason: entry.reason,
      userId: entry.userId,
      relayId: entry.relayId,
      detail: entry.detail ?? null,
    })
  } catch {
    // never let logging break a response
  }
}

export function logLine(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ t: new Date().toISOString(), ...fields }))
}
