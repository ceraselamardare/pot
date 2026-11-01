"use client"
// You (ux-spec §4.15): profile, Settings → Appearance (Match my phone · Day · Night, stored on this device and
// applied before first paint by the head script), notifications and install rows (F-23), help, Advanced, sign out.
import { Bell, ChevronRight, CircleHelp, Download, LogOut, Settings2 } from "lucide-react"
import Link from "next/link"
import { useSyncExternalStore } from "react"
import { Avatar } from "@/components/pot/Avatar"
import { Segmented } from "@/components/pot/Controls"
import { signOut } from "@/components/app-shell/Shell"
import { pageTitle, t } from "@/i18n/t"
import { useMeInfo } from "@/lib/client/data"
import { useTheme, type ThemeSetting } from "@/lib/theme/useTheme"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { useInstallContext } from "@/lib/client/pwa/platform"
import { disablePush, usePush } from "@/lib/client/pwa/push"
import { openSheet } from "@/lib/client/sheet"


// "Match my phone" may not change data-theme (the OS already matches), so the choice also fires this event.
const SETTING_EVENT = "pot-theme-setting"

function useThemeSetting(get: () => ThemeSetting): ThemeSetting {
  return useSyncExternalStore(
    (cb) => {
      const mo = new MutationObserver(cb)
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] })
      window.addEventListener("storage", cb)
      window.addEventListener(SETTING_EVENT, cb)
      return () => {
        mo.disconnect()
        window.removeEventListener("storage", cb)
        window.removeEventListener(SETTING_EVENT, cb)
      }
    },
    get,
    () => "auto",
  )
}

function Row({ icon, label, sub, href, onClick, disabled }: { icon: React.ReactNode; label: string; sub?: string; href?: string; onClick?: () => void; disabled?: boolean }) {
  const inner = (
    <>
      <span aria-hidden className="text-ink [&_svg]:size-5">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-label [overflow-wrap:anywhere] text-ink">{label}</span>
        {sub && <span className="block text-body-sm text-ink-muted">{sub}</span>}
      </span>
      {(href || onClick) && !disabled && <ChevronRight aria-hidden className="size-5 text-ink-muted" strokeWidth={2} />}
    </>
  )
  const cls = "flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left"
  if (href)
    return (
      <Link href={href} className={`${cls} hover:bg-surface-sunken`}>
        {inner}
      </Link>
    )
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={`${cls} hover:bg-surface-sunken`}>
        {inner}
      </button>
    )
  return <div className={cls}>{inner}</div>
}

/** You → Notifications (frontend-architecture §5.9): needs install (iOS tab) → the coach; off → the pre-prompt;
 *  on → turn off; denied → how to fix it in Settings. */
function NotificationsRow() {
  const { status, support } = usePush()
  const sub =
    support === "needs_install"
      ? t("push.needs_install")
      : support === "unsupported"
        ? t("push.unsupported")
        : status === "denied"
          ? t("push.denied")
          : status === "subscribed"
            ? t("push.on")
            : t("you.push")
  const onClick =
    support === "needs_install"
      ? () => openSheet("coach")
      : support === "unsupported" || status === "denied"
        ? undefined
        : status === "subscribed"
          ? async () => {
              await disablePush()
              toast(t("push.off"))
            }
          : () => openSheet("push")
  return (
    <div data-you-push={status === "subscribed" ? "on" : support === "ready" ? status : support}>
      <Row icon={<Bell strokeWidth={2} />} label={t("you.notifications")} sub={sub} onClick={onClick} />
    </div>
  )
}

export function YouScreen() {
  const install = useInstallContext()
  const push = usePush()
  const me = useMeInfo()
  const router = useRouter()
  const { setTheme, getSetting } = useTheme()
  const setting = useThemeSetting(getSetting)
  if (!me) return null
  return (
    <>
      <title>{pageTitle(t("you.title"))}</title>
      <main id="main" className="mx-auto w-full max-w-flow px-4 pb-8 md:px-6">
        <h1 className="pt-5 pb-4 font-display text-title text-ink">{t("you.title")}</h1>
        <section className="flex items-center gap-4 rounded-lg bg-surface p-4 shadow-card">
          <Avatar person={{ name: me.name, initials: me.initials, joinIndex: me.joinIndex }} size="lg" />
          <div className="min-w-0">
            <p className="font-display text-heading text-ink">{me.name}</p>
            {me.emailHint && <p className="text-body-sm [overflow-wrap:anywhere] text-ink-muted">{me.emailHint}</p>}
            {me.kind === "mock" && <p className="text-body-sm text-ink-muted">{t("you.profile.demo")}</p>}
          </div>
        </section>

        <section aria-labelledby="you-settings" className="mt-6">
          <h2 id="you-settings" className="mb-2 px-1 text-label text-ink-muted">
            {t("you.settings")}
          </h2>
          <div className="rounded-lg bg-surface p-4">
            <p className="mb-3 text-label text-ink">{t("you.appearance")}</p>
            <Segmented<ThemeSetting>
              label={t("you.appearance")}
              value={setting}
              onChange={(v) => {
                setTheme(v)
                window.dispatchEvent(new Event(SETTING_EVENT))
              }}
              options={[
                { value: "auto", label: t("you.appearance.auto") },
                { value: "day", label: t("you.appearance.day") },
                { value: "night", label: t("you.appearance.night") },
              ]}
            />
          </div>
        </section>

        <section className="mt-4 divide-y divide-line overflow-hidden rounded-lg bg-surface">
          <NotificationsRow />
          {!install.installed && (
            <Row icon={<Download strokeWidth={2} />} label={t("you.install")} sub={t("coach.card.body")} onClick={() => openSheet("coach")} />
          )}
          <Row icon={<CircleHelp strokeWidth={2} />} label={t("you.help")} href="/demo" />
          <Row icon={<Settings2 strokeWidth={2} />} label={t("you.advanced")} href="/you/advanced" />
        </section>

        <section className="mt-4 overflow-hidden rounded-lg bg-surface">
          <Row
            icon={<LogOut strokeWidth={2} />}
            label={t("you.signout")}
            onClick={async () => {
              if (push.status === "subscribed") await disablePush().catch(() => {}) // §5.9: logout drops the subscription
              await signOut()
              router.push("/")
            }}
          />
        </section>
      </main>
    </>
  )
}
