// s10 carried objects (builder D):
// - RequestFlight: Maya's request, shaped as the push Leo will get, leaves her phone, arcs across the world (lifted
//   toward the lens, smeared on the axis of travel) and lands in Leo's lock-screen notification slot. It flies in a
//   "phone frame" that slides from Maya's world pose to Leo's (same tilt, same scale), so its last frame matches the
//   in-screen notification exactly.
// - ApprovedChip: the "✓ Approved" status chip that rides the whip from Leo's approval back to Maya's feed row
//   (screen space, tracked through the live camera: the constant-size anchor of the whip).
import React from "react";
import { useCurrentFrame } from "remotion";
import { DirectionalBlur, Layer, clamp01, inOut, lerp, springAt, type CameraPose } from "../../motion";
import { PushNotification, StatusChip, UiPiece, easeEnter } from "../../ui";
import { PHONE_HOME, PHONE_SCALE, WORLD } from "../shared/world";
import { project, screenToLocal, worldOfScreen, type V3 } from "./s09-shared";

/** Phone-local centre of the lock-screen notification (stackTop 330: rect 8, 330, 374 × 82). */
export const NOTIF_LOCAL = screenToLocal(195, 371);

/** Two phases: it emerges from Leo's row on the lifted timeline (grows, lifts, readable for a beat), then whooshes
 *  across in an arc on `inOut` and settles into the notification slot. */
const flightAt = (f: number, start: number, end: number, from: V3, emerge: number) => {
  const g = clamp01((f - start) / emerge);
  const ge = easeEnter(g);
  const t = clamp01((f - start - emerge) / (end - start - emerge));
  const e = inOut(t);
  const arc = Math.sin(Math.PI * t);
  return {
    outerX: lerp(WORLD.maya.x, WORLD.leo.x, e),
    x: lerp(from.x + 40 * ge, NOTIF_LOCAL.x, e),
    y: lerp(from.y - 70 * ge, NOTIF_LOCAL.y, e) - 300 * arc,
    z: lerp(from.z + 60 * ge, 1.5, e) + 260 * arc,
    scale: lerp(lerp(0.35, 0.95, ge), 1, e) * (1 + 0.45 * arc),
    rotZ: lerp(-6 * ge, 0, e) - 5 * arc,
  };
};

export const RequestFlight: React.FC<{ start: number; end: number; from: V3; camScale: number; emerge?: number }> = ({ start, end, from, camScale, emerge = 9 }) => {
  const f = useCurrentFrame();
  if (f < start || f > end + 4) return null;
  const p = flightAt(f, start, end, from, emerge);
  const prev = flightAt(f - 1, start, end, from, emerge);
  // screen-space speed along x (world px × camera scale), smeared on that axis only
  const v = Math.abs(p.outerX - prev.outerX) * camScale;
  const sigma = Math.min(10, Math.max(0, v - 12) * 0.18);
  const fade = f > end ? 1 - clamp01((f - end) / 4) : 1;
  return (
    <Layer x={p.outerX} rotX={PHONE_HOME.rotX} rotY={PHONE_HOME.rotY} rotZ={PHONE_HOME.rotZ} scale={PHONE_SCALE}>
      <Layer x={p.x} y={p.y} z={p.z} rotZ={p.rotZ} scale={p.scale}>
        <DirectionalBlur inline x={sigma} region={0.5} style={{ opacity: fade * clamp01((f - start + 1) / 3) }}>
          <UiPiece theme="day" width={374}>
            <PushNotification variant="lock" tone="light" progress={1} />
          </UiPiece>
        </DirectionalBlur>
      </Layer>
    </Layer>
  );
};

/** The "✓ Approved" chip that carries Leo's approval home during the whip (screen-space overlay). It pops out of
 *  Leo's "Approved!" check, then its path weight follows the camera's own whip progress, so it holds a near-constant
 *  screen position while the world whips past (the anchor), and lands on Maya's feed row chip as the camera lands. */
export const ApprovedChip: React.FC<{
  cam: CameraPose;
  /** The live camera at the whip's first and last frames (incl. drift), for a clean screen-space path. */
  camStart: CameraPose;
  camEnd: CameraPose;
  popAt: number;
  /** The whip: same frames and ease as the camera key. */
  moveStart: number;
  moveEnd: number;
  ease: (t: number) => number;
  fromLeo: { x: number; y: number };
  toMaya: { x: number; y: number };
}> = ({ cam, camStart, camEnd, popAt, moveStart, moveEnd, ease, fromLeo, toMaya }) => {
  const f = useCurrentFrame();
  if (f < popAt || f > moveEnd + 2) return null;
  const t = clamp01((f - moveStart) / (moveEnd - moveStart));
  const u = ease(t);
  const wLeo = worldOfScreen("leo", fromLeo.x, fromLeo.y);
  const wMaya = worldOfScreen("maya", toMaya.x, toMaya.y);
  // before the move it sits on Leo's check (live); during the whip it glides on a straight screen path; it lands
  // on Maya's chip slot (live) as the camera lands
  const a = f < moveStart ? project(wLeo, cam) : project(wLeo, camStart);
  const b = f >= moveEnd ? project(wMaya, cam) : project(wMaya, camEnd);
  const sA = a.k * (f < moveStart ? cam.scale : camStart.scale) * PHONE_SCALE;
  const sB = b.k * (f >= moveEnd ? cam.scale : camEnd.scale) * PHONE_SCALE;
  const pop = Math.min(1, springAt(f, popAt, "uiPop"));
  const lift = 1 + 0.55 * Math.sin(Math.PI * t) + 0.25 * (1 - t);
  const s = lerp(sA, sB, u) * lift * pop;
  const x = lerp(a.x, b.x, u);
  const y = lerp(a.y, b.y, u) - 80 * Math.sin(Math.PI * t);
  const shadow = 1 - Math.abs(2 * t - 1);
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `translate(-50%, -50%) scale(${s})`,
        transformOrigin: "50% 50%",
        pointerEvents: "none",
        filter: `drop-shadow(0 ${2 + 8 * shadow}px ${4 + 12 * shadow}px rgba(43, 27, 58, ${0.1 + 0.08 * shadow}))`,
      }}
    >
      <UiPiece theme="day" width={101}>
        <StatusChip status="approved" />
      </UiPiece>
    </div>
  );
};
