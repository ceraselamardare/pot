"use client"
// Install coach (F-23; ux-spec §9; design-direction 01 §5; frontend-architecture §5.8).
//  - CoachCard: inside the success state after the first contribution or a new Pot. 48 px app icon, the one
//    benefit ("So you hear when friends need your OK."), [Show me how] (secondary: the Pot screen's marigold
//    stays on Add money) and [Not now] (7-day snooze). Android with Chrome's prompt: [Install Pot] instead.
//  - CoachSheet (?sheet=coach, also from You → "Add Pot to your Home Screen"): numbered steps (<ol>, so screen
//    readers say "1 of 4") with a small drawing of the real control; iOS 26 vs 27 wording; Android menu steps;
//    in-app browsers get "Open in Safari/Chrome" (keeps the #fragment on iOS) and [Copy link].
// iOS gives web apps no install API, so there is never an install button there (Vocabulary's mistake).
import { Check, Copy, EllipsisVertical, Ellipsis, Share, SquarePlus, ToggleRight } from "lucide-react"
import Image from "next/image"
import { useEffect, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { Sheet } from "@/components/sheets/Sheet"
import { Button } from "@/components/ui/button"
import { t, type MessageKey } from "@/i18n/t"
import { coachDispatch, coachVisible, useCoachState } from "@/lib/client/pwa/coach"
import { currentEnv, escapeBrowser, escapeHref, promptInstall, useInstallContext, type InstallContext } from "@/lib/client/pwa/platform"
import { openSheet } from "@/lib/client/sheet"
import { useNow } from "@/lib/client/time"

/** The card in a success state. Renders nothing unless this Pot just earned it and the caps allow. */
export function CoachCard({ pot }: { pot: string }) {
  const s = useCoachState()
  const { ctx } = useInstallContext()
  const now = useNow()
  const show = now > 0 && coachVisible(s, pot, ctx, now)
  useEffect(() => {
    if (show && s.shownFor !== pot) coachDispatch({ type: "SHOWN", pot })
  }, [show, s.shownFor, pot])
  if (!show) return null
  const install = async () => {
    const r = await promptInstall()
    coachDispatch({ type: "SHOW_ME" })
    if (r === "accepted") toast(t("coach.installed"))
    else if (r === "unavailable") openSheet("coach")
  }
  return (
    <section aria-labelledby="coach-card-h" className="flex flex-col gap-3 rounded-lg bg-surface p-4 shadow-card" data-coach-card={ctx}>
      <div className="flex items-start gap-3">
        <Image src="/apple-touch-icon.png" alt="" width={48} height={48} className="size-12 shrink-0 rounded-[22%]" />
        <div className="min-w-0">
          <h2 id="coach-card-h" className="font-display text-heading text-ink">
            {t("coach.card.title")}
          </h2>
          <p className="mt-0.5 text-body-sm text-ink-muted">{t("coach.card.body")}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
        {ctx === "android_prompt" ? (
          <Button onClick={install}>{t("coach.android.cta")}</Button>
        ) : (
          <Button
            onClick={() => {
              coachDispatch({ type: "SHOW_ME" })
              openSheet("coach")
            }}
          >
            {t("coach.card.cta")}
          </Button>
        )}
        <Button variant="ghost" onClick={() => coachDispatch({ type: "NOT_NOW", now: Date.now() })}>
          {t("coach.card.later")}
        </Button>
      </div>
    </section>
  )
}

/** A small drawing of the control to tap: the brand line style, the control ringed in ink on a brand-soft halo. */
function Control({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden className="grid h-14 w-18 shrink-0 place-items-center rounded-md bg-surface-sunken">
      <span className="grid size-10 place-items-center rounded-pill bg-brand-soft text-ink ring-2 ring-ink [&_svg]:size-5">{children}</span>
    </span>
  )
}

function Steps({ steps }: { steps: { key: MessageKey; sub?: MessageKey; icon: ReactNode }[] }) {
  return (
    <ol className="flex flex-col gap-3" data-coach-steps={steps.length}>
      {steps.map((s, i) => (
        <li key={s.key} className="flex items-center gap-3">
          <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-pill bg-surface-sunken text-label text-ink">
            {i + 1}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-body text-ink">{t(s.key as "coach.ios.step2")}</span>
            {s.sub && <span className="mt-0.5 block text-body-sm text-ink-muted">{t(s.sub as "coach.ios.step1_alt")}</span>}
          </span>
          <Control>{s.icon}</Control>
        </li>
      ))}
    </ol>
  )
}

export function CoachSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { ctx, installed, app } = useInstallContext()
  const title = ctx === "in_app" ? t("coach.inapp.title", { browser: browserWord() }) : t("coach.title")
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <Button className="w-full" onClick={onClose} data-coach-done>
          {t("coach.done")}
        </Button>
      }
    >
      <div className="flex flex-col gap-4 pt-1" data-coach-sheet={installed ? "installed" : ctx}>
        <CoachBody ctx={installed ? "standalone" : ctx} app={app} />
      </div>
    </Sheet>
  )
}

function browserWord(): string {
  if (typeof navigator === "undefined") return t("coach.browser.default")
  const b = escapeBrowser(currentEnv())
  return b === "safari" ? t("coach.browser.safari") : b === "chrome" ? t("coach.browser.chrome") : t("coach.browser.default")
}

function CoachBody({ ctx, app }: { ctx: InstallContext; app: string | null }) {
  switch (ctx) {
    case "standalone":
      return (
        <p className="flex items-start gap-2 text-body text-ink">
          <Check aria-hidden className="mt-0.5 size-5 shrink-0 text-approved" strokeWidth={2.5} />
          {t("coach.installed")}
        </p>
      )
    case "ios26":
    case "ios27":
      return (
        <>
          <p className="text-body-sm text-ink-muted">{t("coach.card.body")}</p>
          <Steps
            steps={[
              { key: ctx === "ios27" ? "coach.ios27.step1" : "coach.ios.step1", sub: "coach.ios.step1_alt", icon: <Ellipsis strokeWidth={2} /> },
              { key: "coach.ios.step2", icon: <Share strokeWidth={2} /> },
              { key: "coach.ios.step3", icon: <SquarePlus strokeWidth={2} /> },
              { key: "coach.ios.step4", icon: <ToggleRight strokeWidth={2} /> },
            ]}
          />
          <p className="text-body-sm text-ink-muted">{t("coach.ios.done")}</p>
        </>
      )
    case "ios_other":
      return (
        <Steps
          steps={[
            { key: "coach.ios_other.step1", icon: <Share strokeWidth={2} /> },
            { key: "coach.ios_other.step2", icon: <SquarePlus strokeWidth={2} /> },
          ]}
        />
      )
    case "android_prompt":
      return <AndroidPrompt />
    case "android_menu":
      return (
        <Steps
          steps={[
            { key: "coach.android.step1", icon: <EllipsisVertical strokeWidth={2} /> },
            { key: "coach.android.step2", icon: <SquarePlus strokeWidth={2} /> },
            { key: "coach.android.step3", icon: <Check strokeWidth={2} /> },
          ]}
        />
      )
    case "in_app":
      return <InAppEscape app={app} />
    default:
      return <p className="text-body text-ink">{t("coach.desktop")}</p>
  }
}

function AndroidPrompt() {
  return (
    <>
      <p className="text-body-sm text-ink-muted">{t("coach.card.body")}</p>
      <Button
        variant="primary"
        className="w-full"
        onClick={async () => {
          const r = await promptInstall()
          if (r === "accepted") toast(t("coach.installed"))
        }}
      >
        {t("coach.android.cta")}
      </Button>
    </>
  )
}

/**
 * The in-app browser escape (Instagram, Messenger, LinkedIn, TikTok, Telegram…): Google sign-in and installing
 * don't work there. "Open in Safari" keeps the whole link, #fragment included (the invite secret); Android
 * gets Chrome only when the link has no fragment, and [Copy link] always works.
 */
export function InAppEscape({ app, href, compact }: { app: string | null; href?: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false)
  const target = href ?? (typeof window !== "undefined" ? window.location.href : "")
  const browser = typeof navigator !== "undefined" ? escapeBrowser(currentEnv()) : null
  const open = browser ? escapeHref(target, browser) : null
  const word = browser === "safari" ? t("coach.browser.safari") : browser === "chrome" ? t("coach.browser.chrome") : t("coach.browser.default")
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(target)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast(t("share.copy_failed"))
    }
  }
  return (
    <div className={compact ? "flex flex-col gap-3" : "flex flex-col gap-4"} data-inapp-escape={browser ?? "other"}>
      <p className="text-body text-ink">{t("coach.inapp.body", { appName: app ?? t("coach.app.default") })}</p>
      <div className="grid grid-cols-1 gap-2">
        {open && (
          <Button render={<a href={open} />} data-inapp-open>
            {t("coach.inapp.open", { browser: word })}
          </Button>
        )}
        <Button onClick={copy} data-inapp-copy>
          {copied ? <Check aria-hidden strokeWidth={2.5} /> : <Copy aria-hidden strokeWidth={2} />}
          {copied ? t("coach.inapp.copied") : t("coach.inapp.copy")}
        </Button>
      </div>
    </div>
  )
}
