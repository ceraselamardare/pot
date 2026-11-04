// The s10 → s10b → s11 handoff STATE built straight from the director's spec, for pixel-diffing s10b's first and
// last frames: CAM.maya + the act's drift at a given GLOBAL frame, Maya's PotScreen $66.00 · "You'd get back $22" ·
// feedAfterBoat(), no sheet, tab bar $384.00, empty TypeZone.
import React from "react";
import { AbsoluteFill } from "remotion";
import { addPose, driftAt } from "../../../motion";
import { PotScreen, feedAfterBoat } from "../../../ui";
import { day } from "../../../brand/tokens";
import { CAM, WorldPhone, WorldStage } from "../../shared/world";

export const HandoffRef: React.FC<{ globalFrame: number }> = ({ globalFrame }) => (
  <AbsoluteFill style={{ background: day.ground }}>
    <WorldStage pose={addPose(CAM.maya, driftAt(globalFrame, { seed: "act3" }))}>
      <WorldPhone who="maya" screen={<PotScreen balance={66} yourShare={22} putIn={150} feed={feedAfterBoat()} tabBar={{ balance: 384 }} />} />
    </WorldStage>
  </AbsoluteFill>
);
