// Dev reference for the Act 3 handoff contracts (handoffs.ts): the bare contract state rendered with the shared
// world at a given GLOBAL frame, to diff against a scene's first/last frame.
//   state "s08end"  = CAM.maya, PotScreen $450.00 · FEED_FULL, no sheet (global frame = s09.from − 1)
//   state "s11start" = CAM.maya, PotScreen $66.00 · feedAfterBoat(), no sheet; Leo at rest (global = s11.from)
import React from "react";
import { AbsoluteFill } from "remotion";
import { addPose, cameraAt, driftAt } from "../../../motion";
import { FEED_FULL, PotScreen, feedAfterBoat } from "../../../ui";
import { day } from "../../../brand/tokens";
import { scene } from "../../../data/timeline";
import { CAM, WorldPhone, WorldStage } from "../../shared/world";

export const HandoffRef: React.FC<{ state: "s08end" | "s11start" }> = ({ state }) => {
  const global = state === "s08end" ? scene("s09-instant").from - 1 : scene("s11-close").from;
  const pose = addPose(cameraAt(0, [{ at: 0, ...CAM.maya }], { drift: false }), driftAt(global, { seed: "act3" }));
  return (
    <AbsoluteFill style={{ background: day.ground }}>
      <WorldStage pose={pose}>
        <WorldPhone
          who="maya"
          screen={
            state === "s08end" ? (
              <PotScreen balance={450} yourShare={150} putIn={150} feed={FEED_FULL} />
            ) : (
              <PotScreen balance={66} yourShare={22} putIn={150} feed={feedAfterBoat()} />
            )
          }
        />
        <WorldPhone who="leo" screen={<PotScreen balance={66} yourShare={22} putIn={150} feed={feedAfterBoat()} />} />
      </WorldStage>
    </AbsoluteFill>
  );
};
