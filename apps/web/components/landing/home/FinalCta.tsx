// The final call to action (plan/design-direction/03-landing.md §7, 07 §1.2): one last, warm push, on a `surface`
// card with Maya, Sam and Leo around it. Both buttons are SECONDARY: the page's one marigold is the hero's
// [Start a Pot] (never a marigold band here either: Night secondary buttons, line-strong borders and a marigold
// block next to a button all fail on marigold). [Start a Pot →] leads, with an arrow (the site's one main action
// keeps its one name: "Start your Pot" is retired; tests scope it by [data-final-cta]), then [See a demo]. One sticker
// peeks from the card's corner.
// The buttons are real links styled with buttonVariants (a Base UI <Button render={<Link />}> would give them
// role="button"); Start is a <SignInLink> (/pots?sheet=create without JS, the sign-in dialog with it).
// Motion (plan/design-direction/04-landing-motion.md §7): the card is one sequence that plays once when half of it is
// in view: the group gathers (Maya, Sam, Leo pop from .6, 80 ms apart) and the sunglasses settle (240). The H2, the
// sentence and the buttons never move. The arrow of [Start a Pot →] nudges 3 px on hover (hover-capable devices).
import { ArrowRight } from "lucide-react"
import Link from "next/link"
import { SignInLink } from "@/components/features/auth/SignInLink"
import { Avatar } from "@/components/pot/Avatar"
import { buttonVariants } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { cn } from "@/lib/client/cn"
import { CHAT_CAST } from "./ChatThread"
import { Sequences } from "./motion/Sequences"
import { Section, SectionHead } from "./Section"
import { Sticker } from "./Sticker"

const PEOPLE = [CHAT_CAST.maya, CHAT_CAST.sam, CHAT_CAST.leo]

export function FinalCta() {
  return (
    <Section labelledBy="final-title">
      <Sequences />
      <div
        data-sequence
        data-threshold="0.5"
        className="relative mx-auto rounded-lg bg-surface px-4 py-8 text-center shadow-card md:px-6 lg:p-12"
        data-final-cta
      >
        {/* AvatarStack's seats, one per sequence item (AvatarStack passes no attributes through) */}
        <span aria-hidden className="mx-auto flex w-fit items-center">
          {PEOPLE.map((p, i) => (
            <span key={p.id} data-seq="pop" data-scale=".6" data-at={i * 80} className={cn("grid rounded-pill", i > 0 && "-ml-2")}>
              <Avatar person={p} size="md" ring="surface" />
            </span>
          ))}
        </span>
        <SectionHead
          id="final-title"
          title={t("home.final.title")}
          intro={<span className="block text-balance">{t("home.final.body")}</span>}
          align="center"
          className="mt-4 mb-0 max-w-flow lg:mb-0"
        />
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <SignInLink source="final" className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "l-nudge sm:min-w-44")}>
            {t("home.cta.start")}
            <ArrowRight aria-hidden strokeWidth={2} />
          </SignInLink>
          <Link href="/demo" prefetch={false} className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "sm:min-w-44")}>
            {t("home.cta.demo")}
          </Link>
        </div>

        {/* 1024: 12 px inside the viewport (the band clips at its edge); it reaches out further from xl */}
        <span data-seq="settle" data-at="240" className="absolute -top-6 -right-1 block w-20 lg:-top-10 lg:-right-3 lg:w-36 xl:-right-8">
          <Sticker name="sunglasses" width={80} sizes="(min-width: 1024px) 144px, 80px" rotate={-8} className="w-full" />
        </span>
      </div>
    </Section>
  )
}
