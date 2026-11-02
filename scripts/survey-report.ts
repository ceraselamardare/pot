// "Help us make Pot better": counts per answer for the Pot team (read-only; no names, accounts or per-person rows).
//   scripts/run survey-report                      DATABASE_URL from the env, else apps/web/.env.local
//   scripts/run survey-report --db <postgres url>  any database (e.g. the preview's Neon, read-only role)
//   scripts/run survey-report --json               the tallies as JSON
// The tallying is apps/web/lib/survey-report.ts (unit-tested); this only runs one SELECT.
import { existsSync, readFileSync } from "node:fs"
import { createDb } from "@/db/client"
import { formatSurveyReport, tallySurvey, type SurveyRow } from "@/lib/survey-report"
import { ENV_LOCAL, parseEnvFile } from "./lib/env.ts"

const args = process.argv.slice(2)
const dbArg = args.indexOf("--db") >= 0 ? args[args.indexOf("--db") + 1] : undefined
// only DATABASE_URL is read from .env.local (never the keys file)
const fromFile = existsSync(ENV_LOCAL) ? parseEnvFile(readFileSync(ENV_LOCAL, "utf8")).DATABASE_URL : undefined
const url = dbArg ?? process.env.DATABASE_URL ?? fromFile
if (!url) throw new Error("no database: pass --db <url> or set DATABASE_URL")

const { pool } = createDb(url, 1)
try {
  const res = await pool.query<{ version: number; answers: SurveyRow["answers"]; context: string | null; kind: string }>(
    "select s.version, s.answers, s.context, u.kind from user_survey s join app_user u on u.id = s.user_id",
  )
  const rows: SurveyRow[] = res.rows.map((r) => ({ version: Number(r.version), answers: r.answers, context: r.context, kind: r.kind }))
  console.log(args.includes("--json") ? JSON.stringify(tallySurvey(rows), null, 2) : formatSurveyReport(rows))
} finally {
  await pool.end()
}
