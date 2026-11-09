// The x-ray layers of s12 (builder E): the phone (App, the top layer) and four slabs under it, in the phone's 3D
// space (origin = the phone's centre, units = phone px, z along the phone's normal). Night tokens only;
// marigold only as the request pulse's flash on a border.
import { Banknote, ShieldCheck, Smartphone, Users, Zap, type LucideIcon } from "lucide-react";
import React from "react";
import { AbsoluteFill } from "remotion";
import { alpha, clamp01 } from "../../motion";
import { night } from "../../brand/tokens";
import { DISPLAY } from "../../brand/fonts";
import { mixHex, XR_STROKE } from "./xray";

export type PlateDef = { key: string; Icon: LucideIcon; title: string; label: string };

/** Top → bottom: the request's path through the stack. Copy = the director's brief (technical, accurate). */
export const PLATES: PlateDef[] = [
  { key: "app", Icon: Smartphone, title: "App", label: "Sign in with Google (NEAR Auth) or a NEAR wallet" },
  { key: "relay", Icon: Zap, title: "Gasless relay", label: "NEP-366 meta-transactions · people hold 0 NEAR" },
  { key: "rules", Icon: ShieldCheck, title: "Pot rules", label: "Pot Hub contract · approves only what the rules allow" },
  { key: "pot", Icon: Users, title: "Your Pot", label: "a Sputnik DAO · bigger calls need most of the group" },
  { key: "dollars", Icon: Banknote, title: "Dollars", label: "USDC on NEAR · testnet today" },
];

/** Slab size (inside the phone's rounded outline, so nothing pokes out while they are stacked) and radius. */
export const PLATE_W = 384;
export const PLATE_H = 840;
export const PLATE_R = 24;
/** Distance between layers along the normal, phone px (storyboard: 140-180 px apart in Z). */
export const PLATE_GAP = 150;
/** Slab thickness (a second outline under the face). */
export const PLATE_DEPTH = 14;

/** Final z of layer k (0 = App … 4 = Dollars), centred on the middle layer. */
export const plateZ = (k: number) => (2 - k) * PLATE_GAP;

/** Local point of each layer's right-most corner (callout anchor) for the iso turn (rotZ −35°). */
export const anchorLocal = (k: number): [number, number, number] => {
  const w = k === 0 ? 414 : PLATE_W;
  const h = k === 0 ? 868 : PLATE_H;
  const r = k === 0 ? 67 : PLATE_R;
  const a = (35 * Math.PI) / 180;
  return [w / 2 - r + r * Math.cos(a), h / 2 - r + r * Math.sin(a), 0];
};

/** Where the request pulse touches each layer (local px): the App's Spend button, then a point on each slab's
 *  exposed front band (v > 245 is never covered by the slab above at this gap). */
export const PULSE_LOCAL: [number, number, number][] = [
  [83.5, -92, 1],
  [70, 272, 0],
  [-40, 272, 0],
  [70, 272, 0],
  [-40, 272, 0],
];

/** The story pulses' stations (layer index + plate-local point). All three run down the slabs' LEFT bands (plate-local
 *  x < −69: never covered by the slab above, and clear of every engraved icon and title, which sit on the bottom
 *  band), and every pill and chip sits left of (or under) its dot, so nothing ever covers a label:
 *  "$84.00" stops at Pot rules; "$300.00" stops higher up the same band (beside the $84 check); "Close · 2 of 3"
 *  runs down the band's outer edge (after both results have cleared) and stops at Your Pot. Clearance was checked
 *  frame by frame against the projected label boxes (≥ 38 px) and the frame edges (≥ 44 px). */
export const SPEND84_PATH: { layer: number; at: [number, number, number] }[] = [
  { layer: 0, at: [83.5, -92, 1] },
  { layer: 1, at: [-140, -250, 0] },
  { layer: 2, at: [-100, -140, 0] },
];
export const SPEND300_PATH: { layer: number; at: [number, number, number] }[] = [
  { layer: 0, at: [83.5, -92, 1] },
  { layer: 1, at: [-150, -330, 0] },
  { layer: 2, at: [-155, -320, 0] },
];
export const CLOSE_PATH: { layer: number; at: [number, number, number] }[] = [
  { layer: 0, at: [83.5, -92, 1] },
  { layer: 1, at: [-165, -300, 0] },
  { layer: 2, at: [-178, -260, 0] },
  { layer: 3, at: [-145, -150, 0] },
];

export type PlateLook = {
  /** 0..1: fades the slab in as it separates. */
  appear: number;
  /** 0..1: focused (border line → line-strong, icon → ink). */
  focus: number;
  /** 0..1: the request pulse's flash (border → marigold), decays after the pulse passes. */
  flash: number;
  /** −1 = none, else 0..1 progress of the x-ray scan across the slab. */
  sweep: number;
};

/** One slab: Night surface face with a 1-2 px border, its Lucide icon + title engraved on the exposed band,
 *  a second outline below for thickness, and the x-ray scan sweep. */
export const Plate: React.FC<{ def: PlateDef; z: number; look: PlateLook }> = ({ def, z, look }) => {
  if (look.appear <= 0.001) return null;
  const f = clamp01(look.focus);
  const base = mixHex(night.line, night.lineStrong, 0.35 + 0.65 * f);
  const edge = look.flash > 0.01 ? mixHex(base, night.brand, look.flash) : base;
  const icon = mixHex(night.lineStrong, night.ink, f);
  const Icon = def.Icon;
  const sweeping = look.sweep >= 0 && look.sweep <= 1;
  // the scan runs across the slab (along its width), so it crosses the slab's exposed front band on screen
  const bandX = -150 + (PLATE_W + 300) * look.sweep; // band centre, px from the left
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", transformStyle: "preserve-3d", transform: `translateZ(${z}px)` }}>
      {/* thickness */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: PLATE_W,
          height: PLATE_H,
          marginLeft: -PLATE_W / 2,
          marginTop: -PLATE_H / 2,
          boxSizing: "border-box",
          borderRadius: PLATE_R,
          border: `${XR_STROKE}px solid ${alpha(night.line, 0.9)}`,
          background: alpha(night.ground, 0.55),
          transform: `translateZ(${-PLATE_DEPTH}px)`,
          opacity: look.appear,
        }}
      />
      {/* face */}
      <div
        style={{
          position: "relative",
          width: PLATE_W,
          height: PLATE_H,
          boxSizing: "border-box",
          borderRadius: PLATE_R,
          border: `${XR_STROKE + 0.5 * f}px solid ${edge}`,
          background: alpha(night.surface, 0.9),
          overflow: "hidden",
          opacity: look.appear,
        }}
      >
        {sweeping ? (
          <>
            <div
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: bandX - 110,
                width: 220,
                background: `linear-gradient(90deg, ${alpha(night.ink, 0)} 0%, ${alpha(night.ink, 0.12)} 50%, ${alpha(night.ink, 0)} 100%)`,
              }}
            />
            <div style={{ position: "absolute", top: 0, bottom: 0, left: bandX - 1.5, width: 3, background: night.lineStrong }} />
          </>
        ) : null}
        <div
          style={{
            position: "absolute",
            left: 24,
            top: PLATE_H - 104,
            height: 64,
            display: "flex",
            alignItems: "center",
            gap: 14,
            color: icon,
          }}
        >
          <Icon size={60} strokeWidth={2} color={icon} style={{ display: "block", flexShrink: 0 }} aria-hidden />
          <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 38, lineHeight: 1, letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>{def.title}</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
