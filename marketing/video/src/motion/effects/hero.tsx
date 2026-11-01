// Real (sampled) motion blur from @remotion/motion-blur, for the few hero moments only.
// COST: CameraMotionBlur renders the children `samples` times per frame (8 samples ≈ 8× the render
// time of the wrapped subtree). Trail renders `layers` copies. Use FakeMotionBlur everywhere else.
// Never wrap <Sfx>/<Audio> inside these (children are duplicated).
import React from "react";
import { CameraMotionBlur, Trail } from "@remotion/motion-blur";

/** True shutter motion blur. Default: 180° shutter, 6 samples. Keep the wrapped subtree small. */
export const HeroMotionBlur: React.FC<{ samples?: number; shutterAngle?: number; children: React.ReactNode }> = ({
  samples = 6,
  shutterAngle = 180,
  children,
}) => (
  <CameraMotionBlur samples={samples} shutterAngle={shutterAngle}>
    {children}
  </CameraMotionBlur>
);

/** Ghost trail of past frames (echo). Default: 5 layers, 1 frame apart, 0.6 opacity. */
export const HeroTrail: React.FC<{ layers?: number; lagInFrames?: number; trailOpacity?: number; children: React.ReactNode }> = ({
  layers = 5,
  lagInFrames = 1,
  trailOpacity = 0.6,
  children,
}) => (
  <Trail layers={layers} lagInFrames={lagInFrames} trailOpacity={trailOpacity}>
    {children}
  </Trail>
);
