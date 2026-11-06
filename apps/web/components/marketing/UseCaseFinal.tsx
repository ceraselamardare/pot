// A use-case page's last call to action (page-plan "Structure" 9), in the home page's FinalCta look: a `surface`
// card, [Start a Pot →] and [See how it works], both SECONDARY (the hero's is the page's one marigold), then the
// preview note (test money; the same words as the site footer). An optional sticker peeks from the card's corner.
import { ArrowRight, Info } from "lucide-react"
import Link from "next/link"
import { SignInLink } from "@/components/features/auth/SignInLink"
import { Section, SectionHead } from "@/components/landing/home/Section"
import { Sticker } from "@/components/landing/home/Sticker"
import type { StickerName } from "@/components/landing/home/stickers"
import { buttonVariants } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { cn } from "@/lib/client/cn"

export function UseCaseFinal({ title, body, sticker }: { title: string; body: string; sticker?: StickerName }) {
  return (
    <Section labelledBy="final-title">
      <div className="relative mx-auto rounded-lg bg-surface px-4 py-8 text-center shadow-card md:px-6 lg:p-12" data-final-cta>
        <SectionHead
          id="final-title"
          title={title}
          intro={<span className="block text-balance">{body}</span>}
          align="center"
          className="mb-0 max-w-flow lg:mb-0"
        />
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <SignInLink source="final" className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "l-nudge sm:min-w-44")}>
            {t("home.cta.start")}
            <ArrowRight aria-hidden strokeWidth={2} />
          </SignInLink>
          <Link href="/demo" prefetch={false} className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "sm:min-w-44")}>
            {t("uc.common.cta.demo")}
          </Link>
        </div>
        <p className="mx-auto mt-6 flex max-w-flow items-start justify-center gap-2 text-left text-body-sm text-ink-muted" data-preview-note>
          <Info aria-hidden className="size-5 shrink-0" strokeWidth={2} />
          <span className="min-w-0">{t("home.footer.preview")}</span>
        </p>
        {sticker ? (
          <Sticker
            name={sticker}
            width={80}
            sizes="(min-width: 1024px) 128px, 80px"
            rotate={-8}
            className="absolute -top-6 -right-1 w-20 lg:-top-10 lg:-right-3 lg:w-32"
          />
        ) : null}
      </div>
    </Section>
  )
}
