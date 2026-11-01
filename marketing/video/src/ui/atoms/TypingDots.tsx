// The brand's one motif (apps/web/components/feedback/TypingDots.tsx + globals.css .pot-dot): three dots, opacity
// 0.35 → 1 → 0.35 with a 2 px rise at 40 %, ease-standard, a 1200 ms loop, 150 ms stagger. Frame-driven.
import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { easeStandard } from "../ease";

/** Opacity and rise (px, negative = up) of dot `i` at time `ms` after the loop started. */
export function dotState(ms: number, i: number, loopMs = 1200, staggerMs = 150): { opacity: number; dy: number } {
  const t = ms - i * staggerMs;
  if (t < 0) return { opacity: 0.35, dy: 0 };
  const phase = (t % loopMs) / loopMs;
  if (phase < 0.4) {
    const p = easeStandard(phase / 0.4);
    return { opacity: 0.35 + 0.65 * p, dy: -2 * p };
  }
  const p = easeStandard((phase - 0.4) / 0.6);
  return { opacity: 1 - 0.65 * p, dy: -2 + 2 * p };
}

const SIZE = { sm: 6, md: 8, lg: 10 } as const;

export const TypingDots: React.FC<{
  /** Frame to evaluate (defaults to useCurrentFrame()). Pass `frame - start` to start the loop at `start`. */
  frame?: number;
  size?: keyof typeof SIZE | number;
  color?: string;
  /** Static dots (opacity 0.6), like the app's "Still checking…" / empty feed. */
  still?: boolean;
  gap?: number;
  /** Rise in px at the peak (the app uses 2). */
  rise?: number;
  style?: React.CSSProperties;
}> = ({ frame, size = "md", color = "currentColor", still, gap, rise = 2, style }) => {
  const current = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame ?? current;
  const d = typeof size === "number" ? size : SIZE[size];
  const ms = (f / fps) * 1000;
  return (
    <span aria-hidden style={{ display: "inline-flex", alignItems: "center", gap: gap ?? Math.max(4, d / 2), ...style }}>
      {[0, 1, 2].map((i) => {
        const s = still ? { opacity: 0.6, dy: 0 } : dotState(ms, i);
        return (
          <span
            key={i}
            style={{
              display: "block",
              width: d,
              height: d,
              borderRadius: 999,
              background: color,
              opacity: s.opacity,
              transform: `translateY(${(s.dy * rise) / 2}px)`,
            }}
          />
        );
      })}
    </span>
  );
};
