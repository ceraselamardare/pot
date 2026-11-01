"use client"
// The in-app browser escape on the invite landing (F-24; frontend-architecture §2.5; ux-spec §4.1, §9):
// Instagram, Messenger, LinkedIn, TikTok, Telegram… block Google sign-in and can't install apps. Above the
// CTAs: "Open in Safari to join", why, then [Open in Safari] (x-safari-https://, keeps the #secret; Android:
// Chrome only when there's no fragment) and [Copy link] (always keeps the whole link).
import { Check, Copy, ExternalLink } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { currentEnv, escapeBrowser, escapeHref } from "@/lib/client/pwa/platform"

export function InAppBanner({ app }: { app: string }) {
  const [copied, setCopied] = useState(false)
  const href = window.location.href
  const browser = escapeBrowser(currentEnv())
  const open = browser ? escapeHref(href, browser) : null
  const word = browser === "safari" ? t("coach.browser.safari") : browser === "chrome" ? t("coach.browser.chrome") : t("coach.browser.default")
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
    <section aria-labelledby="inapp-h" className="flex flex-col gap-3 rounded-lg bg-surface p-4 shadow-card" data-inapp-banner={browser ?? "other"}>
      <h2 id="inapp-h" className="font-display text-heading text-ink">
        {t("landing.inapp.title", { browser: word })}
      </h2>
      <p className="text-body-sm text-ink">{t("landing.inapp.body", { appName: app })}</p>
      {open && (
        <Button variant="primary" className="w-full" render={<a href={open} />} data-inapp-open>
          <ExternalLink aria-hidden strokeWidth={2} />
          {t("landing.inapp.open", { browser: word })}
        </Button>
      )}
      <Button className="w-full" onClick={copy} data-inapp-copy>
        {copied ? <Check aria-hidden strokeWidth={2.5} /> : <Copy aria-hidden strokeWidth={2} />}
        {copied ? t("share.copied") : t("landing.inapp.copy")}
      </Button>
      <p className="text-body-sm text-ink-muted">{t("landing.inapp.email")}</p>
    </section>
  )
}
