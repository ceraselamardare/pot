"use client"
// The in-app browser escape (F-24; frontend-architecture §2.5; ux-spec §4.1, §9; design-direction 07 §2.6):
// Instagram, Messenger, LinkedIn, TikTok, Telegram… block Google sign-in and can't install apps. Above the
// CTAs: "Open in Safari to join" (the invite landing) or "Open Pot in Safari to sign in" (the sign-in dialog and the
// app's signed-out screen), why, then [Open in Safari] (x-safari-https://, keeps the #secret; Android: Chrome only
// when there's no fragment) and [Copy link] (always keeps the whole link).
// `href` is the page to open there: the invite link itself by default; the sign-in panel passes where the person was
// going (`/pots?sheet=create`), whose signed-out screen then shows the same sign-in inline.
import { Check, Copy, ExternalLink } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Button, buttonVariants } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { cn } from "@/lib/client/cn"
import { currentEnv, escapeBrowser, escapeHref } from "@/lib/client/pwa/platform"

export function InAppBanner({
  app,
  href: target,
  purpose = "join",
  googleOff = false,
  tone = "card",
  level = 2,
}: {
  /** the in-app browser's app name ("Instagram") */
  app: string
  /** the page to open in the real browser (default: this one) */
  href?: string
  /** the invite landing's words, or the sign-in panel's */
  purpose?: "join" | "signin"
  /** sign-in: this build offers no Google, so the reason is "works best", not "Google doesn't work" */
  googleOff?: boolean
  /** a card on the page (the invite landing), or a sunken block inside a dialog */
  tone?: "card" | "sunken"
  /** the heading level under the screen's own title */
  level?: 2 | 3
}) {
  const [copied, setCopied] = useState(false)
  const href = target ?? window.location.href
  const browser = escapeBrowser(currentEnv())
  const open = browser ? escapeHref(href, browser) : null
  const word = browser === "safari" ? t("coach.browser.safari") : browser === "chrome" ? t("coach.browser.chrome") : t("coach.browser.default")
  const signin = purpose === "signin"
  const H = level === 3 ? "h3" : "h2"
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast(t("share.copy_failed"))
    }
  }
  return (
    <section
      aria-labelledby="inapp-h"
      className={cn("flex flex-col gap-3 text-left", tone === "card" ? "rounded-lg bg-surface p-4 shadow-card" : "rounded-md bg-surface-sunken p-4")}
      data-inapp-banner={browser ?? "other"}
    >
      <H id="inapp-h" className="font-display text-heading text-ink">
        {signin ? t("signin.inapp.title", { browser: word }) : t("landing.inapp.title", { browser: word })}
      </H>
      <p className="text-body-sm text-ink">
        {signin
          ? googleOff
            ? t("signin.inapp.body_any", { browser: word, appName: app })
            : t("signin.inapp.body", { appName: app })
          : t("landing.inapp.body", { appName: app })}
      </p>
      {open && (
        // a real link (not <Button render={<a/>}>, which Base UI flags as a non-native button)
        <a href={open} className={cn(buttonVariants({ variant: "primary" }), "w-full")} data-inapp-open>
          <ExternalLink aria-hidden strokeWidth={2} />
          {t("landing.inapp.open", { browser: word })}
        </a>
      )}
      <Button className="w-full" onClick={copy} data-inapp-copy>
        {copied ? <Check aria-hidden strokeWidth={2.5} /> : <Copy aria-hidden strokeWidth={2} />}
        {copied ? t("share.copied") : t("landing.inapp.copy")}
      </Button>
      {!signin && <p className="text-body-sm text-ink-muted">{t("landing.inapp.email")}</p>}
    </section>
  )
}
