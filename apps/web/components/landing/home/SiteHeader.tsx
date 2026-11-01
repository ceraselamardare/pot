// The landing header (design-direction 03 §0, 04 §0): sticky, solid `ground` (no blur: the tokens have no
// translucent ground; it never hides, shrinks or animates the lockup). The lockup links home and is NOT the page's
// heading (the hero H1 is). From lg, the page's own story as anchor links (How it works · Rules · Under the hood) in
// `ink`, never `link` (Night `link` reads as marigold text). [Try the demo] stays secondary: the hero's [Start a Pot]
// is the one marigold.
// Motion (04 §0): its bottom rule draws in over the first 48 px of scroll (l-hairline: a CSS scroll timeline; always
// on where those are missing, under reduced motion and without JS), and at lg one 2 px `ink` bar follows the section
// you are reading (SiteHeaderNav). Its height (56 px, 64 px from lg, + the 1 px rule) is what Section's scroll-mt
// matches, so an anchor jump lands each band exactly under the rule.
import Link from "next/link"
import { Lockup } from "@/components/brand/Lockup"
import { buttonVariants } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { cn } from "@/lib/client/cn"
import { SiteHeaderNav } from "./SiteHeaderNav"

const NAV = [
  { id: "how", label: "home.nav.how" },
  { id: "rules", label: "home.nav.rules" },
  { id: "tech", label: "home.nav.tech" },
] as const

const IDS = NAV.map((item) => item.id)

export function SiteHeader() {
  return (
    <header className="l-hairline sticky top-0 z-40 border-b border-line bg-ground">
      <div className="mx-auto flex h-14 w-full max-w-app items-center justify-between gap-4 px-4 md:px-6 lg:h-16">
        {/* press: the hit area darkens behind the logo (the logo itself never animates or changes colour) */}
        <Link
          href="/"
          aria-label={t("home.nav.home")}
          data-lockup-link
          className="-ml-1 inline-flex min-h-11 shrink-0 items-center rounded-md px-1"
        >
          <Lockup className="h-10 w-auto" />
        </Link>
        <div className="flex items-center gap-2">
          <nav aria-label={t("home.nav.label")} className="relative hidden lg:block">
            <ul className="flex items-center gap-1">
              {NAV.map((item) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    // only the fill transitions: transition-colors would also fade the focus ring's outline-color in
                    // (04: the ring is never transitioned)
                    className="inline-flex min-h-11 items-center rounded-md px-3 text-label text-ink transition-[background-color] duration-120 ease-standard hover:bg-surface-sunken"
                  >
                    <span data-nav-text>{t(item.label)}</span>
                  </a>
                </li>
              ))}
            </ul>
            <SiteHeaderNav ids={IDS} />
          </nav>
          {/* a real link styled as a secondary button (see Hero.tsx) */}
          <Link href="/demo" className={cn(buttonVariants({ size: "sm" }), "lg:ml-2")}>
            {t("home.cta.demo")}
          </Link>
        </div>
      </div>
    </header>
  )
}
