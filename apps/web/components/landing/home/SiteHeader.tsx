// The landing header (design-direction 03 §0, 04 §0, 07 §1.2): sticky, solid `ground` (no blur: the tokens have no
// translucent ground; it never hides, shrinks or animates the lockup). The lockup links home and is NOT the page's
// heading (the hero H1 is). From lg, the page's own story as anchor links (How it works · Rules · Under the hood) in
// `ink`, never `link` (Night `link` reads as marigold text). Then the site's one main action twice over, for people
// who come back and for people who start: a quiet "Sign in" text link (`ink`, a 44 px hit area, hidden below 360 px,
// where the row has 288 px) and [Start a Pot] as a SECONDARY button: the hero's [Start a Pot] is the page's one
// marigold. Both are <SignInLink>s: real links without JS (/pots, /pots?sheet=create), the sign-in dialog with it.
// The demo isn't here: the hero and the final card carry it.
// Motion (04 §0): its bottom rule draws in over the first 48 px of scroll (l-hairline: a CSS scroll timeline; always
// on where those are missing, under reduced motion and without JS), and at lg one 2 px `ink` bar follows the section
// you are reading (SiteHeaderNav). Its height (56 px, 64 px from lg, + the 1 px rule) is what Section's scroll-mt
// matches, so an anchor jump lands each band exactly under the rule.
import Link from "next/link"
import { Lockup } from "@/components/brand/Lockup"
import { SignInLink } from "@/components/features/auth/SignInLink"
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

/** a header text link: `ink` on a 44 px hit area that darkens on hover (only the fill transitions: transition-colors
 *  would also fade the focus ring's outline-color in, and 04 never transitions the ring) */
const TEXT_LINK =
  "inline-flex min-h-11 items-center rounded-md px-3 text-label text-ink transition-[background-color] duration-120 ease-standard hover:bg-surface-sunken"

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
                  <a href={`#${item.id}`} className={TEXT_LINK}>
                    <span data-nav-text>{t(item.label)}</span>
                  </a>
                </li>
              ))}
            </ul>
            <SiteHeaderNav ids={IDS} />
          </nav>
          {/* for people who come back: the same dialog, then their Pots (07 §2.5's sign-in mode) */}
          <SignInLink next="/pots" source="header" data-header-signin className={cn(TEXT_LINK, "max-xs:hidden lg:ml-2")}>
            {t("home.nav.signin")}
          </SignInLink>
          {/* a real link styled as a secondary button (see Hero.tsx); cn() merges away the base's transparent border */}
          <SignInLink source="header" data-header-start className={cn(buttonVariants({ size: "sm" }))}>
            {t("home.cta.start")}
          </SignInLink>
        </div>
      </div>
    </header>
  )
}
