// UI-kit theme: Day / Night palettes from src/brand/tokens.ts plus the app's derived values
// (apps/web/app/tokens.css: --pot-scrim, --pot-brand-border; shadcn secondary = transparent in Night).
// <Phone> provides it; anything rendered outside a phone can wrap itself in <UiTheme>.
import React, { createContext, useContext, useMemo } from "react";
import { day, night, shadow } from "../brand/tokens";

export type ThemeName = "day" | "night";
export type Palette = { readonly [K in keyof typeof day]: string };

export type UiEnv = {
  theme: ThemeName;
  /** Token colours for the active theme. */
  c: Palette;
  shadowCard: string;
  shadowSheet: string;
  /** Sheet backdrop (app --pot-scrim). */
  scrim: string;
  /** 1 px border of the marigold button: brand-deep in Day, none in Night. */
  brandBorder: string;
  /** Secondary button fill: surface in Day, transparent in Night. */
  secondaryBg: string;
  /** Top safe area (status bar) and bottom safe area (home indicator) in px. 0 outside a phone. */
  safeTop: number;
  safeBottom: number;
  screenW: number;
  screenH: number;
};

export const palette = (theme: ThemeName): Palette => (theme === "night" ? night : day);

export function makeEnv(theme: ThemeName, safeTop = 0, safeBottom = 0, screenW = 390, screenH = 844): UiEnv {
  const c = palette(theme);
  return {
    theme,
    c,
    shadowCard: shadow[theme].shadowCard,
    shadowSheet: shadow[theme].shadowSheet,
    scrim: theme === "night" ? "rgba(0, 0, 0, 0.35)" : "rgba(43, 27, 58, 0.45)",
    brandBorder: theme === "night" ? "transparent" : c.brandDeep,
    secondaryBg: theme === "night" ? "transparent" : c.surface,
    safeTop,
    safeBottom,
    screenW,
    screenH,
  };
}

const Ctx = createContext<UiEnv>(makeEnv("day"));

export const UiTheme: React.FC<{
  theme?: ThemeName;
  safeTop?: number;
  safeBottom?: number;
  screenW?: number;
  screenH?: number;
  children: React.ReactNode;
}> = ({ theme, safeTop, safeBottom, screenW, screenH, children }) => {
  const parent = useContext(Ctx);
  const t = theme ?? parent.theme;
  const top = safeTop ?? parent.safeTop;
  const bottom = safeBottom ?? parent.safeBottom;
  const w = screenW ?? parent.screenW;
  const h = screenH ?? parent.screenH;
  const env = useMemo(() => makeEnv(t, top, bottom, w, h), [t, top, bottom, w, h]);
  return <Ctx.Provider value={env}>{children}</Ctx.Provider>;
};

export const useUi = (): UiEnv => useContext(Ctx);

/** rgba() of a #rrggbb token colour (for alpha-only variations of a token, e.g. ink at 18 %). */
export function alpha(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
