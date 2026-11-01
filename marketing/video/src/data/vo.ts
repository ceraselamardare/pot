// Voice-over alignment access. The audio agent writes src/data/vo/<id>.json for every script line:
//   { "id": "s09-instant", "file": "audio/vo/s09-instant.mp3", "durationSec": 6.42,
//     "words": [{ "text": "Small", "start": 0.12, "end": 0.41 }, ...] }   (seconds, relative to the clip start)
// Scenes never hard-code word times: they ask for a word's frame (relative to the scene) via voWord()/useVo().
import { FPS } from "../motion/time";
import { SCENES, type SceneId } from "./timeline";
import { VO_DATA } from "./vo-data";

export type VoWord = { text: string; start: number; end: number };
export type VoClip = { id: string; file: string; durationSec: number; words: VoWord[] };

/** Frame-based word timing relative to the scene start. */
export type VoWordFrames = { text: string; at: number; end: number; index: number };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9$]/g, "");

/** All words of a scene's VO line, with frames relative to the scene's start (includes the scene's voAt offset). */
export const voWords = (id: SceneId): VoWordFrames[] => {
  const clip = VO_DATA[id];
  const scene = SCENES.find((s) => s.id === id);
  if (!clip || !scene) return [];
  return clip.words.map((w, index) => ({
    text: w.text,
    at: scene.voAt + Math.round(w.start * FPS),
    end: scene.voAt + Math.round(w.end * FPS),
    index,
  }));
};

/**
 * Frame (relative to the scene start) at which `word` is spoken. `occurrence` picks the n-th match (0-based).
 * Falls back to `fallback` when the VO isn't generated yet, so scenes render before audio exists.
 */
export const voWord = (id: SceneId, word: string, fallback: number, occurrence = 0): number => {
  const target = norm(word);
  const hits = voWords(id).filter((w) => norm(w.text) === target);
  return hits[occurrence]?.at ?? fallback;
};

/** Whether real VO timing exists for a scene. */
export const hasVo = (id: SceneId) => Boolean(VO_DATA[id]);

/**
 * Like voWord(), but relative to another scene's start: for components that span several timeline entries
 * (e.g. the s02+s03 continuous shot asks for s03's words relative to s02's start).
 */
export const voWordRel = (id: SceneId, word: string, fallback: number, relativeTo: SceneId, occurrence = 0): number => {
  const own = SCENES.find((s) => s.id === id);
  const base = SCENES.find((s) => s.id === relativeTo);
  if (!own || !base) return fallback;
  const inOwn = voWord(id, word, Number.NaN, occurrence);
  return Number.isNaN(inOwn) ? fallback : inOwn + own.from - base.from;
};
