// Builder C: a screen-space carried object (the whip anchors: the invite card, the "+ $150.00" chip). It is laid out
// at its natural size and placed by its CENTRE in frame px, with a scale, a small tilt, a directional smear from its
// own velocity (research §3.8: σ ≈ 0.5 × px/frame, capped) and a token depth shadow on a leaf plate.
import React from "react";
import { AbsoluteFill } from "remotion";
import { DirectionalBlur, depthShadow, smearSigma } from "../../../motion";

export type FlyState = { x: number; y: number; scale: number; rot?: number; opacity?: number; lift?: number };

export const Flyer: React.FC<{
  /** State at the current frame and the previous / next frames (for the smear). */
  at: FlyState;
  prev?: FlyState;
  next?: FlyState;
  /** Natural size of the content (px). */
  width: number;
  height: number;
  radius?: number;
  /** Supersampling of the content (CSS zoom) for crisp text at large scales. */
  raster?: number;
  /** Smear factor (σ = k × px/frame; research 0.5-1). Anchors that must stay legible mid-whip use less. */
  k?: number;
  maxSmear?: number;
  children: React.ReactNode;
}> = ({ at, prev, next, width, height, radius = 16, raster = 1, k: smearK = 0.5, maxSmear = 40, children }) => {
  const o = at.opacity ?? 1;
  if (o <= 0 || at.scale <= 0) return null;
  const a = prev ?? at;
  const b = next ?? at;
  const vx = (b.x - a.x) / (prev && next ? 2 : 1);
  const vy = (b.y - a.y) / (prev && next ? 2 : 1);
  const sx = smearSigma(vx, smearK, maxSmear) / Math.max(0.2, at.scale);
  const sy = smearSigma(vy, smearK, maxSmear) / Math.max(0.2, at.scale);
  const k = raster;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: at.x - width / 2,
          top: at.y - height / 2,
          width,
          height,
          transform: `rotate(${at.rot ?? 0}deg) scale(${at.scale})`,
          transformOrigin: "50% 50%",
          opacity: o,
        }}
      >
        <DirectionalBlur x={sx} y={sy} region={0.3}>
          <div aria-hidden style={{ position: "absolute", inset: 0, borderRadius: radius, boxShadow: depthShadow(at.lift ?? 160) }} />
          <div style={{ position: "absolute", left: 0, top: 0, width: width * k, height: height * k, transform: `scale(${1 / k})`, transformOrigin: "0 0" }}>
            <div style={{ zoom: k }}>{children}</div>
          </div>
        </DirectionalBlur>
      </div>
    </AbsoluteFill>
  );
};
