// The film's soundtrack bus: every VO clip on the master timeline + the music bed, ducked under the voice.
//   <Soundtrack />              VO + the music bed (audio/music/pot-theme.mp3) ducked under the VO, with the arc and dips
//   <Soundtrack music={null} /> VO only
// Place it once at the root of the master composition (frame 0 = timeline frame 0). Deterministic: the ducking
// envelope is precomputed per frame from the VO word timings (src/data/vo/*.json) and the scene timeline.
//
// Levels (see brief/audio-notes.md): the delivered files are VO -16 LUFS / <= -2 dBTP, SFX peak -3 dBFS, music
// -16 LUFS (public/audio/music/pot-theme.mp3: 120 BPM, bar lines on multiples of 2.000 s, exactly 84.000 s).
// Remotion sums tracks without a master limiter, so the mix keeps headroom: MASTER_DB puts VO peaks at about
// -14 dBFS (research: VO peaks -16..-12 dBFS) and the render is mastered to -14 LUFS / -1 dBTP afterwards
// (scripts/audio-master.py). SFX_MASTER is meant to multiply every <Sfx> cue volume.
import React, { useMemo } from "react";
import { Sequence, getStaticFiles, staticFile } from "remotion";
import { Audio } from "@remotion/media";
import { SCENES, TOTAL_FRAMES, type SceneSpec } from "../data/timeline";
import { VO_DATA } from "../data/vo-data";
import type { VoClip } from "../data/vo";
import { FPS } from "../motion/time";

export const dbToGain = (db: number) => Math.pow(10, db / 20);

/** Mix bus offset applied to everything (headroom for Remotion's summing). */
export const MASTER_DB = -12;
/** Levels in dB relative to the delivered files (VO and music both normalised to -16 LUFS). */
export const LEVELS_DB = {
  VO: MASTER_DB,
  /** Music between VO lines: 4 dB under the voice's loudness. */
  MUSIC_BASE: MASTER_DB - 4,
  /** Music under VO words: ducked 9 dB below MUSIC_BASE (brief: 8-10 dB). */
  MUSIC_DUCKED: MASTER_DB - 13,
  /** Multiply every <Sfx> volume by this (SFX files peak at -3 dBFS; cue volumes 0.3-0.8 then sit 4-14 dB under VO peaks). */
  SFX_MASTER: MASTER_DB,
} as const;
export const VO = dbToGain(LEVELS_DB.VO);
export const MUSIC_BASE = dbToGain(LEVELS_DB.MUSIC_BASE);
export const MUSIC_DUCKED = dbToGain(LEVELS_DB.MUSIC_DUCKED);
export const SFX_MASTER = dbToGain(LEVELS_DB.SFX_MASTER);

/** Ducking dynamics in frames (60 fps). The attack is look-ahead: the music is fully down when the word starts. */
export const DUCK_ATTACK_FRAMES = Math.round(0.12 * FPS);
export const DUCK_RELEASE_FRAMES = Math.round(0.3 * FPS);
/** Word gaps shorter than this stay ducked (no pumping between words; longer designed pauses breathe). */
export const DUCK_MERGE_GAP_FRAMES = Math.round(0.25 * FPS);

export const MUSIC_FILE = "audio/music/pot-theme.mp3";

/** Measured on a Remotion 4.0.537 render: every MP3 (VO, SFX, music) starts exactly 1105 samples (25.06 ms,
 *  1.5 f) late, because the render path does not drop the LAME encoder delay. It is uniform, so all audio keeps
 *  its relative sync; scripts/audio-master.py shifts the mastered audio back by this amount. */
export const MP3_DECODER_DELAY_SEC = 1105 / 44100;

type VoMap = Partial<Record<string, VoClip>>;

/** Absolute timeline frame where a scene's VO clip starts. */
export const voStartFrame = (scene: SceneSpec) => scene.from + scene.voAt;

/** Spoken intervals [start, end] in absolute frames, merged across short gaps. */
export const voIntervals = (scenes: SceneSpec[] = SCENES, voData: VoMap = VO_DATA): Array<[number, number]> => {
  const raw: Array<[number, number]> = [];
  for (const s of scenes) {
    const clip = voData[s.id];
    if (!clip) continue;
    const at = voStartFrame(s);
    for (const w of clip.words) raw.push([at + w.start * FPS, at + w.end * FPS]);
  }
  raw.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const [s, e] of raw) {
    const last = merged[merged.length - 1];
    if (last && s - last[1] <= DUCK_MERGE_GAP_FRAMES) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  return merged;
};

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Duck amount per absolute frame (0 = music at MUSIC_BASE, 1 = fully ducked), precomputed once. */
export const buildDuckEnvelope = (
  totalFrames: number = TOTAL_FRAMES,
  scenes: SceneSpec[] = SCENES,
  voData: VoMap = VO_DATA,
): Float32Array => {
  const env = new Float32Array(Math.max(1, totalFrames));
  for (const [s, e] of voIntervals(scenes, voData)) {
    const a0 = Math.max(0, Math.floor(s - DUCK_ATTACK_FRAMES));
    const r1 = Math.min(env.length - 1, Math.ceil(e + DUCK_RELEASE_FRAMES));
    for (let f = a0; f <= r1; f++) {
      let d: number;
      if (f < s) d = smooth(Math.min(1, Math.max(0, (f - (s - DUCK_ATTACK_FRAMES)) / DUCK_ATTACK_FRAMES)));
      else if (f <= e) d = 1;
      else d = smooth(Math.min(1, Math.max(0, 1 - (f - e) / DUCK_RELEASE_FRAMES)));
      if (d > env[f]) env[f] = d;
    }
  }
  return env;
};

/** Extra music dips in absolute timeline frames (director-tunable once the scene builders report exact frames). */
/** The "Leo is typing…" → nothing joke at the end of s03 (s03 runs 300-525): music down ~12 dB. */
export const JOKE_DIP = { from: 492, to: 525, db: -12 } as const;
/** Music fades to silence over the last frames before the reveal hit at frame 1080 (18.0 s), so the hit lands clean. */
export const REVEAL_CLEAR = { from: 1060, to: 1080 } as const;
/** Ramp length (frames) at each edge of JOKE_DIP, inside the window (the dip is fully down between the ramps). */
export const DIP_RAMP_FRAMES = 3;

/** Director: the music clears for the "Approved by Pot rules" hit (s09, global frame 2602 in timeline v2, measured by
 *  builder D; it was 2662 in v1): a 15 f fade down to `db` before the hit, then back to normal on the hit frame, so
 *  success + burst land clean. */
export const APPROVED_CLEAR = { from: 2587, to: 2602, db: -10 } as const;

/** dB offset of the approved clear-out at an absolute frame. */
export const approvedClearDbAt = (frame: number) => {
  const { from, to, db } = APPROVED_CLEAR;
  if (frame < from || frame >= to) return 0;
  const p = (frame - from + 1) / (to - from);
  return db * smooth(Math.min(1, Math.max(0, p)));
};

/** dB offset of the joke dip at an absolute frame (0 outside the window, JOKE_DIP.db inside, short ramps). */
export const jokeDipDbAt = (frame: number) => {
  const { from, to, db } = JOKE_DIP;
  if (frame < from || frame >= to) return 0;
  const p = Math.min(1, (frame - from + 1) / DIP_RAMP_FRAMES, (to - frame) / DIP_RAMP_FRAMES);
  return db * smooth(Math.max(0, p));
};

/** Gain multiplier of the reveal clear-out: 1 before REVEAL_CLEAR.from, a cos fade to 0 at REVEAL_CLEAR.to - 1,
 *  back to 1 from REVEAL_CLEAR.to (the hit). */
export const revealClearGainAt = (frame: number) => {
  const { from, to } = REVEAL_CLEAR;
  if (frame < from || frame >= to) return 1;
  const p = (frame - from) / Math.max(1, to - 1 - from);
  return Math.cos((Math.PI / 2) * Math.min(1, p));
};

/** Section arc of the music bed, as [frame, dB] keyframes (linear in dB between keyframes; a repeated frame is a step,
 *  placed on a section downbeat where the music changes anyway). pot-theme.mp3 measures flat across its sections
 *  (-16.8..-15.7 LUFS), so the mix shapes the arc: tense Problem, rising Build, Reveal peak, steady Product,
 *  lower Under-the-hood, resolving Outro. Set every value to 0 to hear the file as generated.
 *  Music sections (frames): Problem 0, Build 720, Reveal 1080, Product A 1440, Product B 2640, Under the hood 3840,
 *  Outro 4680, end 5040. */
export const MUSIC_ARC_DB: ReadonlyArray<readonly [number, number]> = [
  // review-1: Act 1's VO sat only ~4.5 dB over the bed (dense lines, busy SFX); 2 dB lower here for clarity.
  [0, -3.5],
  [720, -3.5],
  [1060, 0.5],
  [1080, 1.5],
  [1380, 1.5],
  [1440, -0.5],
  [3840, -0.5],
  [3840, -2],
  [4680, -2],
  [4680, 1],
  [5040, 1],
];

/** Arc offset (dB) at an absolute frame. */
export const musicArcDbAt = (frame: number) => {
  const k = MUSIC_ARC_DB;
  if (!k.length) return 0;
  if (frame <= k[0][0]) return k[0][1];
  for (let i = k.length - 1; i >= 0; i--) {
    if (k[i][0] <= frame) {
      const next = k[i + 1];
      if (!next || next[0] === k[i][0]) return k[i][1];
      return k[i][1] + ((frame - k[i][0]) / (next[0] - k[i][0])) * (next[1] - k[i][1]);
    }
  }
  return 0;
};

/** Music gain at an absolute frame for a given duck envelope: MUSIC_BASE → MUSIC_DUCKED (in dB) under VO words,
 *  plus the section arc, the joke dip and the reveal clear-out. */
export const musicGainAt = (env: Float32Array, frame: number) => {
  const d = env[Math.min(env.length - 1, Math.max(0, Math.round(frame)))] ?? 0;
  const db =
    LEVELS_DB.MUSIC_BASE +
    d * (LEVELS_DB.MUSIC_DUCKED - LEVELS_DB.MUSIC_BASE) +
    musicArcDbAt(frame) +
    jokeDipDbAt(frame) +
    approvedClearDbAt(frame);
  return dbToGain(db) * revealClearGainAt(frame);
};

let defaultEnvelope: Float32Array | null = null;
/** Music volume (linear) at an absolute timeline frame, from src/data/timeline.ts (scene.from + scene.voAt) and
 *  the VO word timings. Deterministic and cached; reuse it anywhere the music level is needed. */
export const musicVolumeAt = (frame: number) => {
  defaultEnvelope ??= buildDuckEnvelope();
  return musicGainAt(defaultEnvelope, frame);
};

/** Files present in public/ (Studio and render bundles). Empty when unknown. */
const publicFiles = (): Set<string> => {
  try {
    return new Set((getStaticFiles() ?? []).map((f) => f.name.replace(/^\/+/, "")));
  } catch {
    return new Set();
  }
};

export type SoundtrackProps = {
  /** public/ path of the music bed, or null for none. Rendered only once the file exists. */
  music?: string | null;
  /** Timeline frame where the music starts (default 0). */
  musicFrom?: number;
  /** Frames to skip at the start of the music file (e.g. to put its first downbeat on frame musicFrom). */
  musicTrimBefore?: number;
  /** Set false to drop the VO (e.g. a music-only cut). */
  vo?: boolean;
  /** Overrides for tests; default to the master timeline and the generated VO data. */
  scenes?: SceneSpec[];
  voData?: VoMap;
  totalFrames?: number;
};

export const Soundtrack: React.FC<SoundtrackProps> = ({
  music = MUSIC_FILE,
  musicFrom = 0,
  musicTrimBefore,
  vo = true,
  scenes = SCENES,
  voData = VO_DATA,
  totalFrames = TOTAL_FRAMES,
}) => {
  const files = useMemo(publicFiles, []);
  const isDefault = scenes === SCENES && voData === VO_DATA && totalFrames === TOTAL_FRAMES;
  const env = useMemo(
    () => (isDefault ? null : buildDuckEnvelope(totalFrames, scenes, voData)),
    [isDefault, totalFrames, scenes, voData],
  );
  const volumeAt = (frame: number) => (env ? musicGainAt(env, frame) : musicVolumeAt(frame));
  const hasMusic = !!music && files.has(music);
  return (
    <>
      {vo &&
        scenes.map((s) => {
          const clip = voData[s.id];
          if (!clip) return null;
          return (
            <Sequence
              key={s.id}
              from={voStartFrame(s)}
              durationInFrames={Math.ceil((clip.durationSec + MP3_DECODER_DELAY_SEC) * FPS) + 1}
              premountFor={FPS}
              name={`vo:${s.id}`}
            >
              <Audio src={staticFile(clip.file)} volume={VO} />
            </Sequence>
          );
        })}
      {hasMusic && (
        <Sequence from={musicFrom} premountFor={FPS} name="music">
          <Audio
            src={staticFile(music)}
            trimBefore={musicTrimBefore}
            volume={(f) => volumeAt(f + musicFrom)}
          />
        </Sequence>
      )}
    </>
  );
};
