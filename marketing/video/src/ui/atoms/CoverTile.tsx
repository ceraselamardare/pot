// The Pot cover (apps/web/components/pot/CoverTile.tsx): an emoji on one of six token gradients
// (Tailwind bg-linear-to-br from → to). Lisbon Trip uses cover 0 (member-1 → member-4).
import React from "react";
import { day } from "../../brand/tokens";

/** COVER_GRADIENTS in the app, as [from, to] token colours (member tints are the same in both themes). */
export const COVER_GRADIENTS: [string, string][] = [
  [day.member1, day.member4],
  [day.member2, day.member3],
  [day.member5, day.member3],
  [day.member4, day.member5],
  [day.member6, day.member2],
  [day.brandSoft, day.member1],
];

export const coverGradient = (cover: number, angle = "to bottom right") => {
  const [from, to] = COVER_GRADIENTS[((cover % 6) + 6) % 6];
  return `linear-gradient(${angle}, ${from}, ${to})`;
};

export type CoverSize = "sm" | "md" | "lg" | "xl" | "banner";

/** px box, radius and emoji size (size-8 rounded-sm text-base … h-32 rounded-lg text-6xl). */
export const COVER: Record<CoverSize, { box: number | null; h: number; radius: number; font: number }> = {
  sm: { box: 32, h: 32, radius: 10, font: 16 },
  md: { box: 44, h: 44, radius: 16, font: 24 },
  lg: { box: 56, h: 56, radius: 16, font: 30 },
  xl: { box: 80, h: 80, radius: 24, font: 48 },
  banner: { box: null, h: 128, radius: 24, font: 60 },
};

export const CoverTile: React.FC<{
  emoji: string;
  cover?: number;
  size?: CoverSize;
  /** Override the box (square) size in px; the emoji scales with it. */
  px?: number;
  style?: React.CSSProperties;
}> = ({ emoji, cover = 0, size = "md", px, style }) => {
  const s = COVER[size];
  const k = px && s.box ? px / s.box : 1;
  return (
    <span
      aria-hidden
      style={{
        display: "inline-grid",
        placeItems: "center",
        flexShrink: 0,
        width: s.box === null ? "100%" : s.box * k,
        height: s.h * k,
        borderRadius: s.radius * k,
        background: coverGradient(cover),
        fontSize: s.font * k,
        lineHeight: 1,
        userSelect: "none",
        ...style,
      }}
    >
      {emoji}
    </span>
  );
};
