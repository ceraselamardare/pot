"use client"
// Advanced (ux-spec §10): a separate, quieter room (surface-sunken, ink-muted, no marigold). The only place that
// shows the Pot account id and the network. components/advanced/** is exempt from the jargon lint.
import { ChevronLeft, Copy, ExternalLink } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { PotAdvanced } from "@/components/advanced/PotAdvanced"
import { pageTitle, t } from "@/i18n/t"
import { explorerAccount } from "@/lib/client/advanced"
import { useMeInfo, usePots } from "@/lib/client/data"

export function AdvancedScreen() {
  const me = useMeInfo()
  const pots = usePots()
  const [copied, setCopied] = useState(false)
  if (!me) return null
  const account = me.account
  return (
    <>
      <title>{pageTitle(t("advanced.title"))}</title>
      <main id="main" className="mx-auto w-full max-w-flow px-4 pb-8 md:px-6">
        <div className="flex items-center gap-1 pt-3">
          <Link href="/you" aria-label={t("advanced.back")} className="-ml-2 grid size-11 place-items-center rounded-pill text-ink hover:bg-surface-sunken">
            <ChevronLeft aria-hidden className="size-6" strokeWidth={2} />
          </Link>
          <h1 className="font-display text-title text-ink">{t("advanced.title")}</h1>
        </div>
        <p className="mt-2 text-body-sm text-ink-muted">{t("advanced.intro")}</p>
        <section className="mt-4 rounded-lg bg-surface-sunken p-4">
          <p className="text-label text-ink">{t("advanced.account")}</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate text-body-sm text-ink-muted">{account}</code>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(account)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                } catch {}
              }}
              className="flex h-11 items-center gap-1.5 rounded-pill px-3 text-label text-ink hover:bg-line"
            >
              <Copy aria-hidden className="size-4" strokeWidth={2} />
              {copied ? t("advanced.copied") : t("advanced.copy")}
            </button>
          </div>
          <p className="mt-2 text-body-sm text-ink-muted">{t("advanced.network")}</p>
          <a
            href={explorerAccount(account)}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-1 flex min-h-11 items-center gap-1.5 text-body-sm text-ink underline underline-offset-4"
          >
            {t("advanced.explorer.account")}
            <ExternalLink aria-hidden className="size-4 shrink-0" strokeWidth={2} />
          </a>
        </section>
        {pots && pots.length > 0 && (
          <section aria-labelledby="advanced-pots" className="mt-6">
            <h2 id="advanced-pots" className="mb-2 px-1 text-label text-ink-muted">
              {t("advanced.pots")}
            </h2>
            <ul className="flex flex-col gap-3">
              {pots.map((p) => (
                <PotAdvanced key={p.slug} pot={p} />
              ))}
            </ul>
          </section>
        )}
        <p className="mt-4 text-body-sm text-ink-muted">{t("advanced.public")}</p>
      </main>
    </>
  )
}
