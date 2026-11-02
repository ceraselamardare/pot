// /api/me/survey ("Help us make Pot better", first-run onboarding): the signed-in person's own optional answers.
//   GET  → { survey: SurveyWire | null }
//   POST SurveyReq (same-origin JSON, zod-strict enum ids) → { survey: SurveyWire }; one row per person (upsert),
//        5 a minute / 20 a day. A pending_device session can't write (rev4: device_not_registered), like PATCH /api/me.
// Read by the Pot team only (scripts/survey-report.ts); never shown to a Pot or to anyone else.
import { getDb } from "@/db/client"
import { getConfig } from "@/server/config"
import { mySurvey, saveSurvey } from "@/server/features/survey"
import { checkCsrf, readJson, route } from "@/server/http/context"
import { surveyReq } from "@/server/http/schemas"
import { requireSession } from "@/server/session/store"

export const maxDuration = 10

export const GET = route("GET /api/me/survey", async (ctx) => {
  const s = await requireSession(getDb(), ctx.req, getConfig())
  return ctx.json({ survey: await mySurvey(getDb(), s) })
})

export const POST = route("POST /api/me/survey", async (ctx) => {
  checkCsrf(ctx.req)
  const { value } = await readJson(ctx.req, surveyReq)
  const s = await requireSession(getDb(), ctx.req, getConfig(), { activeDevice: true })
  return ctx.json({ survey: await saveSurvey(getDb(), s, value) })
})
