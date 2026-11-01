"use client"
// JoinCta (frontend-architecture §2.5, §5.1; ux-spec §4.1-4.2, §6.1; design-direction 01 §1-2): the invite
// landing's client island.
//  - Keeps the #secret in sessionStorage['pot.invite.<slug>'] (survives a redirect sign-in) and strips it from
//    the URL after a successful join. Never logs, sends or persists it anywhere else.
//  - Pre-generates the device key on idle (D-21), so it's ready before the session call.
//  - Runs the join machine: [Join with Google] → "Setting up your Pot account…" → "Joining {potName}…" →
//    "You're in!" (focus on the H1, one polite announcement) → [Add my $150 share] (prefilled Add sheet).
// Mock data source: there's no NEAR Auth popup; joining signs the invitee in as Leo (the D-61 story).
// Testnet (F-13): [Join with a test account] (preview/local, FLAG_DEV_SESSION) asks for a first name and makes a
// dev session for this browser's device key; then the join signs the D-08 message with the #secret and relays
// `join`. NEAR Auth's popup (F-14) slots into the machine's `authorizing` state.
import { ChevronDown, KeyRound, Mail, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useReducer, useRef, useState, useSyncExternalStore } from "react"
import { ProgressSteps, type StepState } from "@/components/feedback/States"
import { AvatarStack } from "@/components/pot/Avatar"
import { InAppBanner } from "@/components/landing/InAppBanner"
import { Button } from "@/components/ui/button"
import { Sheet } from "@/components/sheets/Sheet"
import { useInstallContext } from "@/lib/client/pwa/platform"
import { t } from "@/i18n/t"
import { announce } from "@/lib/client/browser"
import { joinPot, mockJoinSession } from "@/lib/client/actions"
import { FLAG_DEV_SESSION, IS_LIVE } from "@/lib/client/config"
import { useMeInfo, usePot } from "@/lib/client/data"
import { INVITE_SECRET_RE } from "@/lib/client/invite"
import { deviceKeys } from "@/lib/client/keys/device-key-store"
import { initialJoin, joinReducer, joinStep } from "@/lib/client/machines/join"
import { PEOPLE, type PersonaId } from "@/lib/client/mock/fixtures"
import { formatUsd } from "@/lib/client/money"
import { signInDev, signOut } from "@/lib/client/session"
import { cn } from "@/lib/client/cn"
import { SignInOptions } from "@/components/features/auth/SignInOptions"

const JOINER: PersonaId = "leo"
const secretKey = (slug: string) => `pot.invite.${slug}`

/** The invite secret: the #fragment, else the copy kept in sessionStorage. "" on the server. */
function useInviteSecret(slug: string): string | null | undefined {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("hashchange", cb)
      return () => window.removeEventListener("hashchange", cb)
    },
    () => {
      const h = window.location.hash.slice(1)
      if (INVITE_SECRET_RE.test(h)) {
        try {
          sessionStorage.setItem(secretKey(slug), h)
        } catch {}
        return h
      }
      try {
        return sessionStorage.getItem(secretKey(slug))
      } catch {
        return null
      }
    },
    () => undefined,
  )
}

export function JoinCta({
  slug,
  potName,
  suggested,
}: {
  slug: string
  potName: string
  /** MicroStr */
  suggested: string | null
}) {
  const router = useRouter()
  const { app: inApp } = useInstallContext()
  const meInfo = useMeInfo()
  const me = meInfo === undefined ? undefined : (meInfo?.id ?? null)
  const secret = useInviteSecret(slug)
  const [s, dispatch] = useReducer(joinReducer, initialJoin)
  const [more, setMore] = useState(false)
  const [devName, setDevName] = useState("")
  const devNameRef = useRef("")
  const secretRef = useRef<string | null>(null)
  useEffect(() => {
    if (secret) secretRef.current = secret
  }, [secret])
  const pot = usePot(slug)
  const alreadyMember = s.tag === "landing" && !!me && pot.state === "ready"
  const suggestedText = suggested ? formatUsd(BigInt(suggested), "whole") : null
  const view = pot.state === "ready" ? pot.data : null
  const live = IS_LIVE
  const firstName = live ? (meInfo?.name ?? devName.trim()) : PEOPLE[JOINER].name

  // pre-generate the device key on idle (§4.3); harmless where unsupported
  useEffect(() => {
    const run = () => void deviceKeys()?.ensurePending().catch(() => {})
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback
    if (ric) ric(run)
    else setTimeout(run, 1500)
  }, [])

  // the effects of each state: session, then the join itself
  const tag = s.tag
  useEffect(() => {
    let cancelled = false
    const slow = setTimeout(() => !cancelled && dispatch({ type: "SLOW" }), 10_000)
    if (tag === "creatingSession") {
      ;(live ? signInDev(devNameRef.current).then(() => undefined) : mockJoinSession(JOINER))
        .then(() => !cancelled && dispatch({ type: "SESSION_OK" }))
        .catch(() => !cancelled && dispatch({ type: "SESSION_ERR" }))
    } else if (tag === "joining") {
      joinPot(slug, secretRef.current ?? "")
        .then((r) => {
          if (cancelled) return
          if (r === "joined") dispatch({ type: "JOINED" })
          else if (r === "already_member") dispatch({ type: "ALREADY_MEMBER" })
          else if (r === "closed") dispatch({ type: "INVITE_ERR", kind: "pot_closed" })
          else if (r === "used_up") dispatch({ type: "INVITE_ERR", kind: "used" })
          else if (r === "expired") dispatch({ type: "INVITE_ERR", kind: "expired" })
          else dispatch({ type: "INVITE_ERR", kind: "invalid" })
        })
        .catch(() => !cancelled && dispatch({ type: "RELAY_ERR" }))
    }
    return () => {
      cancelled = true
      clearTimeout(slow)
    }
  }, [tag, slug, live])

  // after a successful join: strip the #secret, forget it, announce once
  useEffect(() => {
    if (tag !== "joined") return
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`)
    try {
      sessionStorage.removeItem(secretKey(slug))
    } catch {}
    announce(`${t("setup.success.title")} ${suggestedText ? t("setup.success.body", { potName, suggested: suggestedText }) : t("setup.success.body_plain", { potName })}`)
  }, [tag, slug, potName, suggestedText])

  const join = () => dispatch({ type: "TAP_JOIN", signedIn: !!me, needsAuth: false })
  const joinDev = () => {
    if (!devName.trim()) return
    devNameRef.current = devName.trim()
    join()
  }
  const step = joinStep(s)
  const busy = s.tag === "creatingSession" || s.tag === "joining" || s.tag === "setupError" || s.tag === "joinError"

  // reserve the CTA block's height so swapping variants causes no layout shift (§2.5)
  if (secret === undefined || me === undefined) return <div aria-hidden className="mt-6 min-h-52" />

  if (!secret && s.tag !== "joined")
    return (
      <div className="mt-8 rounded-lg bg-surface p-4 text-center" data-invite-error="incomplete">
        <p className="font-display text-heading text-ink">{t("invite.incomplete.title")}</p>
        <p className="mt-1 text-body-sm text-ink-muted">{t("invite.incomplete.body")}</p>
      </div>
    )

  if (alreadyMember)
    return (
      <div className="mt-8 flex flex-col gap-3 text-center" data-already-member>
        <p className="font-display text-heading text-ink">{t("invite.already_member.title", { potName })}</p>
        <Button variant="primary" className="w-full" onClick={() => router.push(`/p/${slug}`)}>
          {t("invite.already_member.cta", { potName })}
        </Button>
      </div>
    )

  if (s.tag === "inviteError")
    return (
      <div className="mt-8 rounded-lg bg-surface p-4 text-center" data-invite-error={s.kind}>
        <p className="font-display text-heading text-ink">
          {s.kind === "pot_closed" ? t("invite.pot_closed.title", { potName }) : t(`invite.${s.kind}.title` as "invite.invalid.title")}
        </p>
      </div>
    )

  return (
    <div className="mt-8 flex min-h-52 flex-col gap-3" data-join-cta>
      {busy ? (
        <section aria-busy={s.tag === "creatingSession" || s.tag === "joining"} className="rounded-lg bg-surface p-4 shadow-card">
          <p className="mb-4 font-display text-heading text-ink">{t("setup.greeting", { firstName })}</p>
          <ProgressSteps
            steps={[1, 2, 3].map((n) => ({
              label: n === 1 ? t("setup.progress.1") : n === 2 ? t("setup.progress.2", { potName }) : t("setup.progress.3"),
              state: (step === null ? "next" : n < step ? "done" : n === step ? ((s.tag === "setupError" && n === 1) || (s.tag === "joinError" && n === 2) ? "error" : "current") : "next") as StepState,
            }))}
          />
          <p className="mt-3 text-body-sm text-ink-muted" aria-live="polite">
            {(s.tag === "creatingSession" || s.tag === "joining") && s.slow ? t("setup.slow") : t("setup.time")}
          </p>
          {(s.tag === "setupError" || s.tag === "joinError") && (
            <div className="mt-4 flex flex-col gap-3">
              <p role="alert" className="flex items-start gap-2 text-body-sm text-ink">
                <X aria-hidden className="mt-0.5 size-4 shrink-0 text-declined" strokeWidth={2.5} />
                {s.tag === "setupError" ? t("setup.error.relayer") : t("setup.error.join", { potName })}
              </p>
              <Button variant="primary" className="w-full" onClick={() => dispatch({ type: "RETRY" })}>
                {t("setup.error.retry")}
              </Button>
            </div>
          )}
        </section>
      ) : me && s.tag !== "joined" ? (
        <>
          <p className="text-center text-body text-ink">{t("landing.signed_in_as", { email: meInfo?.emailHint ?? meInfo?.name ?? me })}</p>
          <Button variant="primary" className="w-full" onClick={join}>
            {t("landing.signed_in_as.cta", { potName })}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => void signOut()}>
            {t("landing.signed_in_as.switch")}
          </Button>
        </>
      ) : s.tag !== "joined" && live ? (
        <>
        {/* integrations (F-14, F-19): NEAR Auth and "I have a NEAR wallet"; once signed in, straight on to joining */}
        <SignInOptions join primary={!FLAG_DEV_SESSION} onSignedIn={() => dispatch({ type: "TAP_JOIN", signedIn: true, needsAuth: false })} />
        <form
          className="flex flex-col gap-3"
          data-dev-join
          onSubmit={(e) => {
            e.preventDefault()
            joinDev()
          }}
        >
          {FLAG_DEV_SESSION ? (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-label text-ink">{t("signin.dev.name")}</span>
                <input
                  value={devName}
                  maxLength={40}
                  autoComplete="given-name"
                  onChange={(e) => setDevName(e.target.value)}
                  className="h-13 rounded-sm border border-line-strong bg-surface-sunken px-3 text-body text-ink"
                />
              </label>
              <Button type="submit" variant="primary" className="w-full" disabled={!devName.trim()}>
                {t("landing.cta.dev")}
              </Button>
              <p className="text-center text-body-sm text-ink-muted">{t("signin.dev.hint")}</p>
            </>
          ) : (
            <p className="text-center text-body-sm text-ink-muted">{t("signin.body")}</p>
          )}
        </form>
        </>
      ) : s.tag !== "joined" ? (
        <>
          {s.tag === "landing" && s.error && (
            <p role="alert" className="text-body-sm text-ink">
              {t(s.error as "auth.failed")}
            </p>
          )}
          {/* in-app browsers (Instagram, Messenger, Telegram…): Google sign-in is blocked there, so the escape to
              Safari/Chrome comes first and Google + passkey are hidden; email still works (frontend-architecture §2.5) */}
          {inApp ? (
            <InAppBanner app={inApp} />
          ) : (
            <Button variant="primary" className="w-full" onClick={join}>
              <GoogleG />
              {t("landing.cta.google")}
            </Button>
          )}
          <Button className="w-full" onClick={join}>
            <Mail aria-hidden strokeWidth={2} />
            {t("landing.more.email")}
          </Button>
          <Button variant="ghost" className="w-full" aria-expanded={more} onClick={() => setMore((v) => !v)}>
            {t("landing.cta.more")}
            <ChevronDown aria-hidden className={cn("transition-transform duration-200", more && "rotate-180")} strokeWidth={2} />
          </Button>
          {more && (
            <div className="flex flex-col gap-2 rounded-md border border-line bg-surface p-2">
              {!inApp && (
                <button type="button" onClick={join} className="flex min-h-14 items-center gap-3 rounded-sm px-3 text-left hover:bg-surface-sunken">
                  <KeyRound aria-hidden className="size-6 text-ink" strokeWidth={2} />
                  <span>
                    <span className="block text-label text-ink">{t("landing.more.passkey")}</span>
                    <span className="block text-body-sm text-ink-muted">{t("landing.more.passkey_hint")}</span>
                  </span>
                </button>
              )}
              <button type="button" onClick={join} className="min-h-11 rounded-sm px-3 text-left text-body-sm text-link underline-offset-4 hover:underline">
                {t("landing.more.wallet")}
              </button>
              <p className="px-3 pb-1 text-body-sm text-ink-muted">{t("landing.more.note")}</p>
            </div>
          )}
          <p className="mt-1 flex flex-wrap justify-center gap-x-1 text-center text-body-sm text-ink-muted">
            <span>{t("landing.legal")}</span>
            <span>{t("landing.no_app")}</span>
          </p>
        </>
      ) : null}

      <Sheet
        open={s.tag === "joined"}
        onClose={() => router.push(`/p/${slug}`)}
        title={t("setup.success.title")}
        titleClassName="text-balance-hero"
      >
        <div className="flex flex-col gap-5 pt-2 pb-2" data-youre-in>
          {view && <AvatarStack people={view.members.map((m) => m.person).sort((a, b) => (a.joinIndex ?? 0) - (b.joinIndex ?? 0))} size="md" ring="surface" />}
          <p className="text-body text-ink-muted">
            {suggestedText ? t("setup.success.body", { potName, suggested: suggestedText }) : t("setup.success.body_plain", { potName })}
          </p>
          <div className="flex flex-col gap-2">
            <Button
              variant="primary"
              className="w-full"
              onClick={() => router.push(suggested ? `/p/${slug}?sheet=add&amount=${formatUsd(BigInt(suggested), "whole").replace(/[$,]/g, "")}` : `/p/${slug}?sheet=add`)}
            >
              {suggestedText ? t("setup.success.cta", { suggested: suggestedText }) : t("setup.success.cta_plain")}
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => router.push(`/p/${slug}`)}>
              {t("setup.success.later")}
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  )
}

/** The Google "G" on a white disc inside the marigold button (design-direction 01 open question 1). */
function GoogleG() {
  return (
    <span aria-hidden className="grid size-6 place-items-center rounded-pill bg-surface">
      <svg viewBox="0 0 24 24" className="size-4">
        <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z" />
        <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2a7 7 0 0 1-6.6-4.8H1.4v3.1A12 12 0 0 0 12 24Z" />
        <path fill="#FBBC05" d="M5.4 14.5a7.2 7.2 0 0 1 0-4.6V6.8h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
        <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.8l4 3.1A7 7 0 0 1 12 4.8Z" />
      </svg>
    </span>
  )
}
