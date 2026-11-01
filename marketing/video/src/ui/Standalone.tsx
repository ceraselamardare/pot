// Render any UI-kit piece outside a phone at its in-phone size (for 3D breakout twins and kinetic close-ups):
//   <UiPiece theme="day" width={358}><RulesCapsule state="approved" /></UiPiece>
// It provides the theme, the app's base text style (Figtree 16/24, tabular figures), and an optional card body.
// Widths inside a phone: sheet and page content = 358 (390 - 2 × 16 gutters); the chat link card = 264.
import React from "react";
import { UiTheme, useUi, type ThemeName } from "./theme";
import { SCREEN_TEXT } from "./type";

/** Content width inside a 390 px phone (16 px gutters). */
export const CONTENT_W = 358;

export const UiPiece: React.FC<{
  theme?: ThemeName;
  width?: number;
  /** Paint a card body behind the piece: "surface" (white/Night surface), "ground", or none. */
  card?: "surface" | "ground" | "none";
  padding?: number;
  radius?: number;
  /** Add the token card shadow (shadow-card) to the body. */
  shadow?: boolean;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ theme = "day", width = CONTENT_W, card = "none", padding = 0, radius = 24, shadow = false, style, children }) => (
  <UiTheme theme={theme}>
    <PieceBody width={width} card={card} padding={padding} radius={radius} shadow={shadow} style={style}>
      {children}
    </PieceBody>
  </UiTheme>
);

const PieceBody: React.FC<{
  width: number;
  card: "surface" | "ground" | "none";
  padding: number;
  radius: number;
  shadow: boolean;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ width, card, padding, radius, shadow, style, children }) => {
  const { c, shadowCard } = useUi();
  return (
    <div
      style={{
        ...SCREEN_TEXT,
        color: c.ink,
        width: width + padding * 2,
        boxSizing: "border-box",
        padding,
        borderRadius: card === "none" ? undefined : radius,
        background: card === "surface" ? c.surface : card === "ground" ? c.ground : undefined,
        boxShadow: shadow ? shadowCard : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
};
