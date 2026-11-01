// The film's ONE blur grammar (research §3.8): a directional smear via an SVG
// <feGaussianBlur stdDeviation="X 0"> (CSS blur() reads as defocus). It peaks on a move's first frame,
// decays ×0.7 per frame and is gone in 6-8 f. Smear σ ≈ 0.5-1 × that frame's displacement, capped
// (words 12-45 px, whips up to ~100 px, never above 0.15 W). Optional ghosts at 0.22 / 0.12 / 0.06.
// Far cheaper than @remotion/motion-blur (one filter pass vs N re-renders of the children).
// A filter flattens 3D: wrap a whole <Stage3D> or a leaf element, never a <Layer> inside a <Camera>.
import React, { useId } from "react";
import { useCurrentFrame } from "remotion";
import { velocity } from "../easing";

const cleanId = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, "");

/** Below this std-dev (px) the filter is skipped (same DOM, filter: none). */
const EPS = 0.25;

/** Per-axis Gaussian blur. x / y are std-deviations in px. The DOM shape never changes when the blur
 *  turns on/off, so children are never remounted. Blurred edges fade to transparent: for full-frame
 *  scenes put a ground-coloured backdrop behind the children (the whips' `bleed`). */
export const DirectionalBlur: React.FC<{
  x?: number;
  y?: number;
  /** Render as a full-size block (default) or an inline-block span. */
  inline?: boolean;
  /** Filter region padding as a fraction of the element box (default 0.15 block, 0.6 inline). */
  region?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ x = 0, y = 0, inline = false, region, style, children }) => {
  const id = `dblur-${cleanId(useId())}`;
  const sx = Math.abs(x) < EPS ? 0 : Math.abs(x);
  const sy = Math.abs(y) < EPS ? 0 : Math.abs(y);
  const on = sx > 0 || sy > 0;
  const Tag = inline ? "span" : "div";
  const pad = (region ?? (inline ? 0.6 : 0.15)) * 100;
  return (
    <Tag
      style={{
        position: inline ? "relative" : "absolute",
        ...(inline ? { display: "inline-block" } : { inset: 0 }),
        filter: on ? `url(#${id})` : undefined,
        ...style,
      }}
    >
      <svg width={0} height={0} style={{ position: "absolute", width: 0, height: 0 }} aria-hidden>
        <defs>
          <filter id={id} x={`${-pad}%`} y={`${-pad}%`} width={`${100 + 2 * pad}%`} height={`${100 + 2 * pad}%`} colorInterpolationFilters="sRGB">
            <feGaussianBlur stdDeviation={`${sx} ${sy}`} />
          </filter>
        </defs>
      </svg>
      {children}
    </Tag>
  );
};

/** Smear σ (px) for a move of `pxPerFrame` this frame: k × displacement (k 0.5-1, default 0.5), capped. */
export const smearSigma = (pxPerFrame: number, k = 0.5, max = 96) => Math.min(max, Math.abs(pxPerFrame) * k);

/** A smear that peaks at `at` and decays ×`decay` per frame (default 0.7: gone in 6-8 f). */
export const smearDecay = (frame: number, at: number, peak: number, decay = 0.7) => (frame < at ? 0 : peak * Math.pow(decay, frame - at));

/** Ghost opacities from the research (1-3 trailing copies). */
export const GHOSTS = [0.22, 0.12, 0.06] as const;

/** Fake motion blur for anything moving fast. Give it the element's velocity in px/frame (vx / vy),
 *  or a `track` function frame → {x, y} and it differentiates for you.
 *  mode "blur": directional smear (default, cheap). mode "ghost": smear + 1-3 trailing copies at
 *  0.22 / 0.12 / 0.06 placed where the element was 1, 2, 3 frames ago (duplicates children: never put
 *  <Sfx>/<Audio> inside). */
export const FakeMotionBlur: React.FC<{
  vx?: number;
  vy?: number;
  track?: (frame: number) => { x: number; y: number };
  /** σ = k × displacement (default 0.5). */
  k?: number;
  max?: number;
  mode?: "blur" | "ghost";
  ghosts?: 1 | 2 | 3;
  inline?: boolean;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ vx = 0, vy = 0, track, k = 0.5, max = 96, mode = "blur", ghosts = 3, inline, style, children }) => {
  const frame = useCurrentFrame();
  let ux = vx;
  let uy = vy;
  if (track) {
    ux = velocity((f) => track(f).x, frame);
    uy = velocity((f) => track(f).y, frame);
  }
  const blurred = (
    <DirectionalBlur x={smearSigma(ux, k, max)} y={smearSigma(uy, k, max)} inline={inline} style={mode === "ghost" ? undefined : style}>
      {children}
    </DirectionalBlur>
  );
  if (mode !== "ghost") return blurred;
  const moving = Math.hypot(ux, uy) >= 1;
  const Tag = inline ? "span" : "div";
  return (
    <Tag style={{ position: inline ? "relative" : "absolute", ...(inline ? { display: "inline-block" } : { inset: 0 }), ...style }}>
      {moving
        ? GHOSTS.slice(0, ghosts).map((o, i) => (
            <Tag
              key={i}
              aria-hidden
              style={{ position: "absolute", inset: 0, transform: `translate(${-ux * (i + 1)}px, ${-uy * (i + 1)}px)`, opacity: o }}
            >
              {children}
            </Tag>
          ))
        : null}
      {blurred}
    </Tag>
  );
};
