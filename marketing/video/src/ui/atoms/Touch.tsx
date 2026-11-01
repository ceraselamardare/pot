// Video-only helpers (not in the app), frame-driven: the press curve + touch dot (the main tap language), a
// finger-tap ripple (kept for special moments) and a blinking text caret.
import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { day } from "../../brand/tokens";
import { clamp01, easeEnter, easeStandard } from "../ease";
import { alpha, useUi } from "../theme";

/**
 * The press curve for any `pressed` prop: 0 → 1 over `inFrames` (4-6 f), held, then 1 → 0 over `outFrames`
 * (10-12 f) after `holdFrames`. `frame` is relative to the moment the finger lands.
 */
export function pressAt(frame: number, opts?: { inFrames?: number; holdFrames?: number; outFrames?: number }): number {
  const { inFrames = 5, holdFrames = 2, outFrames = 11 } = opts ?? {};
  if (frame < 0) return 0;
  if (frame < inFrames) return easeStandard(frame / inFrames);
  const r = frame - inFrames - holdFrames;
  if (r < 0) return 1;
  if (r < outFrames) return 1 - easeStandard(r / outFrames);
  return 0;
}

/**
 * The touch dot: a ~44 px eggplant disc at 18 % opacity at the tap point, visible only while pressed.
 * Place it in screen coordinates (inside the phone screen) or pass `inside` to centre it in a positioned parent.
 * In Night the default colour is the Night ink (eggplant would vanish on eggplant); override with `color`.
 */
export const TouchDot: React.FC<{
  /** 0..1 press amount (use the same value as the button's `pressed`). */
  press: number;
  x?: number;
  y?: number;
  /** Centre in the positioned parent instead of x/y. */
  inside?: boolean;
  size?: number;
  color?: string;
  opacity?: number;
  style?: React.CSSProperties;
}> = ({ press, x = 0, y = 0, inside, size = 44, color, opacity = 0.18, style }) => {
  const { theme, c } = useUi();
  const p = clamp01(press);
  if (p <= 0) return null;
  const col = color ?? (theme === "night" ? c.ink : day.ink);
  return (
    <span
      aria-hidden
      style={{
        position: "absolute",
        left: inside ? "50%" : x,
        top: inside ? "50%" : y,
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        borderRadius: 999,
        background: alpha(col, opacity * p),
        transform: `scale(${0.8 + 0.2 * p})`,
        pointerEvents: "none",
        zIndex: 60,
        ...style,
      }}
    />
  );
};

/**
 * A soft finger tap: 0 → 0.3 the press (a filled disc grows in), 0.3 → 1 the release ring expands and fades.
 * Ink at low alpha. Position (x, y) is the tap centre inside the positioned parent (e.g. the phone screen).
 */
export const TapRipple: React.FC<{
  x: number;
  y: number;
  /** 0..1 through the tap (≈ 24-30 frames at 60 fps feels natural). */
  progress: number;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}> = ({ x, y, progress, size = 44, color, style }) => {
  const { c } = useUi();
  if (progress <= 0 || progress >= 1) return null;
  const ink = color ?? c.ink;
  const press = easeStandard(clamp01(progress / 0.3));
  const rel = easeEnter(clamp01((progress - 0.3) / 0.7));
  const discA = 0.22 * press * (1 - rel);
  const ringScale = 1 + 0.9 * rel;
  const ringA = 0.35 * (progress < 0.3 ? press : 1 - rel);
  return (
    <span aria-hidden style={{ position: "absolute", left: x, top: y, width: 0, height: 0, zIndex: 60, pointerEvents: "none", ...style }}>
      <span
        style={{
          position: "absolute",
          left: -size / 2,
          top: -size / 2,
          width: size,
          height: size,
          borderRadius: 999,
          background: alpha(ink, discA),
          transform: `scale(${0.6 + 0.4 * press})`,
        }}
      />
      <span
        style={{
          position: "absolute",
          left: -size / 2,
          top: -size / 2,
          width: size,
          height: size,
          borderRadius: 999,
          boxSizing: "border-box",
          border: `2px solid ${alpha(ink, ringA)}`,
          transform: `scale(${ringScale})`,
        }}
      />
    </span>
  );
};

/** A blinking text caret (2 px, the theme's `focus` colour by default), 1.06 s period like iOS. */
export const Caret: React.FC<{
  frame?: number;
  height?: number;
  color?: string;
  /** false = always visible (e.g. while typing, carets don't blink). */
  blink?: boolean;
  periodMs?: number;
  style?: React.CSSProperties;
}> = ({ frame, height = 22, color, blink = true, periodMs = 1060, style }) => {
  const { c } = useUi();
  const cur = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame ?? cur;
  const t = ((f / fps) * 1000) % periodMs;
  const on = !blink || t < periodMs / 2;
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: 2,
        height,
        borderRadius: 1,
        background: color ?? c.focus,
        opacity: on ? 1 : 0,
        verticalAlign: "middle",
        flexShrink: 0,
        ...style,
      }}
    />
  );
};
