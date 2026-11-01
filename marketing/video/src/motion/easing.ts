// The film's motion curves. Every scene uses these names so the whole video moves the same way.
// Source: brief/research-hypermotion.md §3.1-3.3 (binding). All values are frame-based (60 fps).
// Pure functions: no hooks, safe anywhere.
import { Easing, interpolate, random, spring, type SpringConfig } from "remotion";
import { FPS } from "./time";

export type Ease = (t: number) => number;

// ─── Research curves (§3.1, exact beziers) ──────────────────────────────────────
/** Default entry. 24 f (12-42). Covers ~70 % of the travel in the first third, long soft tail. */
export const land: Ease = Easing.bezier(0.22, 0.78, 0.51, 0.94);
/** Hero entries, the flood. 22 f; logo 36-60 f. Hair of overshoot (<1 %). */
export const snap: Ease = Easing.bezier(0.14, 1.06, 0.31, 0.94);
/** Punchline words. 18 f (quint out). */
export const punch: Ease = Easing.bezier(0.22, 1, 0.36, 1);
/** Whip arrivals. 14-16 f: fast head, long settle. */
export const whip: Ease = Easing.bezier(0.38, 0.95, 0.72, 1);
/** Thrown off-frame. 16-26 f, accelerating. */
export const exit: Ease = Easing.bezier(0.29, 0, 0.63, 0.04);
/** Into a cut at full speed. 34 f. */
export const crashOut: Ease = Easing.bezier(0.44, 0, 0.73, 0);
/** Reframes. 24-36 f. */
export const inOut: Ease = Easing.bezier(0.76, 0, 0.24, 1);
/** The "hyper" camera move. 20-30 f. */
export const speedRamp: Ease = Easing.bezier(0.87, 0, 0.13, 1);
/** Blur, opacity, colour. 18 f. */
export const softInOut: Ease = Easing.bezier(0.34, 0.07, 0.66, 0.93);
/** The rare overshoot (peaks 1.08). 30 f. Under 10 % of moves, never on numbers. */
export const popOver: Ease = Easing.bezier(0.3, 0.15, 0.3, 1.39);

// ─── Product (app replica) curves: ux-spec §7.6 ─────────────────────────────────
/** Inside app-UI replicas keep the product's own motion tokens. */
export const uiEase = {
  /** ease-standard: most transitions. */
  standard: Easing.bezier(0.2, 0, 0, 1) as Ease,
  /** ease-enter: elements entering. */
  enter: Easing.bezier(0.05, 0.7, 0.1, 1) as Ease,
  /** ease-exit: elements leaving. */
  exit: Easing.bezier(0.3, 0, 0.8, 0.15) as Ease,
};
/** ux-spec §7.6 durations in frames at 60 fps (120/200/280/360/500/600/1200 ms). */
export const UI_FRAMES = { fast: 7, base: 12, moderate: 17, slow: 22, count: 30, celebrate: 36, loop: 72, minChecking: 72 } as const;

// ─── Aliases kept for older call sites ──────────────────────────────────────────
/** = speedRamp (identical bezier .87,0,.13,1). */
export const expoInOut: Ease = speedRamp;
/** Close to `snap` (max err .05). Prefer snap / land in new code. */
export const expoOut: Ease = Easing.bezier(0.16, 1, 0.3, 1);
/** Accelerate away. Prefer `exit` / `crashOut`. */
export const expoIn: Ease = Easing.bezier(0.7, 0, 0.84, 0);
/** = punch (identical bezier .22,1,.36,1). */
export const quintOut: Ease = punch;
export const quintInOut: Ease = Easing.bezier(0.83, 0, 0.17, 1);
export const cubicOut: Ease = Easing.bezier(0.33, 1, 0.68, 1);
/** Long gentle drifts. Prefer `softInOut` for blur/opacity/colour. */
export const sineInOut: Ease = Easing.bezier(0.37, 0, 0.63, 1);
/** Very fast attack, quick settle. Small state changes (≤ 12 f). */
export const snappyOut: Ease = Easing.bezier(0.2, 0.9, 0.1, 1);
/** ~10 % overshoot. Prefer `popOver`; rare. */
export const backOut: Ease = Easing.bezier(0.34, 1.56, 0.64, 1);
/** ~4 % overshoot settle. */
export const backOutSoft: Ease = Easing.bezier(0.3, 1.25, 0.6, 1);
/** Pulls back ~7 % first, then shoots to the target (wind-up). */
export const anticipate: Ease = Easing.bezier(0.5, -0.4, 0.1, 1);
export const linear: Ease = (t) => t;

/** Every named curve, for docs/pickers. */
export const curves = {
  land,
  snap,
  punch,
  whip,
  exit,
  crashOut,
  inOut,
  speedRamp,
  softInOut,
  popOver,
  expoInOut,
  expoOut,
  expoIn,
  quintOut,
  quintInOut,
  cubicOut,
  sineInOut,
  snappyOut,
  backOut,
  backOutSoft,
  anticipate,
  linear,
} as const;
export type CurveName = keyof typeof curves;

// ─── Springs (§3.2, measured with measureSpring at 60 fps) ──────────────────────
/** Research springs (use these):
 *  uiPop    {500, 30}        5.8 % overshoot, settles 19 f. Chips, checks, UI pops (= the product's spring-pop).
 *  breakout {150, 20}        1.2 %, 36 f. Breakouts, magic moves.
 *  camera   {120, 30, m 1.2} 0 %, 45 f. Camera keys.
 *  lid      {120, 14}        7.3 %, 48 f. THE one visible spring in the film: the logo lid.
 *  slam     {260, 12, m .6}  17.8 %, 33 f. A word slam, at most once per act.
 * Older presets (sticker moments only — too bouncy for words and UI):
 *  pop {12, 220, m .6} 14 % · sticker {9, 180, m .7} 25 % · bouncy {8} 25 %.
 * Neutral: snappy {20, 200} 4 % · smooth {200} 0 % · heavy {15, 80, m 2} 10 %. */
export const springs = {
  uiPop: { stiffness: 500, damping: 30 },
  breakout: { stiffness: 150, damping: 20 },
  camera: { stiffness: 120, damping: 30, mass: 1.2 },
  lid: { stiffness: 120, damping: 14 },
  slam: { stiffness: 260, damping: 12, mass: 0.6 },
  snappy: { damping: 20, stiffness: 200 },
  smooth: { damping: 200 },
  heavy: { damping: 15, stiffness: 80, mass: 2 },
  pop: { damping: 12, stiffness: 220, mass: 0.6 },
  sticker: { damping: 9, stiffness: 180, mass: 0.7 },
  bouncy: { damping: 8 },
} as const satisfies Record<string, Partial<SpringConfig>>;
export type SpringName = keyof typeof springs;

/** spring() that starts at frame `at`, with a named preset (or a config). Returns 0 before `at`. */
export const springAt = (
  frame: number,
  at: number,
  preset: SpringName | Partial<SpringConfig> = "uiPop",
  opts: { fps?: number; durationInFrames?: number; reverse?: boolean } = {},
): number => {
  const config = typeof preset === "string" ? springs[preset] : preset;
  return spring({
    frame: frame - at,
    fps: opts.fps ?? FPS,
    config,
    durationInFrames: opts.durationInFrames,
    reverse: opts.reverse,
  });
};

// ─── Small math ─────────────────────────────────────────────────────────────────
export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const clamp01 = (v: number) => clamp(v, 0, 1);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Interpolate scales in log space (constant zoom rate): logLerp(1, 4, 0.5) = 2. */
export const logLerp = (a: number, b: number, t: number) => Math.exp(lerp(Math.log(Math.max(1e-6, a)), Math.log(Math.max(1e-6, b)), t));

/** Eased 0..1 progress between frames `start` and `end` (clamped on both sides). */
export const ramp = (frame: number, start: number, end: number, ease: Ease = linear): number => {
  if (end <= start) return frame >= end ? 1 : 0;
  return ease(clamp01((frame - start) / (end - start)));
};

/** Same as ramp() but with a start + duration: span(frame, 30, 18, land). */
export const span = (frame: number, at: number, duration: number, ease: Ease = linear): number => ramp(frame, at, at + duration, ease);

/** Map an eased 0..1 progress to [from, to]. mix(p, 0, 300). */
export const mix = (t: number, from: number, to: number) => from + (to - from) * t;

/** Clamped interpolate with an easing: interp(frame, [0, 30], [0, 1], land). */
export const interp = (frame: number, input: [number, number], output: [number, number], ease: Ease = linear) =>
  interpolate(frame, input, output, { easing: ease, extrapolateLeft: "clamp", extrapolateRight: "clamp" });

/** Index-based delay for staggers: stagger(i, 3, 10) = 10 + 3i. */
export const stagger = (i: number, each: number, start = 0) => start + i * each;

/** Uneven sibling stagger (§3.3: siblings 2-6 f apart with uneven gaps). Deterministic per seed.
 *  unevenStagger(i, { start: 30 }) → 30, 33, 38, 40, … */
export const unevenStagger = (i: number, { start = 0, min = 2, max = 6, seed = "stagger" }: { start?: number; min?: number; max?: number; seed?: string } = {}) => {
  let t = start;
  for (let k = 0; k < i; k++) t += Math.round(min + random(`${seed}-${k}`) * (max - min));
  return t;
};

/** A bump that rises and falls within [at, at+duration] (sin-shaped 0→1→0). */
export const pulse = (frame: number, at: number, duration: number) => {
  const t = (frame - at) / duration;
  return t <= 0 || t >= 1 ? 0 : Math.sin(Math.PI * t);
};

/** Numerical velocity of any frame→value function, in units per frame (central difference). */
export const velocity = (fn: (frame: number) => number, frame: number, h = 0.5) => (fn(frame + h) - fn(frame - h)) / (2 * h);

// ─── Keyframes ──────────────────────────────────────────────────────────────────
/** One numeric keyframe. `ease` shapes the segment that ARRIVES at this keyframe. */
export type Keyframe = { at: number; v: number; ease?: Ease };

/** Keyframed number: kf(frame, [{at:0, v:0}, {at:30, v:1, ease: land}]).
 *  Holds the first value before the first key and the last value after the last key.
 *  Two keys at the same frame make a hard cut. Default segment ease: inOut. Pass log=true for scales. */
export const kf = (frame: number, keys: readonly Keyframe[], defaultEase: Ease = inOut, log = false): number => {
  if (keys.length === 0) return 0;
  if (frame <= keys[0].at) return keys[0].v;
  const last = keys[keys.length - 1];
  if (frame >= last.at) return last.v;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (frame >= a.at && frame < b.at) {
      const t = (b.ease ?? defaultEase)((frame - a.at) / (b.at - a.at));
      return log ? logLerp(a.v, b.v, t) : lerp(a.v, b.v, t);
    }
  }
  return last.v;
};

/** A keyframe "pose": a frame, an optional arrival ease and any subset of numeric props. */
export type PoseKey<K extends string> = { at: number; ease?: Ease } & Partial<Record<K, number>>;

/** Fill keys forward so every key is a complete pose (omitted props carry over; first key from defaults). */
export const fillPoses = <K extends string>(keys: readonly PoseKey<K>[], defaults: Record<K, number>): Record<K, number>[] => {
  const propNames = Object.keys(defaults) as K[];
  const poses: Record<K, number>[] = [];
  let prev = { ...defaults };
  for (const key of keys) {
    const pose = { ...prev };
    for (const p of propNames) {
      const v = key[p];
      if (typeof v === "number") pose[p] = v;
    }
    poses.push(pose);
    prev = pose;
  }
  return poses;
};

/** Find the active segment: { i, t } where t is the eased 0..1 progress from key i to key i+1.
 *  i = -1 before the first key, i = last index after the last key (t = 1). */
export const segmentAt = <K extends string>(frame: number, keys: readonly PoseKey<K>[], defaultEase: Ease) => {
  if (frame <= keys[0].at) return { i: 0, t: 0, before: true };
  const lastI = keys.length - 1;
  if (frame >= keys[lastI].at) return { i: lastI, t: 1, before: false };
  for (let i = 0; i < lastI; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (frame >= a.at && frame < b.at) return { i, t: (b.ease ?? defaultEase)((frame - a.at) / (b.at - a.at)), before: false };
  }
  return { i: lastI, t: 1, before: false };
};

/** Keyframed object ("poses"). Each key is a full pose: props a key omits are carried over from the
 *  previous key (first key: from `defaults`). So {at:60, x:100} after {at:30, scale:2} moves only x,
 *  and only between frames 30 and 60. `ease` on a key shapes the segment arriving at it.
 *  `logProps` (e.g. ["scale"]) interpolate in log space. */
export const kfPose = <K extends string>(
  frame: number,
  keys: readonly PoseKey<K>[],
  defaults: Record<K, number>,
  defaultEase: Ease = inOut,
  logProps: readonly K[] = [],
): Record<K, number> => {
  if (keys.length === 0) return { ...defaults };
  const poses = fillPoses(keys, defaults);
  const { i, t } = segmentAt(frame, keys, defaultEase);
  if (i >= keys.length - 1 || t === 0) return poses[i];
  const a = poses[i];
  const b = poses[i + 1];
  const out = {} as Record<K, number>;
  for (const p of Object.keys(defaults) as K[]) out[p] = logProps.includes(p) ? logLerp(a[p], b[p], t) : lerp(a[p], b[p], t);
  return out;
};
