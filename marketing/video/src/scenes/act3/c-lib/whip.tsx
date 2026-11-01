// Builder C: the s07 → s08 "app switch" whip INSIDE Maya's phone screen (same phone, the screen changes).
// It is the film's blur-matched cut whip (research §3.7) at screen scale: the outgoing app (A) accelerates RIGHT on
// `exit` while its smear ramps over its last OUT frames; hard cut at peak speed exactly on the scene boundary; the
// incoming app (B) continues the vector from the left, starts fully smeared and clears on `whip`. Rightward, because
// the camera move across the same cut carries the phone right (toward frame centre): one direction of travel.
// `g` = frames relative to the cut (s07 renders g < 0, s08 renders g >= 0), so both halves share one curve.
import React from "react";
import { DirectionalBlur, exit as exitEase, whip as whipEase, clamp01, smearSigma } from "../../../motion";

/** Frames of A before the cut, and of B after it. */
export const SCREEN_WHIP = { out: 6, in: 16, travel: 280, k: 0.6 } as const;

const bOff = (g: number) => SCREEN_WHIP.travel * (1 - whipEase(clamp01(g / SCREEN_WHIP.in)));
/** B's first-frame speed (px/f): A's last frame matches it. */
const V = SCREEN_WHIP.travel - bOff(1);
const DA = (V * SCREEN_WHIP.out) / 2.26; // exit's end slope ≈ 2.26 (measured)
const aOff = (g: number) => DA * exitEase(clamp01((g + SCREEN_WHIP.out) / SCREEN_WHIP.out));

/** Direction of travel of the screen content (+1 = right). */
const DIR = 1;

/** Horizontal offset (px, positive = right) and smear σ (px) of the screen content at `g`. */
export const screenWhipAt = (g: number): { side: "A" | "B"; dx: number; sigma: number } => {
  if (g < 0) {
    const d = aOff(g);
    const speed = Math.abs(aOff(g + 0.5) - aOff(g - 0.5));
    return { side: "A", dx: DIR * d, sigma: smearSigma(speed, SCREEN_WHIP.k) };
  }
  const d = bOff(g);
  const speed = Math.abs(bOff(g + 0.5) - bOff(g - 0.5));
  return { side: "B", dx: -DIR * d, sigma: smearSigma(g < 1 ? Math.max(speed, V) : speed, SCREEN_WHIP.k) };
};

/** Wraps the screen content: translates + smears it, with its own ground overscanned behind (bleed). */
export const ScreenWhipLayer: React.FC<{ g: number | null; bleed: string; children: React.ReactNode }> = ({ g, bleed, children }) => {
  if (g === null || g < -SCREEN_WHIP.out || g > SCREEN_WHIP.in) return <>{children}</>;
  const { dx, sigma } = screenWhipAt(g);
  const over = Math.abs(dx) + 3 * sigma + 4;
  return (
    <div style={{ position: "absolute", inset: 0, transform: `translateX(${dx}px)` }}>
      <DirectionalBlur x={sigma} region={Math.min(0.9, (over / 390) * 1.05)}>
        <div style={{ position: "absolute", left: -over, right: -over, top: 0, bottom: 0, background: bleed }} />
        <div style={{ position: "absolute", inset: 0 }}>{children}</div>
      </DirectionalBlur>
    </div>
  );
};
