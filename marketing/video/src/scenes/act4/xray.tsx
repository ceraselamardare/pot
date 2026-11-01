// The Act 3 → 4 transition rig and the x-ray phone (builder E), shared by S11Close (its last frames) and
// S12Tech (from frame 0), so the s11 → s12 cut is continuous by construction: both scenes evaluate the SAME
// functions of g = frames relative to the s12 start (negative inside s11). Every boundary is derived from
// src/data/timeline.ts (v1.1: s11 3450 + 420, s12 3870 + 810; the screen-off on the bar line 3840 = g −30).
//
//   g screenOff        the phone's screen goes Night in 1 f (s11 f390 in v1.1, on the music's bar line)
//   + 1 → + 25         a Night rect grows from the screen's on-screen rect to the full frame (24 f, inOut);
//                      the phone shows through it as line-art (the x-ray)
//   + 8 → s12 f36      the line-art phone rotates from PHONE_HOME to isometric (rotX 55°, rotZ −35°) and settles
//                      where the s12 stack lives; an x-ray scan reveals the app's structure on its screen
import React from "react";
import { addPose, alpha, Camera, clamp01, driftAt, inOut, Layer, lerp, logLerp, Stage3D, type CameraPose, type LayerPose } from "../../motion";
import { night } from "../../brand/tokens";
import { scene } from "../../data/timeline";
import { CAM, PHONE_DEPTH, PHONE_HOME, PHONE_SCALE, WORLD } from "../shared";
import { PHONE_H, PHONE_RADIUS, PHONE_W, SCREEN_H, SCREEN_RADIUS, SCREEN_W } from "../../ui";
import { S11, s11CameraAt } from "../act3/s11-timing";
import { cameraMatrix, chain, layerMatrix, toScreen, type Vec3 } from "./xray-math";

/** Perspective of the Act 3 world (WorldStage default), kept for the whole x-ray. */
export const XR_PERSPECTIVE = 2600;

export const S11_LEN = S11.len;
export const S12_FROM = scene("s12-tech").from;

/** g = frames relative to the s12 start. */
export const gFromS11 = (local: number) => local - S11_LEN;

const OFF = S11.screenOff - S11_LEN;

export const XR = {
  /** The 1-frame screen-off (g). */
  screenOff: OFF,
  /** The Night rect grows over these frames (g). */
  rectStart: OFF + 1,
  rectFrames: 24,
  /** Rotation into the isometric pose (g): starts once the Day phone is under the rect, done before s12's
   *  layers separate. */
  rotStart: OFF + 8,
  rotEnd: 36,
} as const;

/** The isometric x-ray pose (storyboard: rotateX 55°, rotateZ −35°). */
export const ISO = { rotX: 55, rotY: 0, rotZ: -35 } as const;

/** Where the s12 stack lives (world px under CAM.maya) and its size. */
export const STACK = { x: -420, y: 14, scale: 0.78 } as const;

/** Maya's phone exactly as WorldPhone stages it. */
export const DAY_PHONE: LayerPose = {
  x: WORLD.maya.x,
  y: WORLD.maya.y,
  z: 0,
  rotX: PHONE_HOME.rotX,
  rotY: PHONE_HOME.rotY,
  rotZ: PHONE_HOME.rotZ,
  scale: PHONE_SCALE,
};

/** 0 → 1 progress of the turn into isometric. */
export const isoProgress = (g: number) => inOut(clamp01((g - XR.rotStart) / (XR.rotEnd - XR.rotStart)));

/** The phone/stack layer pose at g. */
export const xrayLayerPose = (g: number): LayerPose => {
  const t = isoProgress(g);
  return {
    x: lerp(DAY_PHONE.x, STACK.x, t),
    y: lerp(DAY_PHONE.y, STACK.y, t),
    z: 0,
    rotX: lerp(DAY_PHONE.rotX, ISO.rotX, t),
    rotY: lerp(DAY_PHONE.rotY, ISO.rotY, t),
    rotZ: lerp(DAY_PHONE.rotZ, ISO.rotZ, t),
    scale: logLerp(DAY_PHONE.scale, STACK.scale, t),
  };
};

/** s12's own moves on the stack layer (identity at the cut): a slow orbit (degrees added to the iso pose), a
 *  creep, and the collapse into the shield. */
export type StackExtra = { dx?: number; dy?: number; scale?: number; rotX?: number; rotY?: number; rotZ?: number };

export const xrayStackPose = (g: number, extra?: StackExtra): LayerPose => {
  const p = xrayLayerPose(g);
  if (!extra) return p;
  return {
    ...p,
    x: p.x + (extra.dx ?? 0),
    y: p.y + (extra.dy ?? 0),
    rotX: p.rotX + (extra.rotX ?? 0),
    rotY: p.rotY + (extra.rotY ?? 0),
    rotZ: p.rotZ + (extra.rotZ ?? 0),
    scale: p.scale * (extra.scale ?? 1),
  };
};

/** Camera through the transition and Act 4: CAM.maya + the act-3 hand-held drift from the GLOBAL frame
 *  (identical to s11's camera from s11 frame 340 on, so nothing jumps at the screen-off or the cut).
 *  `extra` lets s12 add its own slow moves on top. */
export const xrayCamera = (g: number, extra?: Partial<CameraPose>): CameraPose => {
  if (g < XR.screenOff - 12) return s11CameraAt(g + S11_LEN);
  const base: CameraPose = { ...CAM.maya, ...(extra ?? {}) };
  return addPose(base, driftAt(S12_FROM + g, { seed: "act3" }));
};

/** Screen-space bounding box of the phone's SCREEN at s11 frame `local` (for the screen-off rect). */
export const screenRectAt = (local: number) => {
  const m = chain(cameraMatrix(s11CameraAt(local)), layerMatrix(DAY_PHONE));
  const pts: Vec3[] = [
    [-SCREEN_W / 2, -SCREEN_H / 2, 0.5],
    [SCREEN_W / 2, -SCREEN_H / 2, 0.5],
    [SCREEN_W / 2, SCREEN_H / 2, 0.5],
    [-SCREEN_W / 2, SCREEN_H / 2, 0.5],
  ].map((p) => p as Vec3);
  const s = pts.map((p) => toScreen(m, p, XR_PERSPECTIVE));
  const xs = s.map((p) => p.x);
  const ys = s.map((p) => p.y);
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys), k: s[0].k };
};

// ─── The line-art phone ─────────────────────────────────────────────────────────
const LINE_STRONG = night.lineStrong;
const LINE = night.line;

/** x-ray stroke widths (phone px; ≈ 1-1.5 px on screen at the stack scale). */
export const XR_STROKE = 2;

const outline = (w: number, h: number, r: number, color: string, width: number, fill?: string): React.CSSProperties => ({
  position: "absolute",
  left: (PHONE_W - w) / 2,
  top: (PHONE_H - h) / 2,
  width: w,
  height: h,
  boxSizing: "border-box",
  borderRadius: r,
  border: `${width}px solid ${color}`,
  background: fill,
});

/** A schematic of the Pot screen (header, balance card, two buttons, tabs, feed rows) in Night line. */
const ScreenSchematic: React.FC<{ amount: number; reveal?: number }> = ({ amount, reveal = 1 }) => {
  if (amount <= 0.001 || reveal <= 0.001) return null;
  const c = alpha(LINE_STRONG, 0.55 * amount);
  const soft = alpha(LINE_STRONG, 0.3 * amount);
  const box = (x: number, y: number, w: number, h: number, r: number, color = c, fill?: string): React.CSSProperties => ({
    position: "absolute",
    left: 12 + x,
    top: 12 + y,
    width: w,
    height: h,
    borderRadius: r,
    boxSizing: "border-box",
    border: `${XR_STROKE * 0.75}px solid ${color}`,
    background: fill,
  });
  return (
    // revealed top → bottom behind the x-ray scan line (clip on this leaf group only: 3D-safe)
    <div style={{ position: "absolute", inset: 0, clipPath: reveal < 1 ? `inset(0 0 ${((1 - reveal) * 100).toFixed(2)}% 0)` : undefined }}>
      {/* header: cover tile, name bar, avatars */}
      <div style={box(16, 70, 32, 32, 10)} />
      <div style={box(58, 78, 120, 16, 8, soft)} />
      <div style={box(276, 70, 32, 32, 16)} />
      <div style={box(298, 70, 32, 32, 16)} />
      {/* the balance card */}
      <div style={box(16, 122, 358, 250, 24)} />
      <div style={box(32, 160, 170, 34, 10, soft)} />
      <div style={box(32, 268, 326, 10, 5, soft)} />
      <div style={box(32, 304, 159, 52, 16)} />
      <div style={box(199, 304, 159, 52, 16)} />
      {/* tabs + feed */}
      <div style={box(16, 396, 358, 44, 22, soft)} />
      {[460, 548, 636].map((y) => (
        <div key={y} style={box(16, y, 358, 72, 16, soft)} />
      ))}
    </div>
  );
};

/** The x-ray scan across the phone's screen (top → bottom), 0..1; nothing outside (0, 1). */
const ScreenScan: React.FC<{ p: number }> = ({ p }) => {
  if (p <= 0 || p >= 1) return null;
  const y = 12 + SCREEN_H * p;
  return (
    <div
      style={{
        position: "absolute",
        left: 12,
        top: 12,
        width: SCREEN_W,
        height: SCREEN_H,
        borderRadius: SCREEN_RADIUS,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: y - 12 - 150,
          height: 150,
          background: `linear-gradient(180deg, ${alpha(night.ink, 0)} 0%, ${alpha(night.ink, 0.1)} 100%)`,
        }}
      />
      <div style={{ position: "absolute", left: 0, right: 0, top: y - 12 - 1.5, height: 3, background: night.lineStrong }} />
    </div>
  );
};

/** The phone as x-ray line-art: body outline (front + back face = its thickness), screen, island, buttons and
 *  a schematic of the app, translucent Night fills. Render it inside a <Layer> with xrayLayerPose(). */
export const XrayPhone: React.FC<{
  /** 0..1 strength of the strokes (lit by the request pulse / focus). */
  lit?: number;
  /** 0..1 schematic of the app on the screen. */
  schematic?: number;
  /** Border flash colour mix toward marigold (the request pulse), 0..1. */
  flash?: number;
  /** Fill opacity of the face. */
  fill?: number;
  /** 0..1 fade of the whole drawing (applied on leaf groups only: 3D-safe). */
  opacity?: number;
  /** 0..1 the x-ray scan down the screen that reveals the app's structure (1 = fully revealed). */
  scan?: number;
}> = ({ lit = 0, schematic = 0, flash = 0, fill = 0.62, opacity = 1, scan = 1 }) => {
  if (opacity <= 0.001) return null;
  const edge = flash > 0.01 ? mixHex(LINE_STRONG, night.brand, flash) : LINE_STRONG;
  const screenEdge = alpha(LINE_STRONG, 0.45 + 0.4 * lit);
  return (
    <div style={{ position: "relative", width: PHONE_W, height: PHONE_H, transformStyle: "preserve-3d" }}>
      {/* back face: the body's thickness, seen through the glass */}
      <div style={{ ...outline(PHONE_W, PHONE_H, PHONE_RADIUS, alpha(LINE, 0.9), XR_STROKE, alpha(night.ground, 0.35)), transform: `translateZ(${-PHONE_DEPTH}px)`, opacity }} />
      {/* front face */}
      <div style={{ ...outline(PHONE_W, PHONE_H, PHONE_RADIUS, edge, XR_STROKE + 0.4 * lit, alpha(night.surface, fill)), transform: "translateZ(0.5px)", opacity }}>
        {/* side buttons */}
        {[
          { side: "left" as const, top: 168, h: 30 },
          { side: "left" as const, top: 226, h: 58 },
          { side: "left" as const, top: 296, h: 58 },
          { side: "right" as const, top: 258, h: 92 },
        ].map((b, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              [b.side]: -5,
              top: b.top,
              width: 5,
              height: b.h,
              boxSizing: "border-box",
              border: `${XR_STROKE * 0.8}px solid ${alpha(LINE_STRONG, 0.7)}`,
              borderRadius: 3,
            }}
          />
        ))}
      </div>
      {/* screen + island + the app's structure */}
      <div style={{ position: "absolute", inset: 0, transform: "translateZ(1px)", opacity }}>
        <div style={outline(SCREEN_W, SCREEN_H, SCREEN_RADIUS, screenEdge, XR_STROKE * 0.8)} />
        <div
          style={{
            position: "absolute",
            left: (PHONE_W - 122) / 2,
            top: 12 + 11,
            width: 122,
            height: 35,
            borderRadius: 999,
            boxSizing: "border-box",
            border: `${XR_STROKE * 0.8}px solid ${alpha(LINE_STRONG, 0.75)}`,
          }}
        />
        <ScreenSchematic amount={schematic} reveal={scan} />
        <ScreenScan p={scan} />
      </div>
    </div>
  );
};

const rgbOf = (c: string): number[] =>
  c.startsWith("#") ? [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) : (c.match(/\d+(\.\d+)?/g) ?? ["0", "0", "0"]).slice(0, 3).map(Number);

/** Blend two token colours ("#rrggbb" or a previous blend's "rgb(…)"): mixes of token colours only. */
export const mixHex = (a: string, b: string, t: number): string => {
  const pa = rgbOf(a);
  const pb = rgbOf(b);
  const k = clamp01(t);
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * k));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
};

/** The app schematic on the x-ray screen while the phone turns (same values in s11 and s12): it fades up and is
 *  revealed top → bottom behind a scan line that crosses the cut (v1.1: g −18 → +12). */
export const schematicAt = (g: number) => clamp01((g - (OFF + 8)) / 10);
export const scanAt = (g: number) => clamp01((g - (OFF + 12)) / 30);

/** The x-ray world: Night stage → camera → the phone/stack layer → the line-art phone (+ `children`, e.g. the
 *  s12 plates, in the same 3D space: origin = the phone's centre, units = phone px, z along its normal). */
export const XrayScene: React.FC<{
  g: number;
  /** Extra camera moves (s12), identity at the cut. */
  camExtra?: Partial<CameraPose>;
  /** s12 moves of the stack layer (creep, collapse), identity at the cut. */
  stackExtra?: StackExtra;
  /** Fade of the line-art phone (the collapse). */
  phoneOpacity?: number;
  /** Lift of the phone (the App layer) along its normal, phone px. */
  phoneZ?: number;
  phoneLit?: number;
  phoneFlash?: number;
  children?: React.ReactNode;
}> = ({ g, camExtra, stackExtra, phoneOpacity = 1, phoneZ = 0, phoneLit = 0, phoneFlash = 0, children }) => {
  const cam = xrayCamera(g, camExtra);
  const pose = xrayStackPose(g, stackExtra);
  return (
    <Stage3D perspective={XR_PERSPECTIVE}>
      <Camera pose={cam}>
        <Layer {...pose}>
          <div style={{ transform: `translateZ(${phoneZ}px)`, transformStyle: "preserve-3d" }}>
            <XrayPhone schematic={schematicAt(g)} scan={scanAt(g)} lit={phoneLit} flash={phoneFlash} opacity={phoneOpacity} />
          </div>
          {children}
        </Layer>
      </Camera>
    </Stage3D>
  );
};
