// The first-run intro (components/onboarding) opens for any signed-in browser without the flag. Every spec written
// before it assumes no intro, so the mock config gives each context a storageState with the flag already set
// (`onboardedState`), and contexts made by hand get it with `skipOnboarding`. e2e/mock/onboarding.spec.ts opts
// out with `test.use({ storageState: NO_STATE })` to see the intro.
import type { BrowserContext, Page } from "@playwright/test"

export const ONBOARDING_KEY = "pot.onboarding.v1"
export const ONBOARDED = JSON.stringify({ done: true, at: 0, survey: "skipped", via: "skipped" })
export const NO_STATE = { cookies: [], origins: [] }

/** A storageState for `origin` with the intro already done. */
export function onboardedState(origin: string) {
  return { cookies: [], origins: [{ origin: new URL(origin).origin, localStorage: [{ name: ONBOARDING_KEY, value: ONBOARDED }] }] }
}

/** For a context or page made by hand (browser.newContext()): the intro counts as done before any page loads. */
export async function skipOnboarding(target: BrowserContext | Page) {
  await target.addInitScript(
    ([k, v]) => {
      try {
        if (!localStorage.getItem(k)) localStorage.setItem(k, v)
      } catch {}
    },
    [ONBOARDING_KEY, ONBOARDED] as const,
  )
}
