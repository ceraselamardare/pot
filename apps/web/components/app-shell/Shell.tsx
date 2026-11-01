"use client"
// AppShell parts (frontend-architecture §1.2, §2.1; ux-spec §2, §4.20; design-direction 02 §1, §2 bp-lg):
//  - TabBar: Pots · Requests · You at the bottom on phones (56 px + safe area); a 64 px top bar from bp-lg.
//    The Requests badge counts what waits on you, in `ink` with `surface` numerals (never `declined` red).
//  - SessionGate: signed out → SignedOutScreen; signed in → the tab content.
//  - DemoBanner: mock/demo sessions — "Demo · test money", switch person, reset.
//  - OfflineBanner + one polite LiveRegion per screen.
import { Menu } from "@base-ui/react/menu"
import { ChevronDown, House, Inbox, RotateCcw, UserRound, WifiOff } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { Lockup } from "@/components/brand/Lockup"
import { Glyph } from "@/components/brand/Glyph"
import { Avatar } from "@/components/pot/Avatar"
import { Button } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { useAnnouncement, useOnline } from "@/lib/client/browser"
import { useMe, useMeInfo, useWaitingCount } from "@/lib/client/data"
import { FLAG_DEV_SESSION, IS_LIVE } from "@/lib/client/config"
import { PEOPLE, PERSONAS, type PersonaId } from "@/lib/client/mock/fixtures"
import { initialsOf } from "@/lib/client/mock/world"
import { resetDemo, signInDev, signOut as endSession, switchPersona } from "@/lib/client/session"
import { cn } from "@/lib/client/cn"
import { SignInOptions } from "@/components/features/auth/SignInOptions"

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

function navLabel(key: (typeof NAV)[number]["key"], waiting: number) {
  return key === "requests.title" && waiting > 0 ? `${t(key)}, ${t("requests.badge.a11y", { n: waiting })}` : t(key)
}

export function TabBar() {
  const pathname = usePathname()
  const waiting = useWaitingCount()
  const me = useMe()
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
                aria-label={navLabel(key, waiting)}
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
                {t(key)}
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
            </ul>
          </nav>
        )}
      </div>
    </header>
  )
}

export function DemoBanner() {
  const me = useMeInfo()
  const router = useRouter()
  if (!me || me.kind !== "demo" || !me.persona) return null
  const persona = me.persona
  const others = PERSONAS.filter((p) => p !== persona)
  const switchTo = async (p: PersonaId) => {
    try {
      await switchPersona(p)
    } catch {
      toast.error(t("generic.error"))
    }
  }
  const item =
    "flex min-h-12 w-full cursor-default items-center gap-3 rounded-sm px-3 text-body text-ink outline-none select-none data-highlighted:bg-surface-sunken"
  return (
    <div className="border-b border-line bg-surface-sunken" data-demo-banner>
      <div className="mx-auto flex min-h-11 max-w-app items-center gap-2 px-4 py-1 md:px-6">
        <p className="min-w-0 flex-1 truncate text-body-sm text-ink">{t("demo.banner")}</p>
        <Menu.Root>
          <Menu.Trigger
            className="flex h-11 items-center gap-2 rounded-pill pr-2 pl-1 text-label text-ink hover:bg-line data-popup-open:bg-line"
            aria-label={t("demo.as", { persona: PEOPLE[persona].name })}
          >
            <Avatar person={{ name: PEOPLE[persona].name, initials: initialsOf(PEOPLE[persona].name), joinIndex: PERSONAS.indexOf(persona) }} size="xs" />
            <span>{PEOPLE[persona].name}</span>
            <ChevronDown aria-hidden className="size-4" strokeWidth={2} />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner sideOffset={6} align="end" className="z-50 outline-none">
              <Menu.Popup className="min-w-56 origin-(--transform-origin) rounded-md border border-line bg-surface p-1 shadow-card outline-none">
                {others.map((p) => (
                  <Menu.Item key={p} className={item} onClick={() => void switchTo(p)} data-switch-persona={p}>
                    <Avatar person={{ name: PEOPLE[p].name, initials: initialsOf(PEOPLE[p].name), joinIndex: PERSONAS.indexOf(p) }} size="xs" />
                    {t("demo.switch", { persona: PEOPLE[p].name })}
                  </Menu.Item>
                ))}
                <Menu.Separator className="my-1 h-px bg-line" />
                <Menu.Item
                  className={item}
                  onClick={async () => {
                    try {
                      const next = await resetDemo()
                      toast(t("demo.reset.done"))
                      router.push(next)
                    } catch {
                      toast.error(t("generic.error"))
                    }
                  }}
                >
                  <RotateCcw aria-hidden className="size-5" strokeWidth={2} />
                  {t("demo.reset")}
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>
    </div>
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

export function SignedOutScreen() {
  return (
    <main id="main" className="mx-auto flex min-h-[70dvh] max-w-flow flex-col items-center justify-center px-4 py-12 text-center">
      <Glyph className="mb-6 h-14 w-auto" />
      <h1 className="font-display text-title text-ink">{t("signin.title")}</h1>
      <p className="mt-2 max-w-80 text-body text-ink-muted">{t("signin.body")}</p>
      <div className="mt-8 flex w-full max-w-80 flex-col gap-3">
        <Button variant="primary" render={<Link href="/demo" />}>
          {t("signin.demo")}
        </Button>
        <Button render={<Link href="/" />}>{t("signin.home")}</Button>
      </div>
      {/* integrations (F-14, F-19): NEAR Auth (localhost:3000 / flagged builds) and "I have a NEAR wallet" */}
      {IS_LIVE && <SignInOptions className="mt-6 max-w-80" />}
      {IS_LIVE && FLAG_DEV_SESSION && <DevSignIn />}
    </main>
  )
}

/** Preview/local only (FLAG_DEV_SESSION): a 0-NEAR test account for this browser's device key (api-spec §2.1). */
export function DevSignIn({ onDone, cta }: { onDone?: () => void; cta?: string }) {
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const go = async () => {
    if (busy || !name.trim()) return
    setBusy(true)
    setFailed(false)
    try {
      await signInDev(name)
      onDone?.()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form
      className="mt-8 flex w-full max-w-80 flex-col gap-2 rounded-md border border-line bg-surface p-3 text-left"
      data-dev-signin
      onSubmit={(e) => {
        e.preventDefault()
        void go()
      }}
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-label text-ink">{t("signin.dev.name")}</span>
        <input
          value={name}
          maxLength={40}
          autoComplete="given-name"
          onChange={(e) => setName(e.target.value)}
          className="h-12 rounded-sm border border-line-strong bg-surface-sunken px-3 text-body text-ink"
        />
      </label>
      {failed && (
        <p role="alert" className="text-body-sm text-ink">
          {t("setup.error.relayer")}
        </p>
      )}
      <Button type="submit" disabled={busy || !name.trim()} aria-busy={busy || undefined}>
        {cta ?? t("signin.dev.cta")}
      </Button>
      <p className="text-body-sm text-ink-muted">{t("signin.dev.hint")}</p>
    </form>
  )
}

export function SessionGate({ children }: { children: ReactNode }) {
  const me = useMe()
  if (me === undefined) return null // static shell: the client decides (no cookies() in layouts, §0 #3)
  if (me === null) return <SignedOutScreen />
  return <>{children}</>
}

/** You → Sign out (mock: forget the persona; testnet: end the cookie session and drop the device key). */
export function signOut(): Promise<void> {
  return endSession()
}
