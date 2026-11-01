import React from "react";
import { AbsoluteFill } from "remotion";
import { cameraAt } from "../../../motion";
import { PotScreen, FEED_FULL, InviteLanding } from "../../../ui";
import { CAM, TypeZone, WorldPhone, WorldStage, PersonaPill } from "../world";
import { DISPLAY } from "../../../brand/fonts";
import { day } from "../../../brand/tokens";

export const WorldTest: React.FC<{ view: "maya" | "split" }> = ({ view }) => {
  const pose = cameraAt(0, [{ at: 0, ...CAM[view] }], { drift: false });
  return (
    <AbsoluteFill>
      <WorldStage pose={pose}>
        <WorldPhone who="maya" screen={<PotScreen balance={450} yourShare={150} putIn={150} feed={FEED_FULL} />}>
          <PersonaPill person="maya" appear={1} />
        </WorldPhone>
        <WorldPhone who="leo" screen={<InviteLanding />} />
      </WorldStage>
      {view === "maya" ? (
        <TypeZone>
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 120, lineHeight: 1.0, letterSpacing: "-0.02em", color: day.ink }}>
            Small spends
            <br />
            approve themselves.
          </div>
        </TypeZone>
      ) : null}
    </AbsoluteFill>
  );
};
