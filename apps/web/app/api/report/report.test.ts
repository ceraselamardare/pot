// CLI-4 (security audit 2026-11-04): POST /api/report's service: a strict body, one alert per page per hour, and the
// per-IP / global limits. Against a private Postgres schema (DATABASE_URL_TEST, like the other DB tests).
import { vi } from "vitest"
vi.mock("server-only", () => ({}))
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { createTestDb, type TestDb } from "@/db/testing"
import { fileReport, reportReq, REPORT_LIMITS } from "./service"

let t: TestDb
beforeAll(async () => {
  t = await createTestDb("report")
})
afterAll(async () => {
  await t.close()
})
beforeEach(async () => {
  await t.truncate()
})

const body = { page: "give", slug: "near-foundation", reason: "impersonation" } as const

describe("report a public page (CLI-4)", () => {
  it("takes only a page kind, a slug and a reason (no free text, nothing else)", () => {
    expect(reportReq.safeParse(body).success).toBe(true)
    expect(reportReq.safeParse({ ...body, note: "hi" }).success).toBe(false)
    expect(reportReq.safeParse({ ...body, slug: "Bad Slug!" }).success).toBe(false)
    expect(reportReq.safeParse({ ...body, page: "admin" }).success).toBe(false)
    expect(reportReq.safeParse({ ...body, reason: "<script>" }).success).toBe(false)
  })

  it("alerts the team once per page per hour, with no visitor data in the text", async () => {
    const sent: { key: string; text: string }[] = []
    const send = async (db: Parameters<typeof fileReport>[0], key: string, text: string) => {
      const { claimAlert } = await import("@/db/alert")
      if (!(await claimAlert(db, key))) return false
      sent.push({ key, text })
      return true
    }
    expect(await fileReport(t.db, body, "ip-a", send)).toEqual({ received: true })
    expect(await fileReport(t.db, body, "ip-b", send)).toEqual({ received: true })
    expect(sent).toHaveLength(1)
    expect(sent[0]!.key).toBe("report:give:near-foundation")
    expect(sent[0]!.text).toContain('"near-foundation"')
    expect(sent[0]!.text).not.toMatch(/ip-a|ip-b/)
    await fileReport(t.db, { ...body, slug: "red-cross" }, "ip-c", send)
    expect(sent.map((s) => s.key)).toEqual(["report:give:near-foundation", "report:give:red-cross"])
  })

  it("per IP: a burst is rate limited", async () => {
    const send = async () => true
    for (let i = 0; i < Number(REPORT_LIMITS.ipMinute); i++) await fileReport(t.db, body, "ip-x", send)
    await expect(fileReport(t.db, body, "ip-x", send)).rejects.toMatchObject({ reason: "rate_limited" })
    // someone else can still report
    expect(await fileReport(t.db, body, "ip-y", send)).toEqual({ received: true })
  })
})
