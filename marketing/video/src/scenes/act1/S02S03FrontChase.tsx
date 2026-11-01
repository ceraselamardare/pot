// s02-front + s03-chase: ONE continuous shot (105 + 225 f).
// VO s02 (f3): "One friend fronts it all…"  VO s03 (its own f0 = f105 here): "…then spends weeks chasing everyone
// to pay up."
// - s01's whip-left continues: Maya (M on member-1, "Maya") arrives from the right and lands on "friend".
// - Expense chips stack on eighths (Flat · $840.00 / Car · $210.00 / Dinner · $186.00), one thud; the receipt
//   sticker pops behind them. On "fronts" the total ticks $0.00 → $1,236.00 (MoneyRoll "tick", Gabarito 800,
//   ~200 px, tabular), "fronted by Maya".
// - The camera keeps moving down: the total becomes the top of a Night thread of Maya's outgoing reminders, each
//   with "Seen"; a day stamp on the left flips Day 2 → Day 9 → Day 23 (quiet ticks); "weeks" punches big on
//   its word (the thesis word, from 1.6×) over a short dim.
// - THE JOKE: after the VO, "Leo is typing…" appears and the camera pushes in 1.5× to centre it (bubble ≈ 2× its
//   old size on screen); the dots pulse on eighths (blip, blip… the third never comes). The bubble vanishes in a
//   1-frame cut (f300 = film f495), then ~30 f of stillness to the end.
// FrontChaseVisual (no sound, no finish) is exported so s04 can freeze its last frame as the background.
import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from "remotion";
import { CalendarDays, Car, House, UtensilsCrossed, type LucideIcon } from "lucide-react";
import { scene, type SceneId } from "../../data/timeline";
import { voWord, voWordRel, voWords } from "../../data/vo";
import { STICKERS } from "../../data/stickers";
import { SANS } from "../../brand/fonts";
import {
  DirectionalBlur,
  MoneyRoll,
  ScalePunch,
  Sfx,
  StickerPop,
  alpha,
  cameraAt,
  clamp01,
  inOut,
  land,
  lerp,
  punch,
  ramp,
  smearDecay,
  smearSigma,
  softInOut,
  speedRamp,
  whip,
  voLanding,
  type CameraKey,
  type CameraPose,
} from "../../motion";
import { TypingDots } from "../../motion/dots";
import { FilmAvatar, FilmBubble, LEO, MAYA, N, NightFinish, NightGround, Seen } from "./common";

export const S02S03_SCENES: SceneId[] = ["s02-front", "s03-chase"];
export const S02_DURATION = scene("s02-front").duration;
export const S02S03_DURATION = S02_DURATION + scene("s03-chase").duration;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9$]/g, "");
const endOf = (id: SceneId, w: string, fallback: number, rel = 0) => {
  const hit = voWords(id).find((x) => norm(x.text) === w);
  return hit ? hit.end + rel : fallback;
};
const rel = (w: string, fallback: number) => voWordRel("s03-chase", w, fallback, "s02-front");

/** Spoken frames relative to this component's frame 0 (= s02's start). */
export const FC_VO = {
  one: voWord("s02-front", "One", 6),
  friend: voWord("s02-front", "friend", 22),
  fronts: voWord("s02-front", "fronts", 43),
  all: voWord("s02-front", "all", 68),
  then: rel("then", 108),
  spends: rel("spends", 124),
  weeks: rel("weeks", 150),
  chasing: rel("chasing", 174),
  everyone: rel("everyone", 205),
  to: rel("to", 230),
  pay: rel("pay", 239),
  up: rel("up", 253),
  upEnd: endOf("s03-chase", "up", 266, S02_DURATION),
};

const EIGHTH = 15;
/** Next eighth-note frame at or after f (the component starts on an eighth: 195 = 13 eighths). */
const onEighth = (f: number) => Math.ceil(f / EIGHTH) * EIGHTH;

// ─── Beats ──────────────────────────────────────────────────────────────────────
/** Maya whips in from the right (continuing s01's whip-left) and lands just before "friend". The whip-in starts
 *  WHIP_OVERLAP frames before this component's frame 0: s01's last frames draw FrontChaseArrival, so the whip-out
 *  and the whip-in overlap and there is no empty frame at the cut. */
const WHIP_IN = 20;
export const WHIP_OVERLAP = 4;
const WHIP_FROM = 1150; // px: Maya starts just off the right edge
/** Chips on eighths after Maya lands. */
const CHIP_AT = [onEighth(FC_VO.friend + 4), onEighth(FC_VO.friend + 4) + EIGHTH, onEighth(FC_VO.friend + 4) + 2 * EIGHTH];
const STICKER_AT = CHIP_AT[0] - 4;
/** The total rolls on "fronts" (lands 0-4 f early: ~20 steps over 42 f). */
const ROLL_AT = FC_VO.fronts - 2;
const TOTAL_IN = ROLL_AT - 8;

/** Thread beats (outgoing reminders), keyed to the VO. */
const BUBBLE_AT = [
  FC_VO.then - 6, // "hey! just a reminder 🙏"   (Day 2)
  FC_VO.everyone - 1, // "Sam, the $412?"      (after the "weeks" punch clears)
  FC_VO.everyone + 13, // "Leo??"
  FC_VO.pay - 3, // "anyone??"                     (Day 23)
];
const SEEN_AFTER = 14;
/** "weeks": the thesis word punches from 1.6× and holds ~1 s over a short dim. */
const WEEKS_AT = voLanding(FC_VO.weeks);
const WEEKS_OUT = FC_VO.weeks + 48;
/** Day stamp flips (with quiet ticks). */
const DAY_FLIPS: Array<{ at: number; day: number }> = [
  { at: BUBBLE_AT[0] + 2, day: 2 },
  { at: FC_VO.weeks, day: 9 },
  { at: FC_VO.to + 2, day: 23 },
];
/** The joke: Leo starts typing after the VO; the dots pulse on eighths; a 1-frame cut removes the bubble. */
export const TYPING_IN = Math.max(FC_VO.upEnd, BUBBLE_AT[3] + 20);
const DOTS_START = onEighth(TYPING_IN);
export const TYPING_GONE = DOTS_START + 2 * EIGHTH;

// ─── World layout (px from the stage centre at scale 1) ─────────────────────────
const MAYA_AV = { x: -560, y: -175, size: 230 };
const CHIP_LEFT = -330;
const CHIP_Y = [-300, -175, -50];
const CHIP_H = 104;
const TOTAL_Y = 175;
const TOTAL_SIZE = 210;
const LABEL_Y = 305;

/** The thread column (a phone-like chat column, slightly right of centre so the day stamp has the left). */
const THREAD_RIGHT = 380;
const THREAD_LEFT = -220;
const BUBBLE_K = 3.4;
const BUBBLE_TOP = [470, 670, 870, 1070];
const TYPING_TOP = 1270;

const REMINDERS = ["hey! just a reminder 🙏", "Sam, the $412?", "Leo??", "anyone??"];

const CHIPS: Array<{ icon: LucideIcon; label: string; amount: string }> = [
  { icon: House, label: "Flat", amount: "$840.00" },
  { icon: Car, label: "Car", amount: "$210.00" },
  { icon: UtensilsCrossed, label: "Dinner", amount: "$186.00" },
];

// ─── Camera ─────────────────────────────────────────────────────────────────────
/** Keeps moving down: a slow drift through s02, then ONE decisive speed-ramp down into the thread that sweeps the
 *  total out of the top before "weeks" punches (so "weeks" stands alone), a slow drift while the reminders land,
 *  and finally the joke's push-in onto Leo's typing bubble. */
const lin = (t: number) => t;
/** The joke push: starts as Leo's bubble appears, 1.6× in 26 f, centring the typing bubble (≈ 2× its in-thread
 *  size on screen, label ≈ 76 px) with "anyone?? · Seen" above right. */
export const JOKE_PUSH_AT = TYPING_IN - 4;
const JOKE_PUSH_FRAMES = 26;
const JOKE = { cx: -50, cy: 1380, scale: 1.6 };
const CAM_KEYS: CameraKey[] = [
  // Maya lands near centre, framed a little tighter…
  { at: 0, cx: -420, cy: -40, scale: 1.12 },
  { at: CHIP_AT[0] - 6, cx: -420, cy: -34, scale: 1.12, ease: lin },
  // …then the camera reframes and pulls back as the chips stack and the total rolls.
  { at: ROLL_AT + 34, cx: 0, cy: 0, scale: 1, ease: inOut },
  { at: 88, cy: 12, ease: lin },
  { at: WEEKS_AT, cy: 860, ease: speedRamp },
  { at: JOKE_PUSH_AT, cy: 920, ease: lin },
  { at: JOKE_PUSH_AT + JOKE_PUSH_FRAMES, cx: JOKE.cx, cy: JOKE.cy, scale: JOKE.scale, ease: inOut },
  { at: S02S03_DURATION, cy: JOKE.cy + 6, ease: lin },
];

export const frontChaseCamera = (frame: number): CameraPose =>
  cameraAt(frame, CAM_KEYS, { drift: { amount: 7, roll: 0.35, tilt: 0, seed: "s02" }, creep: { start: 0, end: S02S03_DURATION, amount: 0.04 } });

const camera2D = (p: CameraPose) =>
  `translate(${p.x}px, ${p.y}px) rotate(${p.rotZ}deg) scale(${p.scale}) translate(${-p.cx}px, ${-p.cy}px)`;

/** Place a box in world px (origin = stage centre). */
const W = (x: number, y: number, extra?: React.CSSProperties): React.CSSProperties => ({ position: "absolute", left: 960 + x, top: 540 + y, ...extra });

// ─── Pieces ─────────────────────────────────────────────────────────────────────
const ExpenseChip: React.FC<{ i: number; frame: number }> = ({ i, frame }) => {
  const at = CHIP_AT[i];
  if (frame < at) return null;
  const t = frame - at;
  const e = punch(clamp01(t / 14));
  const c = CHIPS[i];
  const Icon = c.icon;
  return (
    <div
      style={W(CHIP_LEFT, CHIP_Y[i] - CHIP_H / 2, {
        height: CHIP_H,
        transform: `translateY(${(1 - e) * -46}px) scale(${lerp(1.12, 1, e)})`,
        transformOrigin: "0% 50%",
        opacity: lerp(0.3, 1, clamp01(t / 5)),
      })}
    >
      <DirectionalBlur inline y={smearDecay(frame, at, 16, 0.45)} region={0.3}>
        <div
          style={{
            height: CHIP_H,
            boxSizing: "border-box",
            display: "inline-flex",
            alignItems: "center",
            gap: 22,
            padding: "0 44px 0 32px",
            borderRadius: CHIP_H / 2,
            background: N.surfaceSunken,
            boxShadow: `inset 0 0 0 2px ${N.line}`,
            fontFamily: SANS,
            fontWeight: 700,
            fontSize: 50,
            color: N.ink,
            whiteSpace: "nowrap",
          }}
        >
          <Icon size={48} strokeWidth={2} color={N.inkMuted} style={{ display: "block" }} />
          <span>
            {c.label} <span style={{ color: N.inkMuted }}>·</span> <span style={{ fontVariantNumeric: "tabular-nums" }}>{c.amount}</span>
          </span>
        </div>
      </DirectionalBlur>
    </div>
  );
};

const Reminder: React.FC<{ i: number; frame: number }> = ({ i, frame }) => {
  const at = BUBBLE_AT[i];
  if (frame < at) return null;
  const e = land(clamp01((frame - at) / 20));
  const seen = ramp(frame, at + SEEN_AFTER, at + SEEN_AFTER + 10, land);
  return (
    <div style={W(THREAD_RIGHT - 1100, BUBBLE_TOP[i], { width: 1100 })}>
      <div style={{ transform: `translateY(${(1 - e) * 44}px) scale(${lerp(0.9, 1, e)})`, transformOrigin: "100% 100%", opacity: lerp(0.25, 1, clamp01((frame - at) / 6)) }}>
        <FilmBubble from="me" k={BUBBLE_K} weight={500}>
          {REMINDERS[i]}
        </FilmBubble>
      </div>
      {frame >= at + SEEN_AFTER ? <Seen size={36} style={{ marginTop: 12, opacity: seen, transform: `translateY(${(1 - seen) * -8}px)` }} /> : null}
    </div>
  );
};

/** Leo's typing bubble (incoming) with the brand dots (gap = 3.33 r) pulsing on eighths, plus "Leo is typing…". */
const TypingBubble: React.FC<{ frame: number }> = ({ frame }) => {
  if (frame < TYPING_IN || frame >= TYPING_GONE) return null; // the joke: a 1-frame cut
  const e = land(clamp01((frame - TYPING_IN) / 16));
  return (
    <div style={W(THREAD_LEFT, TYPING_TOP, { width: 900 })}>
      <div style={{ transform: `translateY(${(1 - e) * 36}px) scale(${lerp(0.9, 1, e)})`, transformOrigin: "0% 100%", opacity: lerp(0.25, 1, clamp01((frame - TYPING_IN) / 6)) }}>
        <FilmBubble from={LEO} k={BUBBLE_K} showName={false} padding="36px 40px">
          <TypingDots r={17} color={N.inkMuted} mode="pulse" grid="eighths" start={DOTS_START} min={0.3} style={{ margin: "4px 0" }} />
        </FilmBubble>
      </div>
      <div style={{ marginTop: 16, marginLeft: 6 * BUBBLE_K + 28 * BUBBLE_K, fontFamily: SANS, fontWeight: 600, fontSize: 46, color: N.inkMuted, opacity: e }}>
        Leo is typing…
      </div>
    </div>
  );
};

/** The day stamp on the left: one pill whose number flips (old slides up, new rises in with a 1 f smear). */
const DayStamp: React.FC<{ frame: number }> = ({ frame }) => {
  const first = DAY_FLIPS[0].at;
  if (frame < first) return null;
  let k = 0;
  for (let i = 0; i < DAY_FLIPS.length; i++) if (frame >= DAY_FLIPS[i].at) k = i;
  const cur = DAY_FLIPS[k];
  const prev = k > 0 ? DAY_FLIPS[k - 1] : null;
  const t = frame - cur.at;
  const p = land(clamp01(t / 9));
  const appear = land(clamp01((frame - first) / 14));
  const H = 72;
  return (
    <div
      style={{
        position: "absolute",
        left: 104,
        top: 486,
        display: "flex",
        alignItems: "center",
        gap: 18,
        height: 112,
        boxSizing: "border-box",
        padding: "0 40px 0 30px",
        borderRadius: 56,
        background: N.surface,
        boxShadow: `inset 0 0 0 2px ${N.line}`,
        opacity: appear,
        transform: `translateX(${(1 - appear) * -40}px)`,
      }}
    >
      <CalendarDays size={54} strokeWidth={2} color={N.inkMuted} style={{ display: "block" }} />
      <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 56, color: N.ink }}>Day</span>
      <span style={{ position: "relative", display: "inline-block", width: 74, height: H, overflow: "hidden" }}>
        {prev && p < 1 ? (
          <span style={{ position: "absolute", left: 0, top: 0, lineHeight: `${H}px`, fontFamily: SANS, fontWeight: 700, fontSize: 56, color: N.ink, fontVariantNumeric: "tabular-nums", transform: `translateY(${-p * H}px)` }}>
            {prev.day}
          </span>
        ) : null}
        <span
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            lineHeight: `${H}px`,
            fontFamily: SANS,
            fontWeight: 700,
            fontSize: 56,
            color: N.ink,
            fontVariantNumeric: "tabular-nums",
            transform: `translateY(${prev ? (1 - p) * H : 0}px)`,
          }}
        >
          {cur.day}
        </span>
      </span>
    </div>
  );
};

/** "weeks": the thesis word, 1.6× → 1 on `punch`, held ~1 s over a short Night-ground dim, out in 7 f. */
const Weeks: React.FC<{ frame: number }> = ({ frame }) => {
  if (frame < WEEKS_AT - 8 || frame > WEEKS_OUT + 12) return null;
  const dim = 0.66 * ramp(frame, WEEKS_AT - 6, WEEKS_AT + 4, softInOut) * (1 - ramp(frame, WEEKS_OUT, WEEKS_OUT + 10, softInOut));
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: alpha(N.ground, dim) }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <ScalePunch words={[{ text: "weeks", startFrame: WEEKS_AT }]} fontSize={330} color={N.ink} letterSpacing="-0.03em" exit={{ at: WEEKS_OUT }} style={{ transform: "translateY(24px)" }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ─── The shot ───────────────────────────────────────────────────────────────────
/** Whip-in offset (px) at component frame f (negative frames = s01's overlap). */
const whipOffset = (f: number) => WHIP_FROM * (1 - whip(clamp01((f + WHIP_OVERLAP) / (WHIP_IN + WHIP_OVERLAP))));
/** Horizontal smear: starts at least as blurred as s01's exit, clears with the move. */
const whipSigma = (f: number) => {
  if (f >= WHIP_IN) return 0;
  const v = Math.abs(whipOffset(f + 0.5) - whipOffset(f - 0.5));
  return Math.min(70, smearSigma(Math.max(v, f <= -WHIP_OVERLAP ? 140 : 0), 0.5, 70));
};

const MayaBlock: React.FC = () => (
  <div style={W(MAYA_AV.x - MAYA_AV.size / 2, MAYA_AV.y - MAYA_AV.size / 2, { width: MAYA_AV.size, display: "flex", flexDirection: "column", alignItems: "center" })}>
    <FilmAvatar person={MAYA} size={MAYA_AV.size} />
    <div style={{ marginTop: 22, fontFamily: SANS, fontWeight: 700, fontSize: 54, color: N.ink }}>Maya</div>
  </div>
);

/** Drawn by s01's last WHIP_OVERLAP frames (frame = s01 frame − s01 duration, i.e. −4…−1): Maya already
 *  arriving from the right while s01's content whips out to the left. Same math as frame ≥ 0 below. */
export const FrontChaseArrival: React.FC<{ frame: number }> = ({ frame }) => (
  <AbsoluteFill style={{ transform: `translateX(${whipOffset(frame)}px)` }}>
    <DirectionalBlur x={whipSigma(frame)} region={0.06}>
      <AbsoluteFill style={{ transform: camera2D(frontChaseCamera(frame)), transformOrigin: "50% 50%" }}>
        <MayaBlock />
      </AbsoluteFill>
    </DirectionalBlur>
  </AbsoluteFill>
);

export const FrontChaseVisual: React.FC = () => {
  const frame = useCurrentFrame();
  const pose = frontChaseCamera(frame);
  const dx = whipOffset(frame);
  const sigma = whipSigma(frame);
  const totalIn = land(clamp01((frame - TOTAL_IN) / 20));
  const labelIn = land(clamp01((frame - (ROLL_AT + 4)) / 20));
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ transform: `translateX(${dx}px)` }}>
        <DirectionalBlur x={sigma} region={0.06}>
          <AbsoluteFill style={{ transform: camera2D(pose), transformOrigin: "50% 50%" }}>
            {/* receipt sticker behind the chips (the act's one sticker) */}
            <div style={W(110, -420, { width: 250 })}>
              <StickerPop at={STICKER_AT} rotate={10} inline={false}>
                <Img src={staticFile(STICKERS.receipt.src)} style={{ width: 250, display: "block" }} />
              </StickerPop>
            </div>
            {/* Maya */}
            <MayaBlock />
            {/* expense chips */}
            {CHIPS.map((_, i) => (
              <ExpenseChip key={i} i={i} frame={frame} />
            ))}
            {/* the total */}
            {frame >= TOTAL_IN ? (
              <div style={W(-960, TOTAL_Y - (TOTAL_SIZE * 1.06) / 2, { width: 1920, display: "flex", justifyContent: "center", opacity: lerp(0.25, 1, totalIn), transform: `translateY(${(1 - totalIn) * 40}px)` })}>
                <MoneyRoll from={0} to={1236} at={ROLL_AT} mode="tick" fontSize={TOTAL_SIZE} color={N.ink} />
              </div>
            ) : null}
            {frame >= ROLL_AT + 4 ? (
              <div
                style={W(-960, LABEL_Y - 30, {
                  width: 1920,
                  textAlign: "center",
                  fontFamily: SANS,
                  fontWeight: 600,
                  fontSize: 50,
                  color: N.inkMuted,
                  opacity: labelIn,
                  transform: `translateY(${(1 - labelIn) * 30}px)`,
                })}
              >
                fronted by <span style={{ color: N.ink }}>Maya</span>
              </div>
            ) : null}
            {/* the thread */}
            {REMINDERS.map((_, i) => (
              <Reminder key={i} i={i} frame={frame} />
            ))}
            <TypingBubble frame={frame} />
          </AbsoluteFill>
        </DirectionalBlur>
      </AbsoluteFill>
      <Weeks frame={frame} />
      <DayStamp frame={frame} />
    </AbsoluteFill>
  );
};

/** Sound (sparse): one thud for the chips, quiet ticks on the day flips, two quiet blips for the dots (the third
 *  never comes: that's the joke). */
const FrontChaseSfx: React.FC = () => (
  <>
    {/* the chip's punch lands ~4 f after it starts; thud.mp3 peaks 1 f in */}
    <Sfx name="thud" at={CHIP_AT[0] + 3} volume={0.5} />
    {DAY_FLIPS.map((d) => (
      <Sfx key={d.at} name="tick" at={d.at} volume={0.16} />
    ))}
    {/* blips.mp3 = three blips at 0 / 150 / 300 ms: play only the first, then only the second, on each dot's peak */}
    <Sfx name="blips" at={DOTS_START + 7} durationInFrames={6} volume={0.3} />
    <Sfx name="blips" at={DOTS_START + EIGHTH + 7} trimBefore={9} durationInFrames={6} volume={0.3} />
  </>
);

export const S02S03FrontChase: React.FC = () => (
  <NightGround>
    <FrontChaseVisual />
    <NightFinish />
    <FrontChaseSfx />
  </NightGround>
);

/** Key frames for the README / director. */
export const FC_KEYS = { WHIP_OVERLAP, WHIP_IN, CHIP_AT, STICKER_AT, ROLL_AT, BUBBLE_AT, WEEKS_AT, WEEKS_OUT, DAY_FLIPS, TYPING_IN, JOKE_PUSH_AT, DOTS_START, TYPING_GONE };
