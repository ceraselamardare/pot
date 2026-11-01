// The brand's one celebration (apps/web/components/money/Celebration.tsx): 12 particles, 6-8 px, `brand` with
// every 4th `brand-deep`, leaving the centre of the (relative) parent, travelling 40-72 px, scaling to 0.2 and
// fading to 0 over 600 ms with ease-enter. Same deterministic geometry as the app. Reserved for
// "Approved by Pot rules" (and the logo reveal).
import React from "react";
import { easeEnter, clamp01 } from "../ease";
import { useUi } from "../theme";

export const PARTICLES = Array.from({ length: 12 }, (_, i) => {
  const angle = (i / 12) * Math.PI * 2 + (i % 2 ? 0.18 : -0.12);
  const dist = 40 + ((i * 37) % 33); // 40-72 px
  return {
    dx: Math.round(Math.cos(angle) * dist),
    dy: Math.round(Math.sin(angle) * dist),
    size: i % 3 === 0 ? 8 : i % 3 === 1 ? 7 : 6,
    deep: i % 4 === 0,
  };
});

export const Celebration: React.FC<{
  /** 0..1 linear time through the 600 ms burst (frames 0-36 at 60 fps). Renders nothing at 0 or ≥ 1. */
  progress: number;
  /** "app": the app's exact curve (ease-enter on everything: particles fade within ~150 ms).
   *  "cinematic": same paths, but the fade and shrink wait for the last 60 % (reads on video). */
  variant?: "app" | "cinematic";
  /** Multiplies travel distance (cinematic variants; 1 = the app). */
  distance?: number;
  /** Multiplies particle size (1 = the app). */
  size?: number;
  /** Centre offset from the parent's centre, px. */
  originX?: number;
  originY?: number;
  style?: React.CSSProperties;
}> = ({ progress, variant = "app", distance = 1, size = 1, originX = 0, originY = 0, style }) => {
  const { c } = useUi();
  if (progress <= 0 || progress >= 1) return null;
  const p = clamp01(progress);
  const e = easeEnter(p);
  // fade/shrink amount: the app ties it to the travel; cinematic holds the particles bright, then fades (ease-in)
  const f = variant === "app" ? e : Math.pow(clamp01((p - 0.4) / 0.6), 1.6);
  return (
    <span aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible", zIndex: 10, ...style }}>
      {PARTICLES.map((q, i) => {
        const s = q.size * size;
        return (
          <span
            key={i}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: s,
              height: s,
              borderRadius: 999,
              background: q.deep ? c.brandDeep : c.brand,
              opacity: 1 - f,
              transform: `translate(-50%, -50%) translate(${originX + q.dx * distance * e}px, ${originY + q.dy * distance * e}px) scale(${1 - 0.8 * f})`,
            }}
          />
        );
      })}
    </span>
  );
};
