// Music-grid helpers on top of time.ts (120 BPM, 1 beat = 30 frames, 1 bar = 120 frames at 60 fps).
import { FRAMES_PER_BEAT } from "./time";

/** Frame of the beat at or before `frame` (snap down to the grid). */
export const beatFloor = (frame: number, beatFrames = FRAMES_PER_BEAT) => Math.floor(frame / beatFrames) * beatFrames;
/** Nearest beat frame (snap a cue to the grid). */
export const snapToBeat = (frame: number, subdivision = 1, beatFrames = FRAMES_PER_BEAT) => {
  const step = beatFrames / subdivision;
  return Math.round(frame / step) * step;
};

/** 1 → 0 decaying pulse on every beat (or every `every` beats), e.g. for a 2% scale bump on the kick.
 *  `decay` = frames to fall to ~5%. `offset` shifts the grid (frames). */
export const beatPulse = (
  frame: number,
  { every = 1, offset = 0, decay = 10, beatFrames = FRAMES_PER_BEAT }: { every?: number; offset?: number; decay?: number; beatFrames?: number } = {},
) => {
  const period = beatFrames * every;
  const local = (((frame - offset) % period) + period) % period;
  return Math.exp((-3 * local) / decay);
};

/** Which beat (0-based) `frame` falls in, and the 0..1 phase inside it. */
export const beatPhase = (frame: number, beatFrames = FRAMES_PER_BEAT) => ({
  beat: Math.floor(frame / beatFrames),
  phase: (frame % beatFrames) / beatFrames,
});
