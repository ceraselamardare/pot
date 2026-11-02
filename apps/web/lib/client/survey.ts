"use client"
// "Help us make Pot better" (first-run onboarding) for both data sources (lib/client/config.ts):
//  - mock: localStorage['pot.mock.survey'] per mock person (lib/client/mock/store.ts saveSurvey/getSurvey);
//  - testnet: POST/GET /api/me/survey (the person's own row; read by the Pot team only).
import { IS_LIVE } from "./config"
import { api } from "./live/api"
import * as mock from "./mock/store"
import type { SurveyReq, SurveyWire } from "@/lib/survey"

export async function sendSurvey(req: SurveyReq): Promise<SurveyWire> {
  if (!IS_LIVE) return mock.saveSurvey(req)
  const { data } = await api<{ survey: SurveyWire }>("POST", "/api/me/survey", req)
  return data.survey
}

/** The person's earlier answers (to prefill a replay), or null. Never throws: no answers is the fallback. */
export async function loadMySurvey(): Promise<SurveyWire | null> {
  try {
    if (!IS_LIVE) return await mock.getSurvey()
    const { data } = await api<{ survey: SurveyWire | null }>("GET", "/api/me/survey")
    return data.survey
  } catch {
    return null
  }
}
