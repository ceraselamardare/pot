// s13-end (Act 5, the end card). Hard cut from Night on the bar line at 1:18. VO at f30: "Pot. Built at NEAR Hackathon."
//
//   f0      Cream Day ground; Lockup on="light" (pot-lockup-on-light) is already there at 1.15× and settles to 1.0
//           over 42 f on `land` (log-space scale about its ink centre). Centred, 200 px tall, quarter-tile clear space.
//   "Pot."  The dots blip once, left to right 9 f apart (scale pulse via the Lockup's `dots` prop), on the `blips`
//           motif (its three transients are 9 f apart too), then rest.
//   f10+    The tagline blur-resolves at 8 f per word (Figtree 600, ink-muted, 44 px).
//   "Built" The pill "Built at NEAR HACKATHON" rises in (surface, 1 px line border, ink, Figtree 600).
//   "Hack…" "Social Money · Real-World Money" (ink-muted). Optional `repoUrl` line under it.
//   The card is composed by ≈ f144 and holds to the last frame (270 f timeline v1.2) on a 2 % constant-rate creep
//   plus a 4 px hand-held drift, so no frame is static. No fade to black: the last frame is the card.
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { day } from "../../brand/tokens";
import { SANS } from "../../brand/fonts";
import { LOGO_GEOMETRY, type DotState } from "../../brand/Logo";
import { DirectionalBlur, Sfx, WordRise, driftAt, land, lerp, logLerp, ramp, softInOut, voLanding } from "../../motion";
import { scene, type SceneId } from "../../data/timeline";
import { voWord } from "../../data/vo";
import { LockupSvg, WORDMARK_INK } from "../act2/LockupSvg";

const ID: SceneId = "s13-end";
export const S13_END_SCENES: SceneId[] = [ID];

const DUR = scene(ID).duration;
const LAST = DUR - 1;

// ─── Lockup geometry (units of the 512 tile = the Lockup's viewBox units) ──────────────────────────
const G = LOGO_GEOMETRY;
/** Lockup height in px = the tile (the tallest element on light grounds). */
export const S13_LOCKUP_HEIGHT = 200;
const U = S13_LOCKUP_HEIGHT / G.tile;
/** Ink extents on light: the tile starts at x 0; the wordmark's "t" ends at 1253.2 units. */
const INK_CX = (0 + WORDMARK_INK.right) / 2;
const INK_CY = G.tile / 2;

// ─── Layout (frame px; the card's optical centre sits just above the frame centre) ─────────────────
const TILE_TOP = 300;
const LOCKUP_CY = TILE_TOP + S13_LOCKUP_HEIGHT / 2;
/** Quarter-tile clear space = 50 px under the tile; the tagline's cap height starts ≈ 62 px below it. */
const TAG_TOP = TILE_TOP + S13_LOCKUP_HEIGHT + 52;
const TAG_SIZE = 44;
const PILL_TOP = TAG_TOP + 98;
const PILL_SIZE = 28;
const TRACKS_TOP = PILL_TOP + 92;
const TRACKS_SIZE = 28;
const REPO_TOP = TRACKS_TOP + 50;
const REPO_SIZE = 24;

// ─── Timing (scene frames) ─────────────────────────────────────────────────────────────────────────
const ARRIVE = 42; // 1.15 → 1.0 (brief: 36-48 f)
const SAY_POT = voWord(ID, "Pot", 33);
const SAY_BUILT = voWord(ID, "Built", 83);
const SAY_HACK = voWord(ID, "Hackathon", 134);
/** Dot i peaks on "Pot" + 9i (the blips file's transients sit at 0, 9, 18 f, each peaking ~0.5 f in). */
const BLIP_PEAK = SAY_POT;
const BLIP_GAP = 9;
const TAG_AT = 10;
const TAG_STAGGER = 8; // "blur-resolves at 8 f per word"
const PILL_AT = voLanding(SAY_BUILT);
const TRACKS_AT = voLanding(SAY_HACK);
const REPO_AT = TRACKS_AT + 10;
/** The card never freezes (review-1: the old 1.5 % over 5 s read as motionless): a 2 % push at a constant log rate
 *  from the end of the arrival to the very last frame, plus a gentle hand-held drift (~4 px, translation only). */
const CREEP = 0.02;
const DRIFT = 4;

export const S13_KEYS = {
  arrive: [0, ARRIVE],
  blips: [BLIP_PEAK, BLIP_PEAK + 2 * BLIP_GAP],
  tagline: [TAG_AT, TAG_AT + 7 * TAG_STAGGER + 20],
  pill: PILL_AT,
  tracks: TRACKS_AT,
  composed: TRACKS_AT + 20,
  last: LAST,
} as const;

/** One dot blip: a 3 f attack to +40 % then a 10 f settle (smooth, no overshoot), 0 elsewhere. */
const blip = (t: number) => {
  if (t <= -3 || t >= 10) return 0;
  return t < 0 ? Math.sin(((t + 3) / 3) * (Math.PI / 2)) : 0.5 + 0.5 * Math.cos((t / 10) * Math.PI);
};

/** A block that rises into its slot out of a vertical smear (the house entry, for non-word elements). */
const Rise: React.FC<{ at: number; top: number; children: React.ReactNode }> = ({ at, top, children }) => {
  const f = useCurrentFrame();
  if (f < at) return null;
  const e = ramp(f, at, at + 20, land);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top, display: "flex", justifyContent: "center" }}>
      <DirectionalBlur inline y={14 * (1 - e)} style={{ transform: `translateY(${(1 - e) * 24}px)`, opacity: lerp(0.2, 1, ramp(f, at, at + 10)) }}>
        {children}
      </DirectionalBlur>
    </div>
  );
};

export type S13EndProps = {
  /** Optional repo link, shown as a small ink-muted line under the tracks (default: not shown). */
  repoUrl?: string;
};

export const S13End: React.FC<S13EndProps> = ({ repoUrl }) => {
  const f = useCurrentFrame();
  // With the optional repo line the card is one line taller: lift everything by half of it to stay centred.
  const shift = repoUrl ? -(REPO_TOP - TRACKS_TOP) / 2 : 0;
  // Creep (folded into the logo's vector geometry; CSS scale for the text block).
  const k = Math.pow(1 + CREEP, ramp(f, ARRIVE, LAST));
  const dEnv = ramp(f, 0, ARRIVE, softInOut);
  const dr = driftAt(f, { amount: DRIFT, roll: 0, tilt: 0, seed: "s13-end" });
  const dx = (dr.x ?? 0) * dEnv;
  const dy = (dr.y ?? 0) * dEnv;
  // Arrival: 1.15 → 1.0 in log space about the lockup's ink centre.
  const s = logLerp(1.15, 1, ramp(f, 0, ARRIVE, land)) * k;
  const u = U * s;
  const cy = 540 + (LOCKUP_CY + shift - 540) * k;
  const dots = [0, 1, 2].map((i): DotState => ({ scale: 1 + 0.4 * blip(f - (BLIP_PEAK + i * BLIP_GAP)) })) as [DotState, DotState, DotState];

  return (
    <AbsoluteFill style={{ background: day.ground }}>
      {/* The logo is painted inside a full-frame SVG at (0, 0) with an SVG translate: sub-pixel exact, crisp. */}
      <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute", left: 0, top: 0 }}>
        <LockupSvg x={960 + dx - INK_CX * u} y={cy + dy - INK_CY * u} height={G.tile * u} on="light" dots={dots} />
      </svg>
      <AbsoluteFill style={{ transform: `translate(${dx}px, ${dy}px) scale(${k})`, transformOrigin: "960px 540px" }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: TAG_TOP + shift, display: "flex", justifyContent: "center" }}>
          <WordRise
            text="Group chat money that follows its own rules."
            start={TAG_AT}
            stagger={TAG_STAGGER}
            fontFamily={SANS}
            fontWeight={600}
            fontSize={TAG_SIZE}
            lineHeight={1.2}
            letterSpacing="0"
            color={day.inkMuted}
            rise={20}
            blur={14}
            style={{ whiteSpace: "nowrap" }}
          />
        </div>
        <Rise at={PILL_AT} top={PILL_TOP + shift}>
          <div
            style={{
              padding: "14px 28px",
              borderRadius: 999,
              background: day.surface,
              border: `1px solid ${day.line}`,
              color: day.ink,
              fontFamily: SANS,
              fontWeight: 600,
              fontSize: PILL_SIZE,
              lineHeight: 1.2,
              whiteSpace: "nowrap",
            }}
          >
            Built at NEAR HACKATHON
          </div>
        </Rise>
        <Rise at={TRACKS_AT} top={TRACKS_TOP + shift}>
          <div style={{ color: day.inkMuted, fontFamily: SANS, fontWeight: 600, fontSize: TRACKS_SIZE, lineHeight: 1.2, whiteSpace: "nowrap" }}>
            Social Money · Real-World Money
          </div>
        </Rise>
        {repoUrl ? (
          <Rise at={REPO_AT} top={REPO_TOP + shift}>
            <div style={{ color: day.inkMuted, fontFamily: SANS, fontWeight: 500, fontSize: REPO_SIZE, lineHeight: 1.2, whiteSpace: "nowrap" }}>{repoUrl}</div>
          </Rise>
        ) : null}
      </AbsoluteFill>
      {/* The dots' motif rests here: one blip on "Pot." (first transient on the word's frame). */}
      <Sfx name="blips" at={BLIP_PEAK - 1} volume={0.4} />
    </AbsoluteFill>
  );
};

export default S13End;
