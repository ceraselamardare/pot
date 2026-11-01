// Very soft member-colour glows far behind the phone (Act 3 staging). Radial gradients, no CSS blur:
// nearly free to render. They wander slowly with noise so the background is never static.
import React from "react";
import { AbsoluteFill, random, useCurrentFrame, useVideoConfig } from "remotion";
import { noise2D } from "@remotion/noise";
import { alpha } from "../color";

export const Orbs: React.FC<{
  /** Token colours (member-1..6 on cream; brand-soft for warmth). */
  colors: string[];
  /** Peak opacity of each orb (default 0.15 ≈ the storyboard's "about 15 %"). */
  opacity?: number;
  /** Orb radius in px (default 560). */
  radius?: number;
  /** Wander distance in px (default 90). */
  wander?: number;
  /** Noise cycles per second (default 0.05). */
  speed?: number;
  seed?: string;
  /** Explicit centres as fractions (else seeded positions around the frame centre). */
  positions?: [number, number][];
}> = ({ colors, opacity = 0.15, radius = 560, wander = 90, speed = 0.05, seed = "orbs", positions }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const t = (frame / fps) * speed;
  const layers = colors.map((c, i) => {
    const [fx, fy] = positions?.[i] ?? [0.2 + random(`${seed}-x-${i}`) * 0.6, 0.2 + random(`${seed}-y-${i}`) * 0.6];
    const x = fx * width + noise2D(`${seed}-wx-${i}`, t, i) * wander;
    const y = fy * height + noise2D(`${seed}-wy-${i}`, t, i + 7) * wander;
    return `radial-gradient(circle ${radius}px at ${x}px ${y}px, ${alpha(c, opacity)} 0%, ${alpha(c, opacity * 0.45)} 40%, ${alpha(c, 0)} 100%)`;
  });
  return <AbsoluteFill aria-hidden style={{ background: layers.join(", "), pointerEvents: "none" }} />;
};
