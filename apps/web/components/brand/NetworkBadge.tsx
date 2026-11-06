// The Testnet badge: the one place the site says it runs on NEAR testnet (every other "preview / test money" line is
// gone). It renders only on a `testnet` build (lib/network.ts), so a mainnet build drops it with no other change.
// Look: a small pill with a dashed `line-strong` edge (3:1 on every ground), `ink` text and a Lucide flask at
// stroke 2 (status = an icon + a word; the app's test icon, as on test-dollar rows); neutral, never marigold. A pseudo-element stretches the 28 px pill to a 44 px
// hit area, so the focus ring hugs the pill and the row it sits in keeps its height.
// Behaviour: a real <button> that toggles a native popover (popovertarget): no JavaScript at all, so it is server
// rendered and costs the marketing pages nothing. The browser gives it Esc, light dismiss, aria-expanded and the
// top layer; the explanation sits right after the button in the DOM, so a screen reader reads it next. CSS anchor
// positioning (globals.css, .pot-netpop) places it under the badge, or above it near the bottom of the screen;
// without anchor support it opens as a small centred card. One component everywhere: tune it here.
// `place` names the instance (ids and anchor names must be unique on a page): header (header-narrow under it below
// 448 px) and footer on the marketing pages, app (phones) and app-top (the bp-lg top bar) in the app shell, page on
// the standalone pages, demo on /demo.
import { FlaskConical } from "lucide-react"
import type { CSSProperties } from "react"
import { t } from "@/i18n/t"
import { cn } from "@/lib/client/cn"
import { isTestnetBuild } from "@/lib/network"

export type NetworkBadgePlace = "header" | "header-narrow" | "footer" | "app" | "app-top" | "page" | "demo"

export function NetworkBadge({ place, className }: { place: NetworkBadgePlace; className?: string }) {
  if (!isTestnetBuild()) return null
  const id = `network-badge-${place}`
  const anchor = {
    "--pot-netpop-anchor": `--pot-netbadge-${place}`,
  } as CSSProperties
  return (
    <>
      <button
        type="button"
        popoverTarget={id}
        style={anchor}
        className={cn(
          "pot-netbadge relative inline-flex h-7 shrink-0 items-center gap-1 rounded-pill border border-dashed border-line-strong px-2 font-sans text-body-sm font-semibold whitespace-nowrap text-ink transition-[background-color] duration-120 ease-standard hover:bg-surface-sunken",
          "before:absolute before:inset-x-0 before:-inset-y-2 before:content-['']",
          className,
        )}
        data-network-badge={place}
      >
        <FlaskConical aria-hidden className="size-3.5 shrink-0" strokeWidth={2} />
        {t("network.badge")}
      </button>
      <div
        id={id}
        popover="auto"
        style={anchor}
        className="pot-netpop w-[min(20rem,calc(100vw-2rem))] rounded-md border border-line bg-surface p-4 text-left text-ink shadow-card"
        data-network-badge-pop={place}
      >
        <p className="flex items-center gap-2 text-label text-ink">
          <FlaskConical aria-hidden className="size-4 shrink-0" strokeWidth={2} />
          {t("network.badge.title")}
        </p>
        <p className="mt-1 text-body-sm text-ink-muted">{t("network.badge.body")}</p>
      </div>
    </>
  )
}
