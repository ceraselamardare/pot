// s05-pivot. VO: "What if the money lived right in the group chat?"
// - The breath: the incoming chat bubble with the brand's three typing dots (r 14, gap 3.33 r = 46.67, Night
//   ink-muted) already popped in during s04's tail (pivotBubble.tsx), so frame 0 continues it seamlessly.
// - The question rises word by word above it on the voice; "in the group chat?" is bold (Gabarito 800, ink) against
//   the rest (Gabarito 500, ink-muted).
// - On "chat": push into the MIDDLE dot 1 → 6× in log space over 60 f on `crashOut`. The dots settle to full
//   ink-muted, the drift fades out, and the LAST FRAME equals DOT_HANDOFF exactly: dots r 84, centres 280 apart,
//   the middle one at (960, 540), inside the Night-surface bubble grown past them (S05_END_BUBBLE).
// Geometry is computed in screen space (no CSS scale on the bubble or dots), so the end frame is pixel-exact.
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { scene, type SceneId } from "../../data/timeline";
import { voWord } from "../../data/vo";
import { Sfx, WordRise, clamp01, crashOut, driftAt, logLerp, ramp, softInOut, voLanding } from "../../motion";
import { N, NightFinish, NightGround } from "./common";
import { BUBBLE_1X, PIVOT_C, PIVOT_POP_S05, PUSH_RATIO, PivotBubble } from "./pivotBubble";

export { PUSH_RATIO };

export const S05_SCENES: SceneId[] = ["s05-pivot"];
const ID: SceneId = "s05-pivot";
export const S05_DURATION = scene(ID).duration;
const LAST = S05_DURATION - 1;

export const S05_VO = {
  what: voWord(ID, "What", 18),
  if: voWord(ID, "if", 31),
  the: voWord(ID, "the", 71),
  money: voWord(ID, "money", 79),
  lived: voWord(ID, "lived", 97),
  right: voWord(ID, "right", 121),
  in: voWord(ID, "in", 135),
  the2: voWord(ID, "the", 141, 1),
  group: voWord(ID, "group", 148),
  chat: voWord(ID, "chat", 162),
};

// ─── Handoff geometry ───────────────────────────────────────────────────────────
const C = PIVOT_C;
/** The bubble on the last frame (screen px). s06 can rebuild it exactly from this. */
export const S05_END_BUBBLE = {
  x: C.x - (BUBBLE_1X.w * PUSH_RATIO) / 2,
  y: C.y - (BUBBLE_1X.h * PUSH_RATIO) / 2,
  w: BUBBLE_1X.w * PUSH_RATIO,
  h: BUBBLE_1X.h * PUSH_RATIO,
  /** border-radius: top-left, top-right, bottom-right = r; bottom-left (the incoming tail corner) = tail. */
  r: BUBBLE_1X.r * PUSH_RATIO,
  tail: BUBBLE_1X.tail * PUSH_RATIO,
  color: N.surface,
  dotColor: N.inkMuted,
} as const;

// ─── Beats ──────────────────────────────────────────────────────────────────────
/** The bubble popped in during s04's tail (negative = before this scene's frame 0). */
export const BUBBLE_AT = PIVOT_POP_S05;
/** The push starts as "chat" lands and ends exactly on the last frame. */
export const PUSH_AT = LAST - 60;
/** Creep before the push (the scene's 1-3 % life), from frame 0 so the cut from s04 (1×) is seamless. */
const CREEP = 0.03;

const pushT = (f: number) => clamp01((f - PUSH_AT) / (LAST - PUSH_AT));
/** Camera zoom around the middle dot: creep, then 1 → 6× in log space on crashOut (exactly 6 on the last frame). */
export const s05Scale = (f: number) => {
  const creep = 1 + CREEP * ramp(f, 0, PUSH_AT, softInOut);
  const t = pushT(f);
  if (t <= 0) return creep;
  if (t >= 1) return PUSH_RATIO;
  return logLerp(1 + CREEP, PUSH_RATIO, crashOut(t));
};

// ─── Question ───────────────────────────────────────────────────────────────────
const LINE1 = { size: 80, top: 222 };
const LINE2 = { size: 112, top: 322 };

const Question: React.FC = () => (
  <>
    <AbsoluteFill style={{ alignItems: "center", top: LINE1.top }}>
      <WordRise
        words={[
          { text: "What", startFrame: voLanding(S05_VO.what) },
          { text: "if", startFrame: voLanding(S05_VO.if) },
          { text: "the", startFrame: voLanding(S05_VO.the) },
          { text: "money", startFrame: voLanding(S05_VO.money) },
          { text: "lived", startFrame: voLanding(S05_VO.lived) },
          { text: "right", startFrame: voLanding(S05_VO.right) },
        ]}
        fontSize={LINE1.size}
        fontWeight={500}
        letterSpacing="-0.015em"
        color={N.inkMuted}
        rise={44}
      />
    </AbsoluteFill>
    <AbsoluteFill style={{ alignItems: "center", top: LINE2.top }}>
      <WordRise
        words={[
          { text: "in", startFrame: voLanding(S05_VO.in) },
          { text: "the", startFrame: voLanding(S05_VO.the2) },
          { text: "group", startFrame: voLanding(S05_VO.group) },
          { text: "chat?", startFrame: voLanding(S05_VO.chat) },
        ]}
        fontSize={LINE2.size}
        fontWeight={800}
        color={N.ink}
        rise={56}
      />
    </AbsoluteFill>
  </>
);

// ─── Scene ──────────────────────────────────────────────────────────────────────
export const S05Pivot: React.FC = () => {
  const frame = useCurrentFrame();
  const s = s05Scale(frame);
  // Drift (2D, small): zero on frame 0 (continuity with s04's still bubble), fades out over the push so the last
  // frame is exactly on the handoff.
  const dr = driftAt(frame, { amount: 5, roll: 0, tilt: 0, seed: "s05" });
  const live = ramp(frame, 0, 40, softInOut) * (1 - ramp(frame, PUSH_AT, LAST, softInOut));
  const d = { x: (dr.x ?? 0) * live, y: (dr.y ?? 0) * live };
  // Dots: the brand pulse, settling to still (full ink-muted, scale 1) as the push starts.
  const settle = ramp(frame, PUSH_AT, PUSH_AT + 26, softInOut);
  return (
    <NightGround>
      <AbsoluteFill style={{ transform: `translate(${d.x}px, ${d.y}px) scale(${s})`, transformOrigin: `${C.x}px ${C.y}px` }}>
        <Question />
      </AbsoluteFill>
      <PivotBubble frame={frame} popAt={BUBBLE_AT} s={s} d={d} settle={settle} />
      <NightFinish />
      {/* SFX: the riser from "chat", trimmed to end on the cut (the dots' blips play in s04, at the pop). */}
      <Sfx name="riser" at={S05_VO.chat} trimBefore={Math.max(0, 110 - (S05_DURATION - S05_VO.chat))} durationInFrames={S05_DURATION - S05_VO.chat} volume={0.55} />
    </NightGround>
  );
};

export const S05_KEYS = { BUBBLE_AT, PUSH_AT, LAST };
