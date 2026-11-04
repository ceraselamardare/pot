// Builder E preview: S11Close and S12Tech at their real timeline durations (1920 × 1080, 60 fps), plus the two
// back to back (S11toS12) to check the screen-off → x-ray continuity across the cut.
import "../../../brand/fonts";
import React from "react";
import { AbsoluteFill, Composition, Folder, Sequence } from "remotion";
import { FPS } from "../../../motion/time";
import { scene } from "../../../data/timeline";
import { S11Close } from "../../act3/e-index";
import { S12Tech } from "../index";
import { S11Measure } from "./Measure";

const s11 = scene("s11-close").duration;
const s12 = scene("s12-tech").duration;

/** Last 90 f of s11 + the first 150 f of s12, cut exactly as the master timeline does. */
const S11toS12: React.FC = () => (
  <AbsoluteFill>
    <Sequence from={-(s11 - 90)} durationInFrames={s11} premountFor={30}>
      <S11Close />
    </Sequence>
    <Sequence from={90} durationInFrames={s12} premountFor={30}>
      <S12Tech />
    </Sequence>
  </AbsoluteFill>
);

export const ActFourPreviewRoot: React.FC = () => (
  <Folder name="BuilderE">
    <Composition id="S11Close" component={S11Close} durationInFrames={s11} fps={FPS} width={1920} height={1080} />
    <Composition id="S12Tech" component={S12Tech} durationInFrames={s12} fps={FPS} width={1920} height={1080} />
    <Composition id="S11toS12" component={S11toS12} durationInFrames={240} fps={FPS} width={1920} height={1080} />
    <Composition id="S11Measure" component={S11Measure} defaultProps={{ mode: "waiting" as "waiting" | "waiting2" | "closed" | "propose" | "more" }} durationInFrames={1} fps={FPS} width={1920} height={1080} />
  </Folder>
);
