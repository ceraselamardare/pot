"use client"
// The /demo tour's stage (06 §3): one viewport-high area. In DOM order (= reading and focus order): the header
// (lockup, [Skip to the end]), the strip ("You're …", "Part n of 5 · name", 5 segments), the caption, the phone,
// [← Back] [Next →], and the part's "Under the hood". Phones stack them (the hood row sits above the controls, under
// the thumb); from md the phone is the hero on the right and everything else is one column on the left. Below
// 656 px of height on phones (the phone would drop under 360 px) the stage stops being fixed-height and the page
// scrolls; nothing is sticky, so nothing is ever covered.
// Short phones (under 720 px of height, e.g. iPhone Safari with its toolbars at 390 × 664; polish after QA, F2): the
// chrome tightens (header 44, a 32 px strip row, the caption at 16/22, the hood row 32 with a 44 px hit area) and the
// phone is a shorter crop (390/640, like an SE), so it stays ≥ 240 px wide. The phone's size on phones comes from
// its box (a size container, demo.css), not from a guessed chrome height.
// The cover (state 0) and the end (state 15) reuse the same slots: the cover's [Show me how] and the end's
// [Start a real Pot] are the one marigold; on a tap step it is the phone's own primary, and Next stays secondary.
// The server HTML is the cover, with [Show me how] and [Skip to the end] as links into the story list below.
import { ArrowLeft, ArrowRight, Check, ChevronRight, FlaskConical, Layers, Pointer } from "lucide-react"
import Link from "next/link"
import type { Persona } from "@/app/demo/_data/types"
import { Lockup } from "@/components/brand/Lockup"
import { Avatar } from "@/components/pot/Avatar"
import { buttonVariants } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { cn } from "@/lib/client/cn"
import type { PersonVM } from "@/lib/client/mock/types"
import { tk } from "./copy"
import { partOf, stepsOfPart, TOUR, TOUR_COVER, TOUR_END, TOUR_PARTS } from "./tour"
import { captionKeyAt, showsTapHint, useTour } from "./TourPlayer"
import { TourPhone, type TourPhones } from "./TourPhone"

const SECONDARY = cn(buttonVariants({ variant: "secondary" }), "d-nudge min-h-12")
const PRIMARY = cn(buttonVariants({ variant: "primary" }), "d-nudge")
const END_LINES = ["tour.end.l1", "tour.end.l2", "tour.end.l3", "tour.end.l4", "tour.end.l5"] as const
const CAST: Persona[] = ["maya", "sam", "leo"]

// grid placement from md: rows = spacer / strip / caption / controls / hood / spacer; the phone spans them all
const LEFT = "md:order-none md:col-span-6 md:col-start-1 lg:col-span-5"
const PHONE_BOX = "md:order-none md:col-span-6 md:col-start-7 md:row-span-6 md:row-start-1 lg:col-span-7 lg:col-start-6"

export function Stage({ phones, people }: { phones: TourPhones; people: Record<Persona, PersonVM> }) {
  const p = useTour()
  const mode = p.at === TOUR_COVER ? "cover" : p.at === TOUR_END ? "end" : "step"
  const step = TOUR[p.at - 1] ?? null
  const part = partOf(p.at)
  const you = step ? people[step.you] : null
  const last = p.at === TOUR.length
  const captionKey = captionKeyAt(p)
  const hint = mode === "step" && p.hydrated && showsTapHint(p)

  return (
    <div
      data-tour-stage
      data-mode={mode}
      data-state={p.at}
      data-via={p.via}
      data-poke={p.pokes ? (p.pokes % 2 ? "a" : "b") : undefined}
      data-poke-to={p.pokes ? p.pokeTo : undefined}
      className="flex h-dvh flex-col max-md:[@media(max-height:40.99rem)]:h-auto max-md:[@media(max-height:40.99rem)]:min-h-dvh"
    >
      <header className="shrink-0 border-b border-line bg-ground">
        <div className="mx-auto flex h-14 w-full max-w-app items-center justify-between gap-3 px-4 md:px-6 lg:h-16 max-md:[@media(max-height:44.99rem)]:h-11">
          <Link href="/" aria-label={t("home.nav.home")} className="-ml-1 inline-flex min-h-11 shrink-0 items-center rounded-md px-1">
            <Lockup className="h-9 w-auto lg:h-10 max-md:[@media(max-height:44.99rem)]:h-8" />
          </Link>
          {mode === "end" ? null : p.hydrated ? (
            <button type="button" onClick={p.skip} className="-mr-2 inline-flex min-h-11 items-center rounded-md px-2 text-label text-ink hover:bg-surface-sunken" data-tour-skip>
              {t("tour.skip")}
            </button>
          ) : (
            <a href="#end" className="-mr-2 inline-flex min-h-11 items-center rounded-md px-2 text-label text-ink hover:bg-surface-sunken" data-tour-skip>
              {t("tour.skip")}
            </a>
          )}
        </div>
      </header>

      <main
        id="main"
        data-tour
        className="mx-auto flex min-h-0 w-full max-w-app flex-1 flex-col px-4 md:grid md:grid-cols-12 md:grid-rows-[minmax(0,1fr)_auto_auto_auto_auto_minmax(0,1fr)] md:gap-x-8 md:px-6 lg:gap-x-12"
      >
        {/* 1. the strip */}
        {step && you && part ? (
          <div
            className={cn(
              "order-1 grid shrink-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 pt-2 [grid-template-areas:'chip_part'_'bar_bar'] max-md:[@media(max-height:44.99rem)]:pt-1 md:row-start-2 md:grid-cols-1 md:gap-y-3 md:pt-0 md:[grid-template-areas:'part'_'bar'_'chip']",
              LEFT,
            )}
            data-tour-strip
          >
            <p className="inline-flex min-h-9 items-center gap-2 justify-self-start rounded-pill bg-surface py-1 pr-3 pl-1 shadow-card [grid-area:chip] max-md:[@media(max-height:44.99rem)]:min-h-8 max-md:[@media(max-height:44.99rem)]:py-0.5" data-tour-you={step.you}>
              <span key={step.you} className="d-pop grid">
                <Avatar person={you} size="sm" />
              </span>
              <span key={`${step.you}-t`} className="d-fade text-label whitespace-nowrap text-ink">
                {t("tour.you", { name: you.name })}
              </span>
            </p>
            <p className="flex min-h-11 items-center justify-end text-right text-body-sm text-balance text-ink-muted tabular-nums [grid-area:part] max-md:[@media(max-height:44.99rem)]:min-h-8 md:min-h-0 md:justify-start md:text-left md:text-label md:text-ink" data-tour-part={part.n}>
              {t("tour.part", { n: part.n, total: TOUR_PARTS.length, name: tk(part.nameKey) })}
            </p>
            <div
              role="progressbar"
              aria-label={t("tour.progress.label")}
              aria-valuemin={1}
              aria-valuemax={TOUR.length}
              aria-valuenow={step.n}
              aria-valuetext={t("tour.progress", { n: step.n, total: TOUR.length })}
              className="mt-1 grid grid-cols-5 gap-1 [grid-area:bar] md:mt-0"
              data-tour-progress
            >
              {TOUR_PARTS.map((pt) => {
                const steps = stepsOfPart(pt.n)
                const done = steps.filter((s) => s.n <= step.n).length
                return (
                  <span key={pt.n} className="h-1 overflow-hidden rounded-pill bg-line">
                    <span
                      className="block h-full origin-left rounded-pill bg-ink transition-transform duration-280 ease-standard motion-reduce:transition-none"
                      style={{ transform: `scaleX(${done / steps.length})` }}
                    />
                  </span>
                )
              })}
            </div>
          </div>
        ) : null}

        {/* 2. the caption (the cover's and the end's copy) */}
        <div className={cn("order-2 shrink-0 md:row-start-3", LEFT, mode === "step" ? "mt-2 max-md:[@media(max-height:44.99rem)]:mt-1 md:mt-6" : "mt-4 md:mt-0")} data-tour-copy>
          {mode === "cover" ? (
            <div key="cover" className="d-fade">
              <h1 tabIndex={-1} className="font-display text-title text-balance text-ink outline-none lg:text-balance-hero" data-tour-title>
                {t("tour.cover.title")}
              </h1>
              <p className="mt-2 text-body text-pretty text-ink md:mt-3">{t("tour.cover.body")}</p>
              <ul aria-label={t("tour.cast.label")} className="mt-3 flex flex-col gap-1.5 md:mt-5 md:gap-2" data-tour-cast>
                {CAST.map((who) => (
                  <li key={who} className="flex items-center gap-3">
                    <Avatar person={people[who]} size="sm" />
                    <span className="text-body-sm text-ink md:text-body">
                      <span className="font-semibold">{people[who].name}</span>
                      <span className="text-ink-muted"> · {t(`tour.cast.${who}`)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : mode === "end" ? (
            <div key="end" className="d-fade">
              <h1 tabIndex={-1} className="font-display text-title text-balance text-ink outline-none lg:text-balance-hero" data-tour-title>
                {t("tour.end.title")}
              </h1>
              <ul className="mt-4 flex flex-col gap-3 md:mt-6" data-tour-end-lines>
                {END_LINES.map((k) => (
                  <li key={k} className="flex items-start gap-3 text-body text-pretty text-ink">
                    <Check aria-hidden className="mt-0.5 size-5 shrink-0 text-ink" strokeWidth={2} />
                    {t(k)}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <h1 className="sr-only">{t("tour.cover.title")}</h1>
              {/* keyed by the hold too: step 7's "checking" caption gives way to the approval with the phone */}
              <div key={`${p.at}-${p.holding}`} className="d-swap min-h-18 max-md:[@media(max-height:44.99rem)]:min-h-[4.125rem] md:min-h-24">
                <p className="text-center text-body text-pretty text-ink max-md:[@media(max-height:44.99rem)]:leading-[1.375rem] md:text-left lg:font-display lg:text-heading" data-tour-caption={step!.n} data-tour-caption-key={captionKey ?? undefined}>
                  {t(captionKey as "tour.s1")}
                </p>
                {p.simLine ? (
                  <p className="mt-1.5 flex items-start justify-center gap-1.5 text-left text-body-sm text-ink-muted md:justify-start" data-tour-sim>
                    <FlaskConical aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
                    {t("tour.sim")}
                  </p>
                ) : null}
                {hint ? (
                  <p className="d-fade mt-1 flex items-start justify-center gap-1.5 text-left text-body-sm text-ink-muted md:mt-2 md:justify-start" data-tour-tap-hint>
                    <Pointer aria-hidden className="d-point mt-0.5 size-4 shrink-0" strokeWidth={2} />
                    {t("tour.tap_hint")}
                  </p>
                ) : null}
              </div>
            </>
          )}
        </div>

        {/* 3. the phone */}
        <div
          className={cn(
            "order-3 flex min-h-0 flex-1 items-center justify-center py-2 md:h-full md:py-6",
            PHONE_BOX,
            mode === "end" && "max-md:hidden",
            mode === "cover" && "max-md:py-3",
            mode === "step" && "max-md:[@media(max-height:44.99rem)]:pt-1 max-md:[@media(max-height:44.99rem)]:pb-1.5",
          )}
          data-tour-phone-box
        >
          <TourPhone
            phones={phones}
            people={people}
            className={cn(
              // on a step below md, demo.css sizes the phone from its box ([data-tour-phone-box]); these are the cover's
              "aspect-[390/720] max-h-full w-[min(100%,21rem,calc((100dvh-var(--tour-chrome))*0.5417))] md:aspect-[390/800] md:w-[min(100%,calc(min(40rem,100dvh-10rem)*0.4875))]",
              // the cover's phone keeps a 14rem floor (its screen would reflow narrower than a phone below it) and is
              // cropped by its box instead: on a 390 × 664 Safari viewport it shows the Pot's top half, not a squeezed one
              mode === "cover" && "max-md:max-h-[min(40dvh,calc(100dvh-25.5rem))] max-md:min-w-[min(100%,14rem)]",
              "max-md:[@media(max-height:40.99rem)]:w-[12.2rem]",
            )}
          />
        </div>

        {/* 4. the controls */}
        <div
          className={cn(
            "order-5 shrink-0 pb-[calc(0.5rem+env(safe-area-inset-bottom))] md:row-start-4 md:mt-6 md:pb-0",
            mode === "end" && "max-md:mt-6",
            LEFT,
          )}
          data-tour-controls
        >
          {mode === "cover" ? (
            <>
              {p.hydrated ? (
                <button type="button" onClick={() => p.next("next")} className={cn(PRIMARY, "w-full md:w-auto")} data-tour-start>
                  {t("tour.cover.start")}
                  <ArrowRight aria-hidden strokeWidth={2} />
                </button>
              ) : (
                <a href="#story" className={cn(PRIMARY, "w-full md:w-auto")} data-tour-start>
                  {t("tour.cover.start")}
                  <ArrowRight aria-hidden strokeWidth={2} />
                </a>
              )}
              <p className="mt-2 flex items-start gap-1.5 text-body-sm text-ink-muted md:mt-4" data-tour-sim>
                <FlaskConical aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
                {t("tour.sim")}
              </p>
            </>
          ) : mode === "end" ? (
            <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
              <Link href="/pots?sheet=create" className={cn(PRIMARY, "w-full md:w-auto")} data-tour-cta>
                {t("tour.end.cta")}
                <ArrowRight aria-hidden strokeWidth={2} />
              </Link>
              <p className="text-body-sm text-pretty text-ink-muted md:order-last md:basis-full" data-tour-note>
                {t("tour.end.note")}
              </p>
              <Link href="/" className={cn(SECONDARY, "w-full md:w-auto")} data-tour-home>
                {t("tour.end.home")}
              </Link>
            </div>
          ) : (
            <div className="flex gap-2 md:gap-3">
              <button
                type="button"
                onClick={() => p.back()}
                disabled={!p.hydrated || p.at <= 1}
                aria-keyshortcuts="ArrowLeft"
                aria-label={t("tour.back")}
                className={cn(SECONDARY, "size-12 shrink-0 p-0 [--l-nudge:-3px_0] md:w-auto md:px-5")}
                data-tour-back
              >
                <ArrowLeft aria-hidden strokeWidth={2} />
                <span aria-hidden className="hidden md:inline">
                  {t("tour.back")}
                </span>
              </button>
              <button
                type="button"
                onClick={() => p.next()}
                aria-disabled={p.holding || undefined}
                aria-describedby={p.holding ? "tour-checking" : undefined}
                aria-keyshortcuts="ArrowRight"
                className={cn(SECONDARY, "min-w-0 flex-1 md:min-w-40 md:flex-none", p.holding && "cursor-progress opacity-50")}
                data-tour-next
              >
                {last ? t("tour.finish") : t("tour.next")}
                <ArrowRight aria-hidden strokeWidth={2} />
              </button>
              <span id="tour-checking" hidden>
                {t("tour.checking")}
              </span>
            </div>
          )}
        </div>

        {/* 5. this part's "Under the hood" (never open by default, never needed) */}
        {part && p.hydrated ? (
          <div
            className={cn(
              "flex shrink-0 justify-center md:row-start-5 md:mt-6 md:justify-start md:border-t md:border-line md:pt-3",
              mode === "end" ? "order-6 max-md:mt-3" : "order-4 max-md:[@media(max-height:44.99rem)]:mb-1.5",
              LEFT,
            )}
            data-tour-hood-row
          >
            <button
              type="button"
              onClick={() => p.openHood(part.n)}
              aria-haspopup="dialog"
              aria-expanded={p.hoodOpen && p.hoodPart === part.n}
              aria-describedby="tour-hood-hint"
              className="relative -mx-2 inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-body-sm text-ink-muted hover:bg-surface-sunken hover:text-ink max-md:[@media(max-height:44.99rem)]:min-h-8 max-md:[@media(max-height:44.99rem)]:before:absolute max-md:[@media(max-height:44.99rem)]:before:inset-x-0 max-md:[@media(max-height:44.99rem)]:before:-inset-y-1.5 max-md:[@media(max-height:44.99rem)]:before:content-['']"
              data-tour-hood-trigger={part.n}
            >
              <Layers aria-hidden className="size-4" strokeWidth={2} />
              {t("tour.hood.label")}
              <ChevronRight aria-hidden className="size-4" strokeWidth={2} />
            </button>
            <span id="tour-hood-hint" hidden>
              {t("tour.hood.hint")}
            </span>
          </div>
        ) : null}

        <p aria-live="polite" aria-atomic="true" className="sr-only" data-tour-live>
          {p.spoken}
        </p>
      </main>
    </div>
  )
}
