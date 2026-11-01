// Demo: the research 3D phone (held-pose entry, side thickness, contact shadow, perspective 2600),
// a breakout card (sibling layer, breakout spring, faces the lens, token shadow), the hero burst,
// a log-space push toward the card, creep + drift.
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { day } from "../../brand/tokens";
import { Stage3D, Camera, Layer, BreakOut, Parallax, Slab, ContactShadow, HELD_ENTRY, heldEntryPose, breakoutLifted, useCamera, pushKeys } from "../camera";
import { inOut } from "../easing";
import { PhoneDummy, DummyCard, PHONE_W, PHONE_H } from "./PhoneDummy";
import { Orbs } from "../effects/Orbs";
import { Burst } from "../effects/Burst";

export const CAMERA_FRAMES = 300;
const CARD_Y = -98; // the approved card's slot inside the phone, from the phone centre

export const CameraDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const entry = heldEntryPose(frame, 4);
  const cam = useCamera(
    [
      { at: 0, scale: 1 },
      ...pushKeys(100, 36, { cx: 0, cy: -160 }),
      { at: 220, scale: 1, cx: 0, cy: 0, ease: inOut },
    ],
    { creep: { start: 0, end: 300, amount: 0.06 } },
  );
  return (
    <AbsoluteFill style={{ background: day.ground }}>
      <Parallax pose={cam} factor={0.4}>
        <Orbs colors={[day.member1, day.member2, day.member3]} opacity={0.12} />
      </Parallax>
      <Stage3D perspective={HELD_ENTRY.perspective}>
        <Camera pose={cam}>
          <Layer rotX={entry.rotX} rotY={entry.rotY} rotZ={entry.rotZ} scale={entry.scale * 1.1}>
            {/* Contact shadow on the "table" plane under the phone. */}
            <Layer z={-112} y={20}>
              <ContactShadow width={PHONE_W * 1.5} height={PHONE_H * 1.05} opacity={0.18} />
            </Layer>
            <Slab width={PHONE_W} height={PHONE_H} radius={56} depth={110}>
              <PhoneDummy hideCard={breakoutLifted(frame, 60, 190)} />
            </Slab>
            {/* Breakout: a SIBLING of the phone body (not inside the clipped screen). */}
            <BreakOut at={60} from={{ y: CARD_Y }} to={{ y: CARD_Y - 40, x: 40, z: 240, scale: 1.6 }} returnAt={190} face={entry} radius={24}>
              <div style={{ position: "relative" }}>
                <DummyCard title="Approved by Pot rules" line="$84 sent to you" />
                <Burst at={84} variant="hero" scale={0.8} rim />
              </div>
            </BreakOut>
          </Layer>
        </Camera>
      </Stage3D>
    </AbsoluteFill>
  );
};
