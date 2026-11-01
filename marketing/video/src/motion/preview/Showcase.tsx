// MotionKit showcase: a ~13 s reel that strings the primitives together the way the film will
// (research grammar): reveal snap → blur-matched whip → tick roll → zoom-through → camera push into the
// typing dot → marigold flood → logo on the lid spring + burst → scale cut → 3D phone (held-pose entry,
// breakout, hero burst, roll) → hard cut → end card.
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { TransitionSeries } from "@remotion/transitions";
import { day, night } from "../../brand/tokens";
import { SANS } from "../../brand/fonts";
import { Lockup } from "../../brand/Logo";
import { WordRise, Typewriter, typedEnd } from "../text/KineticText";
import { HighlightBar, StrikeThrough } from "../text/marks";
import { useFitText } from "../text/fit";
import { MoneyRoll } from "../numbers";
import { Stage3D, Camera, Layer, BreakOut, Slab, ContactShadow, HELD_ENTRY, heldEntryPose, breakoutLifted, useCamera, pushKeys, revealSnapKeys } from "../camera";
import { Grain } from "../effects/Grain";
import { Vignette } from "../effects/overlays";
import { Burst } from "../effects/Burst";
import { TypingDots, typingDots, DOT_GAP_R } from "../dots";
import { hyper, type HyperTransition } from "../transitions/wrappers";
import { crashOut, inOut, land, linear, springAt, ramp, lerp, logLerp } from "../easing";
import { Sfx } from "../Sfx";
import { PhoneDummy, DummyCard, PHONE_W, PHONE_H } from "./PhoneDummy";
import { SHOWCASE_FRAMES as META_FRAMES } from "./showcase-meta";

const NightFinish: React.FC = () => (
  <>
    <Vignette theme="night" />
    <Grain />
  </>
);

// 1 ─ Hook: reveal snap + rising words + member-4 highlight (no marigold in Act 1).
const Hook: React.FC = () => {
  const text = "Every group trip\nhas a money problem.";
  const fontSize = useFitText({ text, maxWidth: 1600, maxFontSize: 170 });
  // Frame 0 already moves (research rule 9): the first word is rising and the snap lands on f2.
  const cam = useCamera(revealSnapKeys(2, 1.5, { ratio: 0.6, tail: 24 }), { creep: { start: 30, end: 110, amount: 0.05 } });
  return (
    <AbsoluteFill style={{ background: night.ground }}>
      <Stage3D>
        <Camera pose={cam}>
          <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
            <WordRise
              text={text}
              start={0}
              stagger={6}
              fontSize={fontSize}
              color={night.ink}
              renderWord={(w) =>
                w.startsWith("money") ? (
                  <HighlightBar at={48} color={day.member4}>
                    {w}
                  </HighlightBar>
                ) : (
                  w
                )
              }
            />
          </AbsoluteFill>
        </Camera>
      </Stage3D>
      <NightFinish />
      <Sfx name="whoosh-fast" at={86} volume={0.5} />
    </AbsoluteFill>
  );
};

// 2 ─ Fronted: the tick roll, then we fly into the number.
const Fronted: React.FC = () => {
  const cam = useCamera(pushKeys(30, 80, { from: 1 }), { creep: { start: 0, end: 120, amount: 0.04 } });
  return (
    <AbsoluteFill style={{ background: night.ground }}>
      <Stage3D>
        <Camera pose={cam}>
          <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 22 }}>
            <MoneyRoll from={0} to={1236} at={8} fontSize={210} color={night.ink} />
            <WordRise text="fronted by Maya" start={40} stagger={5} fontFamily={SANS} fontWeight={600} fontSize={46} color={night.inkMuted} letterSpacing="0" rise={32} />
          </AbsoluteFill>
        </Camera>
      </Stage3D>
      <NightFinish />
      <Sfx name="tick" at={8} volume={0.3} />
    </AbsoluteFill>
  );
};

// 3 ─ The chase + "Leo is typing…", then the camera pushes into the middle dot (log space, crashOut).
const DOT_R = 14;
const DOT = { x: 960, y: 760 };
const PUSH_AT = 90;
const PUSH_FRAMES = 40;
const PUSH_TO = 6;
const FLOOD_FRAMES = 15;
const Typing: React.FC = () => {
  const frame = useCurrentFrame();
  const line = "i'll pay you back!!";
  const end = typedEnd(line, { start: 4, seed: "showcase" });
  // Push 1 → 6× toward the middle dot: look-at moves onto the dot while the zoom runs in log space.
  const cam = useCamera([
    { at: 0, scale: 1 },
    { at: PUSH_AT, scale: 1 },
    { at: PUSH_AT + PUSH_FRAMES, scale: PUSH_TO, cx: DOT.x - 960, cy: DOT.y - 540, ease: crashOut },
    // Keep creeping in while the flood (next shot) opens from the dot: no dead stop.
    { at: PUSH_AT + PUSH_FRAMES + FLOOD_FRAMES, scale: PUSH_TO * 1.1, ease: linear },
  ]);
  const gap = DOT_GAP_R * DOT_R;
  return (
    <AbsoluteFill style={{ background: night.ground }}>
      <Stage3D>
        <Camera pose={cam}>
          <AbsoluteFill style={{ alignItems: "center", paddingTop: 300 }}>
            <div style={{ background: night.surfaceSunken, borderRadius: 40, padding: "26px 42px", color: night.ink }}>
              <StrikeThrough at={end + 8} dimTo={0.5}>
                <Typewriter text={line} start={4} seed="showcase" fontFamily={SANS} fontWeight={600} fontSize={60} color={night.ink} caretUntil={end + 6} align="left" />
              </StrikeThrough>
            </div>
          </AbsoluteFill>
          <div style={{ position: "absolute", left: 0, right: 0, top: DOT.y - 110, textAlign: "center", fontFamily: SANS, fontWeight: 600, fontSize: 30, color: night.inkMuted }}>
            Leo is typing…
          </div>
          {/* The bubble is placed so the MIDDLE dot sits exactly on DOT (the flood starts there). */}
          <div
            style={{
              position: "absolute",
              left: DOT.x - gap - DOT_R - 38,
              top: DOT.y - DOT_R - 28,
              background: night.surfaceSunken,
              borderRadius: 44,
              padding: "28px 38px",
            }}
          >
            <TypingDots mode="pulse" grid="eighths" r={DOT_R} color={night.inkMuted} />
          </div>
        </Camera>
      </Stage3D>
      <NightFinish />
      <Sfx name="typing" at={4} volume={0.35} />
      <Sfx name="scribble" at={end + 8} volume={0.45} />
      <Sfx name="riser" at={PUSH_AT - 20} volume={0.5} />
    </AbsoluteFill>
  );
};

// 4 ─ Reveal on marigold: the lid spring (the film's one visible spring), eggplant burst, tagline.
const Reveal: React.FC = () => {
  const frame = useCurrentFrame();
  const lid = springAt(frame, 2, "lid");
  const dots = typingDots(frame, { mode: frame < 70 ? "pulse" : "still", start: 10 });
  return (
    <AbsoluteFill style={{ background: day.brand, alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 48 }}>
      <div style={{ position: "relative", transform: `scale(${lerp(0.82, 1, lid)})` }}>
        <Lockup height={220} on="marigold" dots={dots} wordmarkReveal={ramp(frame, 14, 26, land)} />
        {/* Leaves from the glyph's edge so eggplant particles never clump on the eggplant glyph. */}
        <Burst at={6} variant="hero" x={110} y={119} r0={90} scale={1.3} color={day.onBrand} />
      </div>
      <WordRise text="Group chat money that follows its own rules." start={30} stagger={4} fontSize={56} fontWeight={700} color={day.onBrand} letterSpacing="-0.01em" rise={36} />
      <Sfx name="impact" at={0} volume={0.8} />
      <Sfx name="burst" at={6} volume={0.6} />
    </AbsoluteFill>
  );
};

// 5 ─ Product: the research 3D phone + breakout + hero burst + tick roll + kinetic line.
const Product: React.FC = () => {
  const frame = useCurrentFrame();
  const entry = heldEntryPose(frame, 2);
  const lineSize = useFitText({ text: "approve themselves.", maxWidth: 820, maxFontSize: 112 });
  const cam = useCamera(
    [
      { at: 0, scale: 1, x: -330 },
      ...pushKeys(96, 30, { from: 1, cx: 0, cy: -150 }).map((k) => ({ ...k, x: -330 })),
      { at: 190, scale: 1, cx: 0, cy: 0, x: -330, ease: inOut },
    ],
    { creep: { start: 0, end: 240, amount: 0.05 } },
  );
  return (
    <AbsoluteFill style={{ background: day.ground }}>
      <Stage3D perspective={HELD_ENTRY.perspective}>
        <Camera pose={cam}>
          <Layer rotX={entry.rotX} rotY={entry.rotY} rotZ={entry.rotZ} scale={entry.scale * 1.12}>
            <Layer z={-112} y={20}>
              <ContactShadow width={PHONE_W * 1.5} height={PHONE_H * 1.05} opacity={0.18} />
            </Layer>
            <Slab width={PHONE_W} height={PHONE_H} radius={56} depth={110}>
              <PhoneDummy hideCard={breakoutLifted(frame, 70, 170)} balance={<MoneyRoll steps={[{ at: 0, value: 450 }, { at: 120, value: 366 }]} fontSize={44} />} />
            </Slab>
            <BreakOut at={70} from={{ y: -98 }} to={{ y: -140, x: 30, z: 240, scale: 1.6 }} returnAt={170} face={entry} radius={24}>
              <div style={{ position: "relative" }}>
                <DummyCard title="Approved by Pot rules" line="$84 sent to you" />
                <Burst at={90} variant="hero" scale={0.75} rim />
              </div>
            </BreakOut>
          </Layer>
        </Camera>
      </Stage3D>
      <AbsoluteFill style={{ left: 1000, width: 860, justifyContent: "center", alignItems: "flex-start", gap: 36 }}>
        <WordRise
          text={"Small spends\napprove themselves."}
          start={20}
          stagger={8}
          fontSize={lineSize}
          align="left"
          renderWord={(w) =>
            w.startsWith("approve") ? (
              <HighlightBar at={60}>
                {w}
              </HighlightBar>
            ) : (
              w
            )
          }
        />
        <MoneyRoll steps={[{ at: 0, value: 450 }, { at: 124, value: 366 }]} fontSize={120} />
      </AbsoluteFill>
      <Sfx name="swoosh-up" at={68} volume={0.5} />
      <Sfx name="success" at={89} volume={0.7} />
      <Sfx name="burst" at={90} volume={0.5} />
    </AbsoluteFill>
  );
};

// 6 ─ End card: lockup 1.15 → 1.0 over 42 f, dots blip once, words resolve, long hold with creep.
const End: React.FC = () => {
  const frame = useCurrentFrame();
  const s = logLerp(1.15, 1, land(Math.min(1, frame / 42)));
  const dots = typingDots(frame, { mode: frame >= 20 && frame < 92 ? "pulse" : "still", start: 20 });
  const cam = useCamera([{ at: 0, scale: 1 }], { creep: { start: 0, end: 150, amount: 0.02 } });
  return (
    <AbsoluteFill style={{ background: day.ground }}>
      <Stage3D>
        <Camera pose={cam}>
          <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 48 }}>
            <div style={{ transform: `scale(${s})` }}>
              <Lockup height={200} on="light" dots={dots} />
            </div>
            <WordRise text="Group chat money that follows its own rules." start={18} stagger={8} fontFamily={SANS} fontWeight={600} fontSize={44} color={day.inkMuted} letterSpacing="0" rise={24} />
          </AbsoluteFill>
        </Camera>
      </Stage3D>
      <Sfx name="blips" at={20} volume={0.5} />
    </AbsoluteFill>
  );
};

// ─── Reel ───────────────────────────────────────────────────────────────────────
const shots = [
  { el: <Hook />, d: 110 },
  { el: <Fronted />, d: 130 },
  { el: <Typing />, d: PUSH_AT + PUSH_FRAMES + FLOOD_FRAMES },
  { el: <Reveal />, d: 150 },
  { el: <Product />, d: 240 },
  { el: <End />, d: 150 },
];
// One entry per seam; null = hard cut.
const trans: (HyperTransition | null)[] = [
  hyper.whipPan({ direction: "left", bleed: [night.ground, night.ground] }),
  hyper.zoomThrough({ origin: [0.5, 0.45] }),
  // After the push the middle dot is at screen centre with radius DOT_R × PUSH_TO.
  hyper.flood({ x: 960, y: 540, r0: DOT_R * PUSH_TO }, FLOOD_FRAMES),
  hyper.scaleCut({ ratio: 1.8 }),
  null,
];
const tf = (t: HyperTransition | null) => (t ? t.timing.getDurationInFrames({ fps: 60 }) : 0);

export const SHOWCASE_FRAMES = shots.reduce((a, s) => a + s.d, 0) - trans.reduce((a, t) => a + tf(t), 0);
if (SHOWCASE_FRAMES !== META_FRAMES) {
  // eslint-disable-next-line no-console
  console.warn(`[motion-kit] showcase-meta.ts says ${META_FRAMES} frames but the reel is ${SHOWCASE_FRAMES}: update showcase-meta.ts`);
}

export const MotionKitShowcase: React.FC = () => (
  <AbsoluteFill style={{ background: night.ground }}>
    <TransitionSeries>
      {shots.map((s, i) => (
        <React.Fragment key={i}>
          <TransitionSeries.Sequence durationInFrames={s.d} premountFor={30}>
            {s.el}
          </TransitionSeries.Sequence>
          {i < trans.length && trans[i] ? <TransitionSeries.Transition {...trans[i]!} /> : null}
        </React.Fragment>
      ))}
    </TransitionSeries>
  </AbsoluteFill>
);

export default MotionKitShowcase;
