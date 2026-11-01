// The /demo NEAR layer's server composition (05 §4, 06 §4-§5): the decoded cards of a chapter, as
//  - HoodStack: one tour part's "Under the hood" (06 §4.2): the summary, the cards stacked in dataset order (each
//    group led by its 05 caption, no timeline), the real testnet links, the glossary and a link to /demo/all;
//  - HoodPane: one chapter's full Night panel with the beat timeline, for /demo/all (DemoAll), the technical read.
// Plus what the phones need, computed here so the client never loads the dataset.
import { ArrowRight, Layers } from "lucide-react"
import Link from "next/link"
import type { AppScene, Card, Chapter, Persona, WhoPaid as WhoPaidRow } from "@/app/demo/_data/types"
import { t } from "@/i18n/t"
import { cn } from "@/lib/client/cn"
import type { PersonVM } from "@/lib/client/mock/types"
import { PAGE_NIGHT, SimBanner, SimChip } from "./Bits"
import { WhoPaid } from "./cards/Sent"
import { ProposalCard } from "./cards/Proposal"
import { ReceiptRoute } from "./cards/Route"
import { InviteSigCard, SignedCard, signedTitle } from "./cards/Signed"
import { SentCard } from "./cards/Sent"
import { BalancesCard, BeforeCard, GlossaryList, InterludeCard, NoteCard, Recap, RealOne, RulesCard, StateCard } from "./cards/Misc"
import { tk } from "./copy"
import { beatCards, CHAPTERS, getChapter, lastRouteBeat, PERSONAS, personaOf, personVM, sceneAt, SCRIPT, signedBeat, tappedAt, txById, usdcOf } from "./data"
import { DemoFrame } from "./Frame"
import { Rich } from "./Rich"
import type { PhoneStory } from "./Scenes"
import { BeatSlot, YouChip } from "./Slots"
import { TOUR_PARTS, type TourPart } from "./tour"
import { StaticPhone } from "./TourPhone"

export function peopleVMs(): Record<Persona, PersonVM> {
  return Object.fromEntries(PERSONAS.map((p) => [p, personVM(p)])) as Record<Persona, PersonVM>
}

// ---------------------------------------------------------------------------------------------------------
// What the phone needs (computed here, so the client never loads the dataset)

const EXPIRY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(Date.UTC(2026, 10, 14))

export function phoneStory(c: Chapter): PhoneStory {
  const pot = SCRIPT.ids.pot
  const personas = (accounts: string[] | undefined) => (accounts ?? []).map(personaOf).filter((p): p is Persona => p !== null)
  const ledger = Object.fromEntries(PERSONAS.map((p) => [p, { contributed: "0", instantUsed: "0" }])) as PhoneStory["ledger"]
  for (const m of c.before.pot?.members ?? []) {
    const p = personaOf(m.account)
    if (p) ledger[p] = { contributed: m.contributed, instantUsed: m.instantUsed }
  }
  const spend = c.beats.map((b) => b.app).find((s) => s?.scene === "spend")
  const requesterBeat = c.beats.find((b) => b.app?.scene === "spend")
  const closing = c.beats.some((b) => b.app?.scene === "close")
  const refunds = closing
    ? (c.before.pot?.members ?? []).map((m) => ({
        persona: personaOf(m.account)!,
        putIn: m.contributed,
        back: String(usdcOf(c.after.balances, m.account) - usdcOf(c.before.balances, m.account)),
      }))
    : []
  return {
    potName: SCRIPT.pot.name,
    emoji: SCRIPT.pot.emoji,
    potBefore: String(usdcOf(c.before.balances, pot)),
    potAfter: String(usdcOf(c.after.balances, pot)),
    goal: String(150_000_000n * 3n),
    membersBefore: personas(c.before.dao?.members),
    membersAfter: personas(c.after.dao?.members),
    ledger,
    request: spend?.scene === "spend" ? { amount: spend.amount, category: spend.category, requester: requesterBeat?.you ?? "maya" } : null,
    refunds,
    expiry: EXPIRY,
  }
}

/** Every dataset beat's phone screen (the unit test's jargon guard walks them all). */
export interface PhoneBeat {
  scene: AppScene
  /** a screen shown first on this beat (the push that opens the sheet) */
  before?: AppScene
  you: Persona
  /** the tap happened: the screen shows its busy state */
  tapped: boolean
  /** the screen's primary is this beat's tap */
  tap: boolean
}

export function phoneBeats(c: Chapter): PhoneBeat[] {
  return c.beats.map((b, i) => ({ scene: sceneAt(c, i), before: b.appBefore, you: b.you, tapped: tappedAt(c, i), tap: !!b.tap }))
}

// ---------------------------------------------------------------------------------------------------------
// The hood

function cardTitle(c: Chapter, card: Card): string {
  switch (card.type) {
    case "signed":
      return signedTitle(txById(c, card.tx)!)
    case "invite":
      return t("demo.card.invite")
    case "sent":
      return t("demo.card.sent")
    case "route":
      return t("demo.card.route")
    case "rules":
      return t("demo.card.rules")
    case "proposal":
      return t("demo.card.proposal", { id: card.id })
    case "state":
      return t("demo.card.state")
    case "balances":
      return t("demo.card.balances")
    case "note":
      return card.key === "demo.interlude" ? t("demo.interlude.title") : t("demo.card.note")
  }
}

/** One card. `prefix` makes its ids unique on the page; `gloss` is the prefix of the glossary its terms link to. */
function CardView({ c, card, i, k, prefix, gloss = prefix }: { c: Chapter; card: Card; i: number; k: number; prefix: string; gloss?: string }) {
  const id = `${prefix}b${i + 1}-c${k}`
  const b = c.beats[i]!
  switch (card.type) {
    case "signed":
      return <SignedCard id={id} tx={txById(c, card.tx)!} />
    case "invite":
      return <InviteSigCard id={id} message={card.message} publicKey={card.publicKey} signature={card.signature} param={card.param} />
    case "sent": {
      const s = signedBeat(c, card.tx)
      return <SentCard id={id} tx={txById(c, card.tx)!} signedAnchor={s >= 0 ? `${prefix}beat-${s + 1}` : null} />
    }
    case "route": {
      const tx = txById(c, card.tx)!
      const rows = b.receipts?.tx === card.tx ? b.receipts.rows : tx.receipts.filter((r) => !r.refund).map((r) => r.n)
      return <ReceiptRoute card id={id} tx={tx} rows={rows} showRefunds={lastRouteBeat(c, card.tx) === i || b.receipts?.tx !== card.tx} />
    }
    case "rules":
      return <RulesCard id={id} rows={card.rows} path={card.path} reason={card.reason} />
    case "proposal":
      return <ProposalCard id={id} proposal={card.proposal} meter={card.meter} members={c.before.dao?.members ?? c.after.dao?.members ?? []} />
    case "state":
      return <StateCard id={id} before={c.before} after={c.after} />
    case "balances":
      return <BalancesCard id={id} chapter={c} />
    case "note":
      return <NoteCard id={id} k={card.key} anchorPrefix={gloss} />
  }
}

/** The chapter's who-paid: one row per account and kind, summed (the person's "nothing" stays one row). */
function mergeWhoPaid(rows: WhoPaidRow[]): WhoPaidRow[] {
  const out = new Map<string, WhoPaidRow>()
  for (const r of rows) {
    const k = `${r.account}|${r.what}`
    const cur = out.get(k)
    if (!cur) {
      out.set(k, { ...r })
      continue
    }
    const yocto = BigInt(cur.yocto) + BigInt(r.yocto)
    out.set(k, { ...cur, yocto: String(yocto), near: (Number(yocto) / 1e24).toFixed(4), approx: cur.approx || r.approx })
  }
  return [...out.values()]
}

export function HoodPane({ c, prefix = "" }: { c: Chapter; prefix?: string }) {
  const row = SCRIPT.recap.rows.find((r) => r.n === c.n)!
  const shownTypes = new Set(c.beats.flatMap((b) => beatCards(b).map((x) => x.type)))
  const allWhoPaid = mergeWhoPaid(c.txs.flatMap((x) => x.whoPaid))
  return (
    <section
      data-theme="night"
      id={`${prefix}hood`}
      aria-labelledby={`${prefix}hood-title`}
      className={cn("@container/hood min-w-0 rounded-lg border border-line bg-ground p-4 text-ink lg:p-6", PAGE_NIGHT.panel)}
      data-hood
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${prefix}hood-title`} className="flex items-center gap-2 font-display text-title text-ink">
          <Layers aria-hidden className="size-6" strokeWidth={2} />
          {t("demo.pane.hood")}
        </h2>
        <SimChip />
      </div>
      <ul aria-label={t("demo.summary.label")} className="mt-3 flex flex-wrap gap-2 text-body-sm text-ink tabular-nums" data-summary>
        {[
          t("demo.summary.signatures", { n: row.signatures }),
          t("demo.summary.transactions", { n: row.transactions }),
          t("demo.summary.receipts", { n: row.receipts }),
          t("demo.summary.near"),
        ].map((s) => (
          <li key={s} className={cn("rounded-pill bg-surface px-3 py-1", PAGE_NIGHT.card)}>
            {s}
          </li>
        ))}
      </ul>

      <div className="mt-5 flex flex-col gap-3">
        <BeforeCard id={`${prefix}before`} chapter={c} />
        <InterludeCard id={`${prefix}interlude`} chapter={c} />
      </div>

      <h3 className="mt-6 mb-3 text-label text-ink-muted">{t("demo.timeline.label")}</h3>
      <ol className="flex flex-col" data-timeline>
        {c.beats.map((b, i) => {
          const cards = beatCards(b)
          const routeTx = cards.find((x) => x.type === "route")
          const extraRoute = b.receipts && !(routeTx && "tx" in routeTx && routeTx.tx === b.receipts.tx) ? b.receipts : null
          const label = b.pane === "app" ? t("demo.timeline.app") : cards[0] ? cardTitle(c, cards[0]) : t("demo.card.route")
          return (
            <BeatSlot key={b.id} i={i} total={c.beats.length} id={`${prefix}${b.id}`} pane={b.pane} label={label}>
              <p className="text-body text-pretty text-ink" data-caption={b.captionKey} data-step-caption>
                <Rich text={tk(b.captionKey)} anchorPrefix={prefix} />
              </p>
              {cards.map((card, k) => (
                <CardView key={k} c={c} card={card} i={i} k={k} prefix={prefix} />
              ))}
              {extraRoute ? (
                <ReceiptRoute
                  card
                  id={`${prefix}b${i + 1}-route`}
                  tx={txById(c, extraRoute.tx)!}
                  rows={extraRoute.rows}
                  showRefunds={lastRouteBeat(c, extraRoute.tx) === i}
                />
              ) : null}
            </BeatSlot>
          )
        })}
      </ol>

      <After c={c} prefix={prefix} shownTypes={shownTypes} allWhoPaid={allWhoPaid} />

      <div className="mt-8 flex flex-col gap-3">
        <RealOne id={`${prefix}real`} links={c.real} />
        <GlossaryList ids={c.glossary} prefix={prefix} />
      </div>
    </section>
  )
}


/** The chapter's After block: state and balances (unless a step already showed them) and who paid. */
function After({ c, prefix, shownTypes, allWhoPaid }: { c: Chapter; prefix: string; shownTypes: Set<string>; allWhoPaid: WhoPaidRow[] }) {
  return (
    <section aria-labelledby={`${prefix}after-title`} className="mt-8 flex flex-col gap-3" data-after-section>
      <h3 id={`${prefix}after-title`} className="font-display text-heading text-ink">
        {t("demo.after.title")}
      </h3>
      {!shownTypes.has("state") ? <StateCard id={`${prefix}after-state`} before={c.before} after={c.after} /> : null}
      {!shownTypes.has("balances") ? <BalancesCard id={`${prefix}after-balances`} chapter={c} /> : null}
      <div className={cn("rounded-md border border-line bg-surface px-4 pb-4 md:px-5", PAGE_NIGHT.card)}>
        <WhoPaid rows={allWhoPaid} className="border-0 p-0 pt-4" />
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------------------------------------
// The tour's hood (06 §4.2): one part, its chapters' cards stacked

/** The glossary ids of a part's chapters, in first-use order, once each. */
export function partGlossary(part: TourPart): string[] {
  return [...new Set(part.chapters.flatMap((n) => getChapter(n).glossary))]
}

function ChapterStack({ c, gloss, titled }: { c: Chapter; gloss: string; titled: boolean }) {
  const prefix = `c${c.n}-`
  const shownTypes = new Set(c.beats.flatMap((b) => beatCards(b).map((x) => x.type)))
  return (
    <section aria-labelledby={`${prefix}stack-title`} className="flex flex-col gap-3" data-hood-chapter={c.n}>
      <h4 id={`${prefix}stack-title`} className={titled ? "font-display text-heading text-ink" : "sr-only"}>
        {tk(`demo.c${c.n}.title`)}
      </h4>
      {c.n === 1 ? <BeforeCard id={`${prefix}before`} chapter={c} /> : null}
      <InterludeCard id={`${prefix}interlude`} chapter={c} />
      {c.beats.map((b, i) => {
        const cards = beatCards(b)
        const routeTx = cards.find((x) => x.type === "route")
        const extraRoute = b.receipts && !(routeTx && "tx" in routeTx && routeTx.tx === b.receipts.tx) ? b.receipts : null
        if (!cards.length && !extraRoute) return null
        return (
          <div key={b.id} id={`${prefix}${b.id}`} className="flex scroll-mt-24 flex-col gap-3" data-hood-group={i + 1}>
            <p className="mt-2 text-body text-pretty text-ink" data-caption={b.captionKey}>
              <Rich text={tk(b.captionKey)} anchorPrefix={gloss} />
            </p>
            {cards.map((card, k) => (
              <CardView key={k} c={c} card={card} i={i} k={k} prefix={prefix} gloss={gloss} />
            ))}
            {extraRoute ? (
              <ReceiptRoute card id={`${prefix}b${i + 1}-route`} tx={txById(c, extraRoute.tx)!} rows={extraRoute.rows} showRefunds={lastRouteBeat(c, extraRoute.tx) === i} />
            ) : null}
          </div>
        )
      })}
      <After c={c} prefix={prefix} shownTypes={shownTypes} allWhoPaid={mergeWhoPaid(c.txs.flatMap((x) => x.whoPaid))} />
    </section>
  )
}

/** One part's "Under the hood": Night-scoped, every card closed to its first level, the raw JSON a click away. */
export function HoodStack({ part }: { part: TourPart }) {
  const gloss = `p${part.n}-`
  const chapters = part.chapters.map(getChapter)
  return (
    <div data-theme="night" data-hood data-hood-part={part.n} className={cn("@container/hood min-w-0 rounded-lg border border-line bg-ground p-4 text-ink lg:p-6", PAGE_NIGHT.panel)}>
      <p className="text-body text-pretty text-ink" data-hood-summary>
        {tk(part.summaryKey)}
      </p>
      <h3 className="mt-6 mb-3 flex items-center gap-2 text-label text-ink-muted">
        <Layers aria-hidden className="size-4" strokeWidth={2} />
        {t("demo.near.steps")}
      </h3>
      <div className="flex flex-col gap-8">
        {chapters.map((c) => (
          <ChapterStack key={c.n} c={c} gloss={gloss} titled={chapters.length > 1} />
        ))}
      </div>
      <div className="mt-8 flex flex-col gap-3">
        <RealOne id={`${gloss}real`} links={chapters.flatMap((c) => c.real)} />
        <GlossaryList ids={partGlossary(part)} prefix={gloss} />
      </div>
      {part.n === TOUR_PARTS.length ? <Recap className="mt-10" /> : null}
      <Link href="/demo/all" className="d-nudge mt-6 inline-flex min-h-11 items-center gap-1.5 text-label text-ink underline decoration-line-strong underline-offset-4" data-hood-all>
        {t("demo.near.all")}
        <ArrowRight aria-hidden className="size-4" strokeWidth={2} />
      </Link>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------
// /demo/all: the technical read

function ChapterHead({ c, people }: { c: Chapter; people: Record<Persona, PersonVM> }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h3 id={`c${c.n}-title`} className="font-display text-title text-balance text-ink">
          {tk(`demo.c${c.n}.title`)}
        </h3>
        <YouChip yous={c.beats.map((b) => b.you)} people={people} />
      </div>
      <p className="max-w-176 text-body text-pretty text-ink" data-aha>
        <Rich text={tk(`demo.c${c.n}.aha`)} />
      </p>
    </div>
  )
}

/** /demo/all, "How Pot works on NEAR (simulation)" (06 §5.2): the five parts in order, every chapter in its final
 *  state with its full timeline open, then the recap, the CLI block and every glossary word. For judges and print. */
export function DemoAll() {
  const people = peopleVMs()
  const allWords = [...new Set(CHAPTERS.flatMap((n) => getChapter(n).glossary))]
  return (
    <DemoFrame>
      <main id="main" className="mx-auto w-full max-w-app px-4 pt-6 pb-16 md:px-6">
        <h1 className="font-display text-title text-ink">{t("demo.all.title")}</h1>
        <SimBanner className="mt-4" />
        {TOUR_PARTS.map((part) => (
          <section key={part.n} aria-labelledby={`part-${part.n}-title`} className="mt-12 border-t border-line pt-8" data-all-part={part.n}>
            <h2 id={`part-${part.n}-title`} className="font-display text-title text-ink">
              {t("tour.list.part", { n: part.n, name: tk(part.nameKey) })}
            </h2>
            <p className="mt-2 max-w-176 text-body text-pretty text-ink" data-hood-summary>
              {tk(part.summaryKey)}
            </p>
            {part.chapters.map((n) => {
              const c = getChapter(n)
              const last = c.beats.length - 1
              return (
                <section key={n} aria-labelledby={`c${n}-title`} className="mt-8" data-all-chapter={n}>
                  <p className="text-label text-ink-muted">{t("demo.chapter.of", { n })}</p>
                  <div className="mt-2">
                    <ChapterHead c={c} people={people} />
                  </div>
                  <div className="mt-5 flex flex-col gap-6 md:grid md:grid-cols-[18rem_minmax(0,1fr)] md:items-start lg:grid-cols-[20rem_minmax(0,1fr)] lg:gap-10">
                    <div className="flex justify-center md:sticky md:top-20">
                      <StaticPhone scene={sceneAt(c, last)} story={phoneStory(c)} you={c.beats[last]!.you} people={people} className="w-[min(100%,20rem)]" />
                    </div>
                    <div className="min-w-0">
                      <HoodPane c={c} prefix={`c${n}-`} />
                    </div>
                  </div>
                </section>
              )
            })}
          </section>
        ))}
        <Recap className="mt-16" />
        <div className="mt-8" data-theme="night">
          <div className={cn("@container/hood rounded-lg border border-line bg-ground p-4 text-ink md:p-6", PAGE_NIGHT.panel)}>
            <GlossaryList ids={allWords} prefix="all-" title={t("demo.all.glossary")} />
          </div>
        </div>
      </main>
    </DemoFrame>
  )
}
