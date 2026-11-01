// The /demo tour's server composition (06 §7.4, §8.1): the stage (its server HTML is the cover), the "Under the
// hood" sheet, and the story list. The list is the whole story without JS (AI judges, curl): per part a heading, a
// phone at the part's last screen, an <ol> of its steps (<li id="step-n">), and a closed <details> "Under the hood"
// with the decoded cards, real testnet links and glossary. Then the end: the five lines, [Start a real Pot] and
// [Back to home]. With JS the list is hidden (the stage plays it) and each part's hood content moves into the sheet
// while it is open. The phones get small per-step props computed here: the client never loads the dataset.
import "./demo.css"
import { ArrowRight, Check, Layers } from "lucide-react"
import Link from "next/link"
import { Suspense } from "react"
import type { AppScene } from "@/app/demo/_data/types"
import { buttonVariants } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { cn } from "@/lib/client/cn"
import { HoodStack, peopleVMs, phoneStory } from "./Chapter"
import { tk } from "./copy"
import { CHAPTERS, getChapter, sceneAt } from "./data"
import { HoodSheet, HoodSlot, TourStory } from "./HoodSheet"
import { JsMark } from "./JsMark"
import { Stage } from "./Stage"
import { partOf, stepsOfPart, TOUR, TOUR_COVER_BEAT, TOUR_END_BEAT, TOUR_PARTS, type TourBeat, type TourChapter } from "./tour"
import { TourPlayer } from "./TourPlayer"
import { StaticPhone, type TourPhones, type TourPhoneStep, type TourScene } from "./TourPhone"

const frameOf = ([c, b]: TourBeat): TourScene => ({ scene: sceneAt(getChapter(c), b - 1), chapter: c })

function beforeOf([c, b]: TourBeat): AppScene | undefined {
  return getChapter(c).beats[b - 1]?.appBefore
}

function single(beat: TourBeat): TourPhoneStep {
  const c = getChapter(beat[0])
  return { frames: [frameOf(beat)], you: c.beats[beat[1] - 1]!.you, tap: false }
}

export function tourPhones(): TourPhones {
  return {
    cover: single(TOUR_COVER_BEAT),
    end: single(TOUR_END_BEAT),
    steps: TOUR.map((s) => ({ frames: s.beats.map(frameOf), before: s.push ? beforeOf(s.beats[0]!) : undefined, you: s.you, tap: s.tap })),
    stories: Object.fromEntries(CHAPTERS.map((n) => [n, phoneStory(getChapter(n))])) as TourPhones["stories"],
  }
}

const END_LINES = ["tour.end.l1", "tour.end.l2", "tour.end.l3", "tour.end.l4", "tour.end.l5"] as const

/** The no-JS story (06 §7.4). Its [Start a real Pot] is drawn secondary: the cover's [Show me how] above is the
 *  page's one marigold while both are on screen (the stage's own end screen draws it marigold). */
function TourList({ people, initialPart }: { people: ReturnType<typeof peopleVMs>; initialPart: number }) {
  return (
    <div className="mx-auto w-full max-w-app px-4 pt-10 pb-16 md:px-6">
      <h2 id="story-title" className="font-display text-title text-ink">
        {t("tour.list.title")}
      </h2>
      {TOUR_PARTS.map((part) => {
        const steps = stepsOfPart(part.n)
        const lastBeat = steps[steps.length - 1]!.beats.at(-1)!
        const c = getChapter(lastBeat[0])
        return (
          <section key={part.n} aria-labelledby={`story-part-${part.n}`} className="mt-10 border-t border-line pt-8" data-tour-list-part={part.n}>
            <h3 id={`story-part-${part.n}`} className="font-display text-heading text-ink">
              {t("tour.list.part", { n: part.n, name: tk(part.nameKey) })}
            </h3>
            <div className="mt-4 flex flex-col gap-6 md:grid md:grid-cols-[18rem_minmax(0,1fr)] md:items-start lg:gap-10">
              <div className="flex justify-center">
                <StaticPhone scene={sceneAt(c, lastBeat[1] - 1)} story={phoneStory(c)} you={c.beats[lastBeat[1] - 1]!.you} people={people} />
              </div>
              <ol className="flex flex-col gap-4">
                {steps.map((s) => (
                  <li key={s.n} id={`step-${s.n}`} className="flex scroll-mt-6 gap-3" data-tour-step={s.n}>
                    <span className="grid size-7 shrink-0 place-items-center rounded-pill bg-surface-sunken text-body-sm font-semibold text-ink tabular-nums">{s.n}</span>
                    <p className="text-body text-pretty text-ink">{tk(s.captionKey)}</p>
                  </li>
                ))}
              </ol>
            </div>
            <details id={part.n === initialPart ? "near" : undefined} className="group/h mt-6 rounded-lg border border-line" data-tour-hood={part.n}>
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg px-4 py-2 text-label text-ink hover:bg-surface-sunken [&::-webkit-details-marker]:hidden">
                <Layers aria-hidden className="size-4 shrink-0" strokeWidth={2} />
                {t("tour.hood.label")}
              </summary>
              <div className="p-2 pt-0 md:p-3 md:pt-0">
                {/* its own boundary: React hydrates the stage first and each hood in a later chunk */}
                <Suspense>
                  <HoodSlot part={part.n}>
                    <HoodStack part={part} />
                  </HoodSlot>
                </Suspense>
              </div>
            </details>
          </section>
        )
      })}
      <section id="end" aria-labelledby="story-end" className="mt-10 border-t border-line pt-8" data-tour-list-end>
        <h3 id="story-end" className="font-display text-title text-ink">
          {t("tour.end.title")}
        </h3>
        <ul className="mt-4 flex flex-col gap-3">
          {END_LINES.map((k) => (
            <li key={k} className="flex items-start gap-3 text-body text-ink">
              <Check aria-hidden className="mt-0.5 size-5 shrink-0" strokeWidth={2} />
              {t(k)}
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Link href="/pots?sheet=create" className={cn(buttonVariants({ variant: "secondary" }), "d-nudge")} data-tour-list-cta>
            {t("tour.end.cta")}
            <ArrowRight aria-hidden strokeWidth={2} />
          </Link>
          <Link href="/" className={buttonVariants({ variant: "ghost" })}>
            {t("tour.end.home")}
          </Link>
          <p className="text-body-sm text-ink-muted sm:basis-full">{t("tour.end.note")}</p>
        </div>
      </section>
    </div>
  )
}

/** /demo and /demo/1…6: the same tour. `initial` is the state it opens at (0 = the cover). */
export function TourPage({ initial, chapter }: { initial: number; chapter: TourChapter | null }) {
  const people = peopleVMs()
  return (
    <div data-demo className="bg-ground">
      <JsMark />
      <TourPlayer initial={initial} chapter={chapter}>
        <Stage phones={tourPhones()} people={people} />
        <HoodSheet />
        <TourStory>
          {/* no boundary around the list itself: React outlines a large finished boundary (its content is sent
              hidden at the end of the body and swapped in by a script), so without JS #story would be empty */}
          <TourList people={people} initialPart={partOf(initial)?.n ?? 1} />
        </TourStory>
      </TourPlayer>
    </div>
  )
}
