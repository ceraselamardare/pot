// Full-frame finishing overlays (research §3.8): Vignette (≤ 10 %), FlashFrame (sparingly), and the Glow
// halo (only as a 0.3 s event). Token colours only. No light leaks (research: off-token, cheap).
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { day } from "../../brand/tokens";
import { alpha } from "../color";
import { softInOut, clamp01 } from "../easing";

/** Research cap: vignette 10 % at most. */
export const VIGNETTE_MAX = 0.1;

/** Soft edge darkening in eggplant (Day) or black (Night, as the Night token shadows). strength ≤ 0.1. */
export const Vignette: React.FC<{
  /** 0..0.1 (default 0.08; clamped to 0.1). */
  strength?: number;
  /** Where the darkening starts, as % of the half-diagonal (default 55). */
  inner?: number;
  theme?: "day" | "night";
  style?: React.CSSProperties;
}> = ({ strength = 0.08, inner = 55, theme = "night", style }) => {
  const s = Math.min(VIGNETTE_MAX, Math.max(0, strength));
  const c = theme === "day" ? day.ink : "#000000";
  return (
    <AbsoluteFill
      aria-hidden
      style={{
        pointerEvents: "none",
        background: `radial-gradient(ellipse 75% 75% at 50% 50%, ${alpha(c, 0)} ${inner}%, ${alpha(c, s * 0.55)} ${inner + (100 - inner) * 0.6}%, ${alpha(c, s)} 100%)`,
        ...style,
      }}
    />
  );
};

/** A brief brightness lift on a hit. Research: white flashes read cheap. Use at most on the s06 hit,
 *  low (default 0.12), or in a token colour. Peaks at `at`, decays over `duration` frames. */
export const FlashFrame: React.FC<{
  at: number;
  duration?: number;
  intensity?: number;
  /** Token colour (default Day surface white). */
  color?: string;
  blend?: React.CSSProperties["mixBlendMode"];
}> = ({ at, duration = 8, intensity = 0.12, color = day.surface, blend = "normal" }) => {
  const frame = useCurrentFrame();
  const t = frame - at;
  if (t < 0 || t > duration) return null;
  return <AbsoluteFill aria-hidden style={{ background: color, opacity: intensity * Math.exp((-4 * t) / duration), mixBlendMode: blend, pointerEvents: "none" }} />;
};

/** Research: glow only as a 0.3 s event halo (18 f): 0 → 1 → 0 starting at `at`. */
export const haloAt = (frame: number, at: number, duration = 18) => {
  const t = clamp01((frame - at) / duration);
  return t <= 0 || t >= 1 ? 0 : softInOut(Math.min(1, t * 3)) * (1 - softInOut(t));
};

/** Soft token-coloured glow around the children's alpha shape (drop-shadow based).
 *  Drive `strength` with haloAt() so it is an event, never a resting look. */
export const Glow: React.FC<{
  color?: string;
  radius?: number;
  strength?: number;
  inline?: boolean;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ color = day.brand, radius = 36, strength = 0.6, inline = true, style, children }) => {
  const Tag = inline ? "span" : "div";
  const s = Math.max(0, Math.min(1, strength));
  return (
    <Tag
      style={{
        display: inline ? "inline-block" : undefined,
        filter: s > 0.01 ? `drop-shadow(0 0 ${radius * 0.35}px ${alpha(color, s * 0.9)}) drop-shadow(0 0 ${radius}px ${alpha(color, s * 0.6)})` : undefined,
        ...style,
      }}
    >
      {children}
    </Tag>
  );
};
