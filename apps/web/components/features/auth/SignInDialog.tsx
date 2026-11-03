"use client"
// The sign-in dialog (site update 2026-11-03; design-direction 07 §2; scratchpad auth-map §4.1): the app's default
// Sheet (a bottom sheet on phones, a centred 440 px dialog from md; focus on the title, Escape/✕/backdrop/Back close
// it) around the shared SignInPanel. Loaded on demand by SignInHost (next/dynamic), so neither the landing nor the
// tour ships it, NEAR Auth or the data layer on first load.
//  - Start mode (the start CTAs: next = /pots?sheet=create): "Sign in to start your Pot". Back mode (the header's
//    "Sign in": next = /pots): "Sign in to Pot".
//  - The hand-off: once a session exists, beginHandoff() (so "/"'s signed-in redirect to /pots stands down), unmount
//    at once (no 280 ms exit under the intro or Create that slides up next), then router.replace(next), which also
//    drops the ?signin=1 entry, so Back never reopens it. A session that appears while it's open (another tab, a
//    stale hint) hands off the same way.
//  - Closing never breaks a sign-in in flight: the sign-in's callback is this always-mounted component's, so a
//    window that finishes after the person closed the dialog still lands them on `next`.
//  - NEAR Connect stacks its own picker above this (body child, z-index 1e8), and a wallet's own panel after a pick
//    uses the same root. While either is up the sheet is non-modal (Sheet `modal={false}`): no focus trap, the page
//    and the picker aren't aria-hidden, nothing blocks pointers, and pressing or focusing the picker never closes
//    this. A close request meanwhile (Escape, Android back) dismisses the picker instead, the topmost layer. When it
//    goes, the sheet is modal again and focus comes back into it if it was left outside.
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { dismissWalletPicker, useWalletPickerUp, walletPickerUp } from "@/components/features/wallet/WalletSignIn"
import { Sheet } from "@/components/sheets/Sheet"
import { t } from "@/i18n/t"
import { useMe } from "@/lib/client/data"
import { beginHandoff, closeSignIn, currentSignInRequest, forgetSignInRequest, modeOf, safeNext, type SignInRequest } from "@/lib/client/signin"
import { SignInPanel } from "./SignInPanel"

export default function SignInDialog({ open }: { open: boolean }) {
  const router = useRouter()
  const me = useMe()
  // each opening reads its opener's request (or the one kept for a reload)
  const [req, setReq] = useState<SignInRequest>(currentSignInRequest)
  const [shown, setShown] = useState(false)
  if (open !== shown) {
    setShown(open)
    if (open) setReq(currentSignInRequest())
  }
  // handed off: gone at once, until the URL stops asking for the dialog
  const [gone, setGone] = useState(false)
  if (!open && gone) setGone(false)
  const handed = useRef(false)
  useEffect(() => {
    if (open) handed.current = false
  }, [open])
  const nextRef = useRef(req.next)
  useEffect(() => {
    nextRef.current = req.next
  }, [req.next])

  const handoff = useCallback(() => {
    if (handed.current) return
    handed.current = true
    beginHandoff()
    setGone(true)
    forgetSignInRequest()
    router.replace(safeNext(nextRef.current))
  }, [router])

  // signed in while it's open: go on at once
  useEffect(() => {
    if (open && me) handoff()
  }, [open, me, handoff])

  // NEAR Connect's picker on top: non-modal until it goes; then focus back into the sheet if it was left outside
  const pickerUp = useWalletPickerUp(open)
  const pickerWas = useRef(false)
  useEffect(() => {
    const was = pickerWas.current
    pickerWas.current = pickerUp
    if (!was || pickerUp || !open) return
    const panel = document.querySelector<HTMLElement>("[role='dialog'] [data-signin-panel]")
    const popup = panel?.closest<HTMLElement>("[role='dialog']")
    if (!popup || popup.contains(document.activeElement)) return
    const target = popup.querySelector<HTMLElement>("[data-signin-cancel], [data-signin-options] button, [data-signin-wait]") ?? popup.querySelector<HTMLElement>("h2[tabindex]")
    target?.focus()
  }, [pickerUp, open])

  const mode = modeOf(req.next)
  if (gone) return null
  return (
    <Sheet
      open={open}
      modal={!pickerUp}
      onClose={() => {
        if (walletPickerUp()) dismissWalletPicker()
        else closeSignIn()
      }}
      title={mode === "start" ? t("signin.start.title") : t("signin.title")}
      description={mode === "start" ? t("signin.start.body") : t("signin.back.body")}
    >
      <SignInPanel layout="dialog" next={req.next} source={req.source} goal={mode} onDone={handoff} className="pt-4 pb-2" />
    </Sheet>
  )
}
