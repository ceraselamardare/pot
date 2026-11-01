// Dev test: is the in-phone text crisp when the world camera pushes in 2×+?
import React from "react";
import { AbsoluteFill } from "remotion";
import { cameraAt } from "../../../motion";
import { PotScreen, SpendSheet, FEED_FULL } from "../../../ui";
import { CAM, WorldPhone, WorldStage } from "../../shared/world";

export const ZoomTest: React.FC<{ scale: number; cx: number; cy: number }> = ({ scale, cx, cy }) => {
  const pose = cameraAt(0, [{ at: 0, ...CAM.maya, scale, cx, cy }], { drift: false });
  return (
    <AbsoluteFill>
      <WorldStage pose={pose}>
        <WorldPhone
          who="maya"
          screen={
            <>
              <PotScreen balance={450} yourShare={150} putIn={150} feed={FEED_FULL} />
              <SpendSheet step="checking" amount={84} category="groceries" dotsFrame={20} />
            </>
          }
        />
      </WorldStage>
    </AbsoluteFill>
  );
};
