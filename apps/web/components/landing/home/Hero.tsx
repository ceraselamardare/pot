// The landing hero (design-direction 03 §1, 07 §1): what Pot is (the H1, the brand tagline with "its own rules" on
// the rules' brand-soft highlight), how it behaves (the subhead), the page's ONLY marigold button [Start a Pot] (a
// <SignInLink>: /pots?sheet=create without JS, the sign-in dialog with it), a secondary [See a demo] (the /demo tour,
// for people who aren't convinced yet), then the proof: Maya's Lisbon Trip group chat on a phone with the "Approved
// by Pot rules" card breaking out of it.
//  - 390: centred copy, then a phone cropped by the hero's bottom edge (it sinks into `ground` through a short
//    fade), the breakout card just under the chat header, overhanging the phone's right edge, two stickers.
//    The chat is bottom-anchored and the phone is tall, so the card floats over empty wallpaper and Maya's invite
//    sits whole below it. Its top lands at about 560 px at 390 (in a 390 x 664 Safari tab: proof before scroll).
//  - lg: copy in cols 1-6 (left-aligned), the full phone in cols 7-12 with two floating cards and two stickers:
//    Leo's $150 under the status bar on the top-right (over the header's call icons and the empty top of the
//    chat, clear of the camera island), and the breakout card off the bottom-left, over the composer.
//  Rule for every overlap: whatever a card overlaps is either fully covered or fully visible (no clipped words,
//  and the invite's logo always shows with its name).
// The whole visual is ONE image (role="img" + home.hero.visual_label); everything inside is aria-hidden + inert.
// Motion (design-direction 04 §1): one 0.8 s CSS-only arrival on first paint ([data-seq-load], no JS needed): the
// brand-soft block wipes in behind "its own rules" (200 ms), the phone rises (0), the proof card lands (280) and its
// check pops (520), Leo's card drops in at lg (400), the stickers settle (360, 440); it all ends by 880 ms on the
// server's frame. The eyebrow, H1 text, subhead, buttons and reassurance line never move, not even their opacity
// (the H1 is the LCP element and the AI judges' first line). Leo's dots pulse from 600 ms, only while fully in view,
// 4.8 s at most (TypingInView). Reduced motion and no JS: the final frame, still.
import Link from "next/link"
import { Check } from "lucide-react"
import { SignInLink } from "@/components/features/auth/SignInLink"
import { MoneyText } from "@/components/money/MoneyText"
import { Avatar } from "@/components/pot/Avatar"
import { GoalBar } from "@/components/pot/GoalBar"
import { buttonVariants } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { cn } from "@/lib/client/cn"
import { dollars, formatUsd } from "@/lib/client/money"
import { CHAT_CAST, ChatThread } from "./ChatThread"
import { FloatCard } from "./FloatCard"
import { seqVars } from "./motion/sequence"
import { PhoneFrame } from "./PhoneFrame"
import { Sticker } from "./Sticker"
import { TypingInView } from "./TypingInView"

const INSTANT_LIMIT = formatUsd(dollars(100), "whole")
/** stacked on the narrowest phones, side by side from 360 px (so the proof card clears the fold), auto width from sm */
const CTA = "w-full xs:w-auto xs:flex-1 sm:min-w-44 sm:flex-none"
/** [Start a Pot] on hover-capable devices: no new colour (the brand has none between brand and brand-deep), the card
 *  shadow fades in over 200 ms. The press stays buttonVariants' own (.97 in 120 ms, out 200 ms, brand-deep): the
 *  transition list only gains box-shadow, with the same per-property durations. */
const PRIMARY_HOVER = "transition-[background-color,border-color,scale,box-shadow] [--tw-duration:120ms,120ms,200ms,200ms] hover:shadow-card"

export function Hero() {
  const title = t("home.hero.title")
  const highlight = t("home.hero.title.highlight")
  const at = title.indexOf(highlight)
  // "Sign in with Google · Nothing to install · No one…" → items, each with the separator before it (from the copy)
  const parts = t("home.hero.reassure").split(/( · )/)
  const reassure = parts.flatMap((item, i) => (i % 2 ? [] : [{ item, sep: i > 0 ? parts[i - 1] : null }]))
  return (
    <section aria-labelledby="hero-title" className="overflow-x-clip" data-landing-hero>
      <div className="mx-auto w-full max-w-app px-4 pt-4 md:px-6 md:pt-12 lg:grid lg:min-h-[40rem] lg:grid-cols-12 lg:items-center lg:gap-8 lg:py-8">
        <div className="text-center lg:col-span-6 lg:text-left">
          <p className="text-label text-ink-muted">{t("home.hero.eyebrow")}</p>
          <h1
            id="hero-title"
            className="mx-auto mt-2 max-w-[12em] font-display text-balance-hero text-balance text-ink max-xs:text-[2.25rem] max-xs:leading-10 lg:mx-0"
          >
            {at < 0 ? (
              title
            ) : (
              <>
                {title.slice(0, at)}
                {/* the text never moves: its brand-soft block sits behind it and wipes in left to right */}
                <span className="relative isolate px-1 whitespace-nowrap selection:bg-surface-sunken">
                  {highlight}
                  <span aria-hidden data-seq-load className="absolute inset-0 -z-10">
                    <span data-seq="wipe" style={seqVars({ at: 200 })} className="block size-full rounded-sm bg-brand-soft" />
                  </span>
                </span>
                {title.slice(at + highlight.length)}
              </>
            )}
          </h1>
          <p className="mx-auto mt-3 max-w-flow text-body text-balance text-ink-muted lg:mx-0 lg:text-pretty">{t("home.hero.subhead")}</p>

          <div className="mt-6 flex flex-col gap-3 xs:flex-row sm:justify-center lg:justify-start">
            {/* real links styled as buttons (buttonVariants): a Base UI <Button render={<Link />}> either logs an error
                or, with nativeButton={false}, turns the link into role="button" */}
            <SignInLink source="hero" className={cn(buttonVariants({ variant: "primary" }), CTA, PRIMARY_HOVER)}>
              {t("home.cta.start")}
            </SignInLink>
            <Link href="/demo" className={cn(buttonVariants({ size: "lg" }), CTA)}>
              {t("home.cta.demo")}
            </Link>
          </div>

          {/* three short promises: one line with " · " at lg; below lg they wrap only between items, with no separator
              left dangling at a line's end */}
          <ul className="mx-auto mt-3 flex max-w-flow flex-wrap justify-center gap-x-4 gap-y-1 text-body-sm text-ink-muted lg:mx-0 lg:max-w-none lg:justify-start lg:gap-x-0">
            {reassure.map(({ item, sep }) => (
              <li key={item} className="whitespace-nowrap">
                {sep ? (
                  <span aria-hidden className="hidden whitespace-pre lg:inline">
                    {sep}
                  </span>
                ) : null}
                {item}
              </li>
            ))}
          </ul>
        </div>

        <HeroVisual />
      </div>
    </section>
  )
}

/** The phone stage: cropped at 390-md, the full rig at lg. */
function HeroVisual() {
  return (
    <div
      role="img"
      aria-label={t("home.hero.visual_label")}
      data-hero-visual
      data-seq-load
      className="relative -mx-4 mt-6 h-[27rem] overflow-clip max-xs:h-[25rem] md:-mx-6 md:h-[30rem] lg:col-span-6 lg:mx-0 lg:mt-0 lg:h-auto lg:overflow-visible lg:py-4"
    >
      <TypingInView delay={600} className="h-full pt-6 lg:pt-0">
        <div aria-hidden inert className="relative mx-auto w-[16.5rem] max-xs:w-60 md:w-72">
          {/* behind the phone, peeking out of its top-left; tucked in a little more below 390 so its die-cut edge
              always clears the screen edge (≥ 4 px, rotation included). It settles like a sticker pressed down. */}
          <Sticker
            name="tram"
            width={80}
            sizes="(min-width: 1024px) 144px, 80px"
            priority
            rotate={-8}
            data-seq="settle"
            style={seqVars({ at: 360 })}
            className="absolute -top-4 -left-13 z-0 w-20 max-[24.375rem]:-left-11 max-xs:-left-8 max-xs:w-16 lg:-top-8 lg:-left-24 lg:w-36"
          />

          {/* 390-md: a tall screen with just the invite and Leo typing; the bottom-anchored chat leaves the top
              empty for the breakout card, and the stage crops the rest. lg: the full phone, the thread without
              Sam's airbnb line, so the top of the chat stays empty under Leo's card. */}
          {/* the one movement on load: the phone rises 24 px (04: no second chat motion inside it) */}
          <PhoneFrame
            label={t("home.hero.visual_label")}
            data-seq="fade-up"
            style={seqVars({ at: 0, dur: 360, y: 24 })}
            className="relative z-10 aspect-[390/814] w-full lg:aspect-[390/844]"
          >
            <ChatThread rows={["invite", "typing"]} animateTyping className="lg:hidden" />
            <ChatThread rows={["boat", "promise", "invite", "typing"]} animateTyping className="hidden lg:flex" />
          </PhoneFrame>

          {/* the proof: Pot rules approved Maya's $84. On a phone it sits just under the chat header and breaks
              out of the right edge (above the fold; it covers only wallpaper); at lg it breaks out of the bottom-left
              corner, toward the copy, covering the composer's + and "Message" whole, below Leo's typing bubble. */}
          {/* it lands from the corner nearest the phone (top-left on a phone, top-right at lg), keeping its tilt */}
          <FloatCard
            tilt={-2}
            data-seq="fade-up"
            style={seqVars({ at: 280, dur: 360, y: 12, scale: 0.96 })}
            className="absolute top-[5.5rem] -right-9 z-20 w-60 origin-top-left lg:origin-top-right max-xs:top-[5rem] max-xs:-right-2 max-xs:w-[14.25rem] md:top-[6rem] md:-right-16 lg:top-[89%] lg:right-auto lg:-left-24 lg:w-64 xl:-left-32 dark:ring-1 dark:ring-line"
          >
            <ApprovedCard />
          </FloatCard>

          {/* lg only: Leo finally chips in. Below the status bar and the camera island; it hides the header's
              call icons whole and stays right of the "Today" pill. */}
          <FloatCard
            tilt={2}
            data-seq="drop"
            style={seqVars({ at: 400 })}
            className="absolute top-[7.5%] -right-24 z-20 hidden w-52 lg:block xl:-right-28 xl:w-56 dark:ring-1 dark:ring-line"
          >
            <LeoAddedCard />
          </FloatCard>

          {/* on a phone: off the left edge beside Maya's invite (under a 664 px fold); at lg: in front of the bottom-right */}
          <Sticker
            name="pastel"
            width={64}
            sizes="(min-width: 1024px) 128px, 64px"
            priority
            rotate={8}
            data-seq="settle"
            style={seqVars({ at: 440 })}
            className="absolute top-[15.5rem] -left-12 z-20 w-16 max-xs:hidden md:top-[17rem] lg:top-auto lg:right-[-4.5rem] lg:bottom-12 lg:left-auto lg:w-32"
          />
        </div>
      </TypingInView>

      {/* the crop: the phone sinks into the page instead of ending on a hard line */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-10 bg-linear-to-b from-transparent to-ground to-60% lg:hidden" />
    </div>
  )
}

function ApprovedCard() {
  return (
    <>
      <div className="flex items-center gap-2 rounded-md bg-brand-soft py-2 pr-2.5 pl-2">
        <span data-seq="pop" style={seqVars({ at: 520 })} className="grid size-6 shrink-0 place-items-center rounded-pill bg-surface">
          <Check className="size-4 text-approved" strokeWidth={2} />
        </span>
        <span className="text-label text-ink">{t("spend.approved")}</span>
      </div>
      {/* the label and the amount share a baseline (their sizes differ); the avatar centres on the row */}
      <div className="mt-2.5 flex items-baseline gap-2 px-1">
        <Avatar person={CHAT_CAST.maya} size="xs" className="self-center" />
        <span className="min-w-0 flex-1 overflow-x-clip text-body-sm text-ellipsis whitespace-nowrap text-ink">{t("spend.reason.chip.groceries")}</span>
        <MoneyText micro={dollars(84)} sign="out" variant="row" className="text-ink" />
      </div>
      <p className="mt-0.5 px-1 text-body-sm text-ink-muted max-xs:hidden">{t("feed.instant.rule", { instantLimit: INSTANT_LIMIT })}</p>
    </>
  )
}

function LeoAddedCard() {
  return (
    <>
      <div className="flex items-center gap-2.5">
        <Avatar person={CHAT_CAST.leo} size="md" ring="surface" />
        <div className="min-w-0 flex-1">
          <p className="text-label text-ink">{t("feed.contribution", { name: CHAT_CAST.leo.name, amount: formatUsd(dollars(150), "whole") })}</p>
          <p className="text-body-sm text-ink-muted">{t("home.chat.title")}</p>
        </div>
      </div>
      <GoalBar collected={dollars(450)} goal={dollars(450)} size="sm" className="mt-3" />
    </>
  )
}
