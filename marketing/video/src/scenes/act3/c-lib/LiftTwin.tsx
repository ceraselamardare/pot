// Builder C: a breakout twin with an explicit 0..1 progress (the kit's <BreakOut> rides its own spring; these
// lifts need scene-chosen curves because they hand off to big type / a flying card). Same 3D rules as BreakOut:
// a SIBLING of the phone body inside <WorldPhone> (phone-local px, origin = phone centre), supersampled with CSS
// zoom so text stays crisp when lifted, the token depth shadow on a leaf plate, opacity only on the leaf.
import React from "react";
import { AbsoluteFill } from "remotion";
import { depthShadow, layerTransform, lerp, logLerp, type LayerPose } from "../../../motion";

export const LiftTwin: React.FC<{
  /** 0 = flat on the screen at `from`, 1 = at `to`. Values outside 0..1 extrapolate linearly (avoid). */
  t: number;
  /** In-screen centre (phone-local px, e.g. cardOffset(rect)). */
  from: { x: number; y: number };
  /** Lifted pose (phone-local px). Rotation is added to the face counter-rotation. */
  to: Partial<LayerPose>;
  /** Rotation of the phone: the lifted card counter-rotates to face the lens. */
  face?: { rotX: number; rotY: number };
  /** Start scale (default 1). */
  fromScale?: number;
  opacity?: number;
  radius?: number;
  raster?: number;
  shadow?: boolean;
  children: React.ReactNode;
}> = ({ t, from, to, face, fromScale = 1, opacity = 1, radius = 16, raster, shadow = true, children }) => {
  const endRotX = (to.rotX ?? 0) - (face?.rotX ?? 0);
  const endRotY = (to.rotY ?? 0) - (face?.rotY ?? 0);
  const endScale = to.scale ?? 1.6;
  const p: LayerPose = {
    x: lerp(from.x, to.x ?? from.x, t),
    y: lerp(from.y, to.y ?? from.y, t),
    z: lerp(2, to.z ?? 240, t),
    rotX: lerp(0, endRotX, t),
    rotY: lerp(0, endRotY, t),
    rotZ: lerp(0, to.rotZ ?? 0, t),
    scale: logLerp(fromScale, endScale, Math.max(0, t)),
  };
  if (opacity <= 0) return null;
  const k = raster ?? Math.max(1, endScale * 1.4);
  return (
    <AbsoluteFill
      style={{
        transform: layerTransform({ ...p, scale: p.scale / k }),
        transformStyle: "preserve-3d",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div style={{ position: "relative", borderRadius: radius, zoom: k, opacity }}>
        {shadow ? <div aria-hidden style={{ position: "absolute", inset: 0, borderRadius: radius, boxShadow: depthShadow(p.z) }} /> : null}
        <div style={{ position: "relative" }}>{children}</div>
      </div>
    </AbsoluteFill>
  );
};
