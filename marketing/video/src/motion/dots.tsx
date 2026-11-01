// The typing dots: the brand's one motif and the film's narrative thread
// (chat "typing…" → the s05 bubble → the logo's dots → "Checking Pot rules…" → the end card).
// One geometry everywhere (research §6): 3 dots, centre gap = 3.33 r (the logo: r 18, centres 60 apart).
// One timing function, so the dots move identically wherever they appear. typingDots() plugs straight
// into the Logo's `dots` prop; <TypingDots> draws them for chat bubbles and loaders.
import React from "react";
import { useCurrentFrame } from "remotion";
import type { DotState } from "../brand/Logo";

/** Centre-to-centre distance in units of the dot radius (logo: 60 / 18). */
export const DOT_GAP_R = 60 / 18;

export type DotsMode =
  /** Brand loader ("Checking Pot rules…"): opacity 0.35 → 1, 1200 ms loop, 150 ms stagger. */
  | "pulse"
  /** Chat "typing…" bubble: dots hop up in sequence. */
  | "bounce"
  /** Static dots (resting logo, reduced motion). */
  | "still";

export type DotsOptions = {
  mode?: DotsMode;
  /** "brand": 72 f loop, 9 f stagger (1200 / 150 ms). "eighths": each dot on an eighth note
   *  (15 f stagger, 60 f loop) so the dots pulse with the music (research: s03). */
  grid?: "brand" | "eighths";
  /** Override the loop length / stagger in frames. */
  period?: number;
  stagger?: number;
  /** Lowest opacity in pulse mode (default 0.35, brand spec). */
  min?: number;
  /** Hop height for bounce mode, in the Logo's 512-unit tile space (default 14). */
  hop?: number;
  /** Frame the loop starts (default 0). */
  start?: number;
};

/** State of the three dots at `frame`. Each: { opacity, scale, dy }. */
export const typingDots = (frame: number, opts: DotsOptions = {}): [DotState, DotState, DotState] => {
  const { mode = "pulse", grid = "brand", min = 0.35, hop = 14, start = 0 } = opts;
  const period = opts.period ?? (grid === "eighths" ? 60 : 72);
  const stagger = opts.stagger ?? (grid === "eighths" ? 15 : 9);
  const out = [0, 1, 2].map((i): DotState => {
    if (mode === "still") return { opacity: 1, scale: 1, dy: 0 };
    const local = frame - start - i * stagger;
    if (local < 0) return mode === "pulse" ? { opacity: min, scale: 1, dy: 0 } : { opacity: 0.55, scale: 1, dy: 0 };
    const ph = (local % period) / period; // 0..1
    // A soft bump in the first part of the cycle, rest otherwise ("dot, dot, dot … pause").
    const bumpLen = grid === "eighths" ? 0.25 : 0.4;
    const bump = ph < bumpLen ? Math.sin((ph / bumpLen) * Math.PI) : 0;
    if (mode === "pulse") return { opacity: min + (1 - min) * bump, scale: 1 + 0.12 * bump, dy: 0 };
    return { opacity: 0.55 + 0.45 * bump, scale: 1, dy: -hop * bump };
  });
  return out as [DotState, DotState, DotState];
};

/** Three dots with the brand geometry (centre gap 3.33 r), for chat bubbles and the rules loader.
 *  `r` is the dot radius in px; bounce height scales with r. */
export const TypingDots: React.FC<DotsOptions & { r?: number; color: string; style?: React.CSSProperties }> = ({ r = 12, color, style, ...opts }) => {
  const frame = useCurrentFrame();
  const dots = typingDots(frame, { ...opts, hop: opts.hop ?? 0.8 * r });
  const gap = DOT_GAP_R * r;
  return (
    <div aria-hidden style={{ position: "relative", width: gap * 2 + 2 * r, height: 2 * r, ...style }}>
      {dots.map((d, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: i * gap,
            top: 0,
            width: 2 * r,
            height: 2 * r,
            borderRadius: r,
            background: color,
            opacity: d.opacity,
            transform: `translateY(${d.dy ?? 0}px) scale(${d.scale ?? 1})`,
          }}
        />
      ))}
    </div>
  );
};
