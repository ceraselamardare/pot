// The landing footer (plan/design-direction/03-landing.md §7): small and honest. The whole lockup as the sign-off
// (never cropped, wordmark lowercase, the theme picks its wordmark file), the tagline, the Testnet badge (testnet
// builds only: components/brand/NetworkBadge, the one place the site names its network) and Back to top. The hackathon credit lives only at the end of #tech (its `home.tech.*` keys are the only ones
// allowed to say NEAR), so the footer stays jargon-free. Text links are `ink`, not `link`, because Night `link`
// reads as marigold text. No social icons, newsletter or store badges.
// Motion (04 §8): still. [Back to top] scrolls smoothly to #main (CSS; instant under reduced motion) and its arrow
// nudges up 2 px on hover; a tap darkens its hit area (top.css, page-wide for text links). The lockup never animates.
import { ArrowUp } from "lucide-react"
import Link from "next/link"
import { Lockup } from "@/components/brand/Lockup"
import { NetworkBadge } from "@/components/brand/NetworkBadge"
import { t } from "@/i18n/t"

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-ground" data-site-footer>
      <div className="mx-auto flex w-full max-w-app flex-col gap-6 px-4 pt-8 pb-[calc(2rem+env(safe-area-inset-bottom))] md:px-6 lg:flex-row lg:items-start lg:justify-between lg:gap-12">
        <div className="min-w-0">
          <Link href="/" aria-label={t("home.nav.home")} className="inline-flex min-h-11 items-center rounded-sm">
            <Lockup className="h-10 w-auto" />
          </Link>
          <p className="mt-3 text-body-sm text-ink-muted">{t("app.description")}</p>
          <NetworkBadge place="footer" className="mt-4" />
        </div>

        <div className="flex min-w-0 flex-col gap-3 lg:max-w-md lg:items-end lg:text-right">
          <a
            href="#main"
            className="l-nudge -ml-2 inline-flex min-h-11 w-fit items-center gap-2 rounded-sm px-2 text-label text-ink underline-offset-4 [--l-nudge:0_-2px] hover:underline lg:-mr-2 lg:ml-0"
          >
            <ArrowUp aria-hidden className="size-5" strokeWidth={2} />
            {t("home.footer.top")}
          </a>
        </div>
      </div>
    </footer>
  )
}
