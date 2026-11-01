// Hypermotion transitions as @remotion/transitions presentations (research §3.7).
// Easing lives INSIDE each presentation, so drive them with a LINEAR timing: T(frames) / hyper.*.
//
//   <TransitionSeries.Transition {...hyper.whipPan({ direction: "left", bleed: [night.ground, night.ground] })} />
//   <TransitionSeries.Transition {...hyper.flood({ x: 960, y: 560, r0: 24 })} />
//
// Premium (use these): flood (an effect becoming the next ground), whipPan (blur-matched cut whip),
// scaleCut (one-frame scale cut), zoomThrough, cuts on motion. Accents only: circleIris, colorFlood,
// maskWipe, whipSlide, slideStack. Research lists crossfades as cheap: blurDissolve is for the end card at most.
// The same presentations also work inside one scene via <Swap> / <Enter> (wrappers.tsx).
import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import type { TransitionPresentation, TransitionPresentationComponentProps } from "@remotion/transitions";
import { pushCut, type PushCutProps } from "@remotion/transitions";
import { day } from "../../brand/tokens";
import { exit as exitEase, inOut, land, punch, snap, softInOut, whip as whipEase, clamp01, lerp, logLerp, ramp, type Ease } from "../easing";
import { DirectionalBlur, smearSigma } from "../effects/blur";
import { alpha, EGGPLANT } from "../color";
import { dirAngle, dirVec, farCorner, halfExtent, halfPlanePolygon, type Dir4 } from "./geometry";

type Size = { width: number; height: number };
const useSize = (size?: Size): Size => {
  const v = useVideoConfig();
  return size ?? { width: v.width, height: v.height };
};

/** Eased progress + its speed (eased units per frame) for a linear presentation progress p. */
const easeAndSpeed = (p: number, frames: number, ease: Ease) => {
  const d = 0.5 / Math.max(1, frames);
  return { e: ease(clamp01(p)), v: ease(clamp01(p + d)) - ease(clamp01(p - d)) };
};

type P<T extends Record<string, unknown>> = TransitionPresentationComponentProps<T>;

const Hidden: React.FC<{ children: React.ReactNode }> = ({ children }) => <AbsoluteFill style={{ visibility: "hidden" }}>{children}</AbsoluteFill>;

/** A moving full-frame layer with a directional smear and an optional ground-coloured backdrop that
 *  overscans the frame (so blurred edges and revealed areas show the scene's own ground).
 *  `away` limits the overscan to one side along the motion axis (+1 = toward +x/+y, −1 = toward −x/−y),
 *  for shots that sit next to another shot (whipSlide): never overscan into the neighbour. */
const SmearLayer: React.FC<{
  dx: number;
  dy: number;
  sx: number;
  sy: number;
  scale?: number;
  bleed?: string;
  away?: { x?: -1 | 1; y?: -1 | 1 };
  size: Size;
  children: React.ReactNode;
}> = ({ dx, dy, sx, sy, scale = 1, bleed, away, size, children }) => {
  const ox = Math.abs(dx) + 3 * sx + 2;
  const oy = Math.abs(dy) + 3 * sy + 2;
  const region = Math.max((ox / size.width) * 1.05, (oy / size.height) * 1.05, 0.02);
  const left = away?.x === 1 ? 0 : ox;
  const right = away?.x === -1 ? 0 : ox;
  const top = away?.y === 1 ? 0 : oy;
  const bottom = away?.y === -1 ? 0 : oy;
  return (
    <AbsoluteFill style={{ transform: `scale(${scale}) translate(${dx}px, ${dy}px)` }}>
      <DirectionalBlur x={sx} y={sy} region={region}>
        {bleed ? <div style={{ position: "absolute", left: -left, right: -right, top: -top, bottom: -bottom, background: bleed }} /> : null}
        <AbsoluteFill>{children}</AbsoluteFill>
      </DirectionalBlur>
    </AbsoluteFill>
  );
};

// ─── whipPan: blur-matched cut whip (research) ──────────────────────────────────
export type WhipPanProps = {
  /** Where the content travels (default "left": the next shot arrives from the right). */
  direction?: Dir4;
  /** Scene grounds [outgoing, incoming] (token hex). Fills revealed areas and blur fringes.
   *  Without it the whip is blur-only (no travel), which still reads as a whip. */
  bleed?: string | [string, string];
  /** Frames of A before the cut (default 6: the smear ramps over A's last 6 f). */
  outFrames?: number;
  /** B's head: offset it starts from, as a fraction of the frame (default 0.3). Needs bleed. */
  travel?: number;
  /** Smear factor: σ = k × displacement per frame (default 0.5). */
  k?: number;
  maxBlur?: number;
  size?: Size;
};

const WhipPanView: React.FC<P<WhipPanProps>> = ({ children, presentationDirection, presentationProgress, presentationDurationInFrames, passedProps }) => {
  const { direction = "left", bleed, outFrames = 6, travel = 0.3, k = 0.5, maxBlur = 96, size } = passedProps;
  const sz = useSize(size);
  const [ux, uy] = dirVec(direction);
  const W = ux !== 0 ? sz.width : sz.height;
  const D = Math.max(outFrames + 2, presentationDurationInFrames);
  const inFrames = D - outFrames;
  const f = presentationProgress * D; // frames into the transition
  const fCut = outFrames;
  const bleeds = typeof bleed === "string" ? [bleed, bleed] : bleed;
  const move = bleeds !== undefined;
  // B: starts `travel` W behind its slot and lands on `whip`. Peak speed V matches A's last frame.
  const DB = travel * W;
  const bOff = (g: number) => DB * (1 - whipEase(clamp01(g / inFrames)));
  const V = Math.max(1, Math.abs(bOff(0) - bOff(1))); // B's first-frame displacement
  // A: accelerates on `exit` so its last-frame speed equals V.
  const DA = (V * outFrames) / 2.59;
  const aOff = (g: number) => DA * exitEase(clamp01(g / outFrames));

  if (presentationDirection === "exiting") {
    if (f >= fCut) return <Hidden>{children}</Hidden>;
    const speed = Math.abs(aOff(f + 0.5) - aOff(f - 0.5));
    // Smear ramps up into the cut (blur-only mode: same ramp, no travel).
    const sigma = Math.min(maxBlur, smearSigma(move ? speed : V * ramp(f, 0, fCut, exitEase), k, maxBlur));
    const d = move ? aOff(f) : 0;
    const over = move ? 1 : 1 + (4 * sigma) / W;
    return (
      <SmearLayer dx={ux * d} dy={uy * d} sx={ux ? sigma : 0} sy={uy ? sigma : 0} scale={over} bleed={bleeds?.[0]} size={sz}>
        {children}
      </SmearLayer>
    );
  }
  if (f < fCut) return <Hidden>{children}</Hidden>;
  const g = f - fCut;
  const speed = Math.abs(bOff(g + 0.5) - bOff(g - 0.5));
  const sigma = Math.min(maxBlur, smearSigma(g < 1 ? Math.max(speed, V) : speed, k, maxBlur));
  const d = move ? -bOff(g) : 0;
  const over = move ? 1 : 1 + (4 * sigma) / W;
  return (
    <SmearLayer dx={ux * d} dy={uy * d} sx={ux ? sigma : 0} sy={uy ? sigma : 0} scale={over} bleed={bleeds?.[1]} size={sz}>
      {children}
    </SmearLayer>
  );
};

/** Blur-matched whip (research §3.7): A accelerates out and its smear ramps over its last 6 f; hard
 *  cut at peak speed; B continues the vector from `travel` W away, starts at least as blurred and
 *  clears in ~16 f on `whip`. Only one shot is ever visible, so there is no seam. Default 22 f. */
export const whipPan = (props: WhipPanProps = {}): TransitionPresentation<WhipPanProps> => ({ component: WhipPanView, props });

// ─── whipSlide: both shots adjacent (overlap) ───────────────────────────────────
export type WhipSlideProps = {
  direction?: Dir4;
  ease?: Ease;
  /** Scene grounds [outgoing, incoming] for the outer frame edges. */
  bleed?: [string, string];
  k?: number;
  maxBlur?: number;
  /** Push-in at the middle (default 0.04). Never < 0 (it would reveal the void). */
  zoom?: number;
  size?: Size;
};

const WhipSlideView: React.FC<P<WhipSlideProps>> = ({ children, presentationDirection, presentationProgress, presentationDurationInFrames, passedProps }) => {
  const { direction = "left", ease = inOut, bleed, k = 0.25, maxBlur = 56, zoom = 0.04, size } = passedProps;
  const sz = useSize(size);
  const [ux, uy] = dirVec(direction);
  const travel = ux !== 0 ? sz.width : sz.height;
  const { e, v } = easeAndSpeed(presentationProgress, presentationDurationInFrames, ease);
  const sigma = smearSigma(v * travel, k, maxBlur);
  const offset = (presentationDirection === "exiting" ? e : e - 1) * travel;
  return (
    // scale() applied after translate: both shots zoom about the screen centre together → no gap.
    <AbsoluteFill style={{ transform: `scale(${1 + zoom * Math.sin(Math.PI * e)})` }}>
      <SmearLayer
        dx={ux * offset}
        dy={uy * offset}
        sx={ux ? sigma : 0}
        sy={uy ? sigma : 0}
        bleed={bleed?.[presentationDirection === "exiting" ? 0 : 1]}
        // Overscan only on the side away from the seam: the outgoing shot toward the motion, the incoming one behind it.
        away={presentationDirection === "exiting" ? { x: ux ? (ux as 1 | -1) : undefined, y: uy ? (uy as 1 | -1) : undefined } : { x: ux ? ((-ux) as 1 | -1) : undefined, y: uy ? ((-uy) as 1 | -1) : undefined }}
        size={sz}
      >
        {children}
      </SmearLayer>
    </AbsoluteFill>
  );
};

/** Both shots slide side by side (accent: "one world" moves). The seam softens while smeared. Default 18 f. */
export const whipSlide = (props: WhipSlideProps = {}): TransitionPresentation<WhipSlideProps> => ({ component: WhipSlideView, props });

// ─── zoomThrough (research) ─────────────────────────────────────────────────────
export type ZoomThroughProps = {
  /** The feature we fly into, as fractions of the frame (default centre). */
  origin?: [number, number];
  /** Frames of A zooming before the cut (default 18). */
  outFrames?: number;
  /** Zoom rate per 4 frames (default 1.47: 1 → 21.9× in 32 f). */
  rate?: number;
  /** B's start scale after the cut (research 1.4-2.5; default 1.8), settling to 1 on `land`. */
  enterFrom?: number;
  /** "cut" (default, research) or "portal": B grows out of the target as a rounded card while A zooms. */
  mode?: "cut" | "portal";
  /** Light isotropic blur multiplier at peak zoom speed (default 0.4; 0 = none). */
  blur?: number;
  size?: Size;
};

const ZoomThroughView: React.FC<P<ZoomThroughProps>> = ({ children, presentationDirection, presentationProgress, presentationDurationInFrames, passedProps }) => {
  const { origin = [0.5, 0.5], outFrames = 18, rate = 1.47, enterFrom = 1.8, mode = "cut", blur = 0.4, size } = passedProps;
  const { width, height } = useSize(size);
  const D = Math.max(outFrames + 2, presentationDurationInFrames);
  const f = presentationProgress * D;
  const ox = origin[0] * width;
  const oy = origin[1] * height;
  const reach = farCorner(width, height, ox, oy);
  const peak = Math.pow(rate, outFrames / 4);
  const aScale = (g: number) => Math.pow(rate, clamp01(g / outFrames) * (outFrames / 4));

  if (mode === "portal") {
    if (presentationDirection === "exiting") {
      const s = logLerp(1, peak, clamp01(f / D) ** 1.6);
      return <AbsoluteFill style={{ transform: `scale(${s})`, transformOrigin: `${ox}px ${oy}px` }}>{children}</AbsoluteFill>;
    }
    const t = clamp01((f - D * 0.32) / (D * 0.68));
    const s = lerp(0.12, 1, land(t));
    return (
      <AbsoluteFill
        style={{
          transform: `scale(${s})`,
          transformOrigin: `${ox}px ${oy}px`,
          opacity: ramp(t, 0, 0.12),
          borderRadius: (56 * (1 - land(t))) / Math.max(0.05, s),
          overflow: "hidden",
          boxShadow: t < 1 ? `0 ${30 * (1 - t)}px ${90 * (1 - t)}px ${alpha(EGGPLANT, 0.35 * (1 - t))}` : undefined,
        }}
      >
        {children}
      </AbsoluteFill>
    );
  }

  if (presentationDirection === "exiting") {
    if (f >= outFrames) return <Hidden>{children}</Hidden>;
    const s = aScale(f);
    const speed = (aScale(f + 0.5) - aScale(f - 0.5)) * reach * 0.5;
    const sigma = Math.min(10, speed * 0.04) * blur;
    return (
      <AbsoluteFill style={{ transform: `scale(${s})`, transformOrigin: `${ox}px ${oy}px` }}>
        <DirectionalBlur x={sigma} y={sigma} region={0.02}>
          {children}
        </DirectionalBlur>
      </AbsoluteFill>
    );
  }
  if (f < outFrames) return <Hidden>{children}</Hidden>;
  const g = f - outFrames;
  const tail = D - outFrames;
  const sAt = (q: number) => logLerp(enterFrom, 1, land(clamp01(q / tail)));
  const s = sAt(g);
  const speed = Math.abs(sAt(g + 0.5) - sAt(g - 0.5)) * reach * 0.5;
  const sigma = Math.min(10, speed * 0.04) * blur;
  return (
    <AbsoluteFill style={{ transform: `scale(${s})`, transformOrigin: `${ox}px ${oy}px` }}>
      <DirectionalBlur x={sigma} y={sigma} region={0.02}>
        {children}
      </DirectionalBlur>
    </AbsoluteFill>
  );
};

/** Zoom-through (research §3.6): A zooms ×1.47 every 4 f toward a feature (constant rate in log
 *  space), cut, and B starts at 1.8× and settles on `land`. Default 40 f (18 out + 22 in). */
export const zoomThrough = (props: ZoomThroughProps = {}): TransitionPresentation<ZoomThroughProps> => ({ component: ZoomThroughView, props });

// ─── flood (research §5, off-centre circle) ─────────────────────────────────────
export type FloodProps = {
  /** Centre in px (e.g. the dot or the tapped button). */
  x: number;
  y: number;
  /** Start radius in px (e.g. the dot's radius) so the next ground grows out of the object. */
  r0?: number;
  /** Default snap (research: corners in 12-18 f on snap). */
  ease?: Ease;
};

const FloodView: React.FC<P<FloodProps>> = ({ children, presentationDirection, presentationProgress, passedProps }) => {
  const { x, y, r0 = 0, ease = snap } = passedProps;
  const { width, height } = useVideoConfig();
  const R = Math.hypot(Math.max(x, width - x), Math.max(y, height - y)) + 1;
  const style: React.CSSProperties =
    presentationDirection === "entering" ? { clipPath: `circle(${r0 + (R - r0) * ease(clamp01(presentationProgress))}px at ${x}px ${y}px)` } : {};
  return <AbsoluteFill style={style}>{children}</AbsoluteFill>;
};

/** The effect becomes the next ground: B grows from a circle at (x, y) to the corners. Default 15 f.
 *  Act 1 → 2: flood({ x: dotX, y: dotY, r0: dotR }) into the marigold reveal. */
export const flood = (props: FloodProps): TransitionPresentation<FloodProps> => ({ component: FloodView, props });

// ─── scaleCut ───────────────────────────────────────────────────────────────────
export type ScaleCutProps = {
  /** B's start scale (research 1.4-3.7; default 1.8). The content changes in the same frame. */
  ratio?: number;
  /** Scale origin as fractions (default centre). */
  origin?: [number, number];
  ease?: Ease;
  size?: Size;
};

const ScaleCutView: React.FC<P<ScaleCutProps>> = ({ children, presentationDirection, presentationProgress, passedProps }) => {
  const { ratio = 1.8, origin = [0.5, 0.5], ease = land, size } = passedProps;
  const { width, height } = useSize(size);
  if (presentationDirection === "exiting") return <Hidden>{children}</Hidden>;
  const s = logLerp(Math.max(1, ratio), 1, ease(clamp01(presentationProgress)));
  return <AbsoluteFill style={{ transform: `scale(${s})`, transformOrigin: `${origin[0] * width}px ${origin[1] * height}px` }}>{children}</AbsoluteFill>;
};

/** One-frame scale cut: hard cut to B framed `ratio`× tighter, which settles on `land`. Default 24 f. */
export const scaleCut = (props: ScaleCutProps = {}): TransitionPresentation<ScaleCutProps> => ({ component: ScaleCutView, props });

/** Remotion's pushCut with its off-token flash (#f5f2ed) zeroed. */
export const pushCutToken = (props: PushCutProps = {}) => pushCut({ flashColor: day.surface, flashOpacity: 0, ...props });

// ─── circleIris ─────────────────────────────────────────────────────────────────
export type CircleIrisProps = {
  /** Centre as fractions of the frame (e.g. the button the person tapped). Default centre. */
  origin?: [number, number];
  /** Start radius in px (default 0). */
  r0?: number;
  ease?: Ease;
  /** Token colour of a ring riding the circle's edge (false = none, default). */
  ring?: string | false;
  ringWidth?: number;
  /** Outgoing scene scales back to this while the circle opens (default 0.96). */
  exitScale?: number;
  /** Eggplant dim on the outgoing scene, 0..1 (default 0.2). */
  exitDim?: number;
  size?: Size;
};

const CircleIrisView: React.FC<P<CircleIrisProps>> = ({ children, presentationDirection, presentationProgress, passedProps }) => {
  const { origin = [0.5, 0.5], r0 = 0, ease = snap, ring = false, ringWidth = 14, exitScale = 0.96, exitDim = 0.2, size } = passedProps;
  const { width, height } = useSize(size);
  const e = ease(clamp01(presentationProgress));
  const ox = origin[0] * width;
  const oy = origin[1] * height;
  if (presentationDirection === "exiting") {
    return (
      <AbsoluteFill style={{ transform: `scale(${lerp(1, exitScale, e)})`, transformOrigin: `${ox}px ${oy}px` }}>
        {children}
        {exitDim > 0 ? <AbsoluteFill style={{ background: EGGPLANT, opacity: exitDim * clamp01(e) }} /> : null}
      </AbsoluteFill>
    );
  }
  const r = r0 + (farCorner(width, height, ox, oy) + 1 - r0) * e;
  const rw = ringWidth * (1 - clamp01(e)) + 2;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ clipPath: `circle(${Math.max(0, r)}px at ${ox}px ${oy}px)` }}>{children}</AbsoluteFill>
      {ring && e > 0 && e < 1 ? (
        <div
          style={{
            position: "absolute",
            left: ox - r - rw / 2,
            top: oy - r - rw / 2,
            width: 2 * r + rw,
            height: 2 * r + rw,
            borderRadius: "50%",
            border: `${rw}px solid ${ring}`,
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
};

/** flood + extras: optional token ring on the edge, outgoing scene sinks back slightly. Default 18 f on snap. */
export const circleIris = (props: CircleIrisProps = {}): TransitionPresentation<CircleIrisProps> => ({ component: CircleIrisView, props });

// ─── colorFlood ─────────────────────────────────────────────────────────────────
export type ColorFloodProps = {
  /** Token colours, bottom to top. Default [brand]. Layered: [brandSoft, brand]. */
  colors?: string[];
  shape?: "wipe" | "circle";
  /** Travel direction for "wipe" (default "up"). */
  direction?: Dir4;
  /** Extra tilt of the wipe edge in degrees (default 0). */
  angle?: number;
  /** Circle origin as fractions (default centre). */
  origin?: [number, number];
  /** Fraction of the transition fully covered by colour (default 0.1). */
  hold?: number;
  /** Delay between colour layers, as a fraction of each phase (default 0.18). */
  layerDelay?: number;
  ease?: Ease;
  /** Outgoing scene pushed along the travel direction, fraction of the frame (default 0.04). */
  push?: number;
  size?: Size;
};

const ColorFloodView: React.FC<P<ColorFloodProps>> = ({ children, presentationDirection, presentationProgress, passedProps }) => {
  const {
    colors = [day.brand],
    shape = "wipe",
    direction = "up",
    angle = 0,
    origin = [0.5, 0.5],
    hold = 0.1,
    layerDelay = 0.18,
    ease = inOut,
    push = 0.04,
    size,
  } = passedProps;
  const { width: W, height: H } = useSize(size);
  const p = presentationProgress;
  const n = colors.length;
  const coverEnd = 0.5 - hold / 2;
  const uncoverStart = 0.5 + hold / 2;
  const span = 1 - (n - 1) * layerDelay;
  const cover = (i: number) => ease(clamp01((p / coverEnd - i * layerDelay) / span));
  const uncover = (i: number) => ease(clamp01(((p - uncoverStart) / (1 - uncoverStart) - (n - 1 - i) * layerDelay) / span));
  const th = ((dirAngle(direction) + angle) * Math.PI) / 180;
  const ux = Math.cos(th);
  const uy = Math.sin(th);

  if (presentationDirection === "exiting") {
    const d = push * cover(0) * Math.max(W, H);
    const [px, py] = dirVec(direction);
    return <AbsoluteFill style={{ transform: `translate(${px * d}px, ${py * d}px)` }}>{children}</AbsoluteFill>;
  }

  if (shape === "circle") {
    const ox = origin[0] * W;
    const oy = origin[1] * H;
    const R = farCorner(W, H, ox, oy) + 2;
    const t0 = uncover(0) * R;
    return (
      <AbsoluteFill>
        {t0 > 0 ? <AbsoluteFill style={{ clipPath: `circle(${t0}px at ${ox}px ${oy}px)` }}>{children}</AbsoluteFill> : null}
        {colors.map((col, i) => {
          const r1 = uncover(i) * R;
          const r2 = cover(i) * R;
          if (r2 <= r1 + 0.5) return null;
          return (
            <AbsoluteFill
              key={i}
              style={{ background: `radial-gradient(circle at ${ox}px ${oy}px, transparent ${Math.max(0, r1 - 0.5)}px, ${col} ${r1}px, ${col} ${r2}px, transparent ${r2 + 0.5}px)` }}
            />
          );
        })}
      </AbsoluteFill>
    );
  }

  const R = halfExtent(W, H, ux, uy) + 2;
  const L = W + H;
  const edgeAt = (q: number) => -R + 2 * R * q;
  const t0 = edgeAt(uncover(0));
  return (
    <AbsoluteFill>
      {uncover(0) > 0 ? <AbsoluteFill style={{ clipPath: halfPlanePolygon(W, H, ux, uy, t0) }}>{children}</AbsoluteFill> : null}
      {colors.map((col, i) => {
        const a = edgeAt(uncover(i));
        const b = edgeAt(cover(i));
        if (b <= a + 0.5) return null;
        const mid = (a + b) / 2;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: W / 2 + ux * mid - (b - a) / 2,
              top: H / 2 + uy * mid - L / 2,
              width: b - a,
              height: L,
              background: col,
              transform: `rotate(${(th * 180) / Math.PI}deg)`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/** Token-coloured bands cover the frame, hold, then uncover the next scene. Accent; default 36 f. */
export const colorFlood = (props: ColorFloodProps = {}): TransitionPresentation<ColorFloodProps> => ({ component: ColorFloodView, props });

// ─── slideStack ─────────────────────────────────────────────────────────────────
export type SlideStackProps = {
  /** Where the new card travels (default "up": rises over the old scene, which sinks back). */
  direction?: Dir4;
  ease?: Ease;
  /** Outgoing scene scales back to (default 0.92). */
  backScale?: number;
  /** Eggplant dim on the outgoing scene (default 0.3). */
  dim?: number;
  /** Card corner radius while moving (default 48). */
  radius?: number;
  size?: Size;
};

const SlideStackView: React.FC<P<SlideStackProps>> = ({ children, presentationDirection, presentationProgress, presentationDurationInFrames, passedProps }) => {
  const { direction = "up", ease = snap, backScale = 0.92, dim = 0.3, radius = 48, size } = passedProps;
  const { width, height } = useSize(size);
  const [ux, uy] = dirVec(direction);
  const travel = ux !== 0 ? width : height;
  const { e, v } = easeAndSpeed(presentationProgress, presentationDurationInFrames, ease);
  if (presentationDirection === "exiting") {
    const back = 0.06 * clamp01(e) * travel;
    return (
      <AbsoluteFill style={{ transform: `translate(${ux * back}px, ${uy * back}px) scale(${lerp(1, backScale, clamp01(e))})`, borderRadius: radius * clamp01(e), overflow: "hidden" }}>
        {children}
        <AbsoluteFill style={{ background: EGGPLANT, opacity: dim * clamp01(e) }} />
      </AbsoluteFill>
    );
  }
  const off = (e - 1) * travel;
  const sigma = smearSigma(v * travel, 0.35, 40);
  return (
    <AbsoluteFill
      style={{
        transform: `translate(${ux * off}px, ${uy * off}px)`,
        borderRadius: radius * (1 - clamp01(e)),
        overflow: "hidden",
        boxShadow: e < 1 ? `0 0 120px ${alpha(EGGPLANT, 0.35 * (1 - e * e))}` : undefined,
      }}
    >
      <DirectionalBlur x={ux ? sigma : 0} y={uy ? sigma : 0} region={0.02}>
        {children}
      </DirectionalBlur>
    </AbsoluteFill>
  );
};

/** The new scene rises over the old one like a card landing on a stack (cards occluding the previous
 *  content, as in s04). Accent; default 24 f on snap. */
export const slideStack = (props: SlideStackProps = {}): TransitionPresentation<SlideStackProps> => ({ component: SlideStackView, props });

// ─── maskWipe ───────────────────────────────────────────────────────────────────
export type MaskWipeProps = {
  /** Travel direction of the edge (default "right"). */
  direction?: Dir4;
  /** Tilt of the edge in degrees (default 14). */
  angle?: number;
  ease?: Ease;
  /** Token colour of a thin line riding the edge (default brand; false = none). Never in Act 1. */
  edgeColor?: string | false;
  edgeWidth?: number;
  /** Parallax of both scenes along the travel axis, fraction of the frame (default 0.06). */
  parallax?: number;
  size?: Size;
};

const MaskWipeView: React.FC<P<MaskWipeProps>> = ({ children, presentationDirection, presentationProgress, passedProps }) => {
  const { direction = "right", angle = 14, ease = inOut, edgeColor = day.brand, edgeWidth = 12, parallax = 0.06, size } = passedProps;
  const { width: W, height: H } = useSize(size);
  const e = ease(clamp01(presentationProgress));
  const th = ((dirAngle(direction) + angle) * Math.PI) / 180;
  const ux = Math.cos(th);
  const uy = Math.sin(th);
  const R = halfExtent(W, H, ux, uy) + edgeWidth;
  const edge = -R + 2 * R * e;
  // Parallax only along the main axis: a tilted push would expose the scene edges.
  const [ax, ay] = dirVec(direction);
  const travel = ax !== 0 ? W : H;
  if (presentationDirection === "exiting") {
    const d = parallax * e * travel;
    return <AbsoluteFill style={{ transform: `translate(${ax * d}px, ${ay * d}px)` }}>{children}</AbsoluteFill>;
  }
  const d = -parallax * (1 - e) * travel;
  const L = W + H;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ clipPath: halfPlanePolygon(W, H, ux, uy, edge) }}>
        <AbsoluteFill style={{ transform: `translate(${ax * d}px, ${ay * d}px)` }}>{children}</AbsoluteFill>
      </AbsoluteFill>
      {edgeColor && e > 0 && e < 1 ? (
        <div
          style={{
            position: "absolute",
            left: W / 2 + ux * edge - edgeWidth / 2,
            top: H / 2 + uy * edge - L / 2,
            width: edgeWidth,
            height: L,
            background: edgeColor,
            transform: `rotate(${(th * 180) / Math.PI}deg)`,
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
};

/** Angled hard-edge wipe with a thin token line riding the edge. Accent; default 20 f. */
export const maskWipe = (props: MaskWipeProps = {}): TransitionPresentation<MaskWipeProps> => ({ component: MaskWipeView, props });

// ─── blurDissolve ───────────────────────────────────────────────────────────────
export type BlurDissolveProps = {
  /** Peak blur in px (default 22). */
  blur?: number;
  /** Scale change (default 0.04: old grows to 1.04, new settles from 1.04). */
  zoom?: number;
  ease?: Ease;
};

const BlurDissolveView: React.FC<P<BlurDissolveProps>> = ({ children, presentationDirection, presentationProgress, passedProps }) => {
  const { blur = 22, zoom = 0.04, ease = softInOut } = passedProps;
  const e = ease(clamp01(presentationProgress));
  if (presentationDirection === "exiting") {
    // Stays opaque underneath (no grey mid-fade), blurs and drifts forward.
    return <AbsoluteFill style={{ transform: `scale(${1 + zoom * e})`, filter: e > 0.01 ? `blur(${blur * e}px)` : undefined }}>{children}</AbsoluteFill>;
  }
  const b = blur * (1 - punch(clamp01(presentationProgress)));
  return <AbsoluteFill style={{ opacity: e, transform: `scale(${1 + zoom * (1 - e)})`, filter: b > 0.2 ? `blur(${b}px)` : undefined }}>{children}</AbsoluteFill>;
};

/** Soft dissolve through blur. The research calls crossfades cheap: end card at most. Default 20 f. */
export const blurDissolve = (props: BlurDissolveProps = {}): TransitionPresentation<BlurDissolveProps> => ({ component: BlurDissolveView, props });
