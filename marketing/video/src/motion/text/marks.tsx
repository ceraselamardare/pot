// Marks on words: HighlightBar (a marigold block sweeping behind a word) and StrikeThrough.
// Brand: marigold is never a text colour. Text over the bar is eggplant (on-brand); on Night grounds
// the part of the word the bar has passed turns eggplant as the bar sweeps.
import React from "react";
import { useCurrentFrame } from "remotion";
import { day, night } from "../../brand/tokens";
import { inOut, land, ramp, type Ease } from "../easing";

export type HighlightBarProps = {
  at: number;
  /** Frames for the sweep (research: 10-12 f once the line is readable; default 11). */
  duration?: number;
  ease?: Ease;
  /** Token colour of the bar: brand (default) or brandSoft. */
  color?: string;
  /** Text colour before the bar passes (default: inherit). */
  textColor?: string;
  /** Text colour on the bar (default on-brand eggplant). */
  onBarColor?: string;
  /** Sweep direction (default left → right). */
  from?: "left" | "right";
  /** Sweep the bar away (continuing in the same direction) at this frame. */
  exitAt?: number;
  /** Bar padding around the text, em (default 0.12 horizontal). */
  padX?: number;
  /** Bar height relative to the line (default 0.92) and vertical offset (em). */
  height?: number;
  offsetY?: number;
  /** Corner radius, em (default 0.14). */
  radius?: number;
  /** Slight slant (deg) for energy (default 0). */
  skew?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
};

/** A marigold block sweeps behind the word. Inline: wrap a word inside any kinetic text via renderWord. */
export const HighlightBar: React.FC<HighlightBarProps> = ({
  at,
  duration = 11,
  ease = land,
  color = day.brand,
  textColor,
  onBarColor = day.onBrand,
  from = "left",
  exitAt,
  padX = 0.12,
  height = 0.92,
  offsetY = 0.04,
  radius = 0.14,
  skew = 0,
  style,
  children,
}) => {
  const frame = useCurrentFrame();
  const p = ramp(frame, at, at + duration, ease);
  const q = exitAt !== undefined ? ramp(frame, exitAt, exitAt + duration, inOut) : 0;
  // Visible bar interval [a, b] in 0..1 of the box width.
  const lead = from === "left";
  const a = lead ? q : 1 - p;
  const b = lead ? p : 1 - q;
  const show = b - a > 0.0005;
  // Base text is only drawn where the bar is NOT (drawing both glyph colours on top of each other
  // leaves a light anti-aliasing halo). All three layers share one box so the clips line up.
  let baseClip: string | undefined;
  if (show) {
    if (a <= 0.0005) baseClip = `inset(0 0 0 ${b * 100}%)`;
    else if (b >= 0.9995) baseClip = `inset(0 ${(1 - a) * 100}% 0 0)`;
  }
  const fullyCovered = show && a <= 0.0005 && b >= 0.9995;
  return (
    <span style={{ position: "relative", display: "inline-block", ...style }}>
      {show ? (
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: `-${padX}em`,
            right: `-${padX}em`,
            top: `${(1 - height) / 2 + offsetY}em`,
            height: `${height}em`,
            background: color,
            borderRadius: `${radius}em`,
            clipPath: `inset(0 ${(1 - b) * 100}% 0 ${a * 100}% round ${radius}em)`,
            transform: skew ? `skewX(${skew}deg)` : undefined,
          }}
        />
      ) : null}
      <span
        style={{
          position: "relative",
          display: "inline-block",
          margin: `0 -${padX}em`,
          padding: `0 ${padX}em`,
          color: textColor,
          clipPath: baseClip,
          visibility: fullyCovered ? "hidden" : undefined,
        }}
      >
        {children}
      </span>
      {show ? (
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: `-${padX}em`,
            right: `-${padX}em`,
            top: 0,
            bottom: 0,
            paddingLeft: `${padX}em`,
            color: onBarColor,
            whiteSpace: "nowrap",
            clipPath: `inset(0 ${(1 - b) * 100}% 0 ${a * 100}%)`,
          }}
        >
          {children}
        </span>
      ) : null}
    </span>
  );
};

export type StrikeThroughProps = {
  at: number;
  /** Frames for the stroke (default 12). */
  duration?: number;
  ease?: Ease;
  /** "ink" = current text colour (default). "declined" = red; only when an icon + word ("Not approved")
   *  is on screen too (status colours always come with an icon and a word). */
  tone?: "ink" | "declined";
  theme?: "day" | "night";
  /** Stroke thickness as a fraction of the text box height (default 0.085). */
  thickness?: number;
  /** Vertical centre of the stroke as a fraction of the box height (default 0.55 ≈ middle of lowercase). */
  center?: number;
  /** Stroke tilt in degrees, around the stroke's centre (default -2: a confident marker stroke). */
  angle?: number;
  /** Fade the struck text to this opacity after the strike (default 1 = no dim). */
  dimTo?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
};

/** An animated line drawn across words, left → right. */
export const StrikeThrough: React.FC<StrikeThroughProps> = ({
  at,
  duration = 12,
  ease = land,
  tone = "ink",
  theme = "day",
  thickness = 0.085,
  center = 0.55,
  angle = -2,
  dimTo = 1,
  style,
  children,
}) => {
  const frame = useCurrentFrame();
  const p = ramp(frame, at, at + duration, ease);
  const dim = ramp(frame, at + duration * 0.6, at + duration + 10, land);
  const color = tone === "declined" ? (theme === "day" ? day.declined : night.declined) : "currentColor";
  // Sizes are % of this box (not em), so it works around children that set their own font size.
  return (
    <span style={{ position: "relative", display: "inline-block", ...style }}>
      <span style={{ display: "inline-block", opacity: 1 - (1 - dimTo) * dim }}>{children}</span>
      {p > 0 ? (
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: "-2%",
            right: "-2%",
            top: `${(center - thickness / 2) * 100}%`,
            height: `max(2px, ${thickness * 100}%)`,
            transform: `rotate(${angle}deg)`,
            transformOrigin: "50% 50%",
          }}
        >
          <span
            style={{
              position: "absolute",
              inset: 0,
              background: color,
              borderRadius: 999,
              transform: `scaleX(${p})`,
              transformOrigin: "0% 50%",
            }}
          />
        </span>
      ) : null}
    </span>
  );
};
