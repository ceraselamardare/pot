// The master film (director-owned): scenes from the registry on the locked timeline, the soundtrack, captions.
import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { TOTAL_FRAMES, scene } from "./data/timeline";
import { REGISTRY } from "./scenes/registry";
import { Captions } from "./Captions";
import { Soundtrack, MUSIC_FILE } from "./audio/Soundtrack";
import { day } from "./brand/tokens";
import { FilmPropsContext } from "./filmProps";

export type VideoProps = { captions: boolean; music: boolean; vo: boolean; repoUrl?: string };

export const VIDEO_DURATION = TOTAL_FRAMES;

export const Video: React.FC<VideoProps> = ({ captions, music, vo, repoUrl }) => (
  <FilmPropsContext.Provider value={{ repoUrl }}>
  <AbsoluteFill style={{ background: day.ground }}>
    {REGISTRY.map((entry) => {
      const first = scene(entry.covers[0]);
      const duration = entry.covers.reduce((n, id) => n + scene(id).duration, 0);
      const Comp = entry.component;
      return (
        <Sequence
          key={entry.covers.join("+")}
          from={first.from}
          durationInFrames={duration}
          premountFor={90}
          name={entry.covers.join("+")}
          // Each scene is its own stacking context: Chrome can drop the grain's overlay blend when a clip-path layer
          // crosses the frame edge (found by builder B); isolating the scene keeps the blend local and correct.
          style={{ isolation: "isolate" }}
        >
          <Comp />
        </Sequence>
      );
    })}
    {/* VO on the timeline + the music bed ducked under it (levels, arc and dips: src/audio/Soundtrack.tsx). */}
    <Soundtrack music={music ? MUSIC_FILE : null} vo={vo} />
    {captions ? <Captions /> : null}
  </AbsoluteFill>
  </FilmPropsContext.Provider>
);
