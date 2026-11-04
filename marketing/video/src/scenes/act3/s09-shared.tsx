// Builder D shared helpers for s09-instant and s10-group (Act 3 hero moments).
// - UI: measured in-screen rects (390 × 844 phone screen, safe areas 50 / 34) of everything the two scenes press,
//   lift or aim at. Re-measure with `node src/scenes/act3/preview-d/measure.mjs` if the UI kit changes.
// - Projection: the exact CSS 3D chain of the shared world (Stage3D perspective 2600 → Camera → WorldPhone layer),
//   so the camera can frame a point of a phone screen precisely and 2D overlays can track 3D points.
// - tickValue(): the MoneyRoll "tick" schedule, so an in-phone balance shows the same values as the big roll.
// - BigType: the house kinetic type (WordRise) in the TypeZone, with per-word marigold highlight sweeps.
// - WorldSticker: a die-cut sticker popping beside a phone, living in world space (moves with the camera).
import React from "react";
import { Img, staticFile, useCurrentFrame } from "remotion";
import { day } from "../../brand/tokens";
import {
  DirectionalBlur,
  HighlightBar,
  Layer,
  StickerPop,
  WordRise,
  cameraAt,
  exit as exitEase,
  land,
  lerp,
  punch,
  ramp,
  snap,
  voLanding,
  type CameraKey,
  type CameraPose,
  type TimedWord,
} from "../../motion";
import { STICKERS, type StickerName } from "../../data/stickers";
import { voWord } from "../../data/vo";
import type { SceneId } from "../../data/timeline";
import { PHONE_H, SCREEN_W, SCREEN_H } from "../../ui";
import { CAM, PHONE_HOME, PHONE_SCALE, PersonaPill, WORLD } from "../shared/world";

// ─── Measured UI rects (screen coordinates inside the phone) ────────────────────
type R = { x: number; y: number; w: number; h: number };
const r = (x: number, y: number, w: number, h: number): R => ({ x, y, w, h });
/** Centre of a rect. */
export const mid = (q: R) => ({ x: q.x + q.w / 2, y: q.y + q.h / 2 });

export const UI = {
  // PotScreen (app of Nov 3: round actions, compact feed, tab bar with your Pot dollars), scrollY 0
  potHero: r(16, 122, 358, 302.38),
  potBalance: r(32, 158, 156.16, 54),
  /** The round Spend action (56 px circle); its label sits under it. */
  potActionSpend: r(125.75, 326.38, 56, 56),
  /** The first compact row under "Today" (feedAfterGroceries: the groceries row; feedAfterBoat: the boat row). */
  feedFirstRow: r(16, 536.38, 358, 70.97),
  /** The status chip in that row: "✓ One OK" (feedAfterBoat). */
  feedFirstChipOneOk: r(80, 572.69, 81.94, 24),
  /** The tab bar's third tab ("$84.00", your Pot dollars). */
  tabBalance: r(260, 754, 130, 56),
  // SpendSheet step "howMuch": amount, decision line (✓ / ✋ + ⓘ), [Next], keypad
  howAmount: r(146.84, 280, 96.28, 48),
  howDecision: r(16, 404, 358, 52),
  howNext: r(16, 486, 358, 52),
  key: {
    "1": r(16, 550, 114, 56),
    "2": r(138, 550, 114, 56),
    "3": r(260, 550, 114, 56),
    "4": r(16, 614, 114, 56),
    "5": r(138, 614, 114, 56),
    "6": r(260, 614, 114, 56),
    "7": r(16, 678, 114, 56),
    "8": r(138, 678, 114, 56),
    "9": r(260, 678, 114, 56),
    "0": r(138, 742, 114, 56),
  } as Record<string, R>,
  // SpendSheet step "details" (decision closed): chips, Who gets paid, the note, footer (decision, ask, Back)
  detTitle: r(16, 274, 314, 24),
  detChipGroceries: r(16, 388, 141.91, 48),
  /** Tickets once the chip row is scrolled to it (chipsScrollX 245). */
  detChipTickets: r(214.91, 388, 124.72, 48),
  detPayeeMe: r(20, 488, 116.66, 44),
  detNote: r(12, 552, 166, 44),
  detDecision: r(16, 626, 358, 52),
  detCta: r(16, 690, 358, 52),
  /** The same with the decision's ⓘ panel open (the sheet grows 98 px upward). */
  detOpenTitle: r(16, 176, 314, 24),
  detOpenDecision: r(16, 528, 358, 150),
  // SpendSheet results
  checkingResult: r(16, 663.63, 358, 164.38),
  approvedCapsule: r(16, 764, 358, 64),
  /** The typing dots inside the checking capsule (3 × 8 px, 4 px gaps, after 16 px padding). */
  checkingDots: r(32, 792, 32, 8),
  sentCapsule: r(16, 560, 358, 64),
  sentResult: r(16, 459.63, 358, 256.38),
  sentRow: r(20, 644, 350, 28),
  sentDone: r(16, 746, 358, 52),
  oneOkSentResult: r(16, 485.63, 358, 230.38),
  oneOkSentStatus: r(16, 586, 358, 86),
  // LockScreen (stackTop 330): the one-OK push (two body lines)
  lockPush: r(8, 330, 374, 102),
  // ApproveSheet (Leo, one OK)
  approveOneOk: r(16, 385.38, 358, 84),
  approveCta: r(16, 690, 358, 52),
  approveDoneOneOk: r(16, 410, 358, 84),
  approveDoneStatus: r(16, 670, 358, 46),
} as const;

// ─── Projection (CSS 3D chain of the shared world) ──────────────────────────────
export type V3 = { x: number; y: number; z: number };
const D2R = Math.PI / 180;
const rotX = (v: V3, deg: number): V3 => {
  const c = Math.cos(deg * D2R);
  const s = Math.sin(deg * D2R);
  return { x: v.x, y: v.y * c - v.z * s, z: v.y * s + v.z * c };
};
const rotY = (v: V3, deg: number): V3 => {
  const c = Math.cos(deg * D2R);
  const s = Math.sin(deg * D2R);
  return { x: v.x * c + v.z * s, y: v.y, z: -v.x * s + v.z * c };
};
const rotZ = (v: V3, deg: number): V3 => {
  const c = Math.cos(deg * D2R);
  const s = Math.sin(deg * D2R);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c, z: v.z };
};

/** Perspective of WorldStage (Stage3D) and the stage centre. */
export const PERSPECTIVE = 2600;
export const STAGE_C = { x: 960, y: 540 };

/** Phone-local offset (phone px from the phone centre, as BreakOut `from` uses) of a point of the screen. */
export const screenToLocal = (sx: number, sy: number) => ({ x: sx - SCREEN_W / 2, y: sy - SCREEN_H / 2 });

/** World position (px from the stage centre) of a phone-local point (x, y, z) on a WorldPhone at its home pose. */
export const worldOfLocal = (who: keyof typeof WORLD, p: V3, rot = PHONE_HOME): V3 => {
  // layerTransform: translate3d · rotateX · rotateY · rotateZ · scale(s) (2D scale: z untouched)
  let v: V3 = { x: p.x * PHONE_SCALE, y: p.y * PHONE_SCALE, z: p.z };
  v = rotZ(v, rot.rotZ);
  v = rotY(v, rot.rotY);
  v = rotX(v, rot.rotX);
  return { x: v.x + WORLD[who].x, y: v.y + WORLD[who].y, z: v.z };
};

/** World position of a point given in screen coordinates of a phone (e.g. mid(UI.approvedCapsule)). */
export const worldOfScreen = (who: keyof typeof WORLD, sx: number, sy: number) => {
  const l = screenToLocal(sx, sy);
  return worldOfLocal(who, { x: l.x, y: l.y, z: 0.5 });
};

/** Screen position (px) and perspective magnification of a world point under a camera pose. */
export const project = (w: V3, cam: CameraPose) => {
  // cameraTransform: translate3d(x,y,z) · rotateX · rotateY · rotateZ · scale(s) · translate(-cx,-cy)
  let v: V3 = { x: (w.x - cam.cx) * cam.scale, y: (w.y - cam.cy) * cam.scale, z: w.z };
  v = rotZ(v, cam.rotZ);
  v = rotY(v, cam.rotY);
  v = rotX(v, cam.rotX);
  v = { x: v.x + cam.x, y: v.y + cam.y, z: v.z + cam.z };
  const k = PERSPECTIVE / (PERSPECTIVE - v.z);
  return { x: STAGE_C.x + v.x * k, y: STAGE_C.y + v.y * k, k };
};

/** Camera pose (look-at + scale) that puts the screen point (sx, sy) of `who`'s phone at screen (X, Y). */
export const frameOn = (who: keyof typeof WORLD, sx: number, sy: number, scale: number, X: number, Y: number) => {
  const w = worldOfScreen(who, sx, sy);
  const k = PERSPECTIVE / (PERSPECTIVE - w.z);
  return { scale, cx: w.x - (X - STAGE_C.x) / (k * scale), cy: w.y - (Y - STAGE_C.y) / (k * scale) };
};

const REST_POSE: CameraPose = { x: 0, y: 0, z: 0, scale: 1, rotX: 0, rotY: 0, rotZ: 0, cx: 0, cy: 0 };

/** Phone-local (x, y) at height z (e.g. a BreakOut `to` pose) that projects to screen (X, Y) under a framing
 *  (look-at + scale, no camera rotation). Solved by fixed-point iteration (the chain is nearly linear). */
export const localForScreen = (
  who: keyof typeof WORLD,
  X: number,
  Y: number,
  z: number,
  framing: { scale: number; cx: number; cy: number },
) => {
  const cam: CameraPose = { ...REST_POSE, ...framing };
  let p = { x: 0, y: 0 };
  for (let i = 0; i < 8; i++) {
    const s = project(worldOfLocal(who, { x: p.x, y: p.y, z }), cam);
    const g = PHONE_SCALE * s.k * framing.scale;
    p = { x: p.x + (X - s.x) / g, y: p.y + (Y - s.y) / g };
  }
  return p;
};

// ─── Numbers: the MoneyRoll "tick" schedule ─────────────────────────────────────
/** Value shown at `frame` by a tick roll from → to starting at `at` (MoneyRoll mode "tick": ~20 values with
 *  decaying steps on `punch` over `duration`, lands exactly). Use it to keep an in-phone balance in lockstep with
 *  a big <MoneyRoll>. */
export const tickValue = (frame: number, from: number, to: number, at: number, duration = 42, ticks = 20) => {
  const lt = frame - at;
  if (lt < 0) return from;
  const timeAt = (k: number) => Math.round((k * duration) / ticks);
  let kk = 0;
  while (kk < ticks && timeAt(kk + 1) <= lt) kk++;
  if (kk >= ticks) return to;
  return Number(lerp(from, to, punch(kk / ticks)).toFixed(2));
};

// ─── Big kinetic type ───────────────────────────────────────────────────────────
/** House look for the TypeZone: Gabarito 800, ink, tracking −2.5 %. */
export const TYPE_LOOK = { color: day.ink, fontWeight: 800, letterSpacing: "-0.025em", lineHeight: 1.0, align: "left" as const };

/** A VO-timed word: lands 0-4 f before it is spoken (`voLanding`), or at a fixed frame. */
export const spoken = (id: SceneId, word: string, fallback: number, occurrence = 0) => voLanding(voWord(id, word, fallback, occurrence));

export type BigWord = { text: string; at: number; br?: boolean; /** Marigold sweep under this word at this frame. */ hl?: number };

/** One block of big type: VO-timed words rising into fixed slots (WordRise), optional marigold sweeps per word
 *  (a trailing "." / "," stays off the bar), and a word-by-word exit. */
export const BigType: React.FC<{
  words: BigWord[];
  fontSize: number;
  exitAt?: number;
  rise?: number;
  thesis?: number[];
  /** Bar padding (em) around each highlighted word; ≥ 0.14 makes neighbouring bars join into one sweep. */
  hlPad?: number;
  /** Frames each word's sweep takes (11 by default; ~5 with a 3 f stagger chains words into one front). */
  hlDur?: number;
  style?: React.CSSProperties;
}> = ({ words, fontSize, exitAt, rise = 56, thesis, hlPad = 0.1, hlDur = 11, style }) => {
  const timed: TimedWord[] = words.map((w) => ({ text: w.text, startFrame: w.at, breakBefore: w.br }));
  return (
    <WordRise
      {...TYPE_LOOK}
      words={timed}
      fontSize={fontSize}
      rise={rise}
      duration={22}
      thesis={thesis}
      exit={exitAt !== undefined ? { at: exitAt, stagger: 2, duration: 8 } : undefined}
      style={{ whiteSpace: "nowrap", ...style }}
      renderWord={(text, i) => {
        const hl = words[i]?.hl;
        if (hl === undefined) return text;
        const m = text.match(/^(.*?)([.,!?…]*)$/);
        const core = m ? m[1] : text;
        const tail = m ? m[2] : "";
        return (
          <>
            <HighlightBar at={hl} duration={hlDur} padX={hlPad}>
              {core}
            </HighlightBar>
            {tail ? (
              <PunctTail hl={hl} dur={hlDur} gapEm={hlPad + 0.02}>
                {tail}
              </PunctTail>
            ) : null}
          </>
        );
      }}
    />
  );
};

/** Trailing punctuation after a highlighted word: tight to the word until the marigold bar's leading edge arrives,
 *  then nudged just past the bar's overhang (so it never sits on the block edge, and there is no gap before the sweep). */
const PunctTail: React.FC<{ hl: number; dur: number; gapEm: number; children: React.ReactNode }> = ({ hl, dur, gapEm, children }) => {
  const f = useCurrentFrame();
  const p = ramp(f, hl + dur * 0.5, hl + dur, land);
  return <span style={{ display: "inline-block", marginLeft: `${gapEm * p}em` }}>{children}</span>;
};

/** One line of VO-timed rising words with ONE marigold bar under the whole phrase (the kit's HighlightBar around
 *  the line, so the block never notches between words); trailing punctuation rises with the last word, off the bar. */
export const HighlightLine: React.FC<{
  words: { text: string; at: number }[];
  fontSize: number;
  /** The sweep (one block, left to right). */
  hlAt: number;
  hlDur?: number;
  /** Punctuation after the phrase (kept off the bar). */
  tail?: string;
  exitAt?: number;
  rise?: number;
}> = ({ words, fontSize, hlAt, hlDur = 12, tail, exitAt, rise = 56 }) => {
  const look = { ...TYPE_LOOK, fontSize, rise, duration: 22 };
  const exit = exitAt !== undefined ? { at: exitAt, stagger: 2, duration: 8 } : undefined;
  const last = words[words.length - 1];
  return (
    <div style={{ whiteSpace: "nowrap", fontSize, lineHeight: 1 }}>
      <HighlightBar at={hlAt} duration={hlDur} exitAt={exitAt} padX={0.1} style={{ fontSize, lineHeight: 1 }}>
        <WordRise {...look} words={words.map((w) => ({ text: w.text, startFrame: w.at }))} exit={exit} style={{ display: "inline-block" }} />
      </HighlightBar>
      {tail ? (
        <PunctTail hl={hlAt} dur={hlDur} gapEm={0.12}>
          <WordRise
            {...look}
            words={[{ text: tail, startFrame: last.at }]}
            exit={exitAt !== undefined ? { at: exitAt + 2 * words.length, stagger: 2, duration: 8 } : undefined}
            style={{ display: "inline-block" }}
          />
        </PunctTail>
      ) : null}
    </div>
  );
};

/** A non-text element rising into its slot like the house type (rise + vertical smear + opacity helper). */
export const RiseIn: React.FC<{ at: number; exitAt?: number; rise?: number; children: React.ReactNode }> = ({ at, exitAt, rise = 56, children }) => {
  const f = useCurrentFrame();
  if (f < at) return null;
  const e = ramp(f, at, at + 22, land);
  const q = exitAt !== undefined ? ramp(f, exitAt, exitAt + 8, exitEase) : 0;
  if (q >= 1) return null;
  const sigma = 16 * (1 - e) + 16 * q;
  const opacity = (0.2 + 0.8 * ramp(f, at, at + 10)) * (1 - q);
  return (
    <DirectionalBlur inline y={sigma} style={{ transform: `translateY(${(1 - e) * rise - q * rise}px)`, opacity }}>
      {children}
    </DirectionalBlur>
  );
};

// ─── Blur-matched camera moves ──────────────────────────────────────────────────
/** Directional smear (σx, σy in px) for the whole stage during a fast camera move: the screen velocity of world
 *  points under the scene's camera keys (no drift), ×k, above a floor, capped; with several points the fastest wins
 *  (pass points away from the zoom centre for push/pull moves). Zero outside `windows`. Wrap the <WorldStage> in
 *  <DirectionalBlur x y> (the scene's ground colour sits behind it). */
export const smearAt = (
  f: number,
  keys: readonly CameraKey[],
  point: V3 | readonly V3[],
  windows: readonly [number, number][],
  { k = 0.45, max = 48, floor = 6 }: { k?: number; max?: number; floor?: number } = {},
) => {
  if (!windows.some(([a, b]) => f >= a && f <= b)) return { x: 0, y: 0 };
  const cam = (n: number) => cameraAt(n, keys, { rest: CAM.maya, drift: false });
  const c0 = cam(f - 1);
  const c1 = cam(f + 1);
  let vx = 0;
  let vy = 0;
  for (const p of Array.isArray(point) ? (point as readonly V3[]) : [point as V3]) {
    const p0 = project(p, c0);
    const p1 = project(p, c1);
    vx = Math.max(vx, Math.abs(p1.x - p0.x) / 2);
    vy = Math.max(vy, Math.abs(p1.y - p0.y) / 2);
  }
  const sig = (v: number) => (v > floor ? Math.min(max, (v - floor) * k) : 0);
  return { x: sig(vx), y: sig(vy) };
};

// ─── Stickers in world space ────────────────────────────────────────────────────
/** A die-cut sticker beside a phone: a world layer (moves with the camera), popping 1.3 → 1.0 on `snap`. */
export const WorldSticker: React.FC<{
  name: StickerName;
  /** World position (px from the stage centre) of the sticker's centre, and its z (toward the lens). */
  x: number;
  y: number;
  z?: number;
  /** Display width in world px. */
  width: number;
  at: number;
  outAt?: number;
  rotate?: number;
}> = ({ name, x, y, z = 60, width, at, outAt, rotate = -6 }) => {
  const frame = useCurrentFrame();
  if (frame < at) return null;
  // StickerPop scales by (1 − out) on its way out; below 5 % it would only leave a speck, so unmount
  if (outAt !== undefined && frame >= outAt && 1 - ramp(frame, outAt, outAt + 12, snap) < 0.05) return null;
  const s = STICKERS[name];
  const h = (width * s.height) / s.width;
  return (
    <Layer x={x} y={y} z={z}>
      <StickerPop at={at} outAt={outAt} rotate={rotate} inline={false}>
        <Img src={staticFile(s.src)} style={{ width, height: h, display: "block" }} />
      </StickerPop>
    </Layer>
  );
};

/** The shared PersonaPill, enlarged for wide shots (the split): same pill, `k`× bigger, sitting `lift` phone px
 *  above the phone. Place inside a <WorldPhone>. */
export const WidePill: React.FC<{ person: "maya" | "sam" | "leo"; appear: number; k?: number; lift?: number }> = ({ person, appear, k = 1.7, lift = 30 }) => {
  if (appear <= 0) return null;
  // PersonaPill sits at y = −(PHONE_H/2 + 44); scaling about the phone centre moves it, so re-anchor it.
  const base = PHONE_H / 2 + 44;
  return (
    <Layer scale={k} y={-(base + lift) + base * k}>
      <PersonaPill person={person} appear={appear} />
    </Layer>
  );
};

/** Ease from a spring preset name, for camera keys that must follow a BreakOut lift exactly. */
export const springEase =
  (frames: number, fn: (f: number) => number) =>
  (t: number): number =>
    fn(t * frames);
