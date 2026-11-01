// s06-reveal (Act 2, the emotional peak). VO at f45: "Meet Pot. … Group chat money that follows its own rules."
//
//   f0       DOT_HANDOFF on Night. The middle dot turns marigold (the film's first marigold pixel) and is the flood's
//            r0: a circle grows from it to the corners in 15 f on `snap`. `impact` lands on f0.
//   f2-20    An eggplant iris centred on the middle dot reveals the glyph BODY at GLYPH_MATCH_SCALE, so the three
//            dots re-emerge as its marigold holes exactly where the chat dots were (f5-13, measured to 0.01 px).
//   f14-50   The camera pulls back in log space (`land`) to the resting size. The lid drops from off-frame (f18) on
//            the `lid` spring {120,14} (THE one visible spring: seats f35, 7.3 % dip at f40), the handles step out
//            3 f apart (f22, f25), the eggplant burst (day.onBrand) leaves as the lid lands (`burst`, `sparkle`).
//   f48-66   The lockup opens: the glyph slides to its lockup place while "pot" wipes on (f48-58: fully on 10 f
//            before "Pot" is spoken at f68).
//   f113-243 The tagline rises word by word on the voice (WordRise, Gabarito 700, 64 px, eggplant); holds to f305.
//   f305     The words leave (one every 2 f), then the lockup is thrown up and out (f309, smear, no fade).
//   f329-359 MarigoldToPhone: the marigold contracts to PHONE_HANDOFF on cream (30 f, `inOut`, soft whoosh).
//            The last frame is that marigold rect on cream, nothing else (= s07 frame 0).
//
// Logo: GlyphParts builds the mark (identical to the brand glyph at rest); from SWAP (f98) the resting logo is
// LockupSvg on="marigold" (the brand lockup's exact geometry, eggplant glyph + eggplant wordmark, as og-image.png).
// Never recoloured or faded over marigold (a see-through eggplant reads brown), uniform scale only, lowercase
// "pot", mark with the name at rest. See README.md for the measured handoffs and why LockupSvg replaces <Lockup>.
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { day, night } from "../../brand/tokens";
import { DISPLAY } from "../../brand/fonts";
import { GlyphParts, LOGO_GEOMETRY } from "../../brand/Logo";
import {
  Burst,
  DirectionalBlur,
  Grain,
  Sfx,
  Vignette,
  WordRise,
  clamp01,
  driftAt,
  exit as exitEase,
  land,
  lerp,
  logLerp,
  ramp,
  smearSigma,
  snap,
  softInOut,
  springAt,
  velocity,
  voLanding,
} from "../../motion";
import { scene, type SceneId } from "../../data/timeline";
import { voWord } from "../../data/vo";
import { DOT_HANDOFF, GLYPH_MATCH_SCALE, S05_END_BUBBLE } from "../shared/handoffs";
import { MarigoldToPhone, MARIGOLD_TO_PHONE_FRAMES } from "./MarigoldToPhone";
import { LockupSvg, WORDMARK_INK } from "./LockupSvg";

const ID: SceneId = "s06-reveal";
export const S06_REVEAL_SCENES: SceneId[] = [ID];

const DUR = scene(ID).duration;
const LAST = DUR - 1;

// ─── Logo geometry (units of the 512 tile = the Lockup's viewBox units) ──────────────────────────────
const G = LOGO_GEOMETRY;
/** The middle dot: the anchor of the whole build (it never leaves the eye). */
const DOT = { x: G.dotsX[1], y: G.dotY };
/** On marigold there is no tile: the ink runs from the left handle (x 72) to the wordmark's "t" (1253.2). */
const INK_LEFT = 72;
const INK_CX = (INK_LEFT + WORDMARK_INK.right) / 2;
/** The glyph's ink centre (lid top 140 → tail tip 394): the lockup's optical centre line. */
const OPTICAL_CY = (140 + 394) / 2;

// ─── Camera: px per unit (u) and the screen position of the middle dot (mx, my) ──────────────────────
/** Frame 0: the glyph's dots sit exactly on DOT_HANDOFF (84 / 18 px per unit, middle dot at 960, 540). */
const U0 = GLYPH_MATCH_SCALE;
/** Resting Lockup height in px. On marigold there is no tile, so the visible ink (wordmark ascender to descender,
 *  355 of 512 units) is 0.69 × this: 400 → ≈ 277 px tall on screen (the brief: about 260-300 px). */
export const S06_LOCKUP_HEIGHT = 400;
const U1 = S06_LOCKUP_HEIGHT / G.tile;
/** Screen y of the lockup's optical centre at rest ("centred slightly above middle"). */
const REST_CY = 434;
const MY_REST = REST_CY + (DOT.y - OPTICAL_CY) * U1;
/** Middle-dot x once the lockup is open (its ink bbox centred on 960). */
const MX_OPEN = 960 + (DOT.x - INK_CX) * U1;

// ─── Timing (scene frames) ─────────────────────────────────────────────────────────────────────────
const FLOOD = 15;
const FLOOD_R = Math.hypot(Math.max(DOT_HANDOFF.cx, 1920 - DOT_HANDOFF.cx), Math.max(DOT_HANDOFF.cy, 1080 - DOT_HANDOFF.cy)) + 1;
const IRIS_AT = 2;
const IRIS_DUR = 18;
// Starts at 0, not at the hole's radius: an iris edge coinciding with the hole's edge leaves a hairline AA ring
// (measured at f2). From 0 it is fully clipped on f2 and already 35 units (well clear of the hole) on f3.
const IRIS_R0 = 0;
const IRIS_R1 = 192; // the tail tip is 186.5 units from the middle dot
const PULL_AT = 14;
const PULL_DUR = 36;
const LID_AT = 18;
const LID_DROP = 210; // units above its seat (off the top of the frame when it starts)
const LID_ROT = -9; // deg, settles flat on the same spring
const HANDLES_AT = [22, 25] as const; // "step in 3 f apart"
const HANDLE_DUR = 10;
/** Handles start tucked inside the body (same eggplant, so invisible) and step out to their seats: no fades,
 *  so no semi-transparent eggplant over marigold (it reads brown, off-token). */
const HANDLE_TUCK = 44;
/** First frame the lid reaches its seat (the spring's first crossing): the burst leaves here. */
const LID_LAND = (() => {
  for (let f = LID_AT; f < LID_AT + 60; f++) if (springAt(f, LID_AT, "lid") >= 1) return f;
  return LID_AT + 16;
})();
const SAY_POT = voWord(ID, "Pot", 68);
/** "pot" is fully wiped on 10 f before "Pot" is spoken, in a 10 f wipe. */
const WIPE_END = SAY_POT - 10;
const WIPE_START = WIPE_END - 10;
const OPEN_AT = WIPE_START;
const OPEN_DUR = 18;
/** From here the resting logo is the brand Lockup itself (the lid spring has settled to < 0.02 px). */
const SWAP = LID_AT + 80;
const CONTRACT_AT = LAST - MARIGOLD_TO_PHONE_FRAMES;
/** The words leave first (one every 2 f, 7 f each: gone by CONTRACT_AT − 3), then the hero: the lockup is thrown
 *  up and out (out of frame by CONTRACT_AT − 2), so the marigold is empty when it starts to contract. */
const TAG_EXIT_AT = CONTRACT_AT - 24;
const EXIT_AT = CONTRACT_AT - 20;
const EXIT_DUR = 20;
/** The lockup is thrown up and out of frame (no fade: a see-through logo on marigold would read brown). */
const EXIT_LIFT = 760;

/** The tagline, word by word on the voice (display text, VO word, fallback frame). */
const TAGLINE: ReadonlyArray<readonly [string, string, number]> = [
  ["Group", "Group", 123],
  ["chat", "chat", 137],
  ["money", "money", 152],
  ["that", "that", 171],
  ["follows", "follows", 185],
  ["its", "its", 203],
  ["own", "own", 218],
  ["rules.", "rules", 233],
];
const TAG_SIZE = 64;
/** Top of the tagline's line box: below the lockup with clear space. */
const TAG_TOP = 650;

/** Key frames, for the README and the director. */
export const S06_KEYS = {
  flood: [0, FLOOD],
  iris: [IRIS_AT, IRIS_AT + IRIS_DUR],
  dotsMatch: [5, PULL_AT - 1],
  pullBack: [PULL_AT, PULL_AT + PULL_DUR],
  lidDrop: LID_AT,
  lidLand: LID_LAND,
  handles: HANDLES_AT,
  wipe: [WIPE_START, WIPE_END],
  sayPot: SAY_POT,
  swapToLockup: SWAP,
  tagExit: TAG_EXIT_AT,
  lockupExit: EXIT_AT,
  contract: [CONTRACT_AT, LAST],
} as const;

// ─── Pure helpers ──────────────────────────────────────────────────────────────────────────────────
type Pose = { u: number; mx: number; my: number };
export const s06Pose = (f: number): Pose => {
  const e = ramp(f, PULL_AT, PULL_AT + PULL_DUR, land);
  const o = ramp(f, OPEN_AT, OPEN_AT + OPEN_DUR, land);
  return { u: logLerp(U0, U1, e), mx: lerp(DOT_HANDOFF.cx, MX_OPEN, o), my: lerp(DOT_HANDOFF.cy, MY_REST, e) };
};

const floodClip = (f: number): string | undefined => {
  if (f > FLOOD) return undefined;
  const r = DOT_HANDOFF.r + (FLOOD_R - DOT_HANDOFF.r) * snap(clamp01(f / FLOOD));
  return `circle(${r}px at ${DOT_HANDOFF.cx}px ${DOT_HANDOFF.cy}px)`;
};

const lockupLift = (f: number) => -EXIT_LIFT * ramp(f, EXIT_AT, EXIT_AT + EXIT_DUR, exitEase);

// ─── The Night frame under the flood (= s05's last frame) ──────────────────────────────────────────
/** s05's Night finish (src/scenes/act1/common.tsx NightFinish): vignette 8 %, grain 0.28. Matched here so the cut
 *  only changes the grain's noise frame (as every other frame does) and the middle dot's colour. */
const S05_VIGNETTE = 0.08;
const S05_GRAIN = 0.28;

export type BubbleSpec = { x: number; y: number; w: number; h: number; radius: number; bottomLeftRadius: number; color: string };

/** s05's last frame (DOT_HANDOFF + S05_END_BUBBLE + the Night finish). `middle="flood"` leaves the middle dot
 *  out: s06 draws it as the marigold flood's r0 on frame 0. */
export const RevealHandoffNight: React.FC<{ bubble?: BubbleSpec | null; middle?: "ink" | "flood" }> = ({ bubble = S05_END_BUBBLE, middle = "ink" }) => {
  const { cx, cy, r, gap } = DOT_HANDOFF;
  const dots = middle === "ink" ? [-1, 0, 1] : [-1, 1];
  return (
    // isolation: the grain's overlay blend only sees this layer. Without it, Chrome's compositor drops the blend on
    // the frames where the flood circle crosses the frame edges (f5-6: raw grey grain in the corners, measured).
    <AbsoluteFill style={{ background: night.ground, isolation: "isolate" }}>
      {bubble ? (
        <div
          style={{
            position: "absolute",
            left: bubble.x,
            top: bubble.y,
            width: bubble.w,
            height: bubble.h,
            // CSS order: top-left, top-right, bottom-right, bottom-left (the bubble's tail corner).
            borderRadius: `${bubble.radius}px ${bubble.radius}px ${bubble.radius}px ${bubble.bottomLeftRadius}px`,
            background: bubble.color,
          }}
        />
      ) : null}
      {dots.map((k) => (
        <div
          key={k}
          style={{ position: "absolute", left: cx + k * gap - r, top: cy - r, width: 2 * r, height: 2 * r, borderRadius: r, background: night.inkMuted }}
        />
      ))}
      <Vignette theme="night" strength={S05_VIGNETTE} />
      <Grain opacity={S05_GRAIN} />
    </AbsoluteFill>
  );
};

// ─── The marigold world ────────────────────────────────────────────────────────────────────────────
/** Full-frame SVG canvas at (0, 0). The logo is painted INSIDE it with an SVG `translate`, never positioned by
 *  CSS left/top (layout snaps fractional px: 45.33 → 45) or a CSS transform (resampled, i.e. softened, while an
 *  ancestor clip-path, the flood, is active). So the glyph's holes land on the DOT_HANDOFF dots to 0.01 px with
 *  crisp edges, and GlyphParts → Lockup is a same-canvas swap. */
const Canvas: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
    {children}
  </svg>
);

/** The hold breathes (review-1: a 1 % creep over 5 s read as static): a 2 % log-linear push about the frame centre
 *  from the moment the lockup is open to the exit, plus the film's hand-held drift (driftAt, ~6 px, translation
 *  only) eased in after the opening slide. Both run on through the exit; the contraction is independent of them. */
const CREEP = 0.02;
const HOLD_AT = OPEN_AT + OPEN_DUR;
const creepAt = (f: number) => (f <= HOLD_AT ? 1 : Math.pow(1 + CREEP, (f - HOLD_AT) / (EXIT_AT - HOLD_AT)));
const driftOf = (f: number) => {
  const env = ramp(f, HOLD_AT - 6, HOLD_AT + 40, softInOut);
  const d = driftAt(f, { amount: 6, roll: 0, tilt: 0, seed: "s06-hold" });
  return { x: (d.x ?? 0) * env, y: (d.y ?? 0) * env };
};

const RevealWorld: React.FC = () => {
  const f = useCurrentFrame();
  const pose = s06Pose(f);
  // The creep is folded into the vector geometry (no CSS scale on the logo): units → frame px.
  const k = creepAt(f);
  const dr = driftOf(f);
  const u = pose.u * k;
  const X = (x: number) => 960 + (pose.mx + (x - DOT.x) * pose.u - 960) * k + dr.x;
  const Y = (y: number) => 540 + (pose.my + (y - DOT.y) * pose.u - 540) * k + dr.y;

  // Glyph parts (the build).
  const irisP = ramp(f, IRIS_AT, IRIS_AT + IRIS_DUR, land);
  const iris = f < IRIS_AT ? 0 : f >= IRIS_AT + IRIS_DUR ? undefined : lerp(IRIS_R0, IRIS_R1, irisP);
  const lidS = springAt(f, LID_AT, "lid");
  const handle = (i: 0 | 1) => {
    const h = ramp(f, HANDLES_AT[i], HANDLES_AT[i] + HANDLE_DUR, snap);
    // Hidden until the iris has passed (they are not iris-clipped); from HANDLES_AT they sit inside the body.
    return { dx: -HANDLE_TUCK * (1 - h), opacity: f < HANDLES_AT[i] ? 0 : 1 };
  };

  // Lockup (wordmark wipe, then the whole resting logo), its exit.
  const wipe = ramp(f, WIPE_START, WIPE_END, land);
  const lift = lockupLift(f);
  const liftSmear = smearSigma(velocity(lockupLift, f), 0.5, 48);
  const gone = f >= EXIT_AT + EXIT_DUR;

  // Burst: launched from just outside the glyph's edge where the glyph was when the lid landed; it follows the
  // camera pull-back (world) but not the lockup's opening slide (particles don't follow their emitter).
  const landU = s06Pose(LID_LAND).u;
  const burstY = pose.my + (OPTICAL_CY - DOT.y) * pose.u;

  return (
    <AbsoluteFill>
      {/* One SVG canvas for the whole logo: GlyphParts builds the mark while LockupSvg (the brand lockup's exact
          geometry) draws the wordmark; from SWAP the full LockupSvg is the resting logo. The smear only runs
          during the exit throw. */}
      {!gone ? (
        <DirectionalBlur y={liftSmear} region={0.05}>
          <Canvas>
            {f < SWAP ? (
              <g transform={`translate(${X(G.glyphViewBox.x)} ${Y(G.glyphViewBox.y)})`}>
                <GlyphParts
                  size={G.glyphViewBox.w * u}
                  iris={iris}
                  // Hidden lid parks on its seat: parked far above, it widens the masked group's bounds and Chrome
                  // then rasterizes the dot holes ~0.5 px softer (measured), which would blur the f5-13 dot match.
                  lid={f < LID_AT ? { opacity: 0 } : { dy: -LID_DROP * (1 - lidS), rot: LID_ROT * (1 - lidS) }}
                  handles={[handle(0), handle(1)]}
                />
              </g>
            ) : null}
            {f >= WIPE_START ? (
              <LockupSvg x={X(0)} y={Y(0) + lift} height={G.tile * u} on="marigold" wordmarkReveal={wipe} parts={f < SWAP ? "wordmark" : "all"} />
            ) : null}
          </Canvas>
        </DirectionalBlur>
      ) : null}
      <div style={{ position: "absolute", left: DOT_HANDOFF.cx, top: burstY, width: 0, height: 0 }}>
        {/* 30 f (not 36): it has faded before the wipe reaches the right half of "pot", so no particle notches the wordmark. */}
        <Burst at={LID_LAND} variant="hero" x={0} y={0} r0={205 * landU} scale={1.25} duration={30} color={day.onBrand} seed="s06-lid" />
      </div>
      <AbsoluteFill style={{ transform: `translate(${dr.x}px, ${dr.y}px) scale(${k})`, transformOrigin: "960px 540px" }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: TAG_TOP, display: "flex", justifyContent: "center" }}>
          <WordRise
            words={TAGLINE.map(([text, word, fallback]) => ({ text, startFrame: voLanding(voWord(ID, word, fallback)) }))}
            fontFamily={DISPLAY}
            fontWeight={700}
            fontSize={TAG_SIZE}
            lineHeight={1.1}
            letterSpacing="-0.01em"
            color={day.onBrand}
            rise={40}
            style={{ whiteSpace: "nowrap" }}
            exit={{ at: TAG_EXIT_AT, stagger: 2, duration: 7 }}
          />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export type S06RevealProps = {
  /** The Night bubble under the flood on frame 0 (default S05_END_BUBBLE = s05's last frame). null = no bubble. */
  bubble?: BubbleSpec | null;
};

export const S06Reveal: React.FC<S06RevealProps> = ({ bubble = S05_END_BUBBLE }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: night.ground }}>
      {frame <= FLOOD ? <RevealHandoffNight bubble={bubble} middle="flood" /> : null}
      {/* The flood: the middle dot (r0 = 84) grows to the corners; everything marigold lives inside it. */}
      <AbsoluteFill style={{ clipPath: floodClip(frame) }}>
        <MarigoldToPhone start={CONTRACT_AT}>
          <RevealWorld />
        </MarigoldToPhone>
      </AbsoluteFill>
      {/* Sound: the dots resolve into the hit; burst + sparkle on the lid; one soft whoosh on the contraction. */}
      <Sfx name="impact" at={0} volume={0.9} />
      <Sfx name="burst" at={LID_LAND - 1} volume={0.5} />
      <Sfx name="sparkle" at={LID_LAND + 1} volume={0.3} />
      <Sfx name="whoosh-long" at={CONTRACT_AT + 3} volume={0.28} />
    </AbsoluteFill>
  );
};

export default S06Reveal;
