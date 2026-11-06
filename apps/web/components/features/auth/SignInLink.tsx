"use client"
// The site's start CTAs (site update 2026-11-03; design-direction 07 §1.3; scratchpad auth-map §2.2): a real
// <Link href={next}> in the server HTML, so without JS, in a new tab and for crawlers it goes to /pots?sheet=create
// (whose signed-out screen shows the sign-in inline). After hydration, a plain click with no session hint opens the
// sign-in dialog in place instead (`?signin=1`, lib/client/signin.ts); a signed-in browser just navigates; a
// modified click (new tab/window) is left to the browser. The dialog's code starts loading on intent.
// No prefetch by default: a signed-out click opens the dialog in place, so prefetching the app route would only put the
// whole signed-in app (its data layer included) on the landing's first load. A caller can still pass `prefetch`.
import Link from "next/link"
import { useSyncExternalStore, type ComponentPropsWithoutRef, type ReactNode } from "react"
import { DEFAULT_NEXT, hasSessionHint, openSignIn, safeNext, type SignInSource } from "@/lib/client/signin"
import { preloadSignIn } from "./SignInHost"

export type { SignInSource }

const noopSubscribe = () => () => undefined

export function SignInLink({
  next = DEFAULT_NEXT,
  source,
  children,
  onClick,
  onPointerEnter,
  onFocus,
  onTouchStart,
  ...rest
}: {
  /** where to go after signing in (and the no-JS href) */
  next?: string
  source: SignInSource
  children: ReactNode
} & Omit<ComponentPropsWithoutRef<typeof Link>, "href">) {
  const href = safeNext(next)
  // the server HTML (and the first client render) is a plain link; with JS and no session a click opens the dialog.
  // Said as a data attribute (tests, debugging), not aria-haspopup: the buttons' press scale is
  // `active:not-aria-[haspopup]:scale-[.97]`, and the hero's [Start a Pot] must keep it.
  const opensDialog = useSyncExternalStore(noopSubscribe, () => !hasSessionHint(), () => false)
  return (
    <Link
      href={href}
      prefetch={false}
      data-signin-source={source}
      data-opens-dialog={opensDialog || undefined}
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented) return
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        if (hasSessionHint()) return
        e.preventDefault()
        openSignIn({ next: href, source })
      }}
      onPointerEnter={(e) => {
        onPointerEnter?.(e)
        preloadSignIn()
      }}
      onFocus={(e) => {
        onFocus?.(e)
        preloadSignIn()
      }}
      onTouchStart={(e) => {
        onTouchStart?.(e)
        preloadSignIn()
      }}
      {...rest}
    >
      {children}
    </Link>
  )
}
