// The s08 → s09 hand-off state, built independently of both scenes: s09's frame 0 camera (CAM.maya + the global-frame
// drift via useWorldCamera) and Maya's phone with PotScreen $450.00 · You'd get back $150 · You put in $150 · FEED_FULL,
// tab bar $0.00, no sheet, empty TypeZone. Diff it against S08Join's last frame.
import React from "react";
import { AbsoluteFill } from "remotion";
import { FEED_FULL, PotScreen } from "../../../ui";
import { day } from "../../../brand/tokens";
import { CAM, WorldPhone, WorldStage, useWorldCamera } from "../../shared";

export const HandoffRef: React.FC = () => {
  const cam = useWorldCamera("s09-instant", [{ at: 0, ...CAM.maya }]);
  return (
    <AbsoluteFill style={{ background: day.ground }}>
      <WorldStage pose={cam}>
        <WorldPhone who="maya" screen={<PotScreen balance={450} yourShare={150} putIn={150} feed={FEED_FULL} />} />
      </WorldStage>
    </AbsoluteFill>
  );
};
