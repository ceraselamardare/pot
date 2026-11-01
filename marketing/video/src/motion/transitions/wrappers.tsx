// Timing helpers + in-scene wrappers for the presentations.
//   TransitionSeries:  <TransitionSeries.Transition {...hyper.whipPan({ direction: "left" })} />
//   Inside one scene:  <Swap at={90} presentation={whipPan()} from={<CardA />} to={<CardB />} />
//                      <Enter at={30} presentation={circleIris({ origin: [0.5, 0.82] })}><Sheet /></Enter>
import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion";
import { linearTiming, type TransitionPresentation, type TransitionTiming } from "@remotion/transitions";
import { clamp01 } from "../easing";
import {
  blurDissolve,
  circleIris,
  colorFlood,
  flood,
  maskWipe,
  pushCutToken,
  scaleCut,
  slideStack,
  whipPan,
  whipSlide,
  zoomThrough,
  type BlurDissolveProps,
  type CircleIrisProps,
  type ColorFloodProps,
  type FloodProps,
  type MaskWipeProps,
  type ScaleCutProps,
  type SlideStackProps,
  type WhipPanProps,
  type WhipSlideProps,
  type ZoomThroughProps,
} from "./presentations";
import type { PushCutProps } from "@remotion/transitions";

/** Default lengths at 60 fps (research §3.6-3.7). */
export const TRANSITION_FRAMES = {
  /** Blur-matched whip: 6 f of A + 16 f of B. */
  whipPan: 22,
  whipSlide: 18,
  /** 18 f zoom (×1.47 / 4 f → 5.7×) + 22 f settle from 1.8×. */
  zoomThrough: 40,
  /** Circle to the corners in 12-18 f on snap. */
  flood: 15,
  scaleCut: 24,
  circleIris: 18,
  colorFlood: 36,
  slideStack: 24,
  maskWipe: 20,
  blurDissolve: 20,
  pushCut: 20,
} as const;

/** Linear timing (the presentations ease internally). */
export const T = (frames: number): TransitionTiming => linearTiming({ durationInFrames: frames });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyPresentation = TransitionPresentation<any>;
/** What hyper.* returns: spread it into <TransitionSeries.Transition {...t} />. */
export type HyperTransition = { presentation: AnyPresentation; timing: TransitionTiming };

/** Ready-to-spread {presentation, timing} pairs for <TransitionSeries.Transition {...} />. */
export const hyper = {
  whipPan: (props?: WhipPanProps, frames: number = TRANSITION_FRAMES.whipPan): HyperTransition => ({ presentation: whipPan(props), timing: T(frames) }),
  whipSlide: (props?: WhipSlideProps, frames: number = TRANSITION_FRAMES.whipSlide): HyperTransition => ({ presentation: whipSlide(props), timing: T(frames) }),
  zoomThrough: (props?: ZoomThroughProps, frames: number = TRANSITION_FRAMES.zoomThrough): HyperTransition => ({ presentation: zoomThrough(props), timing: T(frames) }),
  flood: (props: FloodProps, frames: number = TRANSITION_FRAMES.flood): HyperTransition => ({ presentation: flood(props), timing: T(frames) }),
  scaleCut: (props?: ScaleCutProps, frames: number = TRANSITION_FRAMES.scaleCut): HyperTransition => ({ presentation: scaleCut(props), timing: T(frames) }),
  circleIris: (props?: CircleIrisProps, frames: number = TRANSITION_FRAMES.circleIris): HyperTransition => ({ presentation: circleIris(props), timing: T(frames) }),
  colorFlood: (props?: ColorFloodProps, frames: number = TRANSITION_FRAMES.colorFlood): HyperTransition => ({ presentation: colorFlood(props), timing: T(frames) }),
  slideStack: (props?: SlideStackProps, frames: number = TRANSITION_FRAMES.slideStack): HyperTransition => ({ presentation: slideStack(props), timing: T(frames) }),
  maskWipe: (props?: MaskWipeProps, frames: number = TRANSITION_FRAMES.maskWipe): HyperTransition => ({ presentation: maskWipe(props), timing: T(frames) }),
  blurDissolve: (props?: BlurDissolveProps, frames: number = TRANSITION_FRAMES.blurDissolve): HyperTransition => ({ presentation: blurDissolve(props), timing: T(frames) }),
  /** Remotion pushCut with the off-token flash zeroed. */
  pushCut: (props?: PushCutProps, frames: number = TRANSITION_FRAMES.pushCut): HyperTransition => ({ presentation: pushCutToken(props), timing: T(frames) }),
};

const noop = () => undefined;

const Present: React.FC<{ presentation: AnyPresentation; direction: "entering" | "exiting"; progress: number; frames: number; children: React.ReactNode }> = ({
  presentation,
  direction,
  progress,
  frames,
  children,
}) => {
  const C = presentation.component as React.ComponentType<Record<string, unknown>>;
  return (
    <C
      presentationDirection={direction}
      presentationProgress={progress}
      presentationDurationInFrames={frames}
      passedProps={presentation.props ?? {}}
      onElementImage={noop}
      onUnmount={noop}
      bothEnteringAndExiting={false}
    >
      {children}
    </C>
  );
};

/** In-scene A → B transition at frame `at`. `from` keeps the scene's clock; `to` gets its own clock
 *  starting at `at` (like a TransitionSeries scene), premounted. */
export const Swap: React.FC<{
  at: number;
  duration?: number;
  presentation: AnyPresentation;
  from: React.ReactNode;
  to: React.ReactNode;
  premountFor?: number;
}> = ({ at, duration = 18, presentation, from, to, premountFor = 30 }) => {
  const frame = useCurrentFrame();
  const p = clamp01((frame - at) / duration);
  return (
    <AbsoluteFill>
      {frame < at + duration ? (
        <Present presentation={presentation} direction="exiting" progress={p} frames={duration}>
          {from}
        </Present>
      ) : null}
      <Sequence from={at} premountFor={premountFor} name="Swap→to">
        <Present presentation={presentation} direction="entering" progress={p} frames={duration}>
          {to}
        </Present>
      </Sequence>
    </AbsoluteFill>
  );
};

/** Bring a layer in with any presentation (it lands over whatever is below). Children keep the scene's clock. */
export const Enter: React.FC<{ at: number; duration?: number; presentation: AnyPresentation; children: React.ReactNode }> = ({
  at,
  duration = 18,
  presentation,
  children,
}) => {
  const frame = useCurrentFrame();
  const p = clamp01((frame - at) / duration);
  if (frame < at) return null;
  return (
    <Present presentation={presentation} direction="entering" progress={p} frames={duration}>
      {children}
    </Present>
  );
};
