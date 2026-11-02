"use client"
// The app shell's PWA host (F-23): the coach and push sheets as URL state (?sheet=coach|push, from the coach card
// and You), "Who can see what" (?sheet=privacy, from a Pot's ••• menu and You; privacy audit 2026-11-02), the automatic push pre-prompt on the first launch from the Home Screen (D-42: after install, with a
// reason, never by itself as a system dialog), and the app badge (Badging API, §8.5). Also the first-run intro
// (?sheet=intro, components/onboarding): the push pre-prompt never stacks on it; while the intro is due or was on
// screen in this page's life, the pre-prompt waits for the next launch.
import { useEffect, useRef } from "react"
import { CoachSheet } from "@/components/pwa/Coach"
import { PushPrompt } from "@/components/pwa/PushPrompt"
import { PrivacySheet } from "@/components/sheets/PrivacySheet"
import { OnboardingHost } from "@/components/onboarding/Onboarding"
import { onboardingBusy } from "@/lib/client/onboarding"
import { useWaitingCount } from "@/lib/client/data"
import { applyBadge, badgeAllowed } from "@/lib/client/pwa/badge"
import { isIOS, isStandalone } from "@/lib/client/pwa/platform"
import { permission, shouldAutoPrompt, usePush } from "@/lib/client/pwa/push"
import { closeSheet, openSheet, useSheetParams } from "@/lib/client/sheet"

export function PwaHost() {
  const { sheet } = useSheetParams()
  const push = usePush()
  const asked = useRef(false)
  useEffect(() => {
    if (asked.current) return
    if (onboardingBusy()) return
    if (shouldAutoPrompt(push.local, { standalone: isStandalone(), permission: permission(), support: push.support, now: Date.now() })) {
      asked.current = true
      if (!new URLSearchParams(window.location.search).get("sheet") && !new URLSearchParams(window.location.search).get("r")) openSheet("push")
    }
  }, [push.local, push.support])
  return (
    <>
      <BadgeSync />
      <CoachSheet open={sheet === "coach"} onClose={closeSheet} />
      <PushPrompt open={sheet === "push"} onClose={closeSheet} />
      <PrivacySheet open={sheet === "privacy"} onClose={closeSheet} />
      <OnboardingHost />
    </>
  )
}

function BadgeSync() {
  const n = useWaitingCount()
  const { status } = usePush()
  useEffect(() => {
    const allowed = badgeAllowed({
      hasApi: "setAppBadge" in navigator,
      ios: isIOS({ ua: navigator.userAgent, platform: navigator.platform ?? "", maxTouchPoints: navigator.maxTouchPoints ?? 0 }),
      standalone: isStandalone(),
      permission: permission(),
    })
    if (allowed) void applyBadge(n)
  }, [n, status])
  return null
}
