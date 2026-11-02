// "Help us make Pot better" (first-run onboarding, 2026-11-02): the signed-in person's own optional survey.
//   POST /api/me/survey  SurveyReq → { survey: SurveyWire }   one row per person, upserted (a second send replaces)
//   GET  /api/me/survey  → { survey: SurveyWire | null }        the person's own row only
// Answers are enum ids (lib/survey.ts, zod in server/http/schemas.ts) and are read by the Pot team only
// (scripts/survey-report.ts). No route returns anyone else's row, and nothing here reaches a Pot, a feed or a push.
// Writes are rate-limited: 5 a minute, 20 a day per person.
import "server-only"
import { eq, sql } from "drizzle-orm"
import type { DbOrTx } from "@/db/client"
import { chargeQuotas, nextUtcDay } from "@/db/quota"
import { userSurvey } from "@/db/schema"
import { compactAnswers, type SurveyAnswers, type SurveyContext, type SurveyReq, type SurveyWire } from "@/lib/survey"
import { ApiError } from "../http/errors"
import { limit } from "../quotas"
import type { SessionCtx } from "../session/store"

type Row = typeof userSurvey.$inferSelect

function wire(r: Row): SurveyWire {
  return {
    version: r.version,
    answers: r.answers as SurveyAnswers,
    context: (r.context as SurveyContext | null) ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }
}

/** The deploy's short commit (Vercel), else null: which build asked the questions. */
export function appVersion(env: Record<string, string | undefined> = process.env): string | null {
  const sha = env.VERCEL_GIT_COMMIT_SHA?.trim()
  return sha ? sha.slice(0, 12) : null
}

export async function mySurvey(db: DbOrTx, s: SessionCtx): Promise<SurveyWire | null> {
  const [r] = await db.select().from(userSurvey).where(eq(userSurvey.userId, s.user.id)).limit(1)
  return r ? wire(r) : null
}

export async function saveSurvey(db: DbOrTx, s: SessionCtx, input: SurveyReq, version = appVersion()): Promise<SurveyWire> {
  const q = await chargeQuotas(db, [
    { subject: `user:${s.user.id}`, action: "survey_burst", amount: 1n, limit: limit("user_survey_burst"), period: "minute", tag: "burst" },
    { subject: `user:${s.user.id}`, action: "survey", amount: 1n, limit: limit("user_survey"), tag: "family:survey" },
  ])
  if (!q.ok) {
    if (q.failed.tag === "burst") throw new ApiError("rate_limited", { retryAfterMs: 60_000 - (Date.now() % 60_000), detail: { limit: Number(q.failed.limit) } })
    throw new ApiError("quota_exceeded", { detail: { family: "survey", limit: q.failed.limit.toString(), resetsAt: nextUtcDay().toISOString() } })
  }
  const values = {
    userId: s.user.id,
    version: input.version,
    answers: compactAnswers(input.answers),
    context: input.context ?? null,
    appVersion: version,
  }
  const [r] = await db
    .insert(userSurvey)
    .values(values)
    .onConflictDoUpdate({
      target: userSurvey.userId,
      set: { version: values.version, answers: values.answers, context: values.context, appVersion: values.appVersion, updatedAt: sql`now()` },
    })
    .returning()
  if (!r) throw new ApiError("internal")
  return wire(r)
}
