// Presses (research §6, Act 3: "presses instead of TapRipple"): an eggplant touch dot at 18 %, the
// button dips to 0.97 and turns brand-deep over 4-6 f, then releases over 10-12 f.
//   const p = pressAt(frame, 120);
//   <div style={{ transform: `scale(${p.scale})`, background: p.down > 0.5 ? day.brandDeep : day.brand }} />
//   <TouchDot at={120} x={195} y={760} />
import React from "react";
import { useCurrentFrame } from "remotion";
import { day } from "../../brand/tokens";
import { alpha, blend } from "../color";
import { snappyOut, uiEase, ramp } from "../easing";

export type PressOptions = { down?: number; hold?: number; up?: number; depth?: number };

/** Press state at `frame` for a press that starts at `at`: down (0..1), scale, and the blended fill. */
export const pressAt = (frame: number, at: number, { down = 5, hold = 2, up = 11, depth = 0.03 }: PressOptions = {}) => {
  const d = ramp(frame, at, at + down, snappyOut) * (1 - ramp(frame, at + down + hold, at + down + hold + up, uiEase.standard));
  return {
    /** 0 = released, 1 = fully pressed. */
    down: d,
    scale: 1 - depth * d,
    /** Marigold → brand-deep, the product's pressed primary button. */
    brandFill: blend(day.brand, day.brandDeep, d),
  };
};

/** The finger: an eggplant dot at 18 % that lands with the press and lifts off. Position in px of the parent. */
export const TouchDot: React.FC<{ at: number; x: number; y: number; size?: number; hold?: number }> = ({ at, x, y, size = 56, hold = 10 }) => {
  const frame = useCurrentFrame();
  const t = frame - at;
  if (t < -2 || t > hold + 14) return null;
  const inP = ramp(frame, at - 2, at + 3, snappyOut);
  const outP = ramp(frame, at + hold, at + hold + 12, uiEase.exit);
  const s = (0.7 + 0.3 * inP) * (1 + 0.25 * outP);
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        borderRadius: size,
        background: alpha(day.ink, 0.18),
        opacity: inP * (1 - outP),
        transform: `scale(${s})`,
        pointerEvents: "none",
      }}
    />
  );
};
