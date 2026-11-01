// Demo: transitions used inside one scene (<Swap>, <Enter>) and the hero motion-blur wrappers.
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { day } from "../../brand/tokens";
import { DISPLAY, SANS } from "../../brand/fonts";
import { Swap, Enter } from "../transitions/wrappers";
import { whipSlide, circleIris } from "../transitions/presentations";
import { HeroMotionBlur, HeroTrail } from "../effects/hero";
import { kf, whip } from "../easing";
import { depthShadow } from "../color";

export const IN_SCENE_FRAMES = 150;

const Box: React.FC<{ bg: string; label: string }> = ({ bg, label }) => (
  <AbsoluteFill style={{ background: bg, alignItems: "center", justifyContent: "center", fontFamily: DISPLAY, fontWeight: 800, fontSize: 64, color: day.ink }}>{label}</AbsoluteFill>
);

const Dot: React.FC<{ y: number; at: number }> = ({ y, at }) => {
  const frame = useCurrentFrame();
  const x = kf(frame, [{ at, v: 80 }, { at: at + 14, v: 760, ease: whip }]);
  return <div style={{ position: "absolute", left: x, top: y, width: 60, height: 60, borderRadius: 60, background: day.member3 }} />;
};

export const InSceneDemo: React.FC = () => (
  <AbsoluteFill style={{ background: day.ground }}>
    {/* Swap inside a 700 × 420 card: pass `size` so distances match the box, not the frame. */}
    <div style={{ position: "absolute", left: 120, top: 120, width: 700, height: 420, borderRadius: 32, overflow: "hidden", boxShadow: depthShadow(20) }}>
      <Swap at={40} duration={18} presentation={whipSlide({ direction: "left", size: { width: 700, height: 420 } })} from={<Box bg={day.member2} label="Maya's phone" />} to={<Box bg={day.member3} label="Leo's phone" />} />
    </div>
    {/* Enter: a sheet opens from the tapped button with a flood-style iris. */}
    <div style={{ position: "absolute", left: 1000, top: 120, width: 700, height: 420, borderRadius: 32, overflow: "hidden", background: day.surfaceSunken }}>
      <div style={{ position: "absolute", left: 250, top: 330, width: 200, height: 56, borderRadius: 999, background: day.brand, border: `1px solid ${day.brandDeep}`, fontFamily: SANS, fontWeight: 700, fontSize: 22, color: day.onBrand, display: "flex", alignItems: "center", justifyContent: "center" }}>
        Ask the group
      </div>
      <Enter at={60} duration={18} presentation={circleIris({ origin: [350 / 700, 358 / 420], size: { width: 700, height: 420 }, exitDim: 0 })}>
        <Box bg={day.surface} label="Sent to the group" />
      </Enter>
    </div>
    {/* Hero blur wrappers (expensive: N re-renders of the subtree). */}
    <div style={{ position: "absolute", left: 120, top: 640, width: 900, height: 120 }}>
      <HeroTrail layers={3} lagInFrames={1} trailOpacity={0.5}>
        <AbsoluteFill>
          <Dot y={30} at={90} />
        </AbsoluteFill>
      </HeroTrail>
    </div>
    <div style={{ position: "absolute", left: 120, top: 820, width: 900, height: 120 }}>
      <HeroMotionBlur samples={6}>
        <AbsoluteFill>
          <Dot y={30} at={90} />
        </AbsoluteFill>
      </HeroMotionBlur>
    </div>
  </AbsoluteFill>
);
