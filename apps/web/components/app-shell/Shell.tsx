"use client"
// AppShell parts (frontend-architecture §1.2, §2.1; ux-spec §2, §4.20; design-direction 02 §1, §2 bp-lg):
//  - TabBar: Pots · Requests · You at the bottom on phones (56 px + safe area); a 64 px top bar from bp-lg.
//    The Requests badge counts what waits on you, in `ink` with `surface` numerals (never `declined` red).
//    The person's own Pot dollars ride along: the You tab's label on phones, a pill at the end of the top bar.
//  - SessionGate: signed out → SignedOutScreen (the sign-in panel inline); signed in → the tab content; the server
//    HTML (no JS) → a <noscript> line.
//  - OfflineBanner + one polite LiveRegion per screen.
import { Coins, House, Inbox, UserRound, WifiOff } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, type ReactNode } from "react"
import { toast } from "sonner"
import { Lockup } from "@/components/brand/Lockup"
import { Glyph } from "@/components/brand/Glyph"
import { buttonVariants } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { useAnnouncement, useOnline } from "@/lib/client/browser"
import { useMe, useOwnDollars, useWaitingCount } from "@/lib/client/data"
import { formatUsd } from "@/lib/client/money"
import { signOut as endSession } from "@/lib/client/session"
import { cn } from "@/lib/client/cn"
import { SignInPanel } from "@/components/features/auth/SignInPanel"

const NAV = [
  { href: "/pots", key: "pots.title", icon: House, match: (p: string) => p === "/pots" || p.startsWith("/p/") },
  { href: "/requests", key: "requests.title", icon: Inbox, match: (p: string) => p.startsWith("/requests") },
  { href: "/you", key: "you.title", icon: UserRound, match: (p: string) => p.startsWith("/you") },
] as const

function Badge({ n, className }: { n: number; className?: string }) {
  if (n <= 0) return null
  return (
    <span
      aria-hidden
      data-badge
      className={cn(
        "grid h-[1.125rem] min-w-[1.125rem] place-items-center rounded-pill bg-ink px-1 font-sans text-xs leading-none font-bold text-surface tabular-nums",
        className,
      )}
    >
      {n}
    </span>
  )
}

function navLabel(key: (typeof NAV)[number]["key"], waiting: number, balance?: string) {
  if (key === "requests.title" && waiting > 0) return `${t(key)}, ${t("requests.badge.a11y", { n: waiting })}`
  if (key === "you.title" && balance) return `${t(key)}, ${t("nav.balance.a11y", { amount: balance })}`
  return t(key)
}

/** The signed-in person's own Pot dollars as "$84.00" (shared query with You → "Your Pot dollars"); undefined while loading. */
function useNavBalance(account: string | null): string | undefined {
  const micro = useOwnDollars(account, true)
  return micro === undefined ? undefined : formatUsd(micro)
}

export function TabBar() {
  const pathname = usePathname()
  const waiting = useWaitingCount()
  const me = useMe()
  const balance = useNavBalance(me ?? null)
  if (!me) return null
  return (
    <nav
      aria-label={t("a11y.tabs.nav")}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="mx-auto grid h-14 max-w-flow grid-cols-3">
        {NAV.map(({ href, key, icon: Icon, match }) => {
          const on = match(pathname)
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={on ? "page" : undefined}
                aria-label={navLabel(key, waiting, balance)}
                className={cn(
                  // labels cap at the viewport: three tabs always fit at 200 % text (F-25)
                  "flex h-full min-w-0 flex-col items-center justify-center gap-0.5 font-sans text-body-sm [font-size:min(var(--text-body-sm),3.8vw)]",
                  on ? "font-semibold text-ink" : "text-ink-muted",
                )}
              >
                <span className="relative">
                  <Icon aria-hidden className="size-6" strokeWidth={on ? 2.25 : 2} />
                  {key === "requests.title" && <Badge n={waiting} className="absolute -top-1.5 -right-3" />}
                </span>
                {key === "you.title" && balance ? (
                  <span data-nav-balance className="tabular-nums">
                    {balance}
                  </span>
                ) : (
                  t(key)
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

export function TopBar() {
  const pathname = usePathname()
  const waiting = useWaitingCount()
  const me = useMe()
  const balance = useNavBalance(me ?? null)
  return (
    <header className="hidden border-b border-line bg-ground lg:block">
      <div className="mx-auto flex h-16 max-w-app items-center justify-between px-6">
        <Link href="/pots" aria-label={t("app.name")} className="rounded-sm">
          <Lockup className="h-8 w-auto" />
        </Link>
        {me && (
          <nav aria-label={t("a11y.tabs.nav")}>
            <ul className="flex items-center gap-1">
              {NAV.map(({ href, key, match }) => {
                const on = match(pathname)
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={on ? "page" : undefined}
                      aria-label={navLabel(key, waiting)}
                      className={cn(
                        "flex h-11 items-center gap-2 rounded-pill px-4 text-label",
                        on ? "bg-surface text-ink shadow-[0_1px_2px_rgb(43_27_58/0.12)]" : "text-ink-muted hover:bg-surface-sunken hover:text-ink",
                      )}
                    >
                      {t(key)}
                      {key === "requests.title" && <Badge n={waiting} />}
                    </Link>
                  </li>
                )
              })}
              {balance && (
                <li className="ml-2 border-l border-line pl-3">
                  <Link
                    href="/you"
                    aria-label={t("nav.balance.a11y", { amount: balance })}
                    data-nav-balance
                    className="flex h-11 items-center gap-2 rounded-pill px-3 text-label text-ink hover:bg-surface-sunken"
                  >
                    <Coins aria-hidden className="size-4 text-ink-muted" strokeWidth={2} />
                    <span className="tabular-nums">{balance}</span>
                  </Link>
                </li>
              )}
            </ul>
          </nav>
        )}
      </div>
    </header>
  )
}

export function OfflineBanner() {
  const online = useOnline()
  const was = useRef(online)
  useEffect(() => {
    if (!was.current && online) toast(t("online.restored"))
    was.current = online
  }, [online])
  if (online) return null
  return (
    <div role="status" className="sticky top-0 z-40 border-b border-line bg-surface-sunken" data-offline-banner>
      <p className="mx-auto flex max-w-app items-start gap-2 px-4 py-2.5 text-body-sm text-ink md:px-6">
        <WifiOff aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
        {t("offline.banner")}
      </p>
    </div>
  )
}

export function LiveRegion() {
  const msg = useAnnouncement()
  return (
    <div role="status" aria-live="polite" className="sr-only" data-live-region>
      {msg}
    </div>
  )
}

/**
 * Signed out on an app route (deep links, the installed app's start, after signing out, a stale hint, and the start
 * CTAs' target without JS or in a new tab): the sign-in dialog's panel inline (site update 2026-11-03; 07 §2.10).
 * Sign-in is the primary (Google, or the wallet when it's the only way, or "Open in Safari" in an in-app browser),
 * [See a demo] secondary, "What is Pot?" a quiet link. After signing in SessionGate swaps the screen in place, so
 * /pots?sheet=create goes on to the first-run intro, then Create. The H1 and the option names are the ones the
 * integration and testnet suites press ("Sign in to Pot", "Continue with Google", "I have a NEAR wallet").
 */
export function SignedOutScreen() {
  // start mode at the start CTAs' destination (client-only: this renders after the session check, never on the server)
  const start = typeof window !== "undefined" && window.location.pathname === "/pots" && new URLSearchParams(window.location.search).get("sheet") === "create"
  return (
    <main id="main" className="mx-auto flex min-h-[70dvh] max-w-flow flex-col items-center justify-center px-4 py-12 text-center">
      <Glyph className="mb-6 h-14 w-auto" />
      <h1 className="font-display text-title text-ink">{t("signin.title")}</h1>
      <p className="mt-2 max-w-80 text-body text-ink-muted">{start ? t("signin.start.body") : t("signin.body")}</p>
      <SignInPanel layout="page" goal={start ? "start" : "back"} className="mt-8 max-w-80" />
    </main>
  )
}

/**
 * The server HTML of every app route (the session is checked on the client, §0 #3). Without JS nothing can sign in
 * (NEAR Auth's window and NEAR Connect both need it), so say so and point at what works without it: the demo's
 * story list and the landing. With JS this is never shown (and React never renders a <noscript>'s children).
 */
function NoScriptSignIn() {
  return (
    <noscript>
      <main id="main" className="mx-auto flex min-h-[70dvh] max-w-flow flex-col items-center justify-center px-4 py-12 text-center" data-nojs>
        <h1 className="font-display text-title text-ink">{t("signin.title")}</h1>
        <p className="mt-2 max-w-80 text-body text-ink-muted">{t("signin.nojs")}</p>
        <div className="mt-8 flex w-full max-w-80 flex-col items-center gap-2">
          <Link href="/demo" className={cn(buttonVariants({ variant: "primary" }), "w-full")}>
            {t("signin.demo")}
          </Link>
          <Link href="/" className="inline-flex min-h-11 items-center rounded-sm px-3 text-body-sm text-ink underline underline-offset-4">
            {t("signin.home")}
          </Link>
        </div>
      </main>
    </noscript>
  )
}

export function SessionGate({ children }: { children: ReactNode }) {
  const me = useMe()
  if (me === undefined) return <NoScriptSignIn /> // static shell: the client decides (no cookies() in layouts, §0 #3)
  if (me === null) return <SignedOutScreen />
  return <>{children}</>
}

/** You → Sign out (mock: forget the persona; testnet: end the cookie session and drop the device key). */
export function signOut(): Promise<void> {
  return endSession()
}
