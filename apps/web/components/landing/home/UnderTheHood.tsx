// Under the hood (#tech; plan/design-direction/03-landing.md §6): the architecture for judges in 30 seconds, and
// the only part of "/" that names the tech (every string is a `home.tech.*` key, the jargon lint's one exemption).
// A Night-scoped band (Section band="night" sets data-theme="night", so every token switches inside it in Day and
// Night alike). When the PAGE is Night too, a ground band would equal the page, so the band lifts one step to
// `surface` and its cards one more to `surface-sunken` (+ their 1 px `line` edge): the act stays marked and every
// card still reads raised over its stage (detail audit C13/D4; tokens only; `PAGE_NIGHT` below).
//   1. the flow diagram as a plain <ol> (vertical on phones, left to right from lg): Maya's tap → our relayer →
//      the Pot Hub (the emphasised node: a marigold top edge, a card top, never text) → two lanes (inside the
//      rules: approved instantly · bigger spends: one member's OK, or a majority) → the Pot pays out;
//   2. six fact cards (3 × 2 from lg); 3. the step-by-step explainer at chapter 4, the $84 spend (a secondary
//      button), and the hackathon credit.
// Precise and calm: thin `line-strong` connectors, aligned boxes, tabular numbers. No code font, no cubes, no glow,
// no chain-link icons, and no inline text links (Night `link` reads as marigold text).
// Motion (design-direction 04 §6): the flow <ol> is ONE sequence (motion/sequence.ts) that plays once at 35 % in
// view (below lg, as soon as its top passes 85 % of the screen; faster, up to 2×, when a quick scroll would carry
// "The Pot pays out" off screen first) and traces Maya's $84 spend: each node it reaches lights (a 2 px brand ring flashes, `lit`), each connector
// it crosses draws a brand trace over the plain one, the Hub's tile pops while it "checks", the trace takes the LEFT
// branch into "Inside the rules" ($84 is under the $100 limit; the group lane stays unlit), joins and pays out, and
// at 2.4 s every trace fades back (`out`), so the last frame is the server HTML's. 3.0 s in all. Reduced motion, no
// JS and a jump past it: the static diagram.
import "./play.css"
import { ArrowRight, Banknote, Check, Clock, ListChecks, Send } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"
import { Avatar } from "@/components/pot/Avatar"
import { buttonVariants } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { cn } from "@/lib/client/cn"
import { CHAT_CAST } from "./ChatThread"
import { Sequences } from "./motion/Sequences"
import { Section, SectionHead } from "./Section"

const FACTS = [
  { id: "dao", title: t("home.tech.dao.title"), body: t("home.tech.dao.body") },
  { id: "hub", title: t("home.tech.hub.title"), body: t("home.tech.hub.body") },
  { id: "majority", title: t("home.tech.majority.title"), body: t("home.tech.majority.body") },
  { id: "relayer", title: t("home.tech.relayer.title"), body: t("home.tech.relayer.body") },
  { id: "auth", title: t("home.tech.auth.title"), body: t("home.tech.auth.body") },
  { id: "money", title: t("home.tech.money.title"), body: t("home.tech.money.body") },
] as const

/** Only when the page itself is Night (html[data-theme=night]); inside the band, `dark:` would always match. */
const PAGE_NIGHT = {
  band: "[html[data-theme=night]_&]:bg-surface",
  card: "[html[data-theme=night]_&]:bg-surface-sunken",
  tile: "[html[data-theme=night]_&]:bg-surface",
  hover: "[html[data-theme=night]_&]:hover:bg-surface",
}

/** 2 px `line-strong` connector pieces (decorative). */
const LINE = "pointer-events-none absolute bg-line-strong"
const BRACKET = "pointer-events-none absolute border-line-strong"

/** The $84 trace's timeline (ms after the flow starts; 04 §6). */
const AT = { tap: 0, relay: 400, hub: 800, fork: 1400, instant: 1640, join: 1900, payout: 2140, out: 2400 } as const

export function UnderTheHood() {
  return (
    <Section id="tech" labelledBy="tech-title" band="night" className={cn("border-y border-line", PAGE_NIGHT.band)}>
      {/* the flow plays its one $84 trace once: at 35 % in view, and below lg once its top passes 85 % of the screen
          (the 512 px phone column needs the time to reach "The Pot pays out" on screen) */}
      <Sequences startLine={0.85} />
      <SectionHead id="tech-title" eyebrow={t("home.tech.eyebrow")} title={t("home.tech.title")} intro={t("home.tech.intro")} />

      <h3 id="tech-flow-title" className="text-label text-ink-muted">
        {t("home.tech.flow.label")}
      </h3>
      <ol aria-labelledby="tech-flow-title" className="mt-3 flex flex-col gap-4 lg:grid lg:grid-cols-5 lg:gap-6" data-tech-flow data-sequence>
        <FlowNode
          first
          at={AT.tap}
          icon={<Avatar person={CHAT_CAST.maya} size="md" />}
          title={t("home.tech.flow.tap.title")}
          body={t("home.tech.flow.tap.body")}
        />
        <FlowNode at={AT.relay} icon={<NodeIcon Icon={Send} />} title={t("home.tech.flow.relay.title")} body={t("home.tech.flow.relay.body")} />
        <FlowNode
          hub
          at={AT.hub}
          icon={
            // the hold IS the check: the tile pops while the node is lit (no typing dots: they belong to their words)
            <span data-seq="pop" data-scale=".85" data-at={AT.hub} className="grid shrink-0">
              <NodeIcon Icon={ListChecks} className="bg-brand-soft" />
            </span>
          }
          title={t("home.tech.flow.hub.title")}
          body={t("home.tech.flow.hub.body")}
        />
        <Lanes />
        <FlowNode
          short
          at={AT.payout}
          icon={<NodeIcon Icon={Banknote} />}
          title={t("home.tech.flow.payout.title")}
          body={t("home.tech.flow.payout.body")}
        />
      </ol>

      <ul className="mt-8 grid gap-3 md:grid-cols-2 lg:mt-10 lg:grid-cols-3 lg:gap-4">
        {FACTS.map((f) => (
          <li key={f.id} data-tech-fact={f.id} className={cn("rounded-md border border-line bg-surface p-4 lg:p-6", PAGE_NIGHT.card)}>
            <h3 className="font-display text-heading text-ink">{f.title}</h3>
            <p className="mt-2 text-body-sm text-ink-muted tabular-nums">
              <Unbroken text={f.body} />
            </p>
          </li>
        ))}
      </ul>

      <div
        className={cn(
          "mt-8 flex flex-col gap-4 rounded-md border border-line bg-surface p-4 md:p-6 lg:mt-10 lg:flex-row lg:items-center lg:justify-between lg:gap-8",
          PAGE_NIGHT.card,
        )}
      >
        <p className="max-w-144 text-body text-ink-muted">{t("home.tech.demo.body")}</p>
        {/* a real link styled as a secondary button (buttonVariants), never role="button" */}
        <Link
          href="/demo/4"
          // its arrow nudges 3 px on hover, like the final card's [Start a Pot →] (04 catalogue: links that carry an arrow)
          className={cn(buttonVariants({ variant: "secondary" }), "l-nudge w-full shrink-0 md:w-auto md:self-start lg:self-auto", PAGE_NIGHT.hover)}
        >
          {t("home.tech.demo.cta")}
          <ArrowRight aria-hidden strokeWidth={2} />
        </Link>
      </div>

      <div className="mt-6 flex flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3">
        <p className="text-label text-ink">{t("home.tech.built")}</p>
        <span aria-hidden className="hidden text-ink-muted sm:inline">
          ·
        </span>
        <p className="text-body-sm text-ink-muted">{t("home.tech.tracks")}</p>
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------------------------------------

/** Keeps "NEP-366", "1-of-1" and "per-method" whole: a hard hyphen is otherwise a line-break point. */
function Unbroken({ text }: { text: string }) {
  return text.split(/(\S+-\S+)/).map((part, i) =>
    i % 2 ? (
      <span key={i} className="whitespace-nowrap">
        {part}
      </span>
    ) : (
      part
    ),
  )
}

function NodeIcon({ Icon, className }: { Icon: typeof Send; className?: string }) {
  return (
    // a tile of its own colour (the Hub's brand-soft) keeps it in every theme
    <span className={cn("grid size-10 shrink-0 place-items-center rounded-pill bg-surface-sunken", className ?? PAGE_NIGHT.tile)}>
      <Icon aria-hidden className="size-5 text-ink" strokeWidth={2} />
    </span>
  )
}

/**
 * A brand trace over a connector: it draws from its start edge (down on phones, rightwards from lg) at `at`, then
 * fades back with every other trace at AT.out, leaving the plain connector (hidden in the final state: `out`).
 */
function Trace({ className, at, dur = 200 }: { className: string; at: number; dur?: number }) {
  return (
    <span aria-hidden data-seq="out" data-at={AT.out} data-dur={600} className={cn("pointer-events-none absolute", className)}>
      <span data-seq="draw-y" data-at={at} data-dur={dur} className="block size-full bg-brand lg:hidden" />
      <span data-seq="draw-x" data-at={at} data-dur={dur} className="hidden size-full bg-brand lg:block" />
    </span>
  )
}

/**
 * A brand copy of a rounded bracket, cut to the half the spend travels (`keep`, a clip-path inset) and revealed along
 * it from `from` (another inset) over `dur` at `at`; it fades back at AT.out. A clip, not a scale, so the rounded
 * corner never squashes.
 */
function BracketTrace({
  box,
  shape,
  keep,
  from,
  at,
  dur,
}: {
  box: string
  shape: string
  keep: string
  from: string
  at: number
  dur: number
}) {
  return (
    <span aria-hidden data-seq="out" data-at={AT.out} data-dur={600} className={cn("pointer-events-none absolute", box)}>
      <span
        data-seq="reveal"
        data-at={at}
        data-dur={dur}
        className={cn("block size-full border-brand", shape)}
        style={{ clipPath: keep, ["--seq-reveal-from" as string]: from }}
      />
    </span>
  )
}

/** The connector from the step before: above it on phones, on its left from lg. */
const connector = (short: boolean) =>
  cn(
    "left-1/2 w-0.5 -translate-x-1/2 lg:left-auto lg:h-0.5 lg:translate-x-0 lg:top-1/2 lg:-translate-y-1/2",
    short ? "-top-2 h-2 lg:-left-3 lg:w-3" : "-top-4 h-4 lg:-left-6 lg:w-6",
  )

/**
 * One step of the flow. Its connector comes from the step before it: above it on phones, on its left from lg.
 * `short`: the step after the two lanes, whose bracket already covers the first half of the gap.
 * `at`: when the $84 reaches it (it lights; its connector's trace draws in the 200 ms before).
 */
function FlowNode({
  icon,
  title,
  body,
  at,
  first = false,
  short = false,
  hub = false,
}: {
  icon: ReactNode
  title: string
  body: string
  at: number
  first?: boolean
  short?: boolean
  hub?: boolean
}) {
  return (
    <li className="relative flex rounded-md" data-seq="lit" data-at={at} data-flow-node>
      {!first && (
        <>
          <span aria-hidden className={cn(LINE, connector(short))} />
          {/* after the lanes the join's half-bracket takes the first 140 ms, then this short piece */}
          <Trace className={connector(short)} at={short ? AT.join + 120 : at - 200} dur={short ? 120 : 200} />
        </>
      )}
      <div
        className={cn(
          "flex w-full items-start gap-3 rounded-md border border-line bg-surface p-3 lg:flex-col lg:p-4",
          PAGE_NIGHT.card,
          // the marigold edge (a card top, never text) as an inset shadow, so the content lines up with the other
          // nodes (a 4 px top border pushed it 3 px down; detail audit C11)
          hub && "border-t-brand shadow-[inset_0_3px_0_var(--pot-brand)]",
        )}
        data-flow-hub={hub || undefined}
      >
        {icon}
        <div className="min-w-0">
          <p className="text-label text-balance text-ink tabular-nums">{title}</p>
          <p className="mt-0.5 text-body-sm text-ink-muted tabular-nums">
            <Unbroken text={body} />
          </p>
        </div>
      </div>
    </li>
  )
}

// the fork and the join, at each breakpoint (the plain connectors and their traces share these boxes)
const PHONE_STEM = "-top-4 left-1/2 h-2 w-0.5 -translate-x-1/2 lg:hidden"
const PHONE_FORK = { box: "-top-2 right-1/4 left-1/4 h-2 lg:hidden", shape: "rounded-t-sm border-x-2 border-t-2" }
const PHONE_JOIN = { box: "right-1/4 -bottom-2 left-1/4 h-2 lg:hidden", shape: "rounded-b-sm border-x-2 border-b-2" }
const WIDE_STEM = "top-1/2 -left-6 hidden h-0.5 w-3 -translate-y-1/2 lg:block"
const WIDE_FORK = { box: "top-1/4 bottom-1/4 -left-3 hidden w-3 lg:block", shape: "rounded-l-sm border-y-2 border-l-2" }
const WIDE_JOIN = { box: "top-1/4 -right-3 bottom-1/4 hidden w-3 lg:block", shape: "rounded-r-sm border-y-2 border-r-2" }

/** Step 4: the rules decide. Side by side on phones (a fork under the Hub), stacked in one column from lg. */
function Lanes() {
  return (
    <li className="relative grid grid-cols-2 gap-2 lg:grid-cols-1 lg:grid-rows-2" data-flow-node>
      {/* phones: stem + fork above, join below */}
      <span aria-hidden className={cn(LINE, PHONE_STEM)} />
      <span aria-hidden className={cn(BRACKET, PHONE_FORK.box, PHONE_FORK.shape)} />
      <span aria-hidden className={cn(BRACKET, PHONE_JOIN.box, PHONE_JOIN.shape)} />
      {/* lg: stem + fork on the left, join on the right */}
      <span aria-hidden className={cn(LINE, WIDE_STEM)} />
      <span aria-hidden className={cn(BRACKET, WIDE_FORK.box, WIDE_FORK.shape)} />
      <span aria-hidden className={cn(BRACKET, WIDE_JOIN.box, WIDE_JOIN.shape)} />
      {/* the $84's road: the stem, then the fork's half into "Inside the rules" (left on phones, top from lg); out of
          the lane, the join's same half back to the middle */}
      <Trace className={PHONE_STEM} at={AT.fork} dur={100} />
      <Trace className={WIDE_STEM} at={AT.fork} dur={100} />
      <BracketTrace {...PHONE_FORK} keep="inset(0 50% 0 0)" from="inset(0 50% 0 50%)" at={AT.fork + 80} dur={160} />
      <BracketTrace {...WIDE_FORK} keep="inset(0 0 50% 0)" from="inset(50% 0 50% 0)" at={AT.fork + 80} dur={160} />
      <BracketTrace {...PHONE_JOIN} keep="inset(0 50% 0 0)" from="inset(0 100% 0 0)" at={AT.join} dur={140} />
      <BracketTrace {...WIDE_JOIN} keep="inset(0 0 50% 0)" from="inset(0 0 100% 0)" at={AT.join} dur={140} />

      <Lane
        tone="instant"
        icon={
          <span data-seq="pop" data-scale=".5" data-at={AT.instant} className="grid shrink-0">
            <Check aria-hidden className="size-5 text-approved" strokeWidth={2} />
          </span>
        }
        title={t("home.tech.flow.instant.title")}
        body={t("home.tech.flow.instant.body")}
      />
      <Lane
        tone="group"
        icon={<Clock aria-hidden className="size-5 shrink-0 text-waiting" strokeWidth={2} />}
        title={t("home.tech.flow.group.title")}
        body={t("home.tech.flow.group.body")}
      />
    </li>
  )
}

function Lane({ tone, icon, title, body }: { tone: "instant" | "group"; icon: ReactNode; title: string; body: string }) {
  return (
    <div
      data-lane={tone}
      // only the $84's lane lights; the group lane is the other road
      data-seq={tone === "instant" ? "lit" : undefined}
      data-at={tone === "instant" ? AT.instant : undefined}
      className={cn(
        "relative flex min-w-0 flex-col gap-2 rounded-md border border-line p-3 lg:flex-row lg:items-start lg:gap-2.5",
        // brand-soft means "the rules did this": only the instant lane gets it
        tone === "instant" ? "bg-brand-soft" : cn("bg-surface", PAGE_NIGHT.card),
      )}
    >
      {icon}
      <div className="min-w-0">
        <p className="text-label text-ink">{title}</p>
        <p className="mt-0.5 text-body-sm text-ink-muted">{body}</p>
      </div>
    </div>
  )
}
