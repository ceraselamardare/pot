// The visible "Last updated 6 November 2026" (page-plan: from the registry, never faked). The same date is the
// sitemap's lastmod and the WebPage's dateModified. Formatted at build time in UTC, so it's the same everywhere.
import { t } from "@/i18n/t"
import { cn } from "@/lib/client/cn"
import { marketingPage, type MarketingPath } from "@/lib/marketing/pages"

const FORMAT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })

export function LastUpdated({ path, className }: { path: MarketingPath; className?: string }) {
  const iso = marketingPage(path).lastModified
  return (
    <p className={cn("text-body-sm text-ink-muted", className)} data-last-updated>
      <time dateTime={iso}>{t("uc.common.updated", { date: FORMAT.format(new Date(`${iso}T00:00:00Z`)) })}</time>
    </p>
  )
}
