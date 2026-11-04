// The invite link preview image (apps/web/app/j/[slug]/opengraph-image.tsx, notes/screens/p2-day-og-image.png):
// 1200 × 630 on marigold, the cover tile centred, the Pot name in Gabarito 800 eggplant, plain seats in member colours
// (no names or initials since the privacy audit of 2026-11-02; `initials` brings back the Oct 22 look) with
// "3 friends are in", the eggplant glyph + lowercase wordmark bottom left. Laid out in DOM at any `width`
// (every size scales from the 1200 px design), so it stays crisp in a chat bubble or full screen.
import React from "react";
import { MARIGOLD, PotMark, EGGPLANT, Wordmark } from "../../brand/Logo";
import { day } from "../../brand/tokens";
import { copy } from "../copy";
import { CREW, LISBON, memberColor, type Person } from "../data";
import { DISPLAY, SANS } from "../type";
import { coverGradient } from "../atoms/CoverTile";

export const OG_W = 1200;
export const OG_H = 630;

export const OgCard: React.FC<{
  width?: number;
  potName?: string;
  emoji?: string;
  cover?: number;
  members?: Person[];
  /** "3 friends are in" by default; "Closed" for a closed Pot. */
  line?: string;
  /** LEGACY: initials in the seats (the app's image shows plain seats now). */
  initials?: boolean;
  radius?: number;
  style?: React.CSSProperties;
}> = ({ width = OG_W, potName = LISBON.name, emoji = LISBON.emoji, cover = LISBON.cover, members = CREW, line, initials = false, radius = 0, style }) => {
  const k = width / OG_W;
  const shown = members.slice(0, 5);
  const text = line ?? copy["og.members"](members.length);
  return (
    <div
      style={{
        position: "relative",
        width,
        height: OG_H * k,
        background: MARIGOLD,
        borderRadius: radius,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        fontFamily: SANS,
        flexShrink: 0,
        ...style,
      }}
    >
      <div
        style={{
          marginTop: 52 * k,
          width: 280 * k,
          height: 280 * k,
          borderRadius: 62 * k,
          display: "grid",
          placeItems: "center",
          background: coverGradient(cover, "135deg"),
          fontSize: 150 * k,
          lineHeight: 1,
        }}
      >
        {emoji}
      </div>
      <div
        style={{
          marginTop: 22 * k,
          maxWidth: 900 * k,
          textAlign: "center",
          fontFamily: DISPLAY,
          fontWeight: 800,
          fontSize: (potName.length > 22 ? 52 : 64) * k,
          lineHeight: 1.08,
          color: EGGPLANT,
        }}
      >
        {potName}
      </div>
      <div style={{ position: "absolute", bottom: 40 * k, left: 0, right: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 18 * k }}>
        {shown.length > 0 && !line ? (
          <div style={{ display: "flex" }}>
            {shown.map((m, i) => (
              <div
                key={m.id}
                style={{
                  boxSizing: "border-box",
                  width: 56 * k,
                  height: 56 * k,
                  marginLeft: i === 0 ? 0 : -12 * k,
                  borderRadius: 999,
                  border: `${4 * k}px solid ${day.surface}`,
                  background: memberColor(m.joinIndex ?? 0),
                  color: EGGPLANT,
                  display: "grid",
                  placeItems: "center",
                  fontSize: 20 * k,
                  fontWeight: 600,
                  lineHeight: 1,
                }}
              >
                {initials ? m.initials : null}
              </div>
            ))}
          </div>
        ) : null}
        <div style={{ fontSize: 32 * k, fontWeight: 600, color: EGGPLANT, lineHeight: 1.2 }}>{text}</div>
      </div>
      <div style={{ position: "absolute", left: 48 * k, bottom: 40 * k, display: "flex", alignItems: "center", gap: 12 * k }}>
        <PotMark size={68 * k} variant="glyph" glyphColor={EGGPLANT} style={{ display: "block" }} />
        <Wordmark height={36 * k} color={EGGPLANT} style={{ display: "block" }} />
      </div>
    </div>
  );
};
