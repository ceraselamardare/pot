// Demo: every transition between token-coloured cards, in one TransitionSeries.
// Premium first (whipPan, flood, zoomThrough, scaleCut), then the accents.
import React from "react";
import { AbsoluteFill } from "remotion";
import { TransitionSeries } from "@remotion/transitions";
import { day, night } from "../../brand/tokens";
import { DISPLAY, SANS } from "../../brand/fonts";
import { hyper, type HyperTransition } from "../transitions/wrappers";
import { useDrift } from "../camera";

const Card: React.FC<{ bg: string; ink: string; title: string; sub: string; dot?: boolean }> = ({ bg, ink, title, sub, dot }) => {
  const drift = useDrift({ amount: 6 });
  return (
    <AbsoluteFill style={{ background: bg, alignItems: "center", justifyContent: "center" }}>
      <div style={{ transform: drift, textAlign: "center" }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 160, color: ink, letterSpacing: "-0.03em", lineHeight: 1 }}>{title}</div>
        <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 38, color: ink, opacity: 0.7, marginTop: 24 }}>{sub}</div>
      </div>
      {/* Edge markers make seams/gaps visible during moves. */}
      <div style={{ position: "absolute", left: 40, top: 40, width: 120, height: 120, borderRadius: 28, background: ink, opacity: 0.12 }} />
      <div style={{ position: "absolute", right: 40, bottom: 40, width: 120, height: 120, borderRadius: 60, background: ink, opacity: 0.12 }} />
      {dot ? <div style={{ position: "absolute", left: 960 - 24, top: 860 - 24, width: 48, height: 48, borderRadius: 48, background: ink }} /> : null}
    </AbsoluteFill>
  );
};

const HOLD = 40;
const cards = [
  { bg: night.ground, ink: night.ink, title: "whipPan", sub: "next: blur-matched cut whip · 22 f" },
  { bg: night.surface, ink: night.ink, title: "flood", sub: "next: the dot floods the frame · 15 f", dot: true },
  { bg: day.brand, ink: day.onBrand, title: "zoomThrough", sub: "next: ×1.47 / 4 f, cut, settle · 40 f" },
  { bg: day.ground, ink: day.ink, title: "scaleCut", sub: "next: one-frame 1.8× cut · 24 f" },
  { bg: day.member3, ink: day.ink, title: "circleIris", sub: "next: iris from a button + ring · 18 f" },
  { bg: day.surface, ink: day.ink, title: "colorFlood", sub: "next: layered bands · 36 f" },
  { bg: day.member2, ink: day.ink, title: "slideStack", sub: "next: card rises over · 24 f" },
  { bg: day.ground, ink: day.ink, title: "maskWipe", sub: "next: angled wipe · 20 f" },
  { bg: night.surface, ink: night.ink, title: "whipSlide", sub: "next: side by side · 18 f" },
  { bg: night.ground, ink: night.ink, title: "blurDissolve", sub: "next: soft (end card only) · 20 f" },
  { bg: day.ground, ink: day.ink, title: "done", sub: "motion kit transitions" },
];

const transitions: HyperTransition[] = [
  hyper.whipPan({ direction: "left", bleed: [night.ground, night.surface] }),
  hyper.flood({ x: 960, y: 860, r0: 24 }),
  hyper.zoomThrough({ origin: [0.5, 0.42] }),
  hyper.scaleCut({ ratio: 1.8 }),
  hyper.circleIris({ origin: [0.82, 0.8], ring: day.brand }),
  hyper.colorFlood({ colors: [day.brandSoft, day.brand], direction: "up" }),
  hyper.slideStack({ direction: "up" }),
  hyper.maskWipe({ direction: "right", angle: 14 }),
  hyper.whipSlide({ direction: "left", bleed: [night.surface, night.ground] }),
  hyper.blurDissolve(),
];

const tf = (i: number) => transitions[i].timing.getDurationInFrames({ fps: 60 });
/** total = Σ sequences − Σ transitions = cards × HOLD + Σ transitions. */
export const TRANSITIONS_FRAMES = cards.length * HOLD + transitions.reduce((a, _, i) => a + tf(i), 0);

export const TransitionsDemo: React.FC = () => (
  <AbsoluteFill style={{ background: night.ground }}>
    <TransitionSeries>
      {cards.map((c, i) => {
        const dur = HOLD + (i > 0 ? tf(i - 1) : 0) + (i < transitions.length ? tf(i) : 0);
        return (
          <React.Fragment key={c.title}>
            <TransitionSeries.Sequence durationInFrames={dur} premountFor={30}>
              <Card {...c} />
            </TransitionSeries.Sequence>
            {i < transitions.length ? <TransitionSeries.Transition {...transitions[i]} /> : null}
          </React.Fragment>
        );
      })}
    </TransitionSeries>
  </AbsoluteFill>
);

/** Frame where transition i starts: (i+1)·HOLD + Σ earlier transitions. */
export const transitionStart = (i: number) => (i + 1) * HOLD + transitions.slice(0, i).reduce((a, _, k) => a + tf(k), 0);
export const transitionLength = tf;
