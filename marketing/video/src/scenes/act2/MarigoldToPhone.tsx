// Accent transition 2 (storyboard v2, s06 → s07): the marigold full frame contracts into Maya's phone screen.
// A clip-path inset(… round r) runs from the full frame (inset 0, radius 0) to PHONE_HANDOFF (the screen rect of
// Maya's phone under CAM.maya) in 30 f on `inOut`, revealing the cream Day ground around it. At progress 1 the
// frame is exactly "a marigold rounded rect on cream", which is s07's frame 0 before the phone body appears.
//
//   // inside s06 (frame 0 = scene start): contracts over the scene's last 30 frames
//   <MarigoldToPhone start={LAST - 30}><Content /></MarigoldToPhone>
//   // straddling a cut (e.g. if the director moves part of it into s07): drive it explicitly
//   <MarigoldToPhone progress={p} />
//
// Children ride on the marigold and are clipped with it (in s06 they have already left by the last frame).
// Pure function of the frame; no 3D inside, so the clip-path is safe here.
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { day } from "../../brand/tokens";
import { inOut, ramp, type Ease } from "../../motion";
import { PHONE_HANDOFF } from "../shared/handoffs";

/** Storyboard length of the contraction (30 f = one beat). */
export const MARIGOLD_TO_PHONE_FRAMES = 30;

/** A rounded screen rect in px: centre, size, corner radius (PHONE_HANDOFF's shape). */
export type ScreenRect = { cx: number; cy: number; w: number; h: number; r: number };

/** Inset distances (px) from each frame edge to the rect. */
export const rectInsets = (rect: ScreenRect = PHONE_HANDOFF, width = 1920, height = 1080) => ({
  top: rect.cy - rect.h / 2,
  right: width - (rect.cx + rect.w / 2),
  bottom: height - (rect.cy + rect.h / 2),
  left: rect.cx - rect.w / 2,
});

/** The clip-path at contraction progress p (0 = full frame, 1 = exactly `rect`). Linear in p on every edge
 *  and on the corner radius, so the eased progress drives one coherent shape. */
export const phoneInset = (p: number, rect: ScreenRect = PHONE_HANDOFF, width = 1920, height = 1080): string => {
  const i = rectInsets(rect, width, height);
  const q = Math.max(0, Math.min(1, p));
  return `inset(${i.top * q}px ${i.right * q}px ${i.bottom * q}px ${i.left * q}px round ${rect.r * q}px)`;
};

export type MarigoldToPhoneProps = {
  /** Frame (in the current Sequence's clock) the contraction starts. Default 0. */
  start?: number;
  /** Frames (default 30). */
  duration?: number;
  /** Default `inOut` (storyboard). */
  ease?: Ease;
  /** Drive the progress directly (0..1, already eased); overrides start/duration/ease. */
  progress?: number;
  /** Target rect (default PHONE_HANDOFF). */
  rect?: ScreenRect;
  /** The contracting colour (default marigold). */
  color?: string;
  /** The ground revealed around it (default the cream Day ground). null = transparent. */
  ground?: string | null;
  /** Content riding on the marigold (clipped with it). */
  children?: React.ReactNode;
};

/** Full-frame marigold layer that contracts into the phone screen rect. */
export const MarigoldToPhone: React.FC<MarigoldToPhoneProps> = ({
  start = 0,
  duration = MARIGOLD_TO_PHONE_FRAMES,
  ease = inOut,
  progress,
  rect = PHONE_HANDOFF,
  color = day.brand,
  ground = day.ground,
  children,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const p = progress ?? ramp(frame, start, start + duration, ease);
  return (
    <AbsoluteFill>
      {ground && p > 0 ? <AbsoluteFill style={{ background: ground }} /> : null}
      <AbsoluteFill style={{ background: color, clipPath: p > 0 ? phoneInset(p, rect, width, height) : undefined }}>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
};
