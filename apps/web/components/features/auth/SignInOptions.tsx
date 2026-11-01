"use client"
// Live sign-in choices (F-14 / F-19; design-direction 01 §2; D-20, D-22): NEAR Auth (Google first; email and
// passkeys run on NEAR Auth's own pages), and "I have a NEAR wallet" in small text. NEAR Auth shows only on builds
// with NEXT_PUBLIC_FLAG_NEAR_AUTH and a client id (the shared testnet client accepts only http://localhost:3000).
// The NEAR Auth window opens synchronously inside the tap; the challenge and the device key are prepared on idle.
import { ChevronDown, KeyRound, Mail } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { cn } from "@/lib/client/cn"
import { prepareNearAuthLogin, startNearAuthLogin } from "@/lib/signing/near-auth/client"
import { NearAuthError, nearAuthEnabled } from "@/lib/signing/near-auth/oidc"
import { WalletSignIn } from "@/components/features/wallet/WalletSignIn"
import { GoogleMark } from "./GoogleMark"

type AuthErr = "auth.popup_blocked" | "auth.failed" | "auth.service_down" | null

export function SignInOptions({
  onSignedIn,
  primary = false,
  join,
  className,
}: {
  /** after a session exists (the join landing goes straight on to joining) */
  onSignedIn?: () => void
  /** the Google button is the screen's marigold (the join landing); secondary next to another marigold */
  primary?: boolean
  /** the join landing's wording ("Join with Google") */
  join?: boolean
  className?: string
}) {
  const enabled = nearAuthEnabled()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<AuthErr>(null)
  const [more, setMore] = useState(false)

  // the device key + the server challenge, before any tap (frontend-architecture §4.3)
  useEffect(() => {
    if (!enabled) return
    const run = () => void prepareNearAuthLogin().catch(() => {})
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback
    if (ric) ric(run)
    else setTimeout(run, 800)
  }, [enabled])

  const login = (connection?: "google-oauth2") => {
    if (busy) return
    setError(null)
    // synchronous: window.open happens inside this tap, before any await
    const p = startNearAuthLogin({ connection })
    setBusy(true)
    p.then(
      () => onSignedIn?.(),
      (e: unknown) => {
        if (e instanceof NearAuthError) {
          if (e.kind === "cancelled") setError(null)
          else if (e.kind === "blocked") setError("auth.popup_blocked")
          else if (e.kind === "unavailable") setError("auth.service_down")
          else setError("auth.failed")
        } else setError((e as { reason?: string })?.reason === "auth_unavailable" ? "auth.service_down" : "auth.failed")
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
              <button type="button" onClick={() => login()} disabled={busy} className="flex min-h-14 items-center gap-3 rounded-sm px-3 hover:bg-surface-sunken" data-near-auth="email">
                <Mail aria-hidden className="size-6 text-ink" strokeWidth={2} />
                <span className="text-label text-ink">{t("landing.more.email")}</span>
              </button>
              <button type="button" onClick={() => login()} disabled={busy} className="flex min-h-14 items-center gap-3 rounded-sm px-3 hover:bg-surface-sunken">
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
      <WalletSignIn onSignedIn={onSignedIn} />
    </div>
  )
}
