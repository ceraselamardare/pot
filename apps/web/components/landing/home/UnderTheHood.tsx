// Under the hood (#tech; plan/design-direction/03-landing.md §6): the architecture for judges in 30 seconds, and
// the only part of "/" that names the tech (every string is a `home.tech.*` key, the jargon lint's one exemption).
// A Night-scoped band (Section band="night" sets data-theme="night", so every token switches inside it in Day and
// Night alike). When the PAGE is Night too, a ground band would equal the page, so the band lifts one step to
// `surface` and its cards one more to `surface-sunken` (+ their 1 px `line` edge): the act stays marked and every
// card still reads raised over its stage (detail audit C13/D4; tokens only; `PAGE_NIGHT` below).
//   1. the flow diagram as a plain <ol> (vertical on phones, left to right from lg): Maya's tap → our relayer →
//      the Pot Hub (the emphasised node: a marigold top edge, a card top, never text) → two lanes (inside the
//      rules: approved instantly · bigger spends: one member's OK, or a majority) → the Pot pays out;
//   2. "Each part, up close" (design-direction 08): a bento of six cells in the flow's order, each the close-up of
//      the node above it (a playful title, one plain hook, the technical line with every key term, and a tiny visual
//      built from the app's own components in a `ground` well); 3. the step-by-step explainer at chapter 4, the $84
//      spend (a secondary button), and the hackathon credit.
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
import { ArrowRight, Banknote, Check, Clock, KeyRound, ListChecks, Send, X } from "lucide-react"
import Link from "next/link"
import { Fragment, type HTMLAttributes, type ReactNode } from "react"
import { MoneyText } from "@/components/money/MoneyText"
import { Avatar, avatarTint } from "@/components/pot/Avatar"
import { CoverTile } from "@/components/pot/CoverTile"
import { StatusChip } from "@/components/pot/StatusChip"
import { buttonVariants } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { cn } from "@/lib/client/cn"
import { dollars, type Micro } from "@/lib/client/money"
import { CHAT_CAST } from "./ChatThread"
import { Sequences } from "./motion/Sequences"
import { Section, SectionHead } from "./Section"

const { maya: MAYA, sam: SAM, leo: LEO } = CHAT_CAST
const POT = t("create.name.placeholder") // "Lisbon Trip"

/** The bento's parts, in the flow's order (each the close-up of the node above it), with their lg spans (3·3 / 4·2 /
 *  2·4: the person's side in halves, then the two richest visuals, the Hub's list and the money, on a diagonal). */
const PARTS = [
  { id: "auth", span: "lg:col-span-3", Visual: AuthVisual },
  { id: "relayer", span: "lg:col-span-3", Visual: RelayerVisual },
  { id: "hub", span: "lg:col-span-4", Visual: HubVisual },
  { id: "majority", span: "lg:col-span-2", Visual: MajorityVisual },
  { id: "dao", span: "lg:col-span-2", Visual: DaoVisual },
  { id: "money", span: "lg:col-span-4", Visual: MoneyVisual },
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

      {/* the path above, the parts here: one cell per stop, in the same order (rows at lg: 3·3 / 4·2 / 2·4) */}
      <h3 id="tech-parts-title" className="mt-8 text-label text-ink-muted lg:mt-10">
        {t("home.tech.parts.label")}
      </h3>
      <ul aria-labelledby="tech-parts-title" className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-6 lg:gap-4">
        {PARTS.map(({ id, span, Visual }) => (
          <li
            key={id}
            data-tech-fact={id}
            className={cn("@container/fact flex min-w-0 flex-col rounded-lg border border-line bg-surface p-4 md:p-6", PAGE_NIGHT.card, span)}
          >
            <h4 className="font-display text-heading text-ink">{t(`home.tech.${id}.title`)}</h4>
            {/* the plain hook a friend could repeat (balanced: two short sentences break between them) */}
            <p className="mt-2 text-body text-balance text-ink">{t(`home.tech.${id}.hook`)}</p>
            <p className="mt-1 text-body-sm text-ink-muted tabular-nums">
              <Unbroken text={t(`home.tech.${id}.body`)} />
            </p>
            {/* the well sits at the cell's foot, so the wells of a row line up along its bottom */}
            <div className="mt-auto pt-4">
              <Visual />
            </div>
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

// ---------------------------------------------------------------------------------------------------------
// Each part, up close (plan/design-direction/08-tech-bento.md): every visual is the product's own UI, built from
// tokens and real components, in a `ground` well (the band showing through; in a Night page the darkest step, so it
// still reads recessed). Names, ids and numbers are real or measured. No connectors, arrows, traces or `lit` rings
// (the flow owns the path), no brand-soft and no marigold, no code font. Inner layouts answer to the cell
// (@container/fact), not the viewport.

/** One image with one sentence (the mock-UI rule of 03): its inside is aria-hidden and inert. */
function Well({ id, label, children, ...rest }: { id: string; label: string; children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div role="img" aria-label={label} data-tech-visual={id} className="rounded-md border border-line bg-ground p-3" {...rest}>
      <div aria-hidden inert>
        {children}
      </div>
    </div>
  )
}

/** Maya's account: 0 NEAR, and the two keys it holds (the Pot, below, holds none). No account id: Maya is made up. */
function AuthVisual() {
  return (
    <Well id="auth" label={t("home.tech.auth.visual")}>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="flex items-center gap-2">
          <Avatar person={MAYA} size="sm" />
          <span className="font-display text-title whitespace-nowrap text-ink tabular-nums">{t("home.tech.auth.v.balance")}</span>
        </span>
        <span className="text-body-sm text-ink-muted">{t("home.tech.auth.v.balance_note")}</span>
      </p>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-body-sm text-ink">
        {[t("home.tech.auth.v.mpc"), t("home.tech.auth.v.device")].map((key) => (
          <span key={key} className="flex items-center gap-1.5">
            <KeyRound aria-hidden className="size-5 shrink-0 text-ink-muted" strokeWidth={2} />
            {key}
          </span>
        ))}
      </p>
    </Well>
  )
}

/**
 * The receipt for the $84 the flow just traced: who paid what. Three columns from @sm (the lg halves), rows below it
 * (label and payer on the left, the figure on the right; Maya's row under RefundTable's 2 px total rule). Always "≈",
 * never struck through or green: it's a receipt, not a state.
 */
function RelayerVisual() {
  const lines = [
    { what: t("home.tech.relayer.v.gas"), by: t("home.tech.relayer.v.gas_by"), value: t("home.tech.relayer.v.gas_value") },
    { what: t("home.tech.relayer.v.storage"), by: t("home.tech.relayer.v.storage_by"), value: t("home.tech.relayer.v.storage_value") },
  ]
  return (
    <Well id="relayer" label={t("home.tech.relayer.visual")}>
      <div className="flex flex-col gap-1.5 @sm/fact:grid @sm/fact:grid-cols-3 @sm/fact:gap-0">
        {lines.map((l, i) => (
          <ReceiptLine key={l.what} what={l.what} by={l.by} className={cn(i > 0 && "@sm/fact:border-l @sm/fact:pl-3", "@sm/fact:pr-3")}>
            <span className="tabular-nums">{l.value}</span>
          </ReceiptLine>
        ))}
        <ReceiptLine
          what={t("home.tech.relayer.v.person")}
          by={t("home.tech.relayer.v.person_by")}
          className="mt-0.5 border-t-2 border-line-strong pt-2 @sm/fact:mt-0 @sm/fact:border-t-0 @sm/fact:border-l @sm/fact:border-l-line @sm/fact:pt-0 @sm/fact:pl-3"
        >
          <MoneyText micro={0n} variant="inline" />
        </ReceiptLine>
      </div>
    </Well>
  )
}

/** One receipt line: a row (what · by … value) below @sm, a column (what / value / by) from it. */
function ReceiptLine({ what, by, className, children }: { what: string; by: string; className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-2 border-line @sm/fact:flex-col @sm/fact:items-start @sm/fact:justify-start @sm/fact:gap-0",
        className,
      )}
    >
      {/* a row's left side; from @sm its two words join the column, the payer last */}
      <span className="flex min-w-0 flex-wrap gap-x-2 @sm/fact:contents">
        <span className="text-body-sm text-ink @sm/fact:text-ink-muted">{what}</span>
        <span className="text-body-sm text-ink-muted @sm/fact:order-last">{by}</span>
      </span>
      {/* the figure: label type on its own 20 px line (an inline span would take the row's 24 px body line) */}
      <span className="shrink-0 text-label text-ink">{children}</span>
    </div>
  )
}

/**
 * The rulebot seat's whole job, as real content (no role="img": the list IS the fact): two labelled lists, side by
 * side from @lg (the lg wide cell), stacked below it. The check is `approved` because it means exactly that here; the
 * ✕ is ink-muted, not `declined`: these are permissions, not a request that failed. Icons decorative, words carry it.
 */
function HubVisual() {
  const groups = [
    {
      id: "tech-hub-yes",
      yes: true,
      label: t("home.tech.hub.v.yes"),
      items: [t("home.tech.hub.v.yes.rules"), t("home.tech.hub.v.yes.joins"), t("home.tech.hub.v.yes.one_ok"), t("home.tech.hub.v.yes.goal")],
    },
    { id: "tech-hub-no", yes: false, label: t("home.tech.hub.v.no"), items: [t("home.tech.hub.v.no.rules"), t("home.tech.hub.v.no.over")] },
  ]
  return (
    <div data-tech-visual="hub" className="grid gap-x-8 gap-y-3 rounded-md border border-line bg-ground p-3 @lg/fact:grid-cols-[auto_auto] @lg/fact:justify-start">
      {groups.map((g) => (
        <div key={g.id}>
          <p id={g.id} className="text-label text-ink">
            {g.label}
          </p>
          <ul aria-labelledby={g.id} className="mt-1.5 flex flex-col gap-1">
            {g.items.map((item) => (
              <li key={item} className="flex items-start gap-2 text-body-sm text-ink">
                {g.yes ? (
                  <Check aria-hidden className="size-5 shrink-0 text-approved" strokeWidth={2} />
                ) : (
                  <X aria-hidden className="size-5 shrink-0 text-ink-muted" strokeWidth={2} />
                )}
                <span>
                  <Unbroken text={item} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

/**
 * Closing Lisbon Trip, in the demo VoteMeter's look (components/demo/cards/Proposal.tsx; a landing copy, like
 * HowItWorks' CloseTable, because VoteMeter reads the demo's data types): approvals first, the "needs 2" rule, then
 * who is left. The bento's one motion (08 §6), once in view: Maya's badge (her own approval, counted when she asked),
 * Sam's, then the "Approved" chip; 1.02 s. The armed frame already shows the caption, the seats and "needs 2";
 * reduced motion, no JS and a jump past it show the final frame (the server HTML).
 */
function MajorityVisual() {
  return (
    <Well id="majority" label={t("home.tech.majority.visual", { pot: POT })} data-sequence>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="text-label text-ink">{t("home.tech.majority.v.caption", { pot: POT })}</p>
        <span data-seq="pop" data-scale=".6" data-at={660} className="flex shrink-0">
          <StatusChip status="approved" />
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Seat person={MAYA} at={0} />
        <Seat person={SAM} at={400} />
        <span className="flex items-center gap-1.5 text-body-sm text-ink">
          <span aria-hidden className="h-6 w-0.5 rounded-pill bg-ink" />
          {t("demo.proposal.needs", { k: 2 })}
        </span>
        <Seat person={LEO} />
      </div>
    </Well>
  )
}

/** A member's seat: approved (a check badge that pops at `at`) or not yet (a dashed ring). */
function Seat({ person, at }: { person: (typeof CHAT_CAST)[keyof typeof CHAT_CAST]; at?: number }) {
  const yes = at !== undefined
  return (
    <span className="relative inline-grid">
      <Avatar person={person} size="sm" className={cn(!yes && "outline-2 outline-offset-2 outline-line-strong outline-dashed")} />
      {yes ? (
        <span
          data-seq="pop"
          data-scale=".5"
          data-at={at}
          className="absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-pill bg-approved text-ground ring-2 ring-ground"
        >
          <Check aria-hidden className="size-3" strokeWidth={2} />
        </span>
      ) : null}
    </span>
  )
}

/** The Pot's real account (the reference Pot on the preview root: no keys, member ×3 + rulebot, global code by
 *  hash), as plain text: the Night band has no inline links. The id breaks only after its dots. */
function DaoVisual() {
  return (
    <Well id="dao" label={t("home.tech.dao.visual", { pot: POT })}>
      <div className="flex items-center gap-2">
        <CoverTile emoji="🇵🇹" cover={0} size="sm" />
        <div className="min-w-0 text-body-sm">
          <p className="text-ink">
            <DotBreaks value={t("home.tech.dao.v.account")} />
          </p>
          <p className="text-ink-muted">{t("home.tech.dao.v.code")}</p>
        </div>
      </div>
      {/* the Pot's keys (none: the pair of Maya's two) and its roles, as two stats that wrap when narrow */}
      <p className="mt-2 flex flex-wrap items-center justify-between gap-x-2 text-body-sm text-ink tabular-nums">
        <span className="flex items-center gap-1.5">
          <KeyRound aria-hidden className="size-5 shrink-0 text-ink-muted" strokeWidth={2} />
          {t("home.tech.dao.v.keys")}
        </span>
        <span>{t("home.tech.dao.v.roles")}</span>
      </p>
    </Well>
  )
}

/** An account id that wraps only after a dot (demo/Bits.tsx `Breaks`, kept local: the landing imports nothing from
 *  the demo). */
function DotBreaks({ value }: { value: string }) {
  const parts = value.split(".")
  return parts.map((p, i) => (
    <Fragment key={i}>
      <span className="whitespace-nowrap">{i < parts.length - 1 ? `${p}.` : p}</span>
      {i < parts.length - 1 ? <wbr /> : null}
    </Fragment>
  ))
}

/**
 * Pro rata as a picture: the "back" bar is cut exactly where the "put in" bar is (D-61's equal $150s, so equal
 * thirds), and the sentence above says the rule in words. People are their colours (member tints, eggplant figures,
 * 9.6-11:1); initials join the figures where a third has room (@sm). Nothing moves: How it works step 5 owns the
 * refund's roll; this cell is the rule, not the event.
 */
function MoneyVisual() {
  return (
    <Well id="money" label={t("home.tech.money.visual")}>
      <p className="text-body-sm text-ink">{t("home.tech.money.v.note")}</p>
      {/* labels beside the bars from @2xs (md and 390 up); above them in a 320 cell, so each third keeps room for $150.00 */}
      <div className="mt-2 grid gap-1 @2xs/fact:grid-cols-[auto_minmax(0,1fr)] @2xs/fact:items-center @2xs/fact:gap-x-2">
        <ShareBar label={t("close.table.put_in")} each={dollars(150)} />
        <ShareBar label={t("home.tech.money.v.back")} each={dollars(22)} />
      </div>
    </Well>
  )
}

function ShareBar({ label, each }: { label: string; each: Micro }) {
  return (
    <>
      <span className="text-body-sm text-ink-muted">{label}</span>
      <span className="flex gap-0.5 overflow-hidden rounded-sm">
        {[MAYA, SAM, LEO].map((p) => (
          <span
            key={p.id}
            className={cn("flex h-7 min-w-0 flex-1 items-center justify-center gap-1.5 text-body-sm font-semibold", avatarTint(p.joinIndex))}
          >
            <span className="hidden @sm/fact:inline">{p.initials}</span>
            <MoneyText micro={each} variant="inline" />
          </span>
        ))}
      </span>
    </>
  )
}
