// CLI-4 (security audit 2026-11-04): "Report this page" on the public pay-in page, pay-in links and payment links.
// A visitor reports a page by its Pot's address (slug) and a reason; the team gets one alert per page per hour
// (server/alerts.ts: the ALERT_WEBHOOK_URL channel, else a log line) and can turn the page off. Nothing about the
// visitor is kept: no account, no note, no IP (only its daily hash, as a rate-limit key). Kept in its own folder so it
// doesn't touch the API the backend owns.
import "server-only"
import { z } from "zod"
import type { DbOrTx } from "@/db/client"
import { chargeQuotas, nextUtcDay } from "@/db/quota"
import { ApiError } from "@/server/http/errors"
import { sendAlert } from "@/server/alerts"

export const REPORT_PAGES = ["give", "gift_link", "pay_link"] as const
export const REPORT_REASONS = ["impersonation", "scam", "other"] as const

export const reportReq = z.strictObject({
  page: z.enum(REPORT_PAGES),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/),
  reason: z.enum(REPORT_REASONS),
})
export type ReportReq = z.infer<typeof reportReq>

/** Per IP: 3 a minute, 10 a day; everyone together: 300 a day (a report is cheap to send, so it's capped). */
export const REPORT_LIMITS = { ipMinute: 3n, ipDay: 10n, globalDay: 300n } as const

const WHAT: Record<ReportReq["page"], string> = { give: "public pay-in page", gift_link: "pay-in link", pay_link: "payment link" }

export async function fileReport(
  db: DbOrTx,
  body: ReportReq,
  ipHash: string,
  send: typeof sendAlert = sendAlert,
): Promise<{ received: true }> {
  const q = await chargeQuotas(db, [
    { subject: `ip:${ipHash}`, action: "report_burst", amount: 1n, limit: REPORT_LIMITS.ipMinute, period: "minute" },
    { subject: `ip:${ipHash}`, action: "report", amount: 1n, limit: REPORT_LIMITS.ipDay },
    { subject: "global", action: "report", amount: 1n, limit: REPORT_LIMITS.globalDay },
  ])
  if (!q.ok) {
    if (q.failed.period === "minute") throw new ApiError("rate_limited", { retryAfterMs: 60_000 - (Date.now() % 60_000) })
    throw new ApiError("quota_exceeded", { detail: { family: "report", resetsAt: nextUtcDay().toISOString() } })
  }
  // one alert per page per hour, however many people report it; the text carries no user data
  await send(
    db,
    `report:${body.page}:${body.slug}`,
    `A visitor reported the ${WHAT[body.page]} of the Pot "${body.slug}" (${body.reason}). Check it; turn its public page and links off if it pretends to be someone.`,
  )
  return { received: true }
}
