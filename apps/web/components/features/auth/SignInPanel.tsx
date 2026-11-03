"use client"
// The sign-in panel (site update 2026-11-03; design-direction 07 §2; scratchpad auth-map §4.1): one component for the
// sign-in dialog (`layout="dialog"`, inside SignInDialog's Sheet) and the app's signed-out screen (`layout="page"`,
// inline in SessionGate's SignedOutScreen), so both have the same options and states.
//  - It offers only what this build has (lib/client/signin.ts `signInMethods`): NEAR Auth's Google (the marigold, the
//    app's own G) and email, then "or" and the NEAR wallet as a quiet row; the wallet alone becomes the marigold
//    ("Continue with a NEAR wallet" in the dialog) with "Google sign-in isn't on in this test version yet."; an
//    in-app browser leads with "Open in Safari/Chrome"; a build with no way in leads with the demo.
//  - Mock builds simulate the full set (like the invite landing): every option signs in as the mock newcomer Alex,
//    so Start → the first-run intro → Create can be walked and tested. Mock only: `?signin_preview=wallet|none`
//    shows the hosted build's wallet-only variant and the nothing-available one, for design review.
//  - Under the options: the fine print, then the dialog's quiet "Not ready? See a quick demo" row (not in back mode,
//    not when opened from the tour's end), or the page's [See a demo] + "What is Pot?". While a sign-in is on its
//    way only the stepper shows (one thing to do).
//  - `data-signin-panel` on the root: the tour's ←/→ keys stand down while it's open (components/demo/TourPlayer).
import { ChevronRight } from "lucide-react"
import Link from "next/link"
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react"
import { InAppBanner } from "@/components/landing/InAppBanner"
import { buttonVariants } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { mockJoinSession } from "@/lib/client/actions"
import { cn } from "@/lib/client/cn"
import { IS_LIVE } from "@/lib/client/config"
import { useInstallContext } from "@/lib/client/pwa/platform"
import { forgetSignInRequest, signInMethods, type SignInSource } from "@/lib/client/signin"
import { IDLE, SignInFlow, SignInOptions, type SignInErr, type SignInGoal, type SignInMethod, type SignInPhase } from "./SignInOptions"

type Methods = ReturnType<typeof signInMethods>

/** The simulated "window" beat before the mock's account setup (its own latency, LATENCY.setup, follows). */
export const MOCK_WINDOW_MS = 700

const noopSubscribe = () => () => undefined
const PREVIEW: Record<string, Methods> = {
  wallet: { google: false, email: false, wallet: true, mock: true },
  none: { google: false, email: false, wallet: false, mock: true },
}
/** Mock only: `?signin_preview=wallet|none` (design review of the hosted and the nothing-available variants). */
function usePreview(): Methods | null {
  return useSyncExternalStore(
    noopSubscribe,
    () => (IS_LIVE ? null : (PREVIEW[new URLSearchParams(window.location.search).get("signin_preview") ?? ""] ?? null)),
    () => null,
  )
}

export function SignInPanel({
  layout,
  next,
  source,
  goal = "start",
  onDone,
  className,
}: {
  layout: "dialog" | "page"
  /** dialog: where the hand-off goes (a redirect-mode sign-in returns there too); page: undefined (stay here) */
  next?: string
  source?: SignInSource
  goal?: SignInGoal
  /** dialog: the host's hand-off; page: undefined (SessionGate swaps the screen in place) */
  onDone?: () => void
  className?: string
}) {
  const { app: inApp } = useInstallContext()
  const m = usePreview() ?? signInMethods(inApp)
  const [busy, setBusy] = useState(false)
  const dialog = layout === "dialog"
  const none = !m.google && !m.email && !m.wallet
  // NEAR Auth is off on this build (today's hosted testnet): the site still tells the Google story, so say why
  const googleLater = !inApp && !none && !m.email
  const walletOnlyLabel = dialog ? "signin.wallet.only" : "landing.more.wallet"
  const demoRow = dialog && goal === "start" && source !== "tour" && !none
  const options = {
    primary: !inApp,
    goal,
    walletOnlyLabel,
    onBusyChange: setBusy,
  } as const
  return (
    <div className={cn("flex w-full flex-col", className)} data-signin-panel data-signin-layout={layout}>
      {inApp && !busy && (
        <>
          <InAppBanner
            app={inApp}
            href={new URL(next ?? `${window.location.pathname}${window.location.search}`, window.location.origin).href}
            purpose="signin"
            googleOff={!m.email}
            tone={dialog ? "sunken" : "card"}
            level={dialog ? 3 : 2}
          />
          {(m.email || m.wallet) && <p className="mt-5 mb-3 text-left text-label text-ink">{t("signin.inapp.here")}</p>}
        </>
      )}
      {none ? (
        <NoWayIn heading={dialog ? "h3" : "h2"} />
      ) : m.mock ? (
        <MockOptions google={m.google} email={m.email} wallet={m.wallet} onDone={onDone} {...options} />
      ) : (
        <SignInOptions layout="direct" returnTo={next} hideGoogle={!!inApp} onSignedIn={onDone} {...options} />
      )}
      {!busy && googleLater && <p className="mt-3 text-body-sm text-ink-muted">{t("signin.google_later")}</p>}
      {!busy && !none && <p className={cn("mt-4 text-body-sm text-ink-muted", dialog && "text-left")}>{m.mock ? t("claim.signin.mock") : m.email ? t("signin.fine") : t("signin.fine.wallet")}</p>}
      {!busy && demoRow && <DemoRow />}
      {!busy && !dialog && (
        <div className="mt-6 flex w-full flex-col items-center gap-2" data-signin-links>
          {!none && (
            <Link href="/demo" className={cn(buttonVariants({ variant: "secondary" }), "w-full")}>
              {t("signin.demo")}
            </Link>
          )}
          <Link href="/" className="inline-flex min-h-11 items-center rounded-sm px-3 text-body-sm text-ink underline underline-offset-4">
            {t("signin.home")}
          </Link>
        </div>
      )}
    </div>
  )
}

/** The dialog's quiet way out (07 §2.3): "Not ready? See a quick demo ›" and what the demo is. */
function DemoRow() {
  const hint = useId()
  return (
    <div className="mt-5 border-t border-line pt-3 text-left" data-signin-demo>
      <p className="flex flex-wrap items-center gap-x-1.5 text-body-sm text-ink-muted">
        {t("signin.demo.lead")}
        {/* replace: the demo takes this ?signin=1 entry's place, so Back from it doesn't reopen the dialog */}
        <Link
          href="/demo"
          replace
          onClick={forgetSignInRequest}
          aria-describedby={hint}
          className="inline-flex min-h-11 items-center gap-0.5 rounded-sm text-label text-ink underline underline-offset-4"
        >
          {t("signin.demo.quick")}
          <ChevronRight aria-hidden className="size-4" strokeWidth={2} />
        </Link>
      </p>
      <p id={hint} className="text-body-sm text-ink-muted">
        {t("signin.demo.hint")}
      </p>
    </div>
  )
}

/** A build with no way in at all: the one case where the demo leads (07 §2.4). */
function NoWayIn({ heading: H }: { heading: "h2" | "h3" }) {
  return (
    <div className="flex flex-col gap-3 text-left" data-signin-none>
      <H className="font-display text-heading text-ink">{t("signin.none.title")}</H>
      <p className="text-body-sm text-ink-muted">{t("signin.none.body")}</p>
      <Link href="/demo" className={cn(buttonVariants({ variant: "primary" }), "w-full")}>
        {t("signin.demo")}
      </Link>
    </div>
  )
}

/** The mock build's simulated sign-in: the live layout and stepper, then the mock session as Alex. */
function MockOptions({
  google,
  email,
  wallet,
  primary,
  walletOnlyLabel,
  goal,
  onDone,
  onBusyChange,
}: {
  google: boolean
  email: boolean
  wallet: boolean
  primary: boolean
  walletOnlyLabel: "signin.wallet.only" | "landing.more.wallet"
  goal: SignInGoal
  onDone?: () => void
  onBusyChange: (busy: boolean) => void
}) {
  const [phase, setPhase] = useState<SignInPhase>(IDLE)
  const [error, setError] = useState<SignInErr | null>(null)
  const attempt = useRef(0)
  const done = useRef(onDone)
  useEffect(() => {
    done.current = onDone
  }, [onDone])
  const pick = (method: SignInMethod) => {
    if (phase.tag !== "idle") return
    const id = ++attempt.current
    setError(null)
    setPhase({ tag: "window", method })
    setTimeout(() => {
      if (attempt.current !== id) return
      setPhase({ tag: "setup", method })
      // lib/client/mock/store.ts createSession: LATENCY.setup, and `pot.mock.fail = "setup"` makes it fail
      mockJoinSession("alex").then(
        () => done.current?.(),
        () => {
          if (attempt.current !== id) return
          setPhase(IDLE)
          setError("signin.failed")
        },
      )
    }, MOCK_WINDOW_MS)
  }
  const cancel = () => {
    if (phase.tag !== "window") return
    attempt.current++
    setPhase(IDLE)
  }
  return (
    <SignInFlow
      google={google}
      email={email}
      wallet={wallet}
      primary={primary}
      walletOnlyLabel={walletOnlyLabel}
      goal={goal}
      phase={phase}
      error={error}
      pick={pick}
      cancel={cancel}
      onBusyChange={onBusyChange}
    />
  )
}
