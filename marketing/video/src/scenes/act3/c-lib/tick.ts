// Builder C: the motion kit's "tick" roll (research §3.5) as a plain value, so an in-app MoneyText (the Pot hero)
// can roll: ~20 distinct values over 42 f with decaying steps (punch), never overshooting, landing exactly.
import { clamp01, lerp, punch, type Ease } from "../../../motion";

export const tickValue = (
  frame: number,
  at: number,
  from: number,
  to: number,
  { duration = 42, ticks = 20, ease = punch }: { duration?: number; ticks?: number; ease?: Ease } = {},
): number => {
  if (frame < at) return from;
  const lt = frame - at;
  if (lt >= duration) return to;
  // step k is shown from round(k·duration/ticks); value = ease(k/ticks) of the way, rounded to the cent
  let k = 0;
  while (k < ticks && Math.round(((k + 1) * duration) / ticks) <= lt) k++;
  if (k >= ticks) return to;
  return Math.round(lerp(from, to, ease(clamp01(k / ticks))) * 100) / 100;
};
