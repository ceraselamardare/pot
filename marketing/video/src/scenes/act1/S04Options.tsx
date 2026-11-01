// s04-options. VO: "Split apps just keep score. Shared accounts hand one person all the money."
// Hard cut on the beat from s03's stillness: the same thread (frozen on s03's last frame) sinks back and dims
// while two big Night cards rise and occlude the frame, one on "Split", one on "Shared".
// - Card 1: Lucide receipt, "Split apps", "Track who owes what." / "Hold no money.", chip ✕ "Can't pay for anything".
// - Card 2: Lucide user-round, "Shared accounts", "One person holds it all." / "Everyone else just hopes.",
//   chip ✕ "One person in charge".
// Chips are the UI kit's StatusChip status="declined" in the Night theme (icon + word + colour), stamped with a
// 3-5 % settle (motion kit Stamp); a StrikeThrough draws over each title in 12 f. Both cards are thrown down and
// off frame on `exit` just after "money"; as they clear, s05's chat bubble with the typing dots pops in at the centre
// (pivotBubble.tsx, f300 = film f825), so the audio breath before s05 never shows an empty frame.
import React from "react";
import { AbsoluteFill, Freeze, useCurrentFrame } from "remotion";
import { Receipt, UserRound, type LucideIcon } from "lucide-react";
import { scene, type SceneId } from "../../data/timeline";
import { voWord, voWords } from "../../data/vo";
import { DISPLAY, SANS } from "../../brand/fonts";
import { DirectionalBlur, Sfx, Stamp, StrikeThrough, alpha, clamp01, depthShadow, exit, land, lerp, ramp, smearSigma, softInOut, snap } from "../../motion";
import { StatusChip, UiTheme } from "../../ui";
import { N, NightFinish, NightGround } from "./common";
import { FrontChaseVisual, S02S03_DURATION } from "./S02S03FrontChase";
import { PIVOT_BLIPS_S04, PIVOT_POP_S04, PivotBubble } from "./pivotBubble";

export const S04_SCENES: SceneId[] = ["s04-options"];
const ID: SceneId = "s04-options";
export const S04_DURATION = scene(ID).duration;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9$]/g, "");
const endOf = (w: string, fallback: number) => voWords(ID).find((x) => norm(x.text) === w)?.end ?? fallback;

export const S04_VO = {
  split: voWord(ID, "Split", 12),
  score: voWord(ID, "score", 84),
  shared: voWord(ID, "Shared", 144),
  one: voWord(ID, "one", 208),
  person: voWord(ID, "person", 220),
  money: voWord(ID, "money", 270),
  moneyEnd: endOf("money", 291),
};

// ─── Beats ──────────────────────────────────────────────────────────────────────
const ENTER_FRAMES = 24;
/** Card 1 is already rising on frame 0 (cut on motion) and lands on "Split". */
const CARD1_IN = S04_VO.split - 18;
const CARD2_IN = S04_VO.shared - 16;
/** Chips stamp on the verdict words ("score", "one person"). The Stamp (1.5× on uiPop) first touches 1.0× 9 f
 *  after it starts, so it starts 10 f early: contact lands 1 f before the word. Strikes follow over 12 f. */
const STAMP_CONTACT = 9;
const CHIP1_AT = S04_VO.score - STAMP_CONTACT - 1;
const STRIKE1_AT = CHIP1_AT + 22;
const CHIP2_AT = S04_VO.one - STAMP_CONTACT - 1;
const STRIKE2_AT = CHIP2_AT + 22;
/** Thrown down and off frame on `exit` as "money" finishes; the pivot bubble pops in while they clear. */
const EXIT_AT = S04_VO.money + 10;
const EXIT_FRAMES = 22;
/** Last frame with a card on screen (card 1 leaves 3 f after card 2). */
export const S04_CARDS_GONE = EXIT_AT + 3 + EXIT_FRAMES;

// ─── Card ───────────────────────────────────────────────────────────────────────
const CARD_W = 1220;
/** The cards dominate the frame (they occlude it): laid out at 1220 px, shown 12 % larger. */
const CARD_SCALE = 1.12;
const CARD_R = 52; // radius-lg (24) at the card's ~2.2× scale

type CardSpec = { icon: LucideIcon; title: string; lines: [string, string]; chip: string; chipAt: number; strikeAt: number };

const CARDS: CardSpec[] = [
  { icon: Receipt, title: "Split apps", lines: ["Track who owes what.", "Hold no money."], chip: "Can’t pay for anything", chipAt: CHIP1_AT, strikeAt: STRIKE1_AT },
  { icon: UserRound, title: "Shared accounts", lines: ["One person holds it all.", "Everyone else just hopes."], chip: "One person in charge", chipAt: CHIP2_AT, strikeAt: STRIKE2_AT },
];

const OptionCard: React.FC<{ spec: CardSpec; lift: number; dim: number }> = ({ spec, lift, dim }) => {
  const Icon = spec.icon;
  return (
    <div
      style={{
        position: "relative",
        width: CARD_W,
        boxSizing: "border-box",
        padding: "72px 88px 80px",
        borderRadius: CARD_R,
        background: N.surface,
        boxShadow: `${depthShadow(lift, "night")}, inset 0 0 0 2px ${N.line}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
        <span style={{ display: "grid", placeItems: "center", width: 136, height: 136, flexShrink: 0, borderRadius: 136, background: N.surfaceSunken, color: N.ink }}>
          <Icon size={70} strokeWidth={2} style={{ display: "block" }} />
        </span>
        <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 112, lineHeight: 1.05, letterSpacing: "-0.025em", color: N.ink, whiteSpace: "nowrap" }}>
          <StrikeThrough at={spec.strikeAt} tone="declined" theme="night" thickness={0.075} center={0.56} dimTo={0.6}>
            {spec.title}
          </StrikeThrough>
        </span>
      </div>
      <div style={{ marginTop: 40, fontFamily: SANS, fontWeight: 600, fontSize: 58, lineHeight: "78px" }}>
        <div style={{ color: N.inkMuted }}>{spec.lines[0]}</div>
        <div style={{ color: N.ink }}>{spec.lines[1]}</div>
      </div>
      <div style={{ marginTop: 44, height: 84 }}>
        <Stamp at={spec.chipAt} origin="20% 50%">
          <UiTheme theme="night">
            {/* the UI kit's chip (Figtree 14/600, 28 px pill) at 3× via CSS zoom: crisp, icon + word + colour */}
            <span style={{ display: "inline-block", zoom: 3 }}>
              <StatusChip status="declined">{spec.chip}</StatusChip>
            </span>
          </UiTheme>
        </Stamp>
      </div>
      {/* receding: a Night-ground scrim on the card itself (leaf) */}
      {dim > 0.001 ? <div style={{ position: "absolute", inset: 0, borderRadius: CARD_R, background: alpha(N.ground, dim) }} /> : null}
    </div>
  );
};

/** One card's motion: rises from below (cut on motion), recedes when the next card covers it, thrown down at the end. */
const CardLayer: React.FC<{ spec: CardSpec; enterAt: number; recedeAt?: number; exitAt: number; restY: number; tilt: number; frame: number }> = ({
  spec,
  enterAt,
  recedeAt,
  exitAt,
  restY,
  tilt,
  frame,
}) => {
  const rise = (f: number) => 1150 * (1 - snap(clamp01((f - enterAt) / ENTER_FRAMES)));
  const fall = (f: number) => 1400 * exit(clamp01((f - exitAt) / EXIT_FRAMES));
  const y = (f: number) => rise(f) + fall(f);
  if (frame < enterAt || frame > exitAt + EXIT_FRAMES) return null;
  const e = snap(clamp01((frame - enterAt) / ENTER_FRAMES));
  const r = recedeAt !== undefined ? land(clamp01((frame - recedeAt) / 26)) : 0;
  const q = exit(clamp01((frame - exitAt) / EXIT_FRAMES));
  const v = Math.abs(y(frame + 0.5) - y(frame - 0.5));
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          transform: `translateY(${restY + y(frame) - 84 * r}px) rotate(${lerp(tilt, 0, e) + q * -tilt * 1.4}deg) scale(${CARD_SCALE * lerp(0.94, 1, e) * lerp(1, 0.9, r)})`,
          transformOrigin: "50% 50%",
        }}
      >
        <DirectionalBlur y={Math.min(60, smearSigma(v, 0.35, 60))} inline region={0.12}>
          <OptionCard spec={spec} lift={lerp(60, 0, e) + 40 * (1 - r)} dim={0.42 * r} />
        </DirectionalBlur>
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene ──────────────────────────────────────────────────────────────────────
export const S04Options: React.FC = () => {
  const frame = useCurrentFrame();
  // The chase thread (s03's last frame) sinks back and dims under card 1, and is gone under card 2.
  // (from frame 0, so the cut from s03 changes nothing but the rising card)
  const back1 = land(clamp01(frame / 30));
  const back2 = ramp(frame, CARD2_IN, CARD2_IN + 30, softInOut);
  const bgDim = 0.6 * back1 + 0.4 * back2;
  return (
    <NightGround>
      {back2 < 1 ? (
        <AbsoluteFill style={{ transform: `scale(${lerp(1, 0.9, back1)}) translateY(${-30 * back1}px)` }}>
          <Freeze frame={S02S03_DURATION - 1}>
            <FrontChaseVisual />
          </Freeze>
          <AbsoluteFill style={{ background: alpha(N.ground, bgDim) }} />
        </AbsoluteFill>
      ) : null}
      <CardLayer spec={CARDS[0]} enterAt={CARD1_IN} recedeAt={CARD2_IN + 4} exitAt={EXIT_AT + 3} restY={-6} tilt={-3} frame={frame} />
      <CardLayer spec={CARDS[1]} enterAt={CARD2_IN} exitAt={EXIT_AT} restY={64} tilt={2.5} frame={frame} />
      {/* s05's bubble arrives here, at rest scale, so the breath has the dots in it (s05 continues it exactly). */}
      <PivotBubble frame={frame} popAt={PIVOT_POP_S04} />
      <NightFinish />
      {/* SFX: one stamp (card 1's chip; the file peaks 1 f in, on the contact frame) and one scribble (card 2's
          strike: only the file's first stroke, f1-9, over the 12 f draw), as the sound system asks. */}
      <Sfx name="stamp" at={CHIP1_AT + STAMP_CONTACT - 1} volume={0.55} />
      <Sfx name="scribble" at={STRIKE2_AT - 1} durationInFrames={11} volume={0.4} />
      {/* the dots' blips on their first pulse (three blips on the three peaks), inside the VO breath */}
      <Sfx name="blips" at={PIVOT_BLIPS_S04} volume={0.22} />
    </NightGround>
  );
};

export const S04_KEYS = { CARD1_IN, CARD2_IN, CHIP1_AT, STRIKE1_AT, CHIP2_AT, STRIKE2_AT, EXIT_AT, S04_CARDS_GONE, PIVOT_POP_S04, PIVOT_BLIPS_S04 };
