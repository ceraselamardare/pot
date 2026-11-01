// Sound-effect cue: <Sfx name="pop" at={beats(2)} volume={0.8} />
// = a premounted <Sequence from={at}> holding an <Audio> from @remotion/media, src = staticFile(SFX[name]).
// Safe before the audio exists: it checks the public/ file list (getStaticFiles(), baked into every
// Studio session and render bundle) and renders NOTHING when the file is missing, so scenes can place
// their cues now and they start sounding as soon as the audio agent drops the files in public/audio/sfx/.
import React, { useMemo } from "react";
import { Sequence, getStaticFiles, staticFile } from "remotion";
import { Audio } from "@remotion/media";
import { SFX, type SfxName } from "../audio/sfx";
// Director integration: every cue goes through the mix bus level (SFX files peak at -3 dBFS; see Soundtrack.tsx).
import { SFX_MASTER } from "../audio/Soundtrack";

let warned = false;

/** Names of files present in public/ (e.g. "audio/sfx/pop.mp3"). Empty outside the browser. */
export const publicFiles = (): Set<string> => {
  try {
    const files = getStaticFiles();
    return new Set((files ?? []).map((f) => f.name.replace(/^\/+/, "")));
  } catch {
    return new Set();
  }
};

/** true when the SFX file for `name` exists in public/. */
export const sfxAvailable = (name: SfxName, files: Set<string> = publicFiles()) => files.has(SFX[name]);

export type SfxProps = {
  name: SfxName;
  /** Frame the sound starts (inside the current Sequence's clock). */
  at: number;
  /** 0..1 or a frame → volume function (frame 0 = sound start). Default 1. */
  volume?: number | ((f: number) => number);
  /** Cut the sound after this many frames (default: plays to its end). */
  durationInFrames?: number;
  playbackRate?: number;
  /** Skip the first n frames of the file (e.g. to land a transient exactly on the cut). */
  trimBefore?: number;
};

export const Sfx: React.FC<SfxProps> = ({ name, at, volume = 1, durationInFrames, playbackRate, trimBefore }) => {
  const available = useMemo(() => sfxAvailable(name), [name]);
  if (!available) {
    if (!warned && typeof window !== "undefined") {
      warned = true;
      // eslint-disable-next-line no-console
      console.info(`[motion-kit] <Sfx>: audio files not found yet (first missing: ${SFX[name]}); cues render silently.`);
    }
    return null;
  }
  return (
    // Default (AbsoluteFill) layout: premounting needs it; an <Audio> paints nothing anyway.
    <Sequence from={at} durationInFrames={durationInFrames} premountFor={30} name={`sfx:${name}`}>
      <Audio
        src={staticFile(SFX[name])}
        volume={typeof volume === "function" ? (f: number) => volume(f) * SFX_MASTER : volume * SFX_MASTER}
        playbackRate={playbackRate}
        trimBefore={trimBefore}
      />
    </Sequence>
  );
};
