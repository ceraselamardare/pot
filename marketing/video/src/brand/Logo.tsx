// Pot logo as React SVG, drawn from the exact paths in brand/logo/*.svg (never redraw or recolour).
// The three typing dots are exposed as props so they can animate (the brand's one motif).
import React, { useId } from "react";

export const EGGPLANT = "#2B1B3A";
export const MARIGOLD = "#FFB320";
export const NIGHT_INK = "#F6F1EA"; // lockup-on-dark wordmark colour (Night ink)

const POT_BODY =
  "M108 176 H404 V252 C404 340 340 392 256 392 C222 392 190 383 164 366 L110 394 L128 338 C114 314 108 286 108 252 Z";
const DOTS_X = [196, 256, 316] as const;
const DOT_Y = 278;
const DOT_R = 18;

export const WORDMARK_PATH =
  "M326 13Q262 13 215.0 -16.0Q168 -45 142.0 -102.0Q116 -159 116 -245Q116 -325 142.5 -382.5Q169 -440 216.5 -471.5Q264 -503 327 -503Q394 -503 444.5 -469.5Q495 -436 523.5 -378.0Q552 -320 552 -245Q552 -170 523.0 -111.5Q494 -53 442.5 -20.0Q391 13 326 13ZM48 190V-490H168L210 -356H201V-144H210V190ZM295 -143Q334 -143 360.5 -171.5Q387 -200 387 -245Q387 -289 360.5 -318.5Q334 -348 295 -348Q256 -348 229.0 -318.5Q202 -289 202 -245Q202 -200 229.0 -171.5Q256 -143 295 -143Z M846 13Q769 13 711.0 -20.0Q653 -53 620.0 -111.0Q587 -169 587 -244Q587 -320 620.0 -378.0Q653 -436 711.0 -469.5Q769 -503 846 -503Q924 -503 982.5 -469.5Q1041 -436 1073.5 -378.0Q1106 -320 1106 -244Q1106 -169 1073.5 -111.0Q1041 -53 982.5 -20.0Q924 13 846 13ZM846 -145Q888 -145 915.0 -172.5Q942 -200 942 -245Q942 -290 915.0 -317.5Q888 -345 846 -345Q805 -345 778.0 -317.5Q751 -290 751 -245Q751 -201 778.0 -173.0Q805 -145 846 -145Z M1395 8Q1308 8 1258.5 -33.0Q1209 -74 1209 -169V-484L1207 -490L1241 -609H1371V-213Q1371 -177 1387.5 -162.0Q1404 -147 1431 -147Q1446 -147 1459.5 -150.0Q1473 -153 1482 -156V-4Q1463 2 1442.0 5.0Q1421 8 1395 8ZM1133 -340V-490H1482V-340Z";

/** Per-dot animation: scale (1 = brand size) and opacity. */
export type DotState = { scale?: number; opacity?: number; dy?: number };
const dot = (d: DotState | undefined) => ({ scale: d?.scale ?? 1, opacity: d?.opacity ?? 1, dy: d?.dy ?? 0 });

/** Handles, lid and bubble body of the pot (no dots), in the 512-unit tile space. */
const PotShape: React.FC<{ fill: string; mask?: string }> = ({ fill, mask }) => (
  <g mask={mask}>
    <rect x="72" y="196" width="56" height="40" rx="20" fill={fill} />
    <rect x="384" y="196" width="56" height="40" rx="20" fill={fill} />
    <path d={POT_BODY} fill={fill} />
    <rect x="92" y="140" width="328" height="44" rx="22" fill={fill} />
  </g>
);

type MarkProps = {
  size: number;
  /** "tile": marigold tile, eggplant pot, marigold dots (pot-mark.svg).
   *  "glyph": the pot-bubble alone with the dots cut through (pot-glyph-eggplant.svg / -marigold.svg). */
  variant?: "tile" | "glyph";
  /** Glyph colour: eggplant on light and marigold grounds; marigold on Night grounds. Ignored for "tile". */
  glyphColor?: typeof EGGPLANT | typeof MARIGOLD;
  dots?: [DotState?, DotState?, DotState?];
  style?: React.CSSProperties;
};

/** The mark. In "glyph" variant the viewBox is cropped to the pot (like pot-glyph-*.svg). */
export const PotMark: React.FC<MarkProps> = ({ size, variant = "tile", glyphColor = EGGPLANT, dots, style }) => {
  const id = useId().replace(/:/g, "");
  const ds = [dot(dots?.[0]), dot(dots?.[1]), dot(dots?.[2])];
  if (variant === "tile") {
    return (
      <svg width={size} height={size} viewBox="0 0 512 512" style={style}>
        <rect width="512" height="512" rx="112" fill={MARIGOLD} />
        <PotShape fill={EGGPLANT} />
        {ds.map((d, i) => (
          <circle
            key={i}
            cx={DOTS_X[i]}
            cy={DOT_Y + d.dy}
            r={DOT_R * d.scale}
            fill={MARIGOLD}
            opacity={d.opacity}
          />
        ))}
      </svg>
    );
  }
  // glyph: dots are holes (mask), so whatever is behind shows through, exactly like the brand file.
  const w = size;
  const h = (size * 278) / 392;
  return (
    <svg width={w} height={h} viewBox="60 128 392 278" style={style}>
      <defs>
        <mask id={`m${id}`} maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
          <rect x="0" y="0" width="512" height="512" fill="white" />
          {ds.map((d, i) => (
            <circle key={i} cx={DOTS_X[i]} cy={DOT_Y + d.dy} r={DOT_R * d.scale} fill="black" opacity={d.opacity} />
          ))}
        </mask>
      </defs>
      <PotShape fill={glyphColor} mask={`url(#m${id})`} />
    </svg>
  );
};

/** The wordmark "pot" (always lowercase, Gabarito ExtraBold outlines). Height = x-height-ish box of the file. */
export const Wordmark: React.FC<{ height: number; color?: string; style?: React.CSSProperties }> = ({
  height,
  color = EGGPLANT,
  style,
}) => (
  <svg height={height} width={(height * 1454) / 819} viewBox="38 -619 1454 819" style={style}>
    <path d={WORDMARK_PATH} fill={color} />
  </svg>
);

type LockupProps = {
  /** Height of the whole lockup in px (the tile's height). Width = height * 1265 / 512. */
  height: number;
  /** "light": pot-lockup-on-light (eggplant wordmark). "dark": pot-lockup-on-dark (Night ink wordmark).
   *  "marigold": eggplant glyph + eggplant wordmark for marigold grounds (as og-image.png). */
  on?: "light" | "dark" | "marigold";
  dots?: [DotState?, DotState?, DotState?];
  /** 0..1 reveal of the wordmark (clip from left), for animating the name in after the mark. */
  wordmarkReveal?: number;
  /** Optional offset/opacity animation of the wordmark. */
  wordmarkStyle?: { opacity?: number; dx?: number };
  style?: React.CSSProperties;
};

/** Mark + wordmark with the brand file's exact geometry (viewBox 1265 × 512). */
export const Lockup: React.FC<LockupProps> = ({ height, on = "light", dots, wordmarkReveal = 1, wordmarkStyle, style }) => {
  const id = useId().replace(/:/g, "");
  const ds = [dot(dots?.[0]), dot(dots?.[1]), dot(dots?.[2])];
  const wordColor = on === "dark" ? NIGHT_INK : EGGPLANT;
  const width = (height * 1265) / 512;
  // The wordmark spans x 602.94 → 1253.2 (its "t" arm); clip from 560 to the viewBox edge (1265), never inside the ink.
  const clipW = (1265 - 560) * Math.max(0, Math.min(1, wordmarkReveal));
  return (
    <svg width={width} height={height} viewBox="0 0 1265 512" style={style}>
      <defs>
        <clipPath id={`c${id}`}>
          <rect x="560" y="0" width={clipW} height="512" />
        </clipPath>
        {on === "marigold" ? (
          <mask id={`m${id}`} maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
            <rect x="0" y="0" width="512" height="512" fill="white" />
            {ds.map((d, i) => (
              <circle key={i} cx={DOTS_X[i]} cy={DOT_Y + d.dy} r={DOT_R * d.scale} fill="black" opacity={d.opacity} />
            ))}
          </mask>
        ) : null}
      </defs>
      {on === "marigold" ? (
        <PotShape fill={EGGPLANT} mask={`url(#m${id})`} />
      ) : (
        <>
          <rect width="512" height="512" rx="112" fill={MARIGOLD} />
          <PotShape fill={EGGPLANT} />
          {ds.map((d, i) => (
            <circle key={i} cx={DOTS_X[i]} cy={DOT_Y + d.dy} r={DOT_R * d.scale} fill={MARIGOLD} opacity={d.opacity} />
          ))}
        </>
      )}
      <g clipPath={`url(#c${id})`} opacity={wordmarkStyle?.opacity ?? 1}>
        <g transform={`translate(${602.94 + (wordmarkStyle?.dx ?? 0)} 363.50) scale(0.43878)`}>
          <path d={WORDMARK_PATH} fill={wordColor} />
        </g>
      </g>
    </svg>
  );
};

/**
 * The glyph (pot-bubble with cut-through dots) split into animatable parts, drawn from the exact brand paths.
 * For the logo build in the reveal: body iris, lid drop, handles stepping in, dots. At rest (no part props)
 * it is pixel-identical to PotMark variant="glyph". Units for offsets: the 512 tile; overflow is visible so a
 * lid can fall in from above the crop.
 */
export type GlyphPartsProps = {
  /** Rendered width in px of the glyph crop (392 units wide). Height = size × 278 / 392. */
  size: number;
  color?: typeof EGGPLANT | typeof MARIGOLD;
  /** Body (bubble + tail): scale around the middle dot, opacity. */
  body?: { scale?: number; opacity?: number };
  /** Circle iris on the body, centred on the middle dot, radius in 512 units (undefined = no iris). */
  iris?: number;
  /** Lid: vertical offset (units), rotation (deg, around its centre), opacity. */
  lid?: { dy?: number; rot?: number; opacity?: number };
  /** Left and right handles: horizontal offset outward (units), opacity. */
  handles?: [{ dx?: number; opacity?: number }?, { dx?: number; opacity?: number }?];
  dots?: [DotState?, DotState?, DotState?];
  style?: React.CSSProperties;
};

export const GlyphParts: React.FC<GlyphPartsProps> = ({ size, color = EGGPLANT, body, iris, lid, handles, dots, style }) => {
  const id = useId().replace(/:/g, "");
  const ds = [dot(dots?.[0]), dot(dots?.[1]), dot(dots?.[2])];
  const bs = body?.scale ?? 1;
  const hl = handles?.[0] ?? {};
  const hr = handles?.[1] ?? {};
  return (
    <svg width={size} height={(size * 278) / 392} viewBox="60 128 392 278" overflow="visible" style={{ overflow: "visible", ...style }}>
      <defs>
        <mask id={`m${id}`} maskUnits="userSpaceOnUse" x="-512" y="-512" width="1536" height="1536">
          <rect x="-512" y="-512" width="1536" height="1536" fill="white" />
          {ds.map((d, i) => (
            <circle key={i} cx={DOTS_X[i]} cy={DOT_Y + d.dy} r={DOT_R * d.scale} fill="black" opacity={d.opacity} />
          ))}
        </mask>
        {iris !== undefined ? (
          <clipPath id={`i${id}`}>
            <circle cx={DOTS_X[1]} cy={DOT_Y} r={Math.max(0, iris)} />
          </clipPath>
        ) : null}
      </defs>
      <g mask={`url(#m${id})`}>
        <g clipPath={iris !== undefined ? `url(#i${id})` : undefined}>
          <g
            opacity={body?.opacity ?? 1}
            transform={`translate(${DOTS_X[1]} ${DOT_Y}) scale(${bs}) translate(${-DOTS_X[1]} ${-DOT_Y})`}
          >
            <path d={POT_BODY} fill={color} />
          </g>
        </g>
        <rect x={72 - (hl.dx ?? 0)} y="196" width="56" height="40" rx="20" fill={color} opacity={hl.opacity ?? 1} />
        <rect x={384 + (hr.dx ?? 0)} y="196" width="56" height="40" rx="20" fill={color} opacity={hr.opacity ?? 1} />
        <g transform={`translate(0 ${lid?.dy ?? 0}) rotate(${lid?.rot ?? 0} 256 162)`} opacity={lid?.opacity ?? 1}>
          <rect x="92" y="140" width="328" height="44" rx="22" fill={color} />
        </g>
      </g>
    </svg>
  );
};

/** Geometry helpers for match-cuts (e.g. chat typing dots → logo dots). Units: the 512 tile. */
export const LOGO_GEOMETRY = {
  tile: 512,
  dotsX: DOTS_X,
  dotY: DOT_Y,
  dotR: DOT_R,
  glyphViewBox: { x: 60, y: 128, w: 392, h: 278 },
  lockupViewBox: { w: 1265, h: 512 },
} as const;
