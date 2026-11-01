// Builder C: where a point of a world phone lands on screen (1920 × 1080 px) for a camera pose. It replays the
// exact CSS transform chain of <WorldStage> → <Camera> → <WorldPhone>'s <Layer> → <Slab> → <Phone> (perspective
// 2600 about the stage centre) with DOMMatrix, so screen-space overlays (a flying card, a chip) can start or land
// exactly on an in-phone element. Pure function of its inputs; runs in the render browser (DOMMatrix).
import { cameraTransform, layerTransform, type CameraPose, type LayerPose } from "../../../motion";
import { PHONE_H, PHONE_W, SCREEN_RECT } from "../../../ui";
import { PHONE_HOME, PHONE_SCALE, WORLD } from "../../shared";

export type Rot = { rotX: number; rotY: number; rotZ: number };

const W = 1920;
const H = 1080;
const ORIGIN = `translate(${W / 2}px, ${H / 2}px)`;
const UNORIGIN = `translate(${-W / 2}px, ${-H / 2}px)`;

/** The WorldPhone layer pose for `who` (same maths as <WorldPhone>). */
export const phoneLayerPose = (who: keyof typeof WORLD, rotation: Rot = PHONE_HOME, pose: Partial<LayerPose> = {}): LayerPose => ({
  x: WORLD[who].x + (pose.x ?? 0),
  y: WORLD[who].y + (pose.y ?? 0),
  z: pose.z ?? 0,
  rotX: rotation.rotX + (pose.rotX ?? 0),
  rotY: rotation.rotY + (pose.rotY ?? 0),
  rotZ: rotation.rotZ + (pose.rotZ ?? 0),
  scale: PHONE_SCALE * (pose.scale ?? 1),
});

const worldMatrix = (cam: CameraPose, layer: LayerPose, perspective: number) =>
  new DOMMatrix(`${ORIGIN} perspective(${perspective}px) ${UNORIGIN}`)
    .multiply(new DOMMatrix(`${ORIGIN} ${cameraTransform(cam)} ${UNORIGIN}`))
    .multiply(new DOMMatrix(`${ORIGIN} ${layerTransform(layer)} ${UNORIGIN}`));

/** Project a point given in the phone's LOCAL 3D space (origin = phone centre, phone px, z toward the lens). */
export const projectPhoneLocal = (
  cam: CameraPose,
  layer: LayerPose,
  lx: number,
  ly: number,
  lz = 1,
  perspective = 2600,
): { x: number; y: number; k: number } => {
  const m = worldMatrix(cam, layer, perspective);
  const at = (x: number, y: number) => {
    const p = m.transformPoint(new DOMPoint(W / 2 + x, H / 2 + y, lz, 1));
    return { x: p.x / p.w, y: p.y / p.w };
  };
  const a = at(lx, ly);
  const b = at(lx + 10, ly);
  const c = at(lx, ly + 10);
  // local magnification: average of the projected x and y unit lengths
  const k = (Math.hypot(b.x - a.x, b.y - a.y) + Math.hypot(c.x - a.x, c.y - a.y)) / 20;
  return { x: a.x, y: a.y, k };
};

/** Phone-local offset (from the phone centre) of a point in SCREEN coordinates (390 × 844, from the screen's top-left). */
export const screenToLocal = (sx: number, sy: number) => ({ x: SCREEN_RECT.x + sx - PHONE_W / 2, y: SCREEN_RECT.y + sy - PHONE_H / 2 });

/** Project a point of a world phone's SCREEN (390 × 844 logical px) to the frame. */
export const projectScreenPoint = (
  cam: CameraPose,
  who: keyof typeof WORLD,
  sx: number,
  sy: number,
  rotation: Rot = PHONE_HOME,
  pose: Partial<LayerPose> = {},
) => {
  const l = screenToLocal(sx, sy);
  return projectPhoneLocal(cam, phoneLayerPose(who, rotation, pose), l.x, l.y, 1);
};
