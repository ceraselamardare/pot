"use client"
// The sign-in dialog's host (site update 2026-11-03; scratchpad auth-map §2.1, §4.1), mounted once in app/providers
// inside its own <Suspense> (useSearchParams), so "/" and "/demo" stay static (Cache Components):
//  - `?signin=1` opens the dialog (SignInLink pushes it; Back closes it; a reload or an "Open in Safari" deep link
//    reopens it), except on the app shell's routes, whose signed-out screen shows the same panel inline;
//  - the dialog's code loads on demand (and on a start CTA's hover/focus/touch, `preloadSignIn`), never with the page;
//  - once mounted it stays mounted, so it can animate closed and still own a sign-in that finishes after a close;
//  - a hand-off ends when the route changes (lib/client/signin.ts `settleHandoff`).
import dynamic from "next/dynamic"
import { usePathname, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { isAppRoute, settleHandoff, SIGNIN_PARAM } from "@/lib/client/signin"

const SignInDialog = dynamic(() => import("./SignInDialog"), { ssr: false })

/** Start loading the dialog's code before the tap (a start CTA's pointerenter / focus / touchstart). */
export function preloadSignIn() {
  void import("./SignInDialog").catch(() => {})
}

export function SignInHost() {
  const params = useSearchParams()
  const pathname = usePathname()
  const open = params.get(SIGNIN_PARAM) === "1" && !isAppRoute(pathname)
  const [mounted, setMounted] = useState(false)
  if (open && !mounted) setMounted(true)
  useEffect(() => {
    settleHandoff(pathname)
  }, [pathname])
  return mounted ? <SignInDialog open={open} /> : null
}
