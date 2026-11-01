// The lockup, composed from the brand's own parts (PotMark + Wordmark from src/brand/Logo.tsx) with the exact
// geometry of brand/logo/pot-lockup-on-*.svg (viewBox 1265 × 512; wordmark at translate(602.94 363.50)
// scale(0.43878)). Drawn as SVG elements so it can be painted inside a full-frame SVG canvas with a sub-pixel
// `translate` (crisp, never layout-snapped).
//
// Why not <Lockup>: its wordmarkReveal clip rect is x 560, width 662 (to 1222 units), but the wordmark's "t"
// crossbar reaches 1253.2 units, so <Lockup> cuts ~31 units off the "t" even at reveal = 1 (a distorted logo).
// The director owns Logo.tsx; the one-line fix is `const clipW = (1265 - 560) * reveal`. Until then this
// component is the faithful lockup; it is pixel-checked against the brand SVG (see README).
import React, { useId } from "react";
import { EGGPLANT, NIGHT_INK, PotMark, Wordmark, type DotState } from "../../brand/Logo";

/** The wordmark's placement in the lockup file, and the Wordmark component's viewBox origin (38, −619). */
const WM_SCALE = 0.43878;
const WM_TX = 602.94;
const WM_TY = 363.5;
/** Lockup-unit box of <Wordmark> (its viewBox is 38 −619 1454 819 in font units). */
export const WORDMARK_BOX = {
  x: WM_TX + 38 * WM_SCALE,
  y: WM_TY - 619 * WM_SCALE,
  w: 1454 * WM_SCALE,
  h: 819 * WM_SCALE,
} as const;
/** Ink extents of the wordmark in lockup units (font x 48..1482, y −609..190). */
export const WORDMARK_INK = {
  left: WM_TX + 48 * WM_SCALE,
  right: WM_TX + 1482 * WM_SCALE,
  top: WM_TY - 609 * WM_SCALE,
  bottom: WM_TY + 190 * WM_SCALE,
} as const;

export type LockupSvgProps = {
  /** Top-left of the lockup box (lockup unit 0, 0) in the parent SVG's px. */
  x: number;
  y: number;
  /** Height in px of the lockup box (the tile). Width = height × 1265 / 512. */
  height: number;
  /** "light" = pot-lockup-on-light, "dark" = pot-lockup-on-dark, "marigold" = eggplant glyph + eggplant wordmark
   *  for marigold grounds (as og-image.png). */
  on?: "light" | "dark" | "marigold";
  dots?: [DotState?, DotState?, DotState?];
  /** 0..1 wipe of the wordmark from its left ink edge (for animating the name in after the mark). */
  wordmarkReveal?: number;
  /** Draw only part of it (e.g. "wordmark" while an animated mark is drawn separately). Default "all". */
  parts?: "all" | "mark" | "wordmark";
};

/** Lockup as SVG elements (place inside an <svg>). Uniform scale only; never recoloured. */
export const LockupSvg: React.FC<LockupSvgProps> = ({ x, y, height, on = "light", dots, wordmarkReveal = 1, parts = "all" }) => {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const u = height / 512;
  const reveal = Math.max(0, Math.min(1, wordmarkReveal));
  const wipeL = WORDMARK_INK.left - 2; // a hair of margin so the AA edge of the "p" is never shaved
  const wipeW = (WORDMARK_INK.right + 2 - wipeL) * reveal;
  return (
    <g transform={`translate(${x} ${y})`}>
      {reveal < 1 ? (
        <defs>
          <clipPath id={`wipe${id}`}>
            <rect x={wipeL * u} y={0} width={Math.max(0, wipeW * u)} height={512 * u} />
          </clipPath>
        </defs>
      ) : null}
      {parts === "wordmark" ? null : on === "marigold" ? (
        <g transform={`translate(${60 * u} ${128 * u})`}>
          <PotMark size={392 * u} variant="glyph" glyphColor={EGGPLANT} dots={dots} />
        </g>
      ) : (
        <PotMark size={512 * u} variant="tile" dots={dots} />
      )}
      {reveal > 0 && parts !== "mark" ? (
        <g clipPath={reveal < 1 ? `url(#wipe${id})` : undefined}>
          <g transform={`translate(${WORDMARK_BOX.x * u} ${WORDMARK_BOX.y * u})`}>
            <Wordmark height={WORDMARK_BOX.h * u} color={on === "dark" ? NIGHT_INK : EGGPLANT} />
          </g>
        </g>
      ) : null}
    </g>
  );
};
