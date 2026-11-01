// Camera rig: a CSS-3D stage, a keyframed camera that moves the "world", 3D layers, parallax,
// organic drift, the held-pose phone entry, phone thickness and breakouts. Pure functions of the frame.
// Recipes: brief/research-hypermotion.md §3.6.
//
//   const cam = useCamera([
//     { at: 0, scale: 1, rotY: -18 },
//     { at: beats(2), scale: 1.4, cx: 120, cy: -200, ease: speedRamp },   // push 1.4× toward a point
//   ], { creep: { start: 0, end: 300 } });                                // + the 4-8 % scene push
//   <Stage3D perspective={2600}>
//     <Camera pose={cam}>
//       <Layer><Slab width={390} height={844} radius={56}><Phone/></Slab></Layer>
//       <BreakOut at={90} returnAt={210} from={{ y: -98 }}><ApprovedCard/></BreakOut>   // sibling, not a child of the screen
//     </Camera>
//   </Stage3D>
//
// 3D GOTCHA (MDN transform-style): opacity < 1, filter, clip-path, mask, mix-blend-mode, isolation and
// overflow other than visible flatten preserve-3d. Keep them on LEAF elements (the screen content, a
// card's inner box), never on Camera / Layer / Slab or anything between them. The clipped phone screen
// can't hold 3D children, so breakout cards are SIBLING layers of the phone, not children of its screen.
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { noise2D } from "@remotion/noise";
import { exit as exitEase, inOut, land, linear, lerp, logLerp, clamp01, fillPoses, segmentAt, springAt, kfPose, type Ease, type PoseKey } from "./easing";
import { alpha, blend, depthShadow, EGGPLANT } from "./color";
import { night } from "../brand/tokens";

// ─── Poses ──────────────────────────────────────────────────────────────────────
export type CamProp = "x" | "y" | "z" | "scale" | "rotX" | "rotY" | "rotZ" | "cx" | "cy";
/** Camera pose, applied to the whole world:
 *  - cx, cy: the world point (px from the stage centre) the camera looks at; it lands on screen centre.
 *  - x, y: extra screen-space offset of that point (px). z: push the world toward (+) / away (−) from the lens.
 *  - scale: zoom (interpolated in log space). rotX / rotY / rotZ: degrees, pivoting on the look-at point. */
export type CameraPose = Record<CamProp, number>;
export type CameraKey = PoseKey<CamProp>;
export const CAMERA_REST: CameraPose = { x: 0, y: 0, z: 0, scale: 1, rotX: 0, rotY: 0, rotZ: 0, cx: 0, cy: 0 };

/** Interpolate two camera poses. Zoom runs in log space (constant rate) and the look-at point is
 *  pre-multiplied by the scale so the destination target glides on a straight screen path
 *  (Archibald, "animating zooming"): L = Lb − (1 − t)·(sa / s)·(Lb − La). */
export const interpolateCamera = (a: CameraPose, b: CameraPose, t: number): CameraPose => {
  const s = logLerp(a.scale, b.scale, t);
  const k = (1 - t) * (a.scale / s);
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    z: lerp(a.z, b.z, t),
    rotX: lerp(a.rotX, b.rotX, t),
    rotY: lerp(a.rotY, b.rotY, t),
    rotZ: lerp(a.rotZ, b.rotZ, t),
    scale: s,
    cx: b.cx - k * (b.cx - a.cx),
    cy: b.cy - k * (b.cy - a.cy),
  };
};

export type DriftOptions = {
  /** Max translation in px (default 8, research: noise2D × 8). */
  amount?: number;
  /** Max roll (rotZ) in degrees (default 0.4). */
  roll?: number;
  /** Max tilt (rotX/rotY) in degrees, only visible in 3D (default 0.3). */
  tilt?: number;
  /** Noise speed in cycles per second (default 0.25, research: t × .25). */
  speed?: number;
  seed?: string | number;
};

/** Smooth, deterministic hand-held float so holds never look frozen. */
export const driftAt = (frame: number, opts: DriftOptions = {}, fps = 60): Partial<CameraPose> => {
  const { amount = 8, roll = 0.4, tilt = 0.3, speed = 0.25, seed = "cam" } = opts;
  const t = (frame / fps) * speed;
  return {
    x: noise2D(`${seed}X`, t, 0) * amount,
    y: noise2D(`${seed}Y`, t, 10) * amount * 0.7,
    rotZ: noise2D(`${seed}R`, t, 20) * roll,
    rotX: noise2D(`${seed}RX`, t, 30) * tilt,
    rotY: noise2D(`${seed}RY`, t, 40) * tilt,
  };
};

/** Add pose deltas (e.g. drift or shake) to a pose. Scale multiplies. */
export const addPose = (pose: CameraPose, ...deltas: Partial<CameraPose>[]): CameraPose => {
  const out = { ...pose };
  for (const d of deltas) {
    for (const k of Object.keys(d) as CamProp[]) {
      const v = d[k];
      if (typeof v !== "number") continue;
      out[k] = k === "scale" ? out[k] * v : out[k] + v;
    }
  }
  return out;
};

export type CameraOptions = {
  /** Hand-held drift (default on: 8 px, ±0.4°). Pass false for locked-off shots. */
  drift?: DriftOptions | false;
  /** The scene's slow push (research: 4-8 % per scene). Linear in log space between start and end. */
  creep?: { start: number; end: number; amount?: number };
  /** Ease for segments whose arriving key has no `ease` (default inOut). */
  ease?: Ease;
  /** Starting pose for props the first key omits (default CAMERA_REST). */
  rest?: Partial<CameraPose>;
};

/** Pure version of useCamera (pass the frame yourself). */
export const cameraAt = (frame: number, keys: readonly CameraKey[], opts: CameraOptions = {}): CameraPose => {
  const rest = { ...CAMERA_REST, ...opts.rest };
  let pose: CameraPose = rest;
  if (keys.length > 0) {
    const poses = fillPoses(keys, rest);
    const { i, t } = segmentAt(frame, keys, opts.ease ?? inOut);
    pose = i >= keys.length - 1 || t === 0 ? poses[i] : interpolateCamera(poses[i], poses[i + 1], t);
  }
  if (opts.creep) {
    const { start, end, amount = 0.06 } = opts.creep;
    pose = { ...pose, scale: pose.scale * Math.pow(1 + amount, clamp01((frame - start) / Math.max(1, end - start))) };
  }
  return opts.drift === false ? pose : addPose(pose, driftAt(frame, opts.drift ?? {}));
};

/** Keyframed camera: each key is a pose (omitted props carry over from the previous key). */
export const useCamera = (keys: readonly CameraKey[], opts: CameraOptions = {}): CameraPose => cameraAt(useCurrentFrame(), keys, opts);

/** The CSS transform for a camera pose (on an element whose transform-origin is the stage centre). */
export const cameraTransform = (p: CameraPose): string =>
  `translate3d(${p.x}px, ${p.y}px, ${p.z}px) rotateX(${p.rotX}deg) rotateY(${p.rotY}deg) rotateZ(${p.rotZ}deg) scale(${p.scale}) translate(${-p.cx}px, ${-p.cy}px)`;

// ─── Move recipes (§3.6) ────────────────────────────────────────────────────────
/** Recommended push ratio by duration: ≤ 12 f → 1.25×, ≤ 36 f → 1.4×, ≤ 90 f → 1.5×, longer drifts 2.4×. */
export const pushRatio = (frames: number) => (frames <= 12 ? 1.25 : frames <= 36 ? 1.4 : frames <= 90 ? 1.5 : 2.4);

/** Keys for a push-in of `frames` starting at `at` (ratio from pushRatio unless given), optionally toward a point. */
export const pushKeys = (
  at: number,
  frames: number,
  { from = 1, ratio, ease = inOut, cx, cy }: { from?: number; ratio?: number; ease?: Ease; cx?: number; cy?: number } = {},
): CameraKey[] => [
  { at, scale: from },
  { at: at + frames, scale: from * (ratio ?? pushRatio(frames)), ease, ...(cx !== undefined ? { cx } : null), ...(cy !== undefined ? { cy } : null) },
];

/** Reveal snap: in ONE frame the scale jumps by `ratio` (0.56-0.77; < 1 snaps back, > 1 punches in),
 *  then a `land` tail of `tail` frames (18-36) settles a further `settle`. Splice into useCamera([...]). */
export const revealSnapKeys = (
  at: number,
  fromScale: number,
  { ratio = 0.6, tail = 24, settle = 0.96 }: { ratio?: number; tail?: number; settle?: number } = {},
): CameraKey[] => [
  { at, scale: fromScale },
  { at: at + 1, scale: fromScale * ratio, ease: linear },
  { at: at + 1 + tail, scale: fromScale * ratio * settle, ease: land },
];

// ─── Components ─────────────────────────────────────────────────────────────────
/** Perspective container. Put one <Camera> (or 3D layers) inside.
 *  Lower perspective = stronger 3D (1200 dramatic, 1800 natural, 2400-2800 = the research's "photographed" phone). */
export const Stage3D: React.FC<{
  perspective?: number;
  /** Vanishing point as fractions of the stage (default centre). */
  origin?: [number, number];
  background?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ perspective = 2400, origin = [0.5, 0.5], background, style, children }) => (
  <AbsoluteFill
    style={{
      perspective: `${perspective}px`,
      perspectiveOrigin: `${origin[0] * 100}% ${origin[1] * 100}%`,
      overflow: "hidden",
      background,
      ...style,
    }}
  >
    {children}
  </AbsoluteFill>
);

/** The world. Everything inside moves with the camera pose; keeps 3D (preserve-3d) for its <Layer>s. */
export const Camera: React.FC<{ pose: CameraPose; style?: React.CSSProperties; children: React.ReactNode }> = ({ pose, style, children }) => (
  <AbsoluteFill style={{ transform: cameraTransform(pose), transformOrigin: "50% 50%", transformStyle: "preserve-3d", ...style }}>
    {children}
  </AbsoluteFill>
);

export type LayerProp = "x" | "y" | "z" | "scale" | "rotX" | "rotY" | "rotZ";
export type LayerPose = Record<LayerProp, number>;
export type LayerKey = PoseKey<LayerProp>;
export const LAYER_REST: LayerPose = { x: 0, y: 0, z: 0, scale: 1, rotX: 0, rotY: 0, rotZ: 0 };

export const layerTransform = (p: Partial<LayerPose>) =>
  `translate3d(${p.x ?? 0}px, ${p.y ?? 0}px, ${p.z ?? 0}px) rotateX(${p.rotX ?? 0}deg) rotateY(${p.rotY ?? 0}deg) rotateZ(${p.rotZ ?? 0}deg) scale(${p.scale ?? 1})`;

type LayerProps = Partial<LayerPose> & {
  /** Keyframed pose (overrides the static props it sets). Scale runs in log space. */
  keys?: readonly LayerKey[];
  /** Supersample the content (CSS zoom × raster, transform scale ÷ raster) so text stays crisp when the
   *  camera or the pose magnifies it. Chrome rasterizes 3D layers near 1× otherwise. 1 = off. */
  raster?: number;
  /** Centre the content on the stage (default true). */
  center?: boolean;
  /** transform-origin (default "50% 50%"). */
  origin?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
};

/** A full-stage plane positioned in 3D (x/y from the stage centre, z toward the lens). Nest freely. */
export const Layer: React.FC<LayerProps> = ({ keys, raster = 1, center = true, origin = "50% 50%", style, children, ...pose }) => {
  const frame = useCurrentFrame();
  const base: LayerPose = { ...LAYER_REST, ...stripUndefined(pose) };
  const p = keys && keys.length ? kfPose(frame, keys, base, inOut, ["scale"]) : base;
  if (raster !== 1) {
    return (
      <AbsoluteFill
        style={{
          transform: layerTransform({ ...p, scale: p.scale / raster }),
          transformOrigin: origin,
          transformStyle: "preserve-3d",
          ...(center ? { alignItems: "center", justifyContent: "center" } : null),
          pointerEvents: "none",
          ...style,
        }}
      >
        <div style={{ zoom: raster, transformStyle: "preserve-3d" }}>{children}</div>
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill
      style={{
        transform: layerTransform(p),
        transformOrigin: origin,
        transformStyle: "preserve-3d",
        ...(center ? { alignItems: "center", justifyContent: "center" } : null),
        pointerEvents: "none",
        ...style,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

// ─── Phone body: held-pose entry, thickness, contact shadow ─────────────────────
/** Research 3D phone entry (§3.6): yaw −54° / pitch 29° / roll 11° → −9° / 24° / 2°, scale 0.79 → 0.95,
 *  in six HELD poses at f 2, 4, 6, 12, 18, 24 (the pose jumps, then holds: reads as photographed).
 *  Use with <Stage3D perspective={HELD_ENTRY.perspective}>. */
export const HELD_ENTRY = {
  from: { rotY: -54, rotX: 29, rotZ: 11, scale: 0.79 },
  to: { rotY: -9, rotX: 24, rotZ: 2, scale: 0.95 },
  holds: [2, 4, 6, 12, 18, 24],
  perspective: 2600,
} as const;

/** Pose of the held-pose entry at `frame` (entry starts at `at`). Spread into <Layer {...pose}>. */
export const heldEntryPose = (
  frame: number,
  at = 0,
  { from = HELD_ENTRY.from, to = HELD_ENTRY.to, holds = HELD_ENTRY.holds, ease = land }: {
    from?: { rotY: number; rotX: number; rotZ: number; scale: number };
    to?: { rotY: number; rotX: number; rotZ: number; scale: number };
    holds?: readonly number[];
    ease?: Ease;
  } = {},
) => {
  const local = frame - at;
  const lastHold = holds[holds.length - 1];
  let held = -1;
  for (const h of holds) if (local >= h) held = h;
  const t = held < 0 ? 0 : ease(held / lastHold);
  return {
    rotY: lerp(from.rotY, to.rotY, t),
    rotX: lerp(from.rotX, to.rotX, t),
    rotZ: lerp(from.rotZ, to.rotZ, t),
    scale: logLerp(from.scale, to.scale, t),
  };
};

/** Gives a flat front face (the phone screen + bezel) real side thickness: `depth` px of body extruded
 *  backwards from the face as stacked rounded layers in Night tokens. Visible side ≈ depth·sin(yaw):
 *  depth 110 shows ~90 px at yaw −54° and ~17 px at −9° (the research's 90 → 20 px). */
export const Slab: React.FC<{
  width: number;
  height: number;
  radius: number;
  /** Body thickness in px (default 110 at 390 × 844; scale with the phone). */
  depth?: number;
  /** Token colours of the body, front edge → back edge (default Night surface-sunken → ground). */
  colors?: [string, string];
  /** Layer spacing in px (default 4 → 28 layers at depth 110). Each layer costs ~10 ms/frame at 1080p;
   *  use 2.5 for extreme close-ups of the edge, 5-6 when the phone is small. */
  step?: number;
  children: React.ReactNode;
}> = ({ width, height, radius, depth = 110, colors = [night.surfaceSunken, night.ground], step = 4, children }) => {
  const n = Math.max(2, Math.ceil(depth / step));
  return (
    <div style={{ position: "relative", width, height, transformStyle: "preserve-3d" }}>
      {Array.from({ length: n }).map((_, i) => {
        const t = i / (n - 1); // 0 = back, 1 = front
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: radius,
              background: blend(colors[1], colors[0], t),
              transform: `translateZ(${-depth + depth * t - 0.5}px)`,
            }}
          />
        );
      })}
      <div style={{ position: "absolute", inset: 0, transform: "translateZ(0.5px)" }}>{children}</div>
    </div>
  );
};

/** Soft eggplant contact shadow on the ground under an object (radial gradient, no blur filter). */
export const ContactShadow: React.FC<{ width: number; height?: number; opacity?: number; style?: React.CSSProperties }> = ({
  width,
  height = width * 0.18,
  opacity = 0.22,
  style,
}) => (
  <div
    aria-hidden
    style={{
      width,
      height,
      borderRadius: "50%",
      background: `radial-gradient(ellipse 50% 50% at 50% 50%, ${alpha(EGGPLANT, opacity)} 0%, ${alpha(EGGPLANT, opacity * 0.4)} 45%, ${alpha(EGGPLANT, 0)} 100%)`,
      ...style,
    }}
  />
);

// ─── Breakouts ──────────────────────────────────────────────────────────────────
/** Frames the return takes (research: `exit` over 20 f). */
export const BREAKOUT_RETURN_FRAMES = 20;

/** Whether a breakout is off the screen plane (hide the in-screen twin while this is true). */
export const breakoutLifted = (frame: number, at: number, returnAt?: number) =>
  frame >= at && (returnAt === undefined || frame < returnAt + BREAKOUT_RETURN_FRAMES);

/** A card that lifts out of the screen into 3D (§3.6): a sibling twin of the in-screen card that
 *  swaps in at `at` (hide the original with breakoutLifted()), lifts on the {150, 20} breakout spring
 *  (translateZ → 240, scale 1.6) as its token shadow grows, holds, and returns on `exit` over 20 f.
 *  Pass the camera pose as `face` to turn the card toward the lens while lifted. */
export const BreakOut: React.FC<{
  at: number;
  /** In-screen pose (x/y offsets of the card from the stage centre). */
  from?: Partial<LayerPose>;
  /** Lifted pose (default z 240, scale 1.6). */
  to?: Partial<LayerPose>;
  returnAt?: number;
  /** Camera pose: the lifted card counter-rotates to face the lens. */
  face?: Pick<CameraPose, "rotX" | "rotY">;
  /** Supersampling for crisp text when lifted (default: lifted scale × 1.4, covering perspective and a
   *  camera push). 1 = off (cheaper). */
  raster?: number;
  /** Corner radius of the shadow box (match the card). */
  radius?: number;
  theme?: "day" | "night";
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ at, from, to, returnAt, face, raster, radius = 24, theme = "day", style, children }) => {
  const frame = useCurrentFrame();
  // Default z 1.5: the phone face sits at translateZ(0.5) inside <Slab>; a twin at z 0 would hide behind it on the
  // swap frame (a 1-frame blink, found by builder E). Explicit from.z still wins.
  const a: LayerPose = { ...LAYER_REST, z: 1.5, ...stripUndefined(from ?? {}) };
  const b: LayerPose = { ...a, z: 240, scale: 1.6, ...stripUndefined(to ?? {}) };
  if (face) {
    b.rotX = (to?.rotX ?? 0) - face.rotX;
    b.rotY = (to?.rotY ?? 0) - face.rotY;
  }
  const up = springAt(frame, at, "breakout");
  const down = returnAt !== undefined ? exitEase(clamp01((frame - returnAt) / BREAKOUT_RETURN_FRAMES)) : 0;
  const t = up * (1 - down);
  const p: LayerPose = {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    z: lerp(a.z, b.z, t),
    rotX: lerp(a.rotX, b.rotX, t),
    rotY: lerp(a.rotY, b.rotY, t),
    rotZ: lerp(a.rotZ, b.rotZ, t),
    scale: logLerp(a.scale, b.scale, clamp01(t)),
  };
  if (!breakoutLifted(frame, at, returnAt)) return null;
  const k = raster ?? b.scale * 1.4;
  return (
    <AbsoluteFill style={{ transform: layerTransform({ ...p, scale: p.scale / k }), transformStyle: "preserve-3d", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
      {/* Content is laid out at ×k (CSS zoom) and scaled back by the transform: crisp when magnified.
          The shadow lives on a LEAF plate behind the card (3D-safe), not on the card's wrapper. */}
      <div style={{ position: "relative", borderRadius: radius, zoom: k, ...style }}>
        <div aria-hidden style={{ position: "absolute", inset: 0, borderRadius: radius, boxShadow: depthShadow(p.z, theme) }} />
        <div style={{ position: "relative" }}>{children}</div>
      </div>
    </AbsoluteFill>
  );
};

/** 2D parallax for backgrounds/foregrounds outside the 3D world: follows the camera by `factor`
 *  (0 = fixed, 1 = moves with the world). Research: 2-2.4× speed ratio between layers. */
export const Parallax: React.FC<{ pose: CameraPose; factor: number; style?: React.CSSProperties; children: React.ReactNode }> = ({ pose, factor, style, children }) => {
  const s = Math.pow(pose.scale, factor);
  return (
    <AbsoluteFill
      style={{
        transform: `translate(${pose.x * factor}px, ${pose.y * factor}px) rotate(${pose.rotZ * factor}deg) scale(${s}) translate(${-pose.cx * factor}px, ${-pose.cy * factor}px)`,
        transformOrigin: "50% 50%",
        ...style,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

/** Hook form of drift for single elements: returns a CSS transform string. */
export const useDrift = (opts: DriftOptions = {}): string => {
  const frame = useCurrentFrame();
  const d = driftAt(frame, opts);
  return `translate(${d.x ?? 0}px, ${d.y ?? 0}px) rotate(${d.rotZ ?? 0}deg)`;
};

function stripUndefined<T extends object>(o: T): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] !== undefined) out[k] = o[k];
  return out;
}
