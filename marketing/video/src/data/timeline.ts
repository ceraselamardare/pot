// The master timeline (director-owned). All values are frames at 60 fps on the 120 BPM grid (1 beat = 30 frames).
// `from` = scene start in the master video; `duration` = scene length; `voAt` = where the scene's VO clip starts,
// relative to the scene start. Scene components get their length from here and must not hard-code it.
// v1 (locked 2026-10-22 from the real VO takes): acts start on bar lines. Act 2 (reveal) 0:18, Act 3 0:24,
// Act 4 1:04, Act 5 1:18, end 1:24 (5040 f). Music sections are built on the same bars.
// v1.1: s11 +1 beat (the group approves the close), s12 −1 beat; s12 starts at 1:04.5 while the music's
// "Under the hood" section still starts at 1:04.0, right as s11's screen-off turns the frame Night.
// v1.2 (after review-1): s13 is 9 beats (270 f), so the film ends at 4950 f = 1:22.5 instead of 3 s of silence.
// v1.3 (after review-2): s13 is 8 beats (240 f): the film ends at 4920 f = 1:22.0, ~1 s after the outro chord fades.
// v2 (2026-11-03, brief/06-update-v2.md): the app's one-OK rules and the "And more" features. Act 3 keeps its window
// (1440 → 3870, 2430 f) and the music is unchanged; inside it: s07 330, s08 480, s09 540, s10 (one OK, new VO 4.985 s)
// 360, s10b-more (new, VO 4.893 s) 360, s11 360 (screen-off still on global 3840).
import { beats } from "../motion/time";

export type SceneId =
  | "s01-hook"
  | "s02-front"
  | "s03-chase"
  | "s04-options"
  | "s05-pivot"
  | "s06-reveal"
  | "s07-create"
  | "s08-join"
  | "s09-instant"
  | "s10-group"
  | "s10b-more"
  | "s11-close"
  | "s12-tech"
  | "s13-end";

export type SceneSpec = { id: SceneId; act: 1 | 2 | 3 | 4 | 5; from: number; duration: number; voAt: number };

// [id, act, length in beats, VO start in beats from the scene start]
const PLAN: Array<[SceneId, SceneSpec["act"], number, number]> = [
  ["s01-hook", 1, 6.5, 0.8], // 195 f; VO 24 → 188
  ["s02-front", 1, 3.5, 0.1], // 105 f; VO 3 → 98 (continuous shot with s03)
  ["s03-chase", 1, 7.5, 0], // 225 f; VO 0 → 173, then the "Leo is typing…" joke
  ["s04-options", 1, 11, 0.3], // 330 f; VO 9 → 328
  ["s05-pivot", 1, 7.5, 0.5], // 225 f; VO 15 → 193, push into the dot to the bar line
  ["s06-reveal", 2, 12, 1.5], // 360 f; frame 0 = bar 9 (0:18); VO 45 → 270
  ["s07-create", 3, 11, 0.8], // 330 f; 0:24; VO 24 → 258
  ["s08-join", 3, 16, 0.5], // 480 f; VO 15 → 449
  ["s09-instant", 3, 18, 0.5], // 540 f; VO 15 → 505
  ["s10-group", 3, 12, 0.5], // 360 f; one OK; VO 15 → 314
  ["s10b-more", 3, 12, 0.5], // 360 f; "And more"; VO 15 → 309
  ["s11-close", 3, 12, 0.5], // 360 f; VO 15 → 275; the group approves closing; screen-off on global 3840 → Act 4
  ["s12-tech", 4, 27, 1.5], // 810 f; 1:04.5; VO 45 → 724 (the music enters "Under the hood" at 1:04.0, as s11's screen goes Night)
  ["s13-end", 5, 8, 1], // 240 f; 1:18; VO 30 → 183; ends 1:22.0 (v1.3: the music's outro chord rings out by ~1:20.9)
];

export const SCENES: SceneSpec[] = (() => {
  let from = 0;
  return PLAN.map(([id, act, len, vo]) => {
    const s: SceneSpec = { id, act, from, duration: beats(len), voAt: beats(vo) };
    from += s.duration;
    return s;
  });
})();

export const TOTAL_FRAMES = SCENES.reduce((n, s) => n + s.duration, 0);

export const scene = (id: SceneId): SceneSpec => {
  const s = SCENES.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown scene ${id}`);
  return s;
};

/** Act start frames (bar lines) for music sections and grading. */
export const ACT_START = {
  1: 0,
  2: scene("s06-reveal").from,
  3: scene("s07-create").from,
  4: scene("s12-tech").from,
  5: scene("s13-end").from,
} as const;
