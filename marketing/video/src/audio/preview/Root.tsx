// Soundtrack preview compositions (audio agent). Not part of the film's composition list.
import React from "react";
import { AbsoluteFill, Composition, Folder } from "remotion";
import { FPS } from "../../motion/time";
import { TOTAL_FRAMES } from "../../data/timeline";
import { Soundtrack } from "../Soundtrack";

const Black: React.FC<React.PropsWithChildren> = ({ children }) => (
  <AbsoluteFill style={{ backgroundColor: "#1c1424" }}>{children}</AbsoluteFill>
);

/** VO only, placed by the timeline (music file absent → silent bed). */
const SoundtrackVO: React.FC = () => (
  <Black>
    <Soundtrack music={null} />
  </Black>
);

/** Ducking check: a steady test bed through the duck envelope, no VO. Create the bed only for the test, then delete it:
 *  ffmpeg -f lavfi -i "anoisesrc=d=89:c=pink:a=0.25:seed=7" -ar 44100 -ac 2 -b:a 192k public/audio/music/_test-bed.mp3 */
const SoundtrackBedTest: React.FC = () => (
  <Black>
    <Soundtrack music="audio/music/_test-bed.mp3" vo={false} />
  </Black>
);

/** Music bed alone through the full envelope (ducking + arc + dips), for level checks. */
const SoundtrackMusicOnly: React.FC = () => (
  <Black>
    <Soundtrack vo={false} />
  </Black>
);

/** Full soundtrack with the real music bed once it exists. */
const SoundtrackFull: React.FC = () => (
  <Black>
    <Soundtrack />
  </Black>
);

export const AudioPreviewRoot: React.FC = () => (
  <Folder name="Audio">
    <Composition id="SoundtrackVO" component={SoundtrackVO} durationInFrames={TOTAL_FRAMES} fps={FPS} width={320} height={180} />
    <Composition id="SoundtrackBedTest" component={SoundtrackBedTest} durationInFrames={TOTAL_FRAMES} fps={FPS} width={320} height={180} />
    <Composition id="SoundtrackMusicOnly" component={SoundtrackMusicOnly} durationInFrames={TOTAL_FRAMES} fps={FPS} width={320} height={180} />
    <Composition id="SoundtrackFull" component={SoundtrackFull} durationInFrames={TOTAL_FRAMES} fps={FPS} width={320} height={180} />
  </Folder>
);
