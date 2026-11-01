// Entrances for objects: StickerPop (research: at most one sticker per scene, 1.3 → 1.0 on snap),
// ShapePop (chips/checks on the uiPop spring), Stamp (declined chips: 3-5 % settle), and Shake.
import React from "react";
import { useCurrentFrame } from "remotion";
import { noise2D } from "@remotion/noise";
import { snap, springAt, ramp, lerp, clamp01, type Ease, type SpringName } from "../easing";
import { alpha, EGGPLANT } from "../color";

export type StickerPopProps = {
  at: number;
  /** Resting tilt in degrees (default -4: stickers look hand-placed). */
  rotate?: number;
  /** Tilt it starts from (default rotate − 8). */
  fromRotate?: number;
  /** Start scale (research default 1.3 → 1.0). Use 0 to grow from nothing. */
  fromScale?: number;
  /** Entry frames (default 22) on `ease` (default snap). */
  duration?: number;
  ease?: Ease;
  /** Use a spring instead (e.g. "sticker" for the one or two playful sticker moments). */
  spring?: SpringName;
  /** Token drop shadow that follows the alpha shape and lands with the sticker (default true). */
  shadow?: boolean;
  /** Leave at this frame (scale to 0 on snap, 12 f). */
  outAt?: number;
  origin?: string;
  inline?: boolean;
  style?: React.CSSProperties;
  children: React.ReactNode;
};

export const StickerPop: React.FC<StickerPopProps> = ({
  at,
  rotate = -4,
  fromRotate,
  fromScale = 1.3,
  duration = 22,
  ease = snap,
  spring,
  shadow = true,
  outAt,
  origin = "50% 60%",
  inline = true,
  style,
  children,
}) => {
  const frame = useCurrentFrame();
  const e = spring ? springAt(frame, at, spring) : ramp(frame, at, at + duration, ease);
  const out = outAt !== undefined ? ramp(frame, outAt, outAt + 12, snap) : 0;
  const scale = lerp(fromScale, 1, e) * (1 - out);
  const rot = lerp(fromRotate ?? rotate - 8, rotate, e);
  // Shadow: lifted (bigger, softer) while arriving, then lands to a resting card shadow.
  const lift = 1 - clamp01(e);
  const opacity = ramp(frame, at, at + 6); // opacity only as a helper
  if (frame < at) return null;
  const Tag = inline ? "span" : "div";
  return (
    <Tag
      style={{
        display: inline ? "inline-block" : undefined,
        transform: `rotate(${rot}deg) scale(${Math.max(0, scale)})`,
        transformOrigin: origin,
        opacity,
        filter: shadow
          ? `drop-shadow(0 ${2 + lift * 18}px ${4 + lift * 24}px ${alpha(EGGPLANT, 0.16 + lift * 0.06)}) drop-shadow(0 1px 1px ${alpha(EGGPLANT, 0.1)})`
          : undefined,
        ...style,
      }}
    >
      {children}
    </Tag>
  );
};

/** Chips, checks, avatars: grow from 0 on the uiPop spring {500, 30} (5.8 % overshoot, 19 f). No shadow. */
export const ShapePop: React.FC<Omit<StickerPopProps, "spring">> = (props) => (
  <StickerPop shadow={false} rotate={0} fromRotate={0} fromScale={0} spring="uiPop" {...props} />
);

/** A stamp: lands from 1.5× on uiPop, so it settles 3-5 % below size and back (the s04 declined chips).
 *  Pair with <Sfx name="stamp"> and, at most once, a tiny <Shake>. */
export const Stamp: React.FC<Omit<StickerPopProps, "spring" | "fromScale">> = (props) => (
  <StickerPop shadow={false} rotate={-3} fromRotate={-6} fromScale={1.5} spring="uiPop" {...props} />
);

export type ShakeOptions = {
  at: number;
  /** Frames until it dies out (default 18). */
  duration?: number;
  /** Peak offset in px (default 10). Keep it tiny: 6-14. */
  amplitude?: number;
  /** Peak roll in degrees (default 0.6). */
  rotation?: number;
  /** Oscillation speed in cycles per frame (default 0.3). */
  frequency?: number;
  seed?: string;
};

/** Decaying shake offsets {x, y, rot} at `frame` (zero outside [at, at+duration]). */
export const shakeAt = (frame: number, o: ShakeOptions) => {
  const { at, duration = 18, amplitude = 10, rotation = 0.6, frequency = 0.3, seed = "shake" } = o;
  const t = frame - at;
  if (t < 0 || t > duration) return { x: 0, y: 0, rot: 0 };
  const env = Math.exp((-4.5 * t) / duration) * (1 - t / duration);
  const ph = t * frequency;
  return {
    x: noise2D(`${seed}-x`, ph, 0) * amplitude * env,
    y: noise2D(`${seed}-y`, ph, 5) * amplitude * env,
    rot: noise2D(`${seed}-r`, ph, 9) * rotation * env,
  };
};

export const useShake = (o: ShakeOptions) => shakeAt(useCurrentFrame(), o);

/** Wrap content (or a whole scene) to shake it on an impact. Several hits: pass an array. Use rarely. */
export const Shake: React.FC<{ hits: ShakeOptions | ShakeOptions[]; style?: React.CSSProperties; children: React.ReactNode }> = ({ hits, style, children }) => {
  const frame = useCurrentFrame();
  const list = Array.isArray(hits) ? hits : [hits];
  let x = 0;
  let y = 0;
  let rot = 0;
  for (const h of list) {
    const s = shakeAt(frame, h);
    x += s.x;
    y += s.y;
    rot += s.rot;
  }
  return <div style={{ position: "absolute", inset: 0, transform: `translate(${x}px, ${y}px) rotate(${rot}deg)`, ...style }}>{children}</div>;
};
