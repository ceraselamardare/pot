"use client"
// CLI-4 (security audit 2026-11-04): "Report this page" from a public pay-in page, a pay-in link or a payment link.
// Testnet: POST /api/report (app/api/report; no session needed). Mock: nothing leaves the browser.
import { IS_LIVE } from "./config"
import { api } from "./live/api"

export type ReportPage = "give" | "gift_link" | "pay_link"
export type ReportReason = "impersonation" | "scam" | "other"

export async function reportPage(page: ReportPage, slug: string, reason: ReportReason): Promise<void> {
  if (!IS_LIVE) return new Promise((r) => setTimeout(r, 300))
  await api("POST", "/api/report", { page, slug, reason })
}
