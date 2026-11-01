// Trust (plan/design-direction/03-landing.md §5): "is it safe?" answered by the product's trust sentence (the H2
// and its body), the two lanes of money out as the app's own status chips, and three short facts.
// Phones: the head, the chips, then one card with three rows. lg: the head on the left (7 of 12) with the chips
// on the right, then three fact cards in a row (Wise's pattern).
// No padlocks, shields or "bank-grade" claims: the proof is behavioural. No check icons on the facts either,
// because a check means "approved" in this product. The chips repeat the body sentence, so they are aria-hidden.
// Motion (plan/design-direction/04-landing-motion.md §5): none. This section answers "is it safe?", and a calm page is
// part of the answer: the chips don't pop (that would repeat the playground) and the fact cards have no hover (they
// aren't links).
import { LinkIcon, LogIn, Split } from "lucide-react"
import { MoneyText } from "@/components/money/MoneyText"
import { Avatar } from "@/components/pot/Avatar"
import { StatusChip } from "@/components/pot/StatusChip"
import { t } from "@/i18n/t"
import { dollars } from "@/lib/client/money"
import { approvalsNeeded } from "@/lib/client/rules"
import { CHAT_CAST } from "./ChatThread"
import { Section, SectionHead } from "./Section"

const K = approvalsNeeded(3) // 2 of 3; Maya's own approval is the first

const FACTS = [
  { id: "google", Icon: LogIn, title: t("home.trust.google.title"), body: t("home.trust.google.body") },
  { id: "install", Icon: LinkIcon, title: t("home.trust.install.title"), body: t("home.trust.install.body") },
  { id: "back", Icon: Split, title: t("home.trust.back.title"), body: t("home.trust.back.body") },
] as const

/** The two lanes of money out, with the story's two spends (Maya's $84 groceries, her $300 boat trip). */
const PROOF = [
  { id: "instant", reason: t("spend.reason.chip.groceries"), amount: dollars(84), status: "approved", word: t("spend.approved") },
  { id: "group", reason: t("home.trust.proof.boat"), amount: dollars(300), status: "needs", word: t("approve.progress", { count: 1, k: K }) },
] as const

export function Trust() {
  return (
    <Section labelledBy="trust-title">
      <div className="lg:grid lg:grid-cols-12 lg:items-end lg:gap-8">
        <SectionHead
          id="trust-title"
          eyebrow={t("home.trust.eyebrow")}
          title={t("home.trust.title")}
          intro={t("home.trust.body")}
          className="mb-4 lg:col-span-6 lg:mb-0"
        />
        {/* phones: the two chips in a row; lg: each chip on its spend's row, on a sunken stage. In Night the stage
            can't sink below the page (ground is the darkest token, and Night's surface-sunken is LIGHTER than the
            surface rows, which made them look like holes): it becomes a ground well with a hairline, and the
            surface rows on it read as raised. */}
        <ul
          inert
          aria-hidden
          className="flex flex-wrap gap-2 lg:col-span-6 lg:flex-col lg:flex-nowrap lg:rounded-lg lg:bg-surface-sunken lg:p-3 lg:dark:bg-ground lg:dark:ring-1 lg:dark:ring-line lg:dark:ring-inset"
        >
          {PROOF.map((p) => (
            <li key={p.id} className="lg:flex lg:min-h-14 lg:items-center lg:gap-3 lg:rounded-md lg:bg-surface lg:px-3 lg:py-2.5">
              <span className="hidden lg:contents">
                <Avatar person={CHAT_CAST.maya} size="sm" />
                <span className="min-w-0 flex-1 truncate text-body text-ink">{p.reason}</span>
                <MoneyText micro={p.amount} className="text-ink" />
              </span>
              <StatusChip status={p.status} className="tabular-nums lg:min-w-45">
                {p.word}
              </StatusChip>
            </li>
          ))}
        </ul>
      </div>

      <ul className="mt-6 divide-y divide-line rounded-lg bg-surface shadow-card lg:mt-8 lg:grid lg:grid-cols-3 lg:gap-6 lg:divide-y-0 lg:rounded-none lg:bg-transparent lg:shadow-none">
        {FACTS.map(({ id, Icon, title, body }) => (
          <li key={id} data-trust-fact={id} className="flex gap-4 p-4 lg:flex-col lg:gap-4 lg:rounded-lg lg:bg-surface lg:p-6 lg:shadow-card">
            <span className="grid size-10 shrink-0 place-items-center rounded-pill bg-surface-sunken">
              <Icon aria-hidden className="size-5 text-ink" strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <h3 className="text-label text-ink">{title}</h3>
              <p className="mt-1 text-body-sm text-ink-muted">{body}</p>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  )
}
