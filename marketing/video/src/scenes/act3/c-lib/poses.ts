// Builder C: camera framings shared by s07 and s08 (world px; CAM.* from the shared world for the hand-offs).
// The s07 → s08 cut happens in the middle of one camera move (from the rules framing, a push into the chat close-up)
// and in the middle of the in-screen app-switch whip, so both scenes key the same move around the cut.
import type { CameraKey, CameraPose } from "../../../motion";
import { addPose, cameraAt, driftAt, inOut } from "../../../motion";
import { scene, type SceneId } from "../../../data/timeline";
import { CAM } from "../../shared";

/** s07's framing at the start of the cut move: CAM.maya after the slow creep through the rules and step 3. */
export const POSE_PRECUT: CameraPose = { ...CAM.maya, scale: 1.03 };

/** s08 chat close-up on Maya's phone: the lower half of the chat, where the invite lands. */
export const POSE_CHAT: CameraPose = { ...CAM.maya, scale: 1.6, cx: -380, cy: 112 };

/** The move that straddles the s07 → s08 cut: frames relative to the cut (s07 frame − duration = s08 frame). */
export const CUT_MOVE = { from: -10, to: 22 } as const;

/** Keys for the move, shifted into a scene's local frames (`cutAt` = the cut's local frame in that scene). */
export const cutMoveKeys = (cutAt: number): CameraKey[] => [
  { at: cutAt + CUT_MOVE.from, ...POSE_PRECUT },
  { at: cutAt + CUT_MOVE.to, ...POSE_CHAT, ease: inOut },
];

/** Same pose as useWorldCamera(id, keys) would give at scene-local `frame` (for hand-off maths at other frames). */
export const worldCamAt = (id: SceneId, keys: readonly CameraKey[], frame: number, driftScale = 1): CameraPose => {
  const base = cameraAt(frame, keys, { rest: CAM.maya, drift: false });
  const d = driftScale;
  return addPose(base, driftAt(frame + scene(id).from, { seed: "act3", amount: 8 * d, roll: 0.4 * d, tilt: 0.3 * d }));
};

/** Same, without drift (for velocities: the drift is slow). */
export const camBaseAt = (keys: readonly CameraKey[], frame: number): CameraPose => cameraAt(frame, keys, { rest: CAM.maya, drift: false });
