// Minimal 4×4 math that mirrors the CSS transform chain of the motion kit's 3D stage, so screen-space overlays
// (callouts, leader lines, the request pulse, the screen-off rect) land exactly on 3D objects.
//   Stage3D (perspective d, origin centre) → Camera (cameraTransform) → Layer (layerTransform) → child
// Every element in that chain is a full-stage AbsoluteFill with transform-origin 50% 50%, so all origins sit at
// the stage centre and a point is written relative to it (x right, y down, z toward the viewer).
import type { CameraPose, LayerPose } from "../../motion";

export type Vec3 = [number, number, number];
/** Row-major 4×4. */
export type Mat4 = number[];

export const STAGE_W = 1920;
export const STAGE_H = 1080;

const rad = (deg: number) => (deg * Math.PI) / 180;

export const identity = (): Mat4 => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export const mul = (a: Mat4, b: Mat4): Mat4 => {
  const o = new Array<number>(16).fill(0);
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[r * 4 + k] * b[k * 4 + c];
      o[r * 4 + c] = s;
    }
  return o;
};

export const chain = (...ms: Mat4[]): Mat4 => ms.reduce((acc, m) => mul(acc, m), identity());

export const translate = (x: number, y: number, z = 0): Mat4 => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1];

/** CSS rotateX(a): y' = y cos a − z sin a, z' = y sin a + z cos a (positive tips the top away). */
export const rotX = (deg: number): Mat4 => {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1];
};

/** CSS rotateY(a): x' = x cos a + z sin a, z' = −x sin a + z cos a (positive turns the right side away). */
export const rotY = (deg: number): Mat4 => {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1];
};

/** CSS rotateZ(a): clockwise on screen for positive a (y points down). */
export const rotZ = (deg: number): Mat4 => {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
};

/** CSS scale(s): 2D (z untouched). */
export const scale2 = (s: number): Mat4 => [s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** = motion kit cameraTransform(): translate3d(x,y,z) rotX rotY rotZ scale(s) translate(−cx, −cy). */
export const cameraMatrix = (p: CameraPose): Mat4 =>
  chain(translate(p.x, p.y, p.z), rotX(p.rotX), rotY(p.rotY), rotZ(p.rotZ), scale2(p.scale), translate(-p.cx, -p.cy, 0));

/** = motion kit layerTransform(): translate3d(x,y,z) rotX rotY rotZ scale(s). */
export const layerMatrix = (p: Partial<LayerPose>): Mat4 =>
  chain(translate(p.x ?? 0, p.y ?? 0, p.z ?? 0), rotX(p.rotX ?? 0), rotY(p.rotY ?? 0), rotZ(p.rotZ ?? 0), scale2(p.scale ?? 1));

export const apply = (m: Mat4, v: Vec3): Vec3 => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2] + m[3],
  m[4] * v[0] + m[5] * v[1] + m[6] * v[2] + m[7],
  m[8] * v[0] + m[9] * v[1] + m[10] * v[2] + m[11],
];

/** Perspective projection of a stage-centred point to screen px (Stage3D: perspective d, origin at the centre). */
export const project = (v: Vec3, d = 2600): { x: number; y: number; depth: number; k: number } => {
  const k = d / (d - v[2]);
  return { x: STAGE_W / 2 + v[0] * k, y: STAGE_H / 2 + v[1] * k, depth: v[2], k };
};

/** Screen position of a point given in a layer's local coordinates (px from the layer's centre). */
export const toScreen = (m: Mat4, local: Vec3, d = 2600) => project(apply(m, local), d);
