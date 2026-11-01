// The app's motion tokens (ux-spec §7.6 / apps/web globals.css), for frame-driven props.
import { Easing } from "remotion";

export const easeStandard = Easing.bezier(0.2, 0, 0, 1);
export const easeEnter = Easing.bezier(0.05, 0.7, 0.1, 1);
export const easeExit = Easing.bezier(0.3, 0, 0.8, 0.15);

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** Map x from [a, b] to 0..1, clamped. */
export const span = (x: number, a: number, b: number) => clamp01((x - a) / (b - a));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The app's `pot-pop` keyframes (320 ms, ease-enter): scale .4 → 1.12 (60 %) → 1, opacity 0 → 1 (60 %). */
export function pop(p: number): { scale: number; opacity: number } {
  const t = easeEnter(clamp01(p));
  if (t < 0.6) return { scale: 0.4 + 0.72 * (t / 0.6), opacity: t / 0.6 };
  return { scale: 1.12 - 0.12 * ((t - 0.6) / 0.4), opacity: 1 };
}

/** App durations in ms. */
export const MS = { fast: 120, base: 200, moderate: 280, slow: 360, count: 500, celebrate: 600, dotsLoop: 1200, minChecking: 1200 } as const;
