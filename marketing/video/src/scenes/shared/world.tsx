// Act 3 world (director-owned): Maya's and Leo's phones live in ONE 3D space (research: "one world, two
// phones"). Every Act 3 scene stages its phones with <WorldPhone> inside <WorldStage>, and moves between them
// with the shared camera targets in CAM, so cuts between scenes built by different agents line up exactly.
//
//   const cam = useCamera([{ at: 0, ...CAM.maya }, { at: 120, ...CAM.leo, ease: whip }], { rest: CAM.maya });
//   <WorldStage pose={cam}>
//     <WorldPhone who="maya" screen={<PotScreen balance={450} … />}>
//       <BreakOut at={90} from={cardOffset(LAYOUT.spendSentCapsule)} face={PHONE_HOME}>…</BreakOut>
//     </WorldPhone>
//     <WorldPhone who="leo" screen={<InviteLanding … />} />
//   </WorldStage>
//   <TypeZone>…big kinetic type in screen space…</TypeZone>
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import {
  addPose,
  Camera,
  cameraAt,
  driftAt,
  Layer,
  Slab,
  Stage3D,
  type CameraKey,
  type CameraOptions,
  type CameraPose,
  type DriftOptions,
  type LayerPose,
} from "../../motion";
import { scene, type SceneId } from "../../data/timeline";
import { Phone, PHONE_H, PHONE_RADIUS, PHONE_W, SCREEN_RECT, type PhoneProps } from "../../ui";
import { day, night } from "../../brand/tokens";
import { Avatar, MAYA, SAM, LEO } from "../../ui";
import { SANS } from "../../brand/fonts";

/** Phone size in Act 3 (1.08 → the 868 px phone is ~937 px tall: big, legible, slightly cropped by drift). */
export const PHONE_SCALE = 1.08;

/** Distance between the two phones in world px (research: Leo at +1.2 W). */
export const PHONE_GAP = 1.2 * 1920;

/** World positions of the phones' centres (px from the stage centre, before the camera). */
export const WORLD = {
  maya: { x: -380, y: 0 },
  leo: { x: -380 + PHONE_GAP, y: 0 },
} as const;

/** Resting tilt of a phone in Act 3: turned slightly toward the type side, top leaning back a touch. */
export const PHONE_HOME = { rotX: 8, rotY: -12, rotZ: 0 } as const;

/** Body thickness in px (phone px, before PHONE_SCALE): ~9 px of visible side at the home yaw. */
export const PHONE_DEPTH = 44;

/** Camera targets. On a phone, the phone sits at screen x ≈ 580 and the right side (≈ 900-1840) is free for type.
 *  `split` shows both phones at x ≈ 240 and 1680 (the s10 1.6× pull-back). */
export const CAM = {
  maya: { cx: 0, cy: 0, scale: 1, x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0 },
  leo: { cx: PHONE_GAP, cy: 0, scale: 1, x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0 },
  split: { cx: (WORLD.maya.x + WORLD.leo.x) / 2, cy: 0, scale: 1 / 1.6, x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0 },
} satisfies Record<string, CameraPose>;

/** Frame within the whole film (scene-local frame + the scene's start). Use it for anything that must stay
 *  continuous across scene cuts (camera drift, looping motifs). */
export const useGlobalFrame = (id: SceneId) => useCurrentFrame() + scene(id).from;

/**
 * The scene camera for world shots: keys are in SCENE-LOCAL frames; the hand-held drift is computed from the
 * GLOBAL frame so it never jumps at a cut between two scenes. Rest pose defaults to CAM.maya.
 */
export const useWorldCamera = (
  id: SceneId,
  keys: readonly CameraKey[],
  opts: Omit<CameraOptions, "drift"> & { drift?: DriftOptions | false } = {},
): CameraPose => {
  const local = useCurrentFrame();
  const global = local + scene(id).from;
  const base = cameraAt(local, keys, { rest: CAM.maya, ...opts, drift: false });
  return opts.drift === false ? base : addPose(base, driftAt(global, { seed: "act3", ...(opts.drift ?? {}) }));
};

/** Screen-space x of a phone's centre for a camera pose (ignores rotation; good for placing 2D overlays). */
export const phoneScreenX = (who: keyof typeof WORLD, cam: Pick<CameraPose, "cx" | "scale" | "x">) =>
  960 + cam.x + (WORLD[who].x - cam.cx) * cam.scale;

/** Offset (phone px, from the phone's centre) of a rect given in SCREEN coordinates (e.g. LAYOUT.*). */
export const cardOffset = (r: { x: number; y: number; w: number; h: number }) => ({
  x: SCREEN_RECT.x + r.x + r.w / 2 - PHONE_W / 2,
  y: SCREEN_RECT.y + r.y + r.h / 2 - PHONE_H / 2,
});

/** The Day stage with the camera. Children are world layers (<WorldPhone>, extra <Layer>s). */
export const WorldStage: React.FC<{
  pose: CameraPose;
  theme?: "day" | "night";
  perspective?: number;
  children: React.ReactNode;
}> = ({ pose, theme = "day", perspective = 2600, children }) => (
  <Stage3D perspective={perspective} background={theme === "day" ? day.ground : night.ground}>
    <Camera pose={pose}>{children}</Camera>
  </Stage3D>
);

/** A phone at its world position. `screen` goes inside the phone; `children` are siblings in the phone's own
 *  3D space (origin = the phone's centre, units = phone px), e.g. <BreakOut from={cardOffset(...)}>. */
export const WorldPhone: React.FC<{
  who: keyof typeof WORLD;
  screen: React.ReactNode;
  /** Pose deltas added to the world position and PHONE_HOME (scale multiplies PHONE_SCALE). */
  pose?: Partial<LayerPose>;
  /** Full override of the rotation (e.g. heldEntryPose output); replaces PHONE_HOME when given. */
  rotation?: { rotX: number; rotY: number; rotZ: number };
  theme?: "day" | "night";
  phoneProps?: Partial<PhoneProps>;
  depth?: number;
  hidden?: boolean;
  /** Supersampling for camera close-ups (builder C's technique): Chrome rasterizes 3D layers near 1×, so a 1.4-2×
   *  push makes phone text soft. raster = k lays the phone out k× larger (Phone `zoom`, Slab × k) and scales the
   *  layer by 1/k: identical geometry (2D scale leaves z-depth alone), text rasterized at k×. Default 2 (director:
   *  measured +70 % edge energy on the s09 close-up; every Act 3 phone gets crisp text). */
  raster?: number;
  children?: React.ReactNode;
}> = ({ who, screen, pose = {}, rotation, theme = "day", phoneProps, depth = PHONE_DEPTH, hidden, raster = 2, children }) => {
  if (hidden) return null;
  const rot = rotation ?? PHONE_HOME;
  const lp = {
    x: WORLD[who].x + (pose.x ?? 0),
    y: WORLD[who].y + (pose.y ?? 0),
    z: pose.z ?? 0,
    rotX: rot.rotX + (pose.rotX ?? 0),
    rotY: rot.rotY + (pose.rotY ?? 0),
    rotZ: rot.rotZ + (pose.rotZ ?? 0),
    scale: PHONE_SCALE * (pose.scale ?? 1),
  };
  const k = Math.max(1, raster);
  if (k === 1) {
    return (
      <Layer {...lp}>
        <Slab width={PHONE_W} height={PHONE_H} radius={PHONE_RADIUS} depth={depth}>
          <Phone theme={theme} {...phoneProps}>
            {screen}
          </Phone>
        </Slab>
        {children}
      </Layer>
    );
  }
  return (
    <>
      <Layer {...lp} scale={lp.scale / k}>
        {/* a k×-tall slab is taller than the 1080 px layer: keep the flex item from shrinking */}
        <div style={{ flexShrink: 0, transformStyle: "preserve-3d" }}>
          <Slab width={PHONE_W * k} height={PHONE_H * k} radius={PHONE_RADIUS * k} depth={depth}>
            <Phone theme={theme} {...phoneProps} zoom={k}>
              {screen}
            </Phone>
          </Slab>
        </div>
      </Layer>
      {children ? <Layer {...lp}>{children}</Layer> : null}
    </>
  );
};

/** Persona pill (avatar + name) shown above a phone when the camera arrives at it. Place inside <WorldPhone>. */
export const PersonaPill: React.FC<{ person: "maya" | "sam" | "leo"; appear: number }> = ({ person, appear }) => {
  const p = person === "maya" ? MAYA : person === "sam" ? SAM : LEO;
  const a = Math.max(0, Math.min(1, appear));
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
      <div
        style={{
          transform: `translate(0px, ${-PHONE_H / 2 - 44 + (1 - a) * 18}px) translateZ(30px)`,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 18px 8px 8px",
          borderRadius: 999,
          background: day.surface,
          boxShadow: "0 1px 2px rgba(43, 27, 58, 0.06), 0 8px 24px rgba(43, 27, 58, 0.08)",
          fontFamily: SANS,
          fontWeight: 600,
          fontSize: 20,
          color: day.ink,
          opacity: a,
        }}
      >
        <Avatar person={p} size="sm" />
        {p.name}
      </div>
    </AbsoluteFill>
  );
};

/** Screen-space column on the free (right) side of the frame for big kinetic type while the camera is on a phone. */
export const TypeZone: React.FC<{ children: React.ReactNode; align?: "start" | "center"; style?: React.CSSProperties }> = ({
  children,
  align = "center",
  style,
}) => (
  <AbsoluteFill style={{ pointerEvents: "none" }}>
    <div
      style={{
        position: "absolute",
        left: 900,
        top: 120,
        width: 940,
        height: 840,
        display: "flex",
        flexDirection: "column",
        justifyContent: align === "center" ? "center" : "flex-start",
        alignItems: "flex-start",
        gap: 24,
        ...style,
      }}
    >
      {children}
    </div>
  </AbsoluteFill>
);
