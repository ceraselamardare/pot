// Act 1 (THE PROBLEM) shared pieces: Night palette constants, the Night finish (grain + vignette), and
// film-scale chat graphics (avatars, bubbles, notification banners) drawn from the UI kit's generic messenger
// geometry (src/ui/screens/ChatScreen.tsx) multiplied by a scale k. Film-level graphics, not phone replicas.
//
// Act 1 rules: Night tokens only, member colours for people, NO marigold (not even night.brandSoft, which is a
// marigold tint): Maya's outgoing bubbles use night.surfaceSunken instead of the app's brand-soft.
import React from "react";
import { AbsoluteFill } from "remotion";
import { MessageCircle } from "lucide-react";
import { day, night } from "../../brand/tokens";
import { SANS } from "../../brand/fonts";
import { Grain, Vignette } from "../../motion";
import { memberColor, MAYA, SAM, LEO, type Person } from "../../ui";

export { MAYA, SAM, LEO };
export type { Person };

/** Night palette (Act 1). */
export const N = night;
/** The Act 1 highlight block colour (member-4 pink; marigold is reserved for s06 onwards). */
export const PINK = day.member4;
/** Eggplant text on member-colour fills (avatars, the pink highlight). */
export const ON_FILL = night.onBrand;
/** The generic messenger's app-icon tile (a member colour, never Pot's logo: Pot doesn't exist yet). */
export const APP_TILE = night.member6;

/** Act 1 finish (research §3.8): grain ≈ 2.5 % monochrome, vignette 8 % (≤ 10 %). */
export const GRAIN_OPACITY = 0.28; // director: lowered from 0.42 (speckled text; X compression)
export const VIGNETTE_STRENGTH = 0.08;

/** Grain + vignette on top of a Night scene. Put it last inside the scene's AbsoluteFill. */
export const NightFinish: React.FC = () => (
  <>
    <Vignette theme="night" strength={VIGNETTE_STRENGTH} />
    <Grain opacity={GRAIN_OPACITY} />
  </>
);

/** Night ground for a whole scene. */
export const NightGround: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill style={{ background: N.ground, overflow: "hidden" }}>{children}</AbsoluteFill>
);

export const personColor = (p: Person) => memberColor(p.joinIndex ?? 0);

/** A member avatar at any size: the member colour, eggplant initial (Figtree 700), like the app's Avatar. */
export const FilmAvatar: React.FC<{ person: Person; size: number; ring?: string; ringWidth?: number; style?: React.CSSProperties }> = ({
  person,
  size,
  ring,
  ringWidth = 0,
  style,
}) => (
  <span
    aria-hidden
    style={{
      display: "inline-grid",
      placeItems: "center",
      flexShrink: 0,
      width: size,
      height: size,
      borderRadius: size,
      background: personColor(person),
      color: ON_FILL,
      fontFamily: SANS,
      fontWeight: 700,
      fontSize: size * 0.42,
      lineHeight: 1,
      boxShadow: ring ? `0 0 0 ${ringWidth}px ${ring}` : undefined,
      ...style,
    }}
  >
    {person.initials}
  </span>
);

/** The generic messenger's app icon: Lucide message-circle on a member-colour tile. */
export const AppTile: React.FC<{ size: number; ring?: string; ringWidth?: number; style?: React.CSSProperties }> = ({ size, ring, ringWidth = 0, style }) => (
  <span
    aria-hidden
    style={{
      display: "inline-grid",
      placeItems: "center",
      width: size,
      height: size,
      borderRadius: size * 0.27,
      background: APP_TILE,
      color: ON_FILL,
      boxShadow: ring ? `0 0 0 ${ringWidth}px ${ring}` : undefined,
      ...style,
    }}
  >
    <MessageCircle size={size * 0.62} strokeWidth={2} style={{ display: "block" }} />
  </span>
);

// ─── Chat bubble (film scale) ───────────────────────────────────────────────────
export type BubbleFrom = Person | "me";

export type FilmBubbleProps = {
  from: BubbleFrom;
  /** Bubble content (text or the typing dots). */
  children: React.ReactNode;
  /** Scale over the app's 390 px phone geometry (k = 3 → 48 px text). */
  k: number;
  /** Show the sender's name (incoming, first of run). Default true. */
  showName?: boolean;
  /** Show the sender's avatar (incoming). Default true. */
  showAvatar?: boolean;
  /** Fill: "surface" (the app's incoming bubble) or "sunken" (one step up, for heroes and Maya's outgoing). */
  fill?: "surface" | "sunken";
  /** Text weight (the app uses 400; film legibility wants 500). */
  weight?: number;
  /** Text size override in px (default 16k). */
  fontSize?: number;
  /** Max bubble width in px (default 272k, the app's BUBBLE_MAX). */
  maxWidth?: number;
  /** Override the padding (px). */
  padding?: string;
  /** Hairline in the Night line token (helps on the near-black ground). */
  outline?: boolean;
  style?: React.CSSProperties;
  bubbleStyle?: React.CSSProperties;
};

/** One chat bubble with the app's geometry: radius 18, the sender-side tail corner 6, padding 7/11/8,
 *  Figtree 16/21, names in member colours (Night), a 28 px avatar for incoming messages. */
export const FilmBubble: React.FC<FilmBubbleProps> = ({
  from,
  children,
  k,
  showName = true,
  showAvatar = true,
  fill,
  weight = 500,
  fontSize,
  maxWidth,
  padding,
  outline = false,
  style,
  bubbleStyle,
}) => {
  const out = from === "me";
  const person = out ? null : from;
  const r = 18 * k;
  const tail = 6 * k;
  const radius = out ? `${r}px ${r}px ${tail}px ${r}px` : `${r}px ${r}px ${r}px ${tail}px`;
  const bg = (fill ?? (out ? "sunken" : "surface")) === "sunken" ? N.surfaceSunken : N.surface;
  const fs = fontSize ?? 16 * k;
  return (
    <div style={{ display: "flex", justifyContent: out ? "flex-end" : "flex-start", alignItems: "flex-end", gap: 6 * k, ...style }}>
      {!out && showAvatar && person ? <FilmAvatar person={person} size={28 * k} /> : null}
      <div
        style={{
          maxWidth: maxWidth ?? 272 * k,
          borderRadius: radius,
          background: bg,
          padding: padding ?? `${7 * k}px ${11 * k}px ${8 * k}px`,
          boxShadow: outline ? `inset 0 0 0 ${Math.max(1, k * 0.5)}px ${N.line}` : undefined,
          boxSizing: "border-box",
          ...bubbleStyle,
        }}
      >
        {person && showName ? (
          <p style={{ margin: `0 0 ${1 * k}px`, fontFamily: SANS, fontSize: 13 * k, lineHeight: `${17 * k}px`, fontWeight: 700, color: personColor(person) }}>
            {person.name}
          </p>
        ) : null}
        <div style={{ margin: 0, fontFamily: SANS, fontSize: fs, lineHeight: `${fs * 1.3}px`, fontWeight: weight, color: N.ink, overflowWrap: "break-word" }}>
          {children}
        </div>
      </div>
    </div>
  );
};

// ─── Notification banner (film scale) ───────────────────────────────────────────
export type BannerMsg = { from: Person; text: string };

/** A generic chat notification banner for the group "Lisbon Trip ✈️": the sender's member-colour avatar with
 *  the messenger's app badge, the group name, "now", and "Name: message". Night surface-sunken card. */
export const NotificationBanner: React.FC<{ msg: BannerMsg; width: number; height: number; style?: React.CSSProperties }> = ({ msg, width, height, style }) => {
  const u = height / 280; // designed at 280 px tall
  return (
    <div
      style={{
        position: "absolute",
        width,
        height,
        boxSizing: "border-box",
        borderRadius: 64 * u,
        background: N.surfaceSunken,
        // inset highlight = the first layer of the Night shadow-card token ("0 1px 0 rgba(255,255,255,0.04) inset")
        boxShadow: `inset 0 ${2 * u}px 0 rgba(255, 255, 255, 0.04), inset 0 0 0 ${2 * u}px ${N.line}`,
        display: "flex",
        alignItems: "center",
        gap: 40 * u,
        padding: `0 ${56 * u}px 0 ${44 * u}px`,
        ...style,
      }}
    >
      <span style={{ position: "relative", flexShrink: 0, width: 160 * u, height: 160 * u }}>
        <FilmAvatar person={msg.from} size={160 * u} />
        <AppTile size={66 * u} ring={N.surfaceSunken} ringWidth={7 * u} style={{ position: "absolute", right: -10 * u, bottom: -10 * u }} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 24 * u }}>
          <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 52 * u, lineHeight: `${64 * u}px`, color: N.ink, whiteSpace: "nowrap" }}>Lisbon Trip ✈️</span>
          <span style={{ fontFamily: SANS, fontWeight: 500, fontSize: 42 * u, color: N.inkMuted, whiteSpace: "nowrap" }}>now</span>
        </div>
        <div style={{ fontFamily: SANS, fontWeight: 500, fontSize: 60 * u, lineHeight: `${76 * u}px`, color: N.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          <span style={{ fontWeight: 700, color: personColor(msg.from) }}>{msg.from.name}:</span> {msg.text}
        </div>
      </div>
    </div>
  );
};

/** "Seen" under an outgoing bubble (ink-muted, Figtree 600). */
export const Seen: React.FC<{ size: number; style?: React.CSSProperties }> = ({ size, style }) => (
  <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: size, lineHeight: 1.2, color: N.inkMuted, textAlign: "right", ...style }}>Seen</div>
);
