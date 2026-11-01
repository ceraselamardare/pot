// Type styles from brand/tokens.json (designed at a 390 px phone), as the app's Tailwind text-* utilities apply
// them (font-size, line-height, weight and letter-spacing). Gabarito = display, Figtree = text.
import type React from "react";
import { DISPLAY, SANS } from "../brand/fonts";

export const T = {
  /** balance-hero: 44/48 Gabarito 800, -0.02em (MoneyText "hero" uses line-height 1.1 like the app). */
  hero: { fontFamily: DISPLAY, fontSize: 44, lineHeight: "48px", fontWeight: 800, letterSpacing: "-0.02em" },
  title: { fontFamily: DISPLAY, fontSize: 26, lineHeight: "30px", fontWeight: 700, letterSpacing: "-0.01em" },
  heading: { fontFamily: DISPLAY, fontSize: 19, lineHeight: "24px", fontWeight: 700, letterSpacing: "0em" },
  body: { fontFamily: SANS, fontSize: 16, lineHeight: "24px", fontWeight: 400 },
  bodySm: { fontFamily: SANS, fontSize: 14, lineHeight: "20px", fontWeight: 400 },
  label: { fontFamily: SANS, fontSize: 15, lineHeight: "20px", fontWeight: 600 },
  amount: { fontFamily: SANS, fontSize: 17, lineHeight: "24px", fontWeight: 700, fontVariantNumeric: "tabular-nums" },
} satisfies Record<string, React.CSSProperties>;

/** The app's <body> (font-sans text-body tabular-nums antialiased): Figtree 16/24, tabular figures everywhere.
 *  Spread on every screen and sheet root so inline content gets the same line boxes as the app. */
export const SCREEN_TEXT: React.CSSProperties = {
  fontFamily: SANS,
  fontSize: 16,
  lineHeight: "24px",
  fontWeight: 400,
  fontVariantNumeric: "tabular-nums",
  WebkitFontSmoothing: "antialiased",
  MozOsxFontSmoothing: "grayscale",
  textRendering: "optimizeLegibility",
};

export { DISPLAY, SANS };
