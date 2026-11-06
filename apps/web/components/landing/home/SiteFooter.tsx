// The site footer on "/" and every marketing page (MarketingShell): the brand block, four link groups and a bottom row.
// The structure follows how consumer money and app sites close their pages: the brand on the left, short titled
// columns of plain text links on the right, a hairline, then the copyright row. The links are site-wide internal
// links, so every page in the registry is one hop from any other (crawlers and AI engines read the visible text).
//  - Brand: the whole lockup (never cropped or recoloured; the theme picks its wordmark), the tagline and the Testnet
//    badge (testnet builds only: components/brand/NetworkBadge, the one place the site names its network).
//  - Product: the home's story anchors, the /demo tour, then [Start a Pot] and [Sign in] as plain text links
//    (<SignInLink>; the page's one marigold stays in its hero).
//  - Use cases and Free tools: built from the registry (lib/marketing/pages.ts `footerPages`), so a registered page
//    appears here on its own and an unbuilt one never does. Stacked in one column, so the grid stays balanced; on
//    phones that column spans two rows, so How it's built tucks under Product (the DOM order stays the reading order).
//  - How it's built: the home's #tech band, /demo/all and the repo (external links say "on GitHub" to screen readers
//    and show an arrow). No legal pages exist, so none are linked.
//  - Bottom row: copyright, the maker, Back to top. No social icons, newsletter or store badges (03 §7).
// Layout: one column for the brand, then a grid of groups, 2 across on phones (320 px included: labels wrap, never
// scroll), 3 from md, beside the brand from lg. Every link is visible (no accordions). Links are `ink-muted` text that
// turns `ink` and underlines on hover, on a 44 px hit area (36 px from lg, where a mouse is likely) that darkens on
// press; never `link` (Night `link` reads as marigold text). Server-rendered: SignInLink is the header's own client
// component, so the footer adds no JavaScript.
import { ArrowUp, ArrowUpRight } from "lucide-react"
import Link from "next/link"
import { Lockup } from "@/components/brand/Lockup"
import { NetworkBadge } from "@/components/brand/NetworkBadge"
import { SignInLink } from "@/components/features/auth/SignInLink"
import { t } from "@/i18n/t"
import { footerPages } from "@/lib/marketing/pages"
import { SITE } from "@/lib/marketing/site"

const LINK =
  "-mx-2 inline-flex min-h-11 items-center gap-1 rounded-sm px-2 py-1 text-body-sm text-ink-muted underline-offset-4 transition-[background-color,color] duration-120 ease-standard hover:text-ink hover:underline active:bg-surface-sunken lg:min-h-9"

const HEADING = "text-label text-ink"

function Group({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <nav aria-labelledby={id} data-footer-group={id}>
      <h2 id={id} className={HEADING}>
        {title}
      </h2>
      <ul className="mt-2 lg:mt-3">{children}</ul>
    </nav>
  )
}

function Internal({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} prefetch={false} className={LINK}>
        {children}
      </Link>
    </li>
  )
}

function External({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <a href={href} rel="noopener" className={LINK} data-external>
        <span>
          {children}
          <span className="sr-only">{t("footer.external")}</span>
        </span>
        <ArrowUpRight aria-hidden className="size-4 shrink-0" strokeWidth={2} />
      </a>
    </li>
  )
}

export function SiteFooter() {
  const { useCases, tools } = footerPages()
  return (
    <footer className="border-t border-line bg-ground" data-site-footer>
      <div className="mx-auto w-full max-w-app px-4 pt-10 pb-[calc(2rem+env(safe-area-inset-bottom))] md:px-6 lg:pt-14">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:gap-16">
          <div className="min-w-0">
            <Link href="/" aria-label={t("home.nav.home")} className="inline-flex min-h-11 items-center rounded-sm">
              <Lockup className="h-10 w-auto" />
            </Link>
            <p className="mt-3 max-w-72 text-body-sm text-ink-muted">{t("app.description")}</p>
            <NetworkBadge place="footer" className="mt-4" />
          </div>

          <div className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 md:gap-x-6">
            <Group id="footer-product" title={t("footer.product.title")}>
              <Internal href="/#how">{t("footer.product.how")}</Internal>
              <Internal href="/#rules">{t("footer.product.rules")}</Internal>
              <Internal href="/demo">{t("footer.product.demo")}</Internal>
              <li>
                <SignInLink source="footer" className={LINK}>
                  {t("footer.product.start")}
                </SignInLink>
              </li>
              <li>
                <SignInLink next="/pots" source="footer" className={LINK}>
                  {t("footer.product.signin")}
                </SignInLink>
              </li>
            </Group>

            {useCases.length || tools.length ? (
              <div className="row-span-2 flex min-w-0 flex-col gap-8 md:row-span-1">
                {useCases.length ? (
                  <Group id="footer-use-cases" title={t("footer.usecases.title")}>
                    {useCases.map((p) => (
                      <Internal key={p.path} href={p.path}>
                        {t(p.useCase.navKey)}
                      </Internal>
                    ))}
                  </Group>
                ) : null}
                {tools.length ? (
                  <Group id="footer-tools" title={t("footer.tools.title")}>
                    {tools.map((p) => (
                      <Internal key={p.path} href={p.path}>
                        {t(p.useCase.navKey)}
                      </Internal>
                    ))}
                  </Group>
                ) : null}
              </div>
            ) : null}

            <Group id="footer-built" title={t("footer.built.title")}>
              <Internal href="/#tech">{t("footer.built.hood")}</Internal>
              <Internal href="/demo/all">{t("footer.built.decoded")}</Internal>
              <External href={SITE.repo}>{t("footer.built.source")}</External>
              <External href={`${SITE.repo}/blob/main/SECURITY.md`}>{t("footer.built.security")}</External>
            </Group>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between lg:mt-14">
          <p className="flex flex-wrap gap-x-2 text-body-sm text-ink-muted">
            <span>{t("footer.copyright")}</span>
            <span aria-hidden>·</span>
            <span>{t("footer.maker")}</span>
          </p>
          <a
            href="#main"
            className="l-nudge -ml-2 inline-flex min-h-11 w-fit items-center gap-2 rounded-sm px-2 text-label text-ink underline-offset-4 [--l-nudge:0_-2px] hover:underline sm:-mr-2 sm:ml-0"
          >
            <ArrowUp aria-hidden className="size-5" strokeWidth={2} />
            {t("home.footer.top")}
          </a>
        </div>
      </div>
    </footer>
  )
}
