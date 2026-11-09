"use client"
// Live sign-in choices (F-14 / F-19; design-direction 01 §2, 07 §2; D-20, D-22): NEAR Auth (Google first; email and
// passkeys run on NEAR Auth's own pages) and a NEAR wallet (NEAR Connect). NEAR Auth shows only on builds with
// NEXT_PUBLIC_FLAG_NEAR_AUTH and a client id (the shared testnet client accepts only http://localhost:3000).
// The NEAR Auth window opens synchronously inside the tap; the challenge and the device key are prepared on idle.
// Two layouts:
//  - "disclosure" (the invite, claim and gift pages): Google, then "More ways" (email, passkey, a note), then the
//    small "I have a NEAR wallet" link;
//  - "direct" (the sign-in dialog and the app's signed-out screen, 07 §2.3-§2.6): every option at once, in the order
//    Google (the marigold) · email · "or" · the wallet as a quiet row (the marigold when it's the only way in). A tap
//    swaps the options for the app's stepper (① the window / the wallet, ② setting up, ③ what comes next) with
//    [Cancel] and "Can't see it? Open it again"; Escape means Cancel while a window is up, and dismisses NEAR
//    Connect's picker when that's on top. Errors say what happened and that nothing changed.
import { ChevronDown, KeyRound, Mail, Wallet, X } from "lucide-react"
import { useEffect, useRef, useState, useSyncExternalStore, type Ref } from "react"
import { ProgressSteps, type StepState } from "@/components/feedback/States"
import { Button } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { useOnline } from "@/lib/client/browser"
import { cn } from "@/lib/client/cn"
import { deviceKeys } from "@/lib/client/keys/device-key-store"
import { prepareNearAuthLogin, startNearAuthLogin } from "@/lib/signing/near-auth/client"
import { NearAuthError, nearAuthConfig, nearAuthEnabled } from "@/lib/signing/near-auth/oidc"
import { dismissWalletPicker, walletPickerUp, walletSignIn, WalletSignIn, type WalletErr } from "@/components/features/wallet/WalletSignIn"
import { GoogleLocalOnly, useGoogleLocalOnly } from "./GoogleLocalOnly"
import { GoogleMark } from "./GoogleMark"

type AuthErr = "auth.popup_blocked" | "auth.failed" | "auth.service_down" | null

export type SignInMethod = "google" | "email" | "wallet"
export type SignInErr =
  "auth.popup_blocked" | "auth.service_down" | "signin.failed" | "signin.timeout" | "signin.offline" | "signin.account_check" | WalletErr
export type SignInPhase = { tag: "idle" } | { tag: "window"; method: SignInMethod } | { tag: "setup"; method: SignInMethod }
/** What step ③ names: Create (a start CTA) or the person's Pots (the header's "Sign in", the app's routes). */
export type SignInGoal = "start" | "back"
export const IDLE: SignInPhase = { tag: "idle" }

/** The device key + the server challenge, before any tap (frontend-architecture §4.3). */
function usePrepare(on: boolean) {
  useEffect(() => {
    if (!on) return
    const run = () => void prepareNearAuthLogin().catch(() => {})
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback
    if (ric) ric(run)
    else setTimeout(run, 800)
  }, [on])
}

type Props = {
  /** after a session exists (the join landing goes straight on to joining; the dialog hands off to its `next`) */
  onSignedIn?: () => void
  /** the first option is the screen's marigold (the join landing, the dialog); secondary next to another marigold */
  primary?: boolean
  /** the join landing's wording ("Join with Google") */
  join?: boolean
  className?: string
  layout?: "disclosure" | "direct"
  /** where a redirect-mode sign-in comes back to (NEAR Auth returns to "/" first); default: this page */
  returnTo?: string
  /** direct: no Google (in-app browsers block it) */
  hideGoogle?: boolean
  /** direct: the wallet's name when it's the only way in: the dialog's "Continue with a NEAR wallet", or the app
   *  screen's "I have a NEAR wallet" (the name the integration and testnet suites press) */
  walletOnlyLabel?: "signin.wallet.only" | "landing.more.wallet"
  /** direct: step ③ of the stepper */
  goal?: SignInGoal
  /** direct: a sign-in is on its way (the panel hides its fine print and demo row) */
  onBusyChange?: (busy: boolean) => void
}

export function SignInOptions({ layout = "disclosure", ...props }: Props) {
  return layout === "direct" ? <DirectOptions {...props} /> : <DisclosureOptions {...props} />
}

// ---------------------------------------------------------------------------------------------------------
// "disclosure": the invite, claim and gift pages

function DisclosureOptions({ onSignedIn, primary = false, join, className, returnTo }: Omit<Props, "layout">) {
  const enabled = nearAuthEnabled()
  const googleOff = useGoogleLocalOnly(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<AuthErr>(null)
  const [more, setMore] = useState(false)
  usePrepare(enabled)

  const login = (connection?: "google-oauth2") => {
    if (busy) return
    setError(null)
    // synchronous: window.open happens inside this tap, before any await
    const p = startNearAuthLogin({ connection, returnTo })
    setBusy(true)
    p.then(
      () => onSignedIn?.(),
      (e: unknown) => {
        const k = nearAuthErr(e)
        setError(k === "auth.popup_blocked" || k === "auth.service_down" || k === null ? k : "auth.failed")
      },
    ).finally(() => setBusy(false))
  }

  return (
    <div className={cn("flex w-full flex-col gap-3", className)} data-signin-options>
      {enabled && (
        <>
          <Button variant={primary ? "primary" : "secondary"} className="w-full" onClick={() => login("google-oauth2")} disabled={busy} data-near-auth="google">
            <GoogleMark />
            {join ? t("landing.cta.google") : t("signin.google")}
          </Button>
          {busy && (
            <p role="status" className="text-center text-body-sm text-ink-muted">
              {t("auth.continue_in_window")}
            </p>
          )}
          {error && (
            <p role="alert" className="text-center text-body-sm text-ink">
              {t(error)}
            </p>
          )}
          <Button variant="ghost" className="w-full" aria-expanded={more} onClick={() => setMore((v) => !v)}>
            {join ? t("landing.cta.more") : t("signin.more")}
            <ChevronDown aria-hidden className={cn("transition-transform duration-200", more && "rotate-180")} strokeWidth={2} />
          </Button>
          {more && (
            <div className="flex flex-col gap-2 rounded-md border border-line bg-surface p-2 text-left">
              <button type="button" onClick={() => login()} disabled={busy} className="flex min-h-14 items-center gap-3 rounded-sm px-3 text-left hover:bg-surface-sunken" data-near-auth="email">
                <Mail aria-hidden className="size-6 text-ink" strokeWidth={2} />
                <span className="text-label text-ink">{t("landing.more.email")}</span>
              </button>
              <button type="button" onClick={() => login()} disabled={busy} className="flex min-h-14 items-center gap-3 rounded-sm px-3 text-left hover:bg-surface-sunken">
                <KeyRound aria-hidden className="size-6 text-ink" strokeWidth={2} />
                <span>
                  <span className="block text-label text-ink">{t("landing.more.passkey")}</span>
                  <span className="block text-body-sm text-ink-muted">{t("landing.more.passkey_hint")}</span>
                </span>
              </button>
              <p className="px-3 pb-1 text-body-sm text-ink-muted">{t("landing.more.note")}</p>
            </div>
          )}
        </>
      )}
      {!enabled && googleOff && <GoogleLocalOnly label={join ? "landing.cta.google" : "signin.google"} />}
      <WalletSignIn onSignedIn={onSignedIn} />
    </div>
  )
}

/** A NEAR Auth failure in the app's words (cancelled = silent). */
function nearAuthErr(e: unknown): Exclude<SignInErr, WalletErr | "signin.offline"> | null {
  if (e instanceof NearAuthError) {
    if (e.kind === "cancelled") return null
    if (e.kind === "blocked") return "auth.popup_blocked"
    if (e.kind === "unavailable") return "auth.service_down"
    if (e.kind === "timeout") return "signin.timeout"
    // GOV-7: the new account didn't hold exactly the keys it should; the sign-in was refused
    if (e.kind === "account_check") return "signin.account_check"
    return "signin.failed"
  }
  return (e as { reason?: string })?.reason === "auth_unavailable" ? "auth.service_down" : "signin.failed"
}

// ---------------------------------------------------------------------------------------------------------
// "direct": the sign-in dialog and the app's signed-out screen

const noopSubscribe = () => () => undefined
/** A browser that can hold a device key (IndexedDB + WebCrypto); NEAR Auth sign-ins need one (D-21). */
const useKeysOk = () => useSyncExternalStore(noopSubscribe, () => deviceKeys() !== null, () => true)

/**
 * The window NEAR Auth opens inside the tap, caught as it opens (client.ts opens it synchronously at the start of
 * startNearAuthLogin): [Cancel] closes it and "Open it again" brings it forward, without ever opening one ourselves.
 */
function withWindowCatch<T>(run: () => T): { result: T; win: Window | null } {
  const open = window.open
  let win: Window | null = null
  window.open = function (this: Window, ...args: Parameters<typeof window.open>) {
    const w = open.apply(this, args)
    win = w
    return w
  } as typeof window.open
  try {
    return { result: run(), win }
  } finally {
    window.open = open
  }
}

/**
 * Close the sign-in window. Until NEAR Auth's page is in it, it's still our blank window, and closing it would make
 * the flow fall back to its full-page redirect: wait (briefly) until it has left our origin. A window still ours
 * after 3 s is left alone (the person closes it; the walked-away attempt then ends silently).
 */
function closeWindowSoon(w: Window | null) {
  if (!w) return
  let tries = 0
  const tick = () => {
    if (w.closed) return
    let ours = true
    try {
      void w.location.href
    } catch {
      ours = false
    }
    if (!ours) return w.close()
    if (++tries > 30) return
    setTimeout(tick, 100)
  }
  tick()
}

const issuerOrigin = () => {
  try {
    return new URL(nearAuthConfig().base).origin
  } catch {
    return ""
  }
}

/** The direct layout's state machine for the live build (NEAR Auth + the wallet). */
function useLiveSignIn({ returnTo, onSignedIn }: { returnTo?: string; onSignedIn?: () => void }) {
  const [phase, setPhase] = useState<SignInPhase>(IDLE)
  const [error, setError] = useState<SignInErr | null>(null)
  // each tap is an attempt; [Cancel] walks away from it: its late failure is ignored, its late success still signs
  // in (the session exists by then, and the hand-off moves on)
  const attempt = useRef(0)
  const win = useRef<Window | null>(null)
  const signedIn = useRef(onSignedIn)
  useEffect(() => {
    signedIn.current = onSignedIn
  }, [onSignedIn])

  const nearAuth = (method: "google" | "email") => {
    const id = ++attempt.current
    setError(null)
    // synchronous: window.open happens inside this tap, before any await
    const { result: p, win: w } = withWindowCatch(() => startNearAuthLogin({ connection: method === "google" ? "google-oauth2" : undefined, returnTo }))
    win.current = w
    setPhase({ tag: "window", method })
    // the window answered (Auth0's web_message): from here on the account is being set up
    const origin = issuerOrigin()
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== origin || (e.data as { type?: string } | null)?.type !== "authorization_response") return
      if (attempt.current === id) setPhase((s) => (s.tag === "window" ? { tag: "setup", method } : s))
    }
    window.addEventListener("message", onMessage)
    p.then(
      () => signedIn.current?.(),
      (e: unknown) => {
        if (attempt.current !== id) return
        setPhase(IDLE)
        setError(nearAuthErr(e))
      },
    ).finally(() => window.removeEventListener("message", onMessage))
  }

  const wallet = () => {
    const id = ++attempt.current
    setError(null)
    setPhase({ tag: "window", method: "wallet" })
    void walletSignIn().then((r) => {
      if (r === "ok") return signedIn.current?.()
      if (attempt.current !== id) return
      setPhase(IDLE)
      setError(r === "cancelled" ? null : r)
    })
  }

  const pick = (m: SignInMethod) => {
    if (phase.tag !== "idle") return
    if (m === "wallet") wallet()
    else nearAuth(m)
  }
  const cancel = () => {
    if (phase.tag !== "window") return
    attempt.current++
    if (phase.method === "wallet") dismissWalletPicker()
    else closeWindowSoon(win.current)
    win.current = null
    setPhase(IDLE)
  }
  /** "Can't see it? Open it again": bring the window forward, or start again in this tap if it was closed. */
  const again = () => {
    if (phase.tag !== "window" || phase.method === "wallet") return
    const w = win.current
    if (w && !w.closed) {
      try {
        w.focus()
      } catch {}
      return
    }
    attempt.current++
    nearAuth(phase.method)
  }
  return { phase, error, pick, cancel, again }
}

function DirectOptions({
  onSignedIn,
  primary = false,
  className,
  returnTo,
  hideGoogle = false,
  walletOnlyLabel = "signin.wallet.only",
  goal = "start",
  onBusyChange,
}: Omit<Props, "layout">) {
  const nearAuth = nearAuthEnabled()
  const keysOk = useKeysOk()
  const online = useOnline()
  usePrepare(nearAuth && keysOk)
  const s = useLiveSignIn({ returnTo, onSignedIn })
  const googleOff = useGoogleLocalOnly(hideGoogle ? "in-app" : null)
  return (
    <SignInFlow
      className={className}
      google={nearAuth && keysOk && !hideGoogle}
      googleOff={!nearAuth && googleOff}
      email={nearAuth && keysOk}
      wallet
      unsupported={nearAuth && !keysOk}
      primary={primary}
      walletOnlyLabel={walletOnlyLabel}
      goal={goal}
      offline={!online}
      onBusyChange={onBusyChange}
      {...s}
    />
  )
}

/**
 * The direct layout itself, for the live machine above and the mock build's simulated one (SignInPanel): the option
 * stack while idle, the stepper while a sign-in is on its way, focus and Escape handled like 07 §2.6, §2.8.
 */
export function SignInFlow({
  className,
  google,
  googleOff = false,
  email,
  wallet,
  unsupported = false,
  primary,
  walletOnlyLabel,
  goal,
  offline = false,
  phase,
  error,
  pick,
  cancel,
  again,
  onBusyChange,
}: {
  className?: string
  google: boolean
  /** a hosted build without NEAR Auth: Google shows switched off, with why (GoogleLocalOnly) */
  googleOff?: boolean
  email: boolean
  wallet: boolean
  /** NEAR Auth is on, but this browser can't hold its key: Google and email give way to one line */
  unsupported?: boolean
  primary: boolean
  walletOnlyLabel: "signin.wallet.only" | "landing.more.wallet"
  goal: SignInGoal
  offline?: boolean
  phase: SignInPhase
  error: SignInErr | null
  pick: (m: SignInMethod) => void
  cancel: () => void
  again?: () => void
  onBusyChange?: (busy: boolean) => void
}) {
  const busy = phase.tag !== "idle"
  const busyChanged = useRef(onBusyChange)
  useEffect(() => {
    busyChanged.current = onBusyChange
  }, [onBusyChange])
  useEffect(() => {
    busyChanged.current?.(busy)
  }, [busy])

  // focus: into the stepper when it takes over (the tapped button is gone), back on the option used when it ends
  const last = useRef<SignInMethod | null>(null)
  const buttons = useRef<Partial<Record<SignInMethod, HTMLButtonElement | null>>>({})
  const wait = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const was = useRef(phase.tag)
  useEffect(() => {
    const before = was.current
    was.current = phase.tag
    if (before === phase.tag) return
    if (phase.tag === "window") cancelRef.current?.focus()
    else if (phase.tag === "setup") wait.current?.focus()
    else if (last.current) buttons.current[last.current]?.focus()
  }, [phase.tag])

  // Escape while a window or the wallet picker is up: Cancel (or dismiss the picker), never the dialog under it
  useEffect(() => {
    if (phase.tag !== "window") return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      e.preventDefault()
      e.stopPropagation()
      if (walletPickerUp()) dismissWalletPicker()
      else cancel()
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [phase.tag, cancel])

  const choose = (m: SignInMethod) => {
    if (offline) return
    last.current = m
    pick(m)
  }
  const ref = (m: SignInMethod) => (el: HTMLButtonElement | null) => {
    buttons.current[m] = el
  }

  return (
    <div className={cn("flex w-full flex-col gap-3", className)}>
      {busy ? (
        <SignInSteps ref={wait} cancelRef={cancelRef} phase={phase} goal={goal} onCancel={cancel} onAgain={again} />
      ) : (
        <ChoiceStack
          google={google}
          googleOff={googleOff}
          email={email}
          wallet={wallet}
          unsupported={unsupported}
          primary={primary}
          walletOnlyLabel={walletOnlyLabel}
          error={offline ? "signin.offline" : error}
          disabled={offline}
          onPick={choose}
          buttonRef={ref}
        />
      )}
    </div>
  )
}

/** The options in 07 §2.4's order. The first one shown takes `primary`; the wallet is a quiet row beside NEAR Auth. */
function ChoiceStack({
  google,
  googleOff,
  email,
  wallet,
  unsupported,
  primary,
  walletOnlyLabel,
  error,
  disabled,
  onPick,
  buttonRef,
}: {
  google: boolean
  email: boolean
  wallet: boolean
  unsupported: boolean
  primary: boolean
  walletOnlyLabel: "signin.wallet.only" | "landing.more.wallet"
  error: SignInErr | null
  disabled: boolean
  onPick: (m: SignInMethod) => void
  buttonRef: (m: SignInMethod) => (el: HTMLButtonElement | null) => void
  googleOff: boolean
}) {
  const first: SignInMethod | null = google ? "google" : email ? "email" : wallet ? "wallet" : null
  const variant = (m: SignInMethod) => (primary && first === m ? "primary" : "secondary")
  const auth = google || email
  const off = disabled ? { "aria-disabled": true as const } : {}
  return (
    <div className="flex w-full flex-col gap-3" data-signin-options>
      {error && (
        <p role="alert" className="flex items-start gap-2 text-left text-body-sm text-ink" data-signin-error={error}>
          <X aria-hidden className="mt-0.5 size-4 shrink-0 text-declined" strokeWidth={2.5} />
          {t(error)}
        </p>
      )}
      {unsupported && <p className="text-left text-body-sm text-ink-muted">{t("signin.unsupported_browser")}</p>}
      {google && (
        <Button ref={buttonRef("google")} variant={variant("google")} className="w-full" onClick={() => onPick("google")} data-near-auth="google" {...off}>
          <GoogleMark />
          {t("signin.google")}
        </Button>
      )}
      {!google && googleOff && <GoogleLocalOnly />}
      {email && (
        <Button ref={buttonRef("email")} variant={variant("email")} className="w-full" onClick={() => onPick("email")} data-near-auth="email" {...off}>
          <Mail aria-hidden strokeWidth={2} />
          {t("landing.more.email")}
        </Button>
      )}
      {(auth || googleOff) && wallet && (
        <p className="flex items-center gap-3 text-body-sm text-ink-muted" data-signin-or>
          <span aria-hidden className="h-px flex-1 bg-line" />
          {t("signin.or")}
          <span aria-hidden className="h-px flex-1 bg-line" />
        </p>
      )}
      {wallet &&
        (auth ? (
          <Button ref={buttonRef("wallet")} variant="ghost" className="w-full" onClick={() => onPick("wallet")} data-wallet-signin {...off}>
            <Wallet aria-hidden strokeWidth={2} />
            {t("landing.more.wallet")}
          </Button>
        ) : (
          <Button ref={buttonRef("wallet")} variant={variant("wallet")} className="w-full" onClick={() => onPick("wallet")} data-wallet-signin {...off}>
            <Wallet aria-hidden strokeWidth={2} />
            {t(walletOnlyLabel)}
          </Button>
        ))}
    </div>
  )
}

/** The app's stepper while a sign-in is on its way (07 §2.6), with [Cancel] while a window is up. */
function SignInSteps({
  ref,
  cancelRef,
  phase,
  goal,
  onCancel,
  onAgain,
}: {
  ref: Ref<HTMLDivElement>
  cancelRef: Ref<HTMLButtonElement>
  phase: Exclude<SignInPhase, { tag: "idle" }>
  goal: SignInGoal
  onCancel: () => void
  onAgain?: () => void
}) {
  const setting = phase.tag === "setup"
  const wallet = phase.method === "wallet"
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (!setting) return
    const id = setTimeout(() => setSlow(true), 10_000)
    return () => clearTimeout(id)
  }, [setting])
  const first = phase.method === "google" ? t("signin.step.google") : phase.method === "email" ? t("signin.step.window") : t("signin.step.wallet")
  const steps: { label: string; state: StepState; helper?: string }[] = [
    { label: setting ? t("signin.step.done") : first, state: setting ? "done" : "current" },
    {
      label: wallet ? t("signin.step.session") : t("setup.progress.1"),
      state: setting ? "current" : "next",
      helper: wallet ? undefined : setting && slow ? t("setup.slow") : t("setup.time"),
    },
    { label: goal === "start" ? t("signin.step.start") : t("signin.step.back"), state: "next" },
  ]
  // what screen readers hear as the steps move (the app's live region is outside the dialog)
  const said = setting ? (wallet ? t("signin.step.session") : t("setup.progress.1")) : first
  return (
    // pot-enter: the options give way with the app's 280 ms fade-in (none with reduced motion)
    <div ref={ref} tabIndex={-1} className="pot-enter flex flex-col gap-4 text-left outline-none" data-signin-wait={phase.tag} data-signin-method={phase.method}>
      <ProgressSteps steps={steps} label={t("signin.steps.a11y")} />
      <p role="status" className="sr-only">
        {said}
      </p>
      {!setting && (
        <div className="flex flex-col gap-1">
          {onAgain && !wallet && (
            <button type="button" onClick={onAgain} className="min-h-11 self-start rounded-sm text-body-sm text-ink underline underline-offset-4" data-signin-again>
              {t("signin.step.again")}
            </button>
          )}
          <Button ref={cancelRef} className="w-full" onClick={onCancel} data-signin-cancel>
            {t("signin.cancel")}
          </Button>
        </div>
      )}
    </div>
  )
}
