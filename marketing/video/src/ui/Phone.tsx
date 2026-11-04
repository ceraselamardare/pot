// A generic modern phone (no real-device branding): a 390 × 844 logical screen with 55 px corners, a thin
// eggplant bezel and rim in token colours, a pill camera island, a status bar (9:41, signal, wi-fi, battery drawn
// in SVG) and a home indicator. Pure DOM/SVG, so it stays crisp at any zoom (prefer the `zoom` prop over a CSS
// scale for big close-ups). Children are the screen: <Phone><PotScreen … /><SpendSheet … /></Phone>.
// 3D: the root is `preserve-3d` and no ancestor of the screen has opacity/filter/mask/isolation/overflow; only the
// screen leaf clips (radius + overflow). `depth` extrudes a side band behind the face for yawed 3D shots.
// SCREEN_RECT gives the screen's box inside the phone, for placing breakout twins exactly over it.
import React from "react";
import { day, night } from "../brand/tokens";
import { SANS } from "../brand/fonts";
import { UiTheme, type ThemeName, alpha } from "./theme";

export const SCREEN_W = 390;
export const SCREEN_H = 844;
export const SCREEN_RADIUS = 55;
export const BEZEL = 12;
export const RIM = 2.5;
/** Status bar height = the screens' top safe area. */
export const SAFE_TOP = 50;
/** Home indicator zone = the screens' bottom safe area. */
export const SAFE_BOTTOM = 34;
export const PHONE_W = SCREEN_W + BEZEL * 2;
export const PHONE_H = SCREEN_H + BEZEL * 2;
export const PHONE_RADIUS = SCREEN_RADIUS + BEZEL;
/** The screen's rectangle relative to the phone's top-left corner (multiply by your stage scale). */
export const SCREEN_RECT = { x: BEZEL, y: BEZEL, width: SCREEN_W, height: SCREEN_H, radius: SCREEN_RADIUS } as const;
const ISLAND = { w: 122, h: 35, top: 11 };

export type PhoneProps = {
  theme?: ThemeName;
  children?: React.ReactNode;
  showStatusBar?: boolean;
  /** "dark" glyphs for light screens (default in Day), "light" for dark screens (default in Night). */
  statusBarTone?: "dark" | "light";
  time?: string;
  /** 0..1 battery level drawn in the status bar. */
  battery?: number;
  homeIndicator?: boolean;
  homeIndicatorTone?: "dark" | "light";
  /** Screen background behind the app (defaults to the theme's ground). */
  screenBackground?: string;
  /** CSS zoom for crisp large renders (layout scales, text re-rasterises). */
  zoom?: number;
  shadow?: boolean;
  /** A faint diagonal glass reflection over the screen. */
  glare?: number;
  /** Body thickness in px (0 = flat). Extruded layers behind the face, visible when a 3D stage yaws the phone. */
  depth?: number;
  style?: React.CSSProperties;
};

const RIM_GRADIENT = `linear-gradient(140deg, ${night.line} 0%, ${day.ink} 16%, ${night.ground} 48%, ${day.ink} 80%, ${night.line} 100%)`;
const BUTTON_GRADIENT = `linear-gradient(90deg, ${night.ground}, ${night.line} 50%, ${night.ground})`;
/** Eggplant-rgba shadow (brand: token shadows or rgba of #2b1b3a). */
export const PHONE_SHADOW = [
  "0 1px 2px rgba(43, 27, 58, 0.24)",
  "0 18px 36px -12px rgba(43, 27, 58, 0.38)",
  "0 40px 80px -20px rgba(43, 27, 58, 0.32)",
].join(", ");
/** Side band shades, front to back (token colours only). */
const EDGE = [night.line, night.surfaceSunken, day.ink, day.ink, night.surface, night.ground];

/** Annular sector path (SVG angles: 0 = +x, clockwise). */
function band(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const p = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(3)} ${(cy + r * Math.sin(a)).toFixed(3)}`;
  if (r0 <= 0) return `M${cx} ${cy} L${p(r1, a0)} A${r1} ${r1} 0 0 1 ${p(r1, a1)} Z`;
  return `M${p(r0, a0)} L${p(r1, a0)} A${r1} ${r1} 0 0 1 ${p(r1, a1)} L${p(r0, a1)} A${r0} ${r0} 0 0 0 ${p(r0, a0)} Z`;
}

const A0 = (-135 * Math.PI) / 180;
const A1 = (-45 * Math.PI) / 180;
const WIFI = [band(8.1, 11.8, 0, 3.6, A0, A1), band(8.1, 11.8, 5.3, 7.6, A0, A1), band(8.1, 11.8, 9.3, 11.6, A0, A1)];

export const StatusBar: React.FC<{ tone: "dark" | "light"; time?: string; battery?: number; height?: number }> = ({
  tone,
  time = "9:41",
  battery = 0.8,
  height = SAFE_TOP,
}) => {
  const color = tone === "dark" ? day.ink : night.ink;
  const cy = ISLAND.top + ISLAND.h / 2;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 0, height, zIndex: 100, pointerEvents: "none", color }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          width: (SCREEN_W - ISLAND.w) / 2,
          top: cy - 11,
          height: 22,
          display: "grid",
          placeItems: "center",
          paddingLeft: 10,
          boxSizing: "border-box",
          fontFamily: SANS,
          fontWeight: 600,
          fontSize: 17,
          lineHeight: "22px",
          letterSpacing: "-0.01em",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {time}
      </div>
      <div
        style={{
          position: "absolute",
          right: 0,
          width: (SCREEN_W - ISLAND.w) / 2,
          top: cy - 7,
          height: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          paddingRight: 8,
          boxSizing: "border-box",
        }}
      >
        {/* signal */}
        <svg width={18} height={12} viewBox="0 0 18 12" style={{ display: "block" }}>
          {[0, 1, 2, 3].map((i) => {
            const h = 4 + i * 2.6;
            return <rect key={i} x={i * 4.8} y={12 - h} width={3.2} height={h} rx={1} fill="currentColor" />;
          })}
        </svg>
        {/* wi-fi */}
        <svg width={16} height={12} viewBox="0 0 16.2 12" style={{ display: "block" }}>
          {WIFI.map((d, i) => (
            <path key={i} d={d} fill="currentColor" />
          ))}
        </svg>
        {/* battery */}
        <svg width={27} height={13} viewBox="0 0 27 13" style={{ display: "block" }}>
          <rect x={0.5} y={0.5} width={23} height={12} rx={3.8} fill="none" stroke="currentColor" strokeOpacity={0.4} />
          <rect x={2} y={2} width={Math.max(0, Math.min(1, battery)) * 20} height={9} rx={2.4} fill="currentColor" />
          <path d="M25 4.4 C26.1 4.7 26.6 5.5 26.6 6.5 C26.6 7.5 26.1 8.3 25 8.6 Z" fill="currentColor" fillOpacity={0.45} />
        </svg>
      </div>
    </div>
  );
};

export const CameraIsland: React.FC = () => (
  <div
    style={{
      position: "absolute",
      top: ISLAND.top,
      left: (SCREEN_W - ISLAND.w) / 2,
      width: ISLAND.w,
      height: ISLAND.h,
      borderRadius: 999,
      background: night.ground,
      zIndex: 101,
      boxShadow: `inset 0 0 0 1px ${alpha(night.surface, 0.9)}`,
    }}
  >
    <span
      style={{
        position: "absolute",
        right: 14,
        top: ISLAND.h / 2 - 6,
        width: 12,
        height: 12,
        borderRadius: 999,
        background: `radial-gradient(circle at 35% 35%, ${night.line} 0%, ${night.surface} 45%, ${night.ground} 100%)`,
        boxShadow: `0 0 0 1.5px ${alpha(night.surfaceSunken, 0.9)}`,
      }}
    />
  </div>
);

export const HomeIndicator: React.FC<{ tone: "dark" | "light" }> = ({ tone }) => (
  <div
    style={{
      position: "absolute",
      bottom: 8,
      left: "50%",
      width: 134,
      height: 5,
      marginLeft: -67,
      borderRadius: 999,
      background: tone === "dark" ? day.ink : night.ink,
      zIndex: 100,
      pointerEvents: "none",
    }}
  />
);

export const Phone: React.FC<PhoneProps> = ({
  theme = "day",
  children,
  showStatusBar = true,
  statusBarTone,
  time = "9:41",
  battery = 0.8,
  homeIndicator = true,
  homeIndicatorTone,
  screenBackground,
  zoom,
  shadow = true,
  glare = 0,
  depth = 0,
  style,
}) => {
  const tone = statusBarTone ?? (theme === "night" ? "light" : "dark");
  const homeTone = homeIndicatorTone ?? tone;
  const ground = theme === "night" ? night.ground : day.ground;
  const sideButton = (side: "left" | "right", top: number, h: number) => (
    <div
      style={{
        position: "absolute",
        [side]: -3,
        top,
        width: 5,
        height: h,
        borderRadius: side === "left" ? "3px 0 0 3px" : "0 3px 3px 0",
        background: BUTTON_GRADIENT,
      }}
    />
  );
  const layers = depth > 0 ? Math.max(2, Math.ceil(depth / 0.75)) : 0;
  return (
    <div
      style={{
        position: "relative",
        width: PHONE_W,
        height: PHONE_H,
        flexShrink: 0,
        zoom,
        transformStyle: "preserve-3d",
        ...style,
      }}
    >
      {/* extruded body: back to front, the shadow sits on the back plate */}
      {Array.from({ length: layers }, (_, j) => {
        const i = layers - 1 - j;
        const z = -((i + 1) / layers) * depth;
        const shade = EDGE[Math.min(EDGE.length - 1, Math.floor((i / layers) * EDGE.length))];
        return (
          <div
            key={`d${i}`}
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: PHONE_RADIUS,
              background: shade,
              transform: `translateZ(${z.toFixed(2)}px)`,
              boxShadow: i === layers - 1 && shadow ? PHONE_SHADOW : undefined,
            }}
          />
        );
      })}
      {/* the face: one flat group at z = 0 (rim, bezel, buttons, screen), so nothing coplanar can z-fight in a
          preserve-3d stage; with depth it sits a hair in front of the body layers */}
      <div style={{ position: "absolute", inset: 0, transform: layers > 0 ? "translateZ(0.5px)" : undefined }}>
        {sideButton("left", 168, 30)}
        {sideButton("left", 226, 58)}
        {sideButton("left", 296, 58)}
        {sideButton("right", 258, 92)}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: PHONE_RADIUS,
            background: RIM_GRADIENT,
            boxShadow: shadow && layers === 0 ? PHONE_SHADOW : undefined,
          }}
        />
        <div style={{ position: "absolute", inset: RIM, borderRadius: PHONE_RADIUS - RIM, background: night.ground }} />
        <div
          style={{
            position: "absolute",
            left: BEZEL,
            top: BEZEL,
            width: SCREEN_W,
            height: SCREEN_H,
            borderRadius: SCREEN_RADIUS,
            // the screen leaf is the only clip (no isolation/mask/opacity on any ancestor: 3D-safe)
            overflow: "hidden",
            background: screenBackground ?? ground,
          }}
        >
          <UiTheme theme={theme} safeTop={showStatusBar ? SAFE_TOP : 0} safeBottom={homeIndicator ? SAFE_BOTTOM : 0} screenW={SCREEN_W} screenH={SCREEN_H}>
            {children}
          </UiTheme>
          {showStatusBar ? <StatusBar tone={tone} time={time} battery={battery} /> : null}
          <CameraIsland />
          {homeIndicator ? <HomeIndicator tone={homeTone} /> : null}
          {glare > 0 ? (
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 102,
                pointerEvents: "none",
                background: `linear-gradient(118deg, ${alpha(day.surface, 0.1 * glare)} 0%, ${alpha(day.surface, 0.04 * glare)} 30%, ${alpha(day.surface, 0)} 46%)`,
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
};

/** A bare 390 × 844 screen (no bezel, no status bar, no safe areas): for 1:1 comparisons with the app's
 *  screenshots and for UI pieces that break out of the phone. */
export const BareScreen: React.FC<{
  theme?: ThemeName;
  /** A taller page for full-page captures (the screen height the sheets size against too). */
  height?: number;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ theme = "day", height = SCREEN_H, children, style }) => (
  <div
    style={{
      position: "relative",
      width: SCREEN_W,
      height,
      overflow: "hidden",
      background: theme === "night" ? night.ground : day.ground,
      ...style,
    }}
  >
    <UiTheme theme={theme} safeTop={0} safeBottom={0} screenW={SCREEN_W} screenH={height}>
      {children}
    </UiTheme>
  </div>
);
