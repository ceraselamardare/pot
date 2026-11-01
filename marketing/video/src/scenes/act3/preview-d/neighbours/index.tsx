// Builder D, dev only: a SEPARATE entry that imports the neighbouring builders' scenes (C's s08, E's s11) to check
// the real handoffs against s09's first and s10's last frame. Kept apart from preview-d/Root so their work in
// progress can never break builder D's own preview.
//   node src/scenes/act3/preview-d/stills.mjs ... (uses preview-d) | this entry: see README-d.md
import "../../../../brand/fonts";
import React from "react";
import { Composition, registerRoot } from "remotion";
import { FPS } from "../../../../motion/time";
import { scene } from "../../../../data/timeline";
import { S08Join, S11Close } from "./imports";

const Root: React.FC = () => (
  <>
    <Composition id="N-S08Join" component={S08Join} durationInFrames={scene("s08-join").duration} fps={FPS} width={1920} height={1080} />
    <Composition id="N-S11Close" component={S11Close} durationInFrames={scene("s11-close").duration} fps={FPS} width={1920} height={1080} />
  </>
);
registerRoot(Root);
