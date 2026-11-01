// The pivot bubble: one incoming Night chat bubble with the brand's three typing dots (r 14, gap 3.33 r) at the
// frame centre. It pops in during s04's tail, as the option cards are thrown off (s04 f300 = film f825), so the
// s04 → s05 audio breath never shows an empty frame; s05 then raises the question above it and pushes into the
// middle dot until its last frame equals DOT_HANDOFF.
// Geometry is plain screen-space math (1× point → pop about the tail corner → zoom about the middle dot + drift),
// so the end frame is pixel-exact. Both scenes draw it with the same function, so the s04 → s05 cut is seamless.
import React from "react";
import { scene } from "../../data/timeline";
import { voWord } from "../../data/vo";
import { DOT_HANDOFF } from "../shared/handoffs";
import { DOT_GAP_R, clamp01, lerp, springAt, typingDots } from "../../motion";
import { N } from "./common";

/** The push ratio: the dots grow from r 14 (1×) to DOT_HANDOFF.r (84). */
export const PUSH_RATIO = 6;
export const PIVOT_R1 = DOT_HANDOFF.r / PUSH_RATIO; // 14
export const PIVOT_GAP1 = PIVOT_R1 * DOT_GAP_R; // 46.67 (= DOT_HANDOFF.gap / 6)
/** Middle dot = frame centre = the zoom's fixed point. */
export const PIVOT_C = { x: DOT_HANDOFF.cx, y: DOT_HANDOFF.cy };
/** The bubble at 1× (screen px), centred on the middle dot; the incoming tail corner is bottom-left. */
export const BUBBLE_1X = { w: 2 * PIVOT_GAP1 + 2 * PIVOT_R1 + 2 * 34, h: 2 * PIVOT_R1 + 2 * 26, r: 40, tail: 12 };

const EIGHTH = 15;
/** s04 frame where the bubble pops in: the first eighth ≥ 26 f after "money" (the cards are being thrown off). */
export const PIVOT_POP_S04 = Math.ceil((voWord("s04-options", "money", 270) + 26) / EIGHTH) * EIGHTH;
/** The same moment in s05's frames (negative: on s05 frame 0 the bubble is already there and pulsing). */
export const PIVOT_POP_S05 = PIVOT_POP_S04 - scene("s04-options").duration;
/** The dots start their brand pulse this many frames after the pop. */
export const PIVOT_DOTS_DELAY = 4;
/** The blips cue for the dots' first pulse (three blips 9 f apart on the three peaks), in s04 frames. */
export const PIVOT_BLIPS_S04 = PIVOT_POP_S04 + PIVOT_DOTS_DELAY + 14;

export type PivotBubbleProps = {
  /** The scene's current frame. */
  frame: number;
  /** Pop frame in this scene's frames (PIVOT_POP_S04 or PIVOT_POP_S05). */
  popAt: number;
  /** Zoom about the middle dot (1 = rest). */
  s?: number;
  /** Screen drift (px). */
  d?: { x: number; y: number };
  /** 0..1: the dots' pulse settles to still (opacity 1, scale 1). */
  settle?: number;
};

export const PivotBubble: React.FC<PivotBubbleProps> = ({ frame, popAt, s = 1, d = { x: 0, y: 0 }, settle = 0 }) => {
  if (frame < popAt) return null;
  const C = PIVOT_C;
  const project = (x: number, y: number) => ({ x: C.x + (x - C.x) * s + d.x, y: C.y + (y - C.y) * s + d.y });
  // Pop: uiPop about the tail corner (bottom-left), from 0.55× and 22 px low.
  const pop = springAt(frame, popAt, "uiPop");
  const ps = lerp(0.55, 1, pop);
  const popY = (1 - pop) * 22;
  const b0 = { x: C.x - BUBBLE_1X.w / 2, y: C.y - BUBBLE_1X.h / 2 };
  const tail = { x: b0.x, y: b0.y + BUBBLE_1X.h };
  const popAbout = (x: number, y: number) => ({ x: tail.x + (x - tail.x) * ps, y: tail.y + (y - tail.y) * ps + popY });
  const p0 = popAbout(b0.x, b0.y);
  const tl = project(p0.x, p0.y);
  const k = s * ps; // total scale of the bubble and the dots
  const fadeIn = clamp01((frame - popAt + 1) / 4);
  const dots = typingDots(frame, { mode: "pulse", start: popAt + PIVOT_DOTS_DELAY, min: 0.35 });
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: tl.x,
          top: tl.y,
          width: BUBBLE_1X.w * k,
          height: BUBBLE_1X.h * k,
          background: N.surface,
          borderRadius: `${BUBBLE_1X.r * k}px ${BUBBLE_1X.r * k}px ${BUBBLE_1X.r * k}px ${BUBBLE_1X.tail * k}px`,
          opacity: fadeIn,
        }}
      />
      {dots.map((dot, i) => {
        const p = popAbout(C.x + (i - 1) * PIVOT_GAP1, C.y);
        const c = project(p.x, p.y);
        const pulse = 1 + ((dot.scale ?? 1) - 1) * (1 - settle);
        const r = PIVOT_R1 * k * pulse;
        const op = lerp(dot.opacity ?? 1, 1, settle) * fadeIn;
        return <div key={i} style={{ position: "absolute", left: c.x - r, top: c.y - r, width: 2 * r, height: 2 * r, borderRadius: r, background: N.inkMuted, opacity: op }} />;
      })}
    </>
  );
};
