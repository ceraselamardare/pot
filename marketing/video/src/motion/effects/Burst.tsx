// The brand's ONE celebration: the marigold burst. Reserved for "Approved by Pot rules" (s09) and the
// logo reveal (s06). Never for group approvals.
//   variant "ui"   = brand/README §8: 10-12 marigold particles, 6-8 px circles, leave the centre, travel
//                    40-72 px, scale and fade to 0, ease-out, once, 600 ms (36 f). Inside app replicas.
//   variant "hero" = research §6 (s09): 12 particles, 12-16 px, leave in 1 f, 30° apart ± a seeded 8°,
//                    travel 120-220 px plus +200 px in Z on `land` over 36 f, fading from 40 % of their
//                    life; optional 1 px brand-deep rim on cream. The cinematic version.
// `scale` multiplies sizes and travel on top of the variant (e.g. the s06 logo burst).
import React from "react";
import { random, useCurrentFrame } from "remotion";
import { day } from "../../brand/tokens";
import { cubicOut, land, clamp01, type Ease } from "../easing";

export const BURST_FRAMES = 36;

type BurstSpec = { count: number; size: [number, number]; travel: [number, number]; z: number; fadeFrom: number; shrink: number; ease: Ease };
export const BURST_SPECS: Record<"ui" | "hero", BurstSpec> = {
  ui: { count: 12, size: [6, 8], travel: [40, 72], z: 0, fadeFrom: 0, shrink: 1, ease: cubicOut },
  hero: { count: 12, size: [12, 16], travel: [120, 220], z: 200, fadeFrom: 0.4, shrink: 0.35, ease: land },
};

export type BurstProps = {
  /** Start frame (particles leave on this frame). */
  at: number;
  variant?: "ui" | "hero";
  /** Centre, in px of the parent (or any CSS length). Default: parent centre. */
  x?: number | string;
  y?: number | string;
  /** Multiplies sizes and travel (default 1). */
  scale?: number;
  /** Override the particle count (spec: 10-12). */
  count?: number;
  /** Frames (default 36 = 600 ms). */
  duration?: number;
  seed?: string;
  /** Token colour (default brand marigold; eggplant on a marigold ground, as in s06). */
  color?: string;
  /** 1 px rim (true = brand-deep), so marigold dots hold up on cream. */
  rim?: boolean | string;
  /** Expanding ring (logo reveal only). true = brand-soft. */
  ring?: boolean | string;
  /** Stretch particles along their path while fast (0 = round dots). */
  streak?: number;
  /** Rotate the whole pattern (deg). */
  rotate?: number;
  /** Perspective used to fake the +Z travel (default 2400). */
  perspective?: number;
  /** Launch radius in px: particles start on this circle (e.g. the logo glyph's edge) instead of the centre. */
  r0?: number;
};

export const Burst: React.FC<BurstProps> = ({
  at,
  variant = "ui",
  x = "50%",
  y = "50%",
  scale = 1,
  count,
  duration = BURST_FRAMES,
  seed = "burst",
  color = day.brand,
  rim = false,
  ring = false,
  streak = 0,
  rotate = 0,
  perspective = 2400,
  r0 = 0,
}) => {
  const frame = useCurrentFrame();
  const spec = BURST_SPECS[variant];
  const n = count ?? spec.count;
  const t = (frame - at) / duration;
  if (t < 0 || t > 1) return null;
  const e = spec.ease(clamp01(t));
  const h = 0.01;
  const de = (spec.ease(Math.min(1, t + h)) - spec.ease(Math.max(0, t - h))) / (2 * h);
  const rimColor = rim === true ? day.brandDeep : rim || undefined;
  const ringColor = typeof ring === "string" ? ring : day.brandSoft;
  const ringR = spec.travel[1] * 1.1 * scale * e;
  return (
    <div aria-hidden style={{ position: "absolute", left: x, top: y, width: 0, height: 0, pointerEvents: "none" }}>
      {ring ? (
        <div
          style={{
            position: "absolute",
            left: -ringR,
            top: -ringR,
            width: ringR * 2,
            height: ringR * 2,
            borderRadius: "50%",
            border: `${Math.max(0.5, 4 * scale * (1 - t))}px solid ${ringColor}`,
            opacity: 1 - cubicOut(t),
          }}
        />
      ) : null}
      {Array.from({ length: n }).map((_, i) => {
        const jitter = (random(`${seed}-a-${i}`) - 0.5) * 16; // ± 8°
        const angle = ((i * 360) / n + jitter + rotate) * (Math.PI / 180);
        const travel = (spec.travel[0] + random(`${seed}-d-${i}`) * (spec.travel[1] - spec.travel[0])) * scale;
        const size = (spec.size[0] + random(`${seed}-s-${i}`) * (spec.size[1] - spec.size[0])) * scale;
        const dist = r0 + travel * e;
        const zScale = spec.z > 0 ? perspective / (perspective - spec.z * e) : 1;
        const pxPerFrame = (travel * de) / duration;
        const stretch = 1 + streak * Math.min(3, pxPerFrame / size);
        const opacity = spec.fadeFrom > 0 ? 1 - clamp01((t - spec.fadeFrom) / (1 - spec.fadeFrom)) : 1 - e;
        const shrink = 1 - spec.shrink * e;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: size,
              height: size,
              marginLeft: -size / 2,
              marginTop: -size / 2,
              borderRadius: size,
              background: color,
              boxShadow: rimColor ? `0 0 0 1px ${rimColor}` : undefined,
              opacity,
              transform: `translate(${Math.cos(angle) * dist * zScale}px, ${Math.sin(angle) * dist * zScale}px) rotate(${(angle * 180) / Math.PI}deg) scale(${shrink * zScale * stretch}, ${shrink * zScale})`,
            }}
          />
        );
      })}
    </div>
  );
};
