// The /demo tour (plan/design-direction/06 §2, §8.1): 14 steps in 5 parts, as plain data. No `@/` imports, so the
// Playwright specs and unit tests can import it as the one source of truth for step counts, taps and the burst.
// Each step names the dataset beats its phone shows (`[chapter, beat]`, 1-based, from app/demo/_data/demo-script.json),
// so no dataset change is needed: the server turns them into small per-step phone props (components/demo/TourPage.tsx).
//
// States: 0 = the cover, 1…14 = the steps, 15 = the end screen (TOUR_END).

export type TourPersona = "maya" | "sam" | "leo"
export type TourChapter = 1 | 2 | 3 | 4 | 5 | 6
export type TourPartN = 1 | 2 | 3 | 4 | 5
export type TourBeat = readonly [chapter: TourChapter, beat: number]

export interface TourPart {
  n: TourPartN
  /** "Start a Pot"… (`tour.p1`…`tour.p5`) */
  nameKey: `tour.p${TourPartN}`
  /** the dataset chapters whose NEAR detail this part's "Under the hood" holds */
  chapters: readonly TourChapter[]
  /** `demo.near.p1.summary`…: the hood's first-level summary (allowlisted) */
  summaryKey: `demo.near.p${TourPartN}.summary`
}

export interface TourStep {
  /** 1…14 */
  n: number
  part: TourPartN
  /** the phone's screen(s): one beat, or a sequence played in order (step 7: checking → approved → sent) */
  beats: readonly TourBeat[]
  /** who holds the phone (the "You're …" chip); matches the dataset beat's `you` */
  you: TourPersona
  /** the phone's own primary is marigold and live, and pressing it = Next. Also the "Done" / [Share link] a person
   *  would naturally tap on a result screen (steps 2, 7, 9, 11: polish after QA); only 5 and 14 have no button */
  tap: boolean
  /** Next waits MIN_CHECKING_MS on arrival ("Checking Pot rules…") */
  hold?: boolean
  /** the one marigold burst (first forward arrival only, never under reduced motion) */
  burst?: boolean
  /** the step opens on the beat's lock-screen push (`appBefore`) for PUSH_MS: the persona switch */
  push?: boolean
  captionKey: `tour.s${number}`
  /** the caption while Next is held (step 7: "…Pot checks the rules"), so it never runs ahead of the phone */
  holdCaptionKey?: `tour.s${number}.checking`
  /** reading budget for S3 (≤ 2 minutes over the whole walk) */
  budgetMs: number
}

export const TOUR_PARTS: readonly TourPart[] = [
  { n: 1, nameKey: "tour.p1", chapters: [1], summaryKey: "demo.near.p1.summary" },
  { n: 2, nameKey: "tour.p2", chapters: [2, 3], summaryKey: "demo.near.p2.summary" },
  { n: 3, nameKey: "tour.p3", chapters: [4], summaryKey: "demo.near.p3.summary" },
  { n: 4, nameKey: "tour.p4", chapters: [5], summaryKey: "demo.near.p4.summary" },
  { n: 5, nameKey: "tour.p5", chapters: [6], summaryKey: "demo.near.p5.summary" },
]

const STEP_MS = 6000

export const TOUR: readonly TourStep[] = [
  { n: 1, part: 1, beats: [[1, 2]], you: "maya", tap: true, captionKey: "tour.s1", budgetMs: STEP_MS },
  { n: 2, part: 1, beats: [[1, 8]], you: "maya", tap: true, captionKey: "tour.s2", budgetMs: STEP_MS },
  { n: 3, part: 2, beats: [[2, 1]], you: "leo", tap: true, captionKey: "tour.s3", budgetMs: STEP_MS },
  { n: 4, part: 2, beats: [[2, 8]], you: "leo", tap: true, captionKey: "tour.s4", budgetMs: STEP_MS },
  { n: 5, part: 2, beats: [[3, 7]], you: "leo", tap: false, captionKey: "tour.s5", budgetMs: STEP_MS },
  { n: 6, part: 3, beats: [[4, 1]], you: "maya", tap: true, captionKey: "tour.s6", budgetMs: STEP_MS },
  {
    n: 7,
    part: 3,
    beats: [
      [4, 2],
      [4, 7],
      [4, 9],
    ],
    you: "maya",
    tap: true,
    hold: true,
    burst: true,
    captionKey: "tour.s7",
    holdCaptionKey: "tour.s7.checking",
    budgetMs: STEP_MS + 1200,
  },
  { n: 8, part: 4, beats: [[5, 1]], you: "maya", tap: true, captionKey: "tour.s8", budgetMs: STEP_MS },
  { n: 9, part: 4, beats: [[5, 5]], you: "maya", tap: true, captionKey: "tour.s9", budgetMs: STEP_MS },
  { n: 10, part: 4, beats: [[5, 6]], you: "leo", tap: true, push: true, captionKey: "tour.s10", budgetMs: STEP_MS },
  { n: 11, part: 4, beats: [[5, 10]], you: "leo", tap: true, captionKey: "tour.s11", budgetMs: STEP_MS },
  { n: 12, part: 5, beats: [[6, 1]], you: "maya", tap: true, captionKey: "tour.s12", budgetMs: STEP_MS },
  { n: 13, part: 5, beats: [[6, 6]], you: "sam", tap: true, push: true, captionKey: "tour.s13", budgetMs: STEP_MS },
  { n: 14, part: 5, beats: [[6, 10]], you: "sam", tap: false, captionKey: "tour.s14", budgetMs: STEP_MS },
]

/** The cover's phone: the full Pot at $450 (director's answer 8). The end's: the closed Pot. */
export const TOUR_COVER_BEAT: TourBeat = [3, 7]
export const TOUR_END_BEAT: TourBeat = [6, 10]
export const TOUR_COVER_BUDGET_MS = STEP_MS
export const TOUR_END_BUDGET_MS = STEP_MS

export const TOUR_COVER = 0
export const TOUR_END = TOUR.length + 1
/** cover + 14 steps + end */
export const TOUR_STATES = TOUR.length + 2

/** Pacing (05 §5, 06 §2): the rules check holds Next 1.2 s; then approved (+ burst), then sent and the roll. */
export const MIN_CHECKING_MS = 1200
export const SEQUENCE_SENT_MS = 1800
/** the lock-screen push before the Approve sheet on steps 10 and 13 */
export const PUSH_MS = 1400

/** /demo/1…/demo/6 (the landing links /demo/4): the same tour, opened at the old chapter's first step (06 §3.8). */
export const TOUR_CHAPTER_START: Record<TourChapter, number> = { 1: 1, 2: 3, 3: 4, 4: 6, 5: 8, 6: 12 }

export function partOf(state: number): TourPart | null {
  const s = TOUR[state - 1]
  return s ? TOUR_PARTS[s.part - 1]! : state === TOUR_END ? TOUR_PARTS[4]! : null
}

/** The steps of a part, in order. */
export function stepsOfPart(part: TourPartN): readonly TourStep[] {
  return TOUR.filter((s) => s.part === part)
}

/**
 * An old `/demo/N#beat-k` link → the nearest tour step: the last step that shows chapter N at a beat ≤ k, else the
 * chapter's start step (director's answer 6).
 */
export function stepForLegacyBeat(chapter: TourChapter, beat: number): number {
  let best: number | null = null
  for (const s of TOUR) if (s.beats.some(([c, b]) => c === chapter && b <= beat)) best = s.n
  return best ?? TOUR_CHAPTER_START[chapter]
}
