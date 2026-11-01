// The problem (design-direction 03 §2): the "before", so no stickers and no marigold. Card 1 is the hook, a mini
// group chat where Maya asks Leo for his $150 on day 2 and again on day 23, and "Leo is typing…" never becomes
// a payment (the punchline under it carries the joke in plain HTML). Cards 2 and 3 say why the usual fixes fail,
// each with a neutral verdict pill (Lucide x in ink-muted: these aren't Pot states, and red means "Not
// approved" here). Then the pivot line, with the logo's three dots resting above it.
//  - 390: three stacked cards, the chat card first.
//  - lg: the chat card in cols 1-7, the other two stacked in cols 8-12, the pivot centred under them.
// The chat is one image (role="img" + home.problem.front.chat.label); its bubbles are aria-hidden + inert.
// Motion (design-direction 04 §2): card 1 is one sequence that plays once when 35 % of it is in view: "Day 2", Maya
// asks (120 ms), then the gap that is the joke (three weeks) before "Day 23" (640), "Leo??" (760), "Seen" (1060),
// Leo's row (1260) and "Leo is typing…" (1360); his dots start at 1460 and stop for good within 4.8 s; the punchline
// lands last (1660). The heads, cards 2 and 3, the pills and the pivot stay still. The server HTML is the final
// frame: no JS, reduced motion and a jump past it show it at once (the toolkit's engine arms it only below the fold).
import { X } from "lucide-react"
import { Glyph } from "@/components/brand/Glyph"
import { TypingDots } from "@/components/feedback/TypingDots"
import { Avatar } from "@/components/pot/Avatar"
import { t } from "@/i18n/t"
import { cn } from "@/lib/client/cn"
import { CHAT_CAST } from "./ChatThread"
import { Sequences } from "./motion/Sequences"
import { Section, SectionHead } from "./Section"
import { TypingInView } from "./TypingInView"

const CARD = "rounded-lg bg-surface p-4 shadow-card md:p-6"

export function Problem() {
  return (
    <Section id="problem" labelledBy="problem-title">
      <Sequences />
      <SectionHead id="problem-title" eyebrow={t("home.problem.eyebrow")} title={t("home.problem.title")} />

      <div className="grid gap-3 lg:grid-cols-12 lg:gap-6">
        <article data-sequence className={cn(CARD, "lg:col-span-7")}>
          <h3 className="font-display text-heading text-ink">{t("home.problem.front.title")}</h3>
          <p className="mt-1 text-body-sm text-ink-muted">{t("home.problem.front.body")}</p>
          <FrontChat />
          <p data-seq="fade" data-at="1660" className="mt-4 text-body text-ink">
            {t("home.problem.front.punchline")}
          </p>
        </article>

        <div className="grid gap-3 lg:col-span-5 lg:gap-6">
          <Verdict title="home.problem.split.title" body="home.problem.split.body" verdict="home.problem.split.verdict" />
          <Verdict title="home.problem.shared.title" body="home.problem.shared.body" verdict="home.problem.shared.verdict" />
        </div>
      </div>

      <div className="mt-12 flex flex-col items-center text-center">
        <Glyph className="h-auto w-12" />
        <p className="mt-4 max-w-[18em] font-display text-title text-balance text-ink">{t("home.problem.pivot")}</p>
      </div>
    </Section>
  )
}

function Verdict({
  title,
  body,
  verdict,
}: {
  title: "home.problem.split.title" | "home.problem.shared.title"
  body: "home.problem.split.body" | "home.problem.shared.body"
  verdict: "home.problem.split.verdict" | "home.problem.shared.verdict"
}) {
  return (
    <article className={cn(CARD, "flex flex-col")}>
      <h3 className="font-display text-heading text-ink">{t(title)}</h3>
      <p className="mt-1 text-body-sm text-ink-muted lg:mb-6">{t(body)}</p>
      <p className="mt-4 inline-flex items-center gap-1.5 self-start rounded-pill bg-surface-sunken py-1 pr-3 pl-2 text-label text-ink lg:mt-auto">
        <X aria-hidden className="size-4 shrink-0 text-ink-muted" strokeWidth={2} />
        {t(verdict)}
      </p>
    </article>
  )
}

/** The mini chat: Day 2 → Maya asks; Day 23 → "Leo??", Seen; Leo is still typing. Each line carries its beat
 *  (data-seq + data-at, ms from the card's start); messages rise from their tail (bottom-left), as in a messenger. */
function FrontChat() {
  return (
    <TypingInView delay={1460} className="mt-4">
      <div role="img" aria-label={t("home.problem.front.chat.label")} className="rounded-md bg-surface-sunken p-3 md:p-4">
        <div aria-hidden inert className="flex flex-col gap-2">
          <DayTag n={2} data-seq="fade" />
          <Bubble from={CHAT_CAST.maya} data-seq="fade-up" data-at="120" data-scale=".96">
            {t("home.problem.front.chat.ask")}
          </Bubble>
          <DayTag n={23} data-seq="fade" data-at="640" className="mt-2" />
          <Bubble from={CHAT_CAST.maya} data-seq="fade-up" data-at="760" data-scale=".96">
            {t("home.problem.front.chat.nudge")}
          </Bubble>
          <p data-seq="fade" data-at="1060" className="-mt-1 pl-10 text-body-sm text-ink-muted">
            {t("home.problem.front.chat.seen")}
          </p>
          <div data-seq="fade-up" data-at="1260" data-scale=".96" className="mt-1 flex origin-bottom-left items-center gap-2">
            <Avatar person={CHAT_CAST.leo} size="sm" />
            <span className="inline-flex h-9 items-center rounded-[1.125rem] rounded-bl-md bg-surface px-3.5 text-ink-muted">
              <TypingDots size="sm" />
            </span>
            <span data-seq="fade" data-at="1360" className="rounded-sm bg-member-3 px-1.5 py-0.5 text-body-sm font-semibold text-on-brand">
              {t("home.problem.front.chat.typing")}
            </span>
          </div>
        </div>
      </div>
    </TypingInView>
  )
}

type Beat = Omit<React.HTMLAttributes<HTMLElement>, "children" | "className">

function DayTag({ n, className, ...beat }: { n: number; className?: string } & Beat) {
  return (
    <p {...beat} className={cn("flex justify-center", className)}>
      <span className="rounded-pill bg-surface px-2.5 py-0.5 text-body-sm text-ink-muted tabular-nums">
        {t("home.problem.front.chat.day", { n })}
      </span>
    </p>
  )
}

function Bubble({ from, children, ...beat }: { from: (typeof CHAT_CAST)[keyof typeof CHAT_CAST]; children: React.ReactNode } & Beat) {
  return (
    <div {...beat} className="flex origin-bottom-left items-end gap-2">
      <Avatar person={from} size="sm" />
      <div className="max-w-[17rem] min-w-0 rounded-[1.125rem] rounded-bl-md bg-surface px-3 pt-1.5 pb-2">
        <p className="text-body-sm font-semibold text-ink">{from.name}</p>
        <p className="text-body text-ink">{children}</p>
      </div>
    </div>
  )
}
