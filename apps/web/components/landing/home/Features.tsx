// "What else a Pot can do" (#more; plan/design-direction/07-site-update.md §3): after the core loop (How it works)
// and the feel of the rules (Try the rules), four more things a Pot does, in one glance, before "Is it safe?". Each is
// a feature that is on in the production config today (hub 1.2 + FLAG_GIFTS), named the way the app names it, so the
// visitor recognises it later: Trust grows (create.trust.label) · All or nothing (create.target.aon.label) · Ask
// anyone to pay in (payin.title) · Send by link (settings.sending). The lines are `home.features.*`, in the app's
// own words (create.rules.intro + create.trust.hint, create.target.aon.hint, payin.intro, rules.change.links.hint).
// Calm on purpose: four quiet cells on `ground` with hairline rules, no cards (Trust, next, has cards), no tiles
// behind the icons (Trust's are sunken circles), no buttons, links, chips, stickers, brand-soft or marigold, and no
// motion (04 keeps Trust still, and this block too).
//  - below 360 px: one column, a `line` rule above each cell;
//  - from 360 px: 2 × 2, a 1 px `line` rule between the columns; md: the same with 24 px of air;
//  - lg: one row of four under the head, divided by 1 px rules (the first cell flush left, the last flush right).
// Icons: Lucide at 24 px, stroke 2, `ink`, decorative. Never a check (it means "approved"), padlocks, shields, coins,
// piggy banks, chain links or chat bubbles (03, 07 §3.6).
import { QrCode, Send, Sprout, Target } from "lucide-react"
import { t } from "@/i18n/t"
import { cn } from "@/lib/client/cn"
import { Section, SectionHead } from "./Section"

const FEATURES = [
  { id: "trust", Icon: Sprout, title: t("create.trust.label"), body: t("home.features.trust") },
  { id: "goal", Icon: Target, title: t("create.target.aon.label"), body: t("home.features.goal") },
  { id: "payin", Icon: QrCode, title: t("payin.title"), body: t("home.features.payin") },
  { id: "links", Icon: Send, title: t("settings.sending"), body: t("home.features.links") },
] as const

/** Each cell's padding and rules by its place (explicit per cell: an odd/even variant would outrank lg's padding). */
function cell(i: number) {
  const left = i % 2 === 0
  return cn(
    "min-w-0 border-t border-line py-4 md:py-6",
    // 2 × 2: the left column keeps the page's edge, the right one starts after the rule between them
    left ? "xs:pr-3 md:pr-6" : "xs:border-l xs:pl-3 md:pl-6",
    // lg: one row; every cell after the first has a rule on its left
    i > 0 && "lg:border-l",
    i === 0 ? "lg:pr-6 lg:pl-0" : i === FEATURES.length - 1 ? "lg:pr-0 lg:pl-6" : "lg:px-6",
  )
}

export function Features() {
  return (
    <Section id="more" labelledBy="more-title">
      <SectionHead id="more-title" eyebrow={t("home.features.eyebrow")} title={t("home.features.title")} />
      <ul className="grid border-b border-line xs:grid-cols-2 lg:grid-cols-4" data-features>
        {FEATURES.map(({ id, Icon, title, body }, i) => (
          <li key={id} data-feature={id} className={cell(i)}>
            <Icon aria-hidden className="size-6 text-ink" strokeWidth={2} />
            <h3 className="mt-3 text-label text-ink">{title}</h3>
            <p className="mt-1 text-body-sm text-ink-muted">{body}</p>
          </li>
        ))}
      </ul>
    </Section>
  )
}
