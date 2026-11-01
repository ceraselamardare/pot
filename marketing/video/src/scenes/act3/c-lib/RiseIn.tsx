// Builder C: a block that arrives like the house words (rise 48 px out of a vertical smear on `land`, opacity only as
// a helper) and leaves on `exit` (up + smear). For TypeZone blocks that are not plain words (MoneyRoll, a GoalBar).
import React from "react";
import { useCurrentFrame } from "remotion";
import { DirectionalBlur, exit as exitEase, land, lerp, ramp } from "../../../motion";

export const RiseIn: React.FC<{ at: number; exitAt?: number; rise?: number; duration?: number; style?: React.CSSProperties; children: React.ReactNode }> = ({
  at,
  exitAt,
  rise = 48,
  duration = 20,
  style,
  children,
}) => {
  const f = useCurrentFrame();
  if (f < at) return null;
  const e = ramp(f, at, at + duration, land);
  const q = exitAt !== undefined ? ramp(f, exitAt, exitAt + 8, exitEase) : 0;
  if (q >= 1) return null;
  const opacity = lerp(0.2, 1, ramp(f, at, at + 10)) * (1 - q);
  return (
    <DirectionalBlur inline y={16 * (1 - e) + 16 * q} style={{ display: "block", transform: `translateY(${(1 - e) * rise - q * rise}px)`, opacity, ...style }}>
      {children}
    </DirectionalBlur>
  );
};
