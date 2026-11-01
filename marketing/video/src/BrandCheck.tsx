// A still that proves fonts, tokens and the logo render correctly. Director-owned.
import React from "react";
import { AbsoluteFill } from "remotion";
import { day, night } from "./brand/tokens";
import { DISPLAY, SANS, TABULAR } from "./brand/fonts";
import { Lockup, PotMark } from "./brand/Logo";

export const BrandCheck: React.FC = () => (
  <AbsoluteFill style={{ background: day.ground, flexDirection: "row" }}>
    <div style={{ flex: 1, padding: 80, display: "flex", flexDirection: "column", gap: 40 }}>
      <Lockup height={160} on="light" />
      <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 120, color: day.ink, letterSpacing: "-0.02em", ...TABULAR }}>
        $450.00
      </div>
      <div style={{ fontFamily: SANS, fontSize: 36, color: day.inkMuted }}>Group chat money that follows its own rules.</div>
      <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
        <PotMark size={120} />
        <div style={{ background: day.brand, borderRadius: 999, padding: "28px 56px", border: `2px solid ${day.brandDeep}` }}>
          <PotMark size={140} variant="glyph" dots={[{ scale: 1 }, { scale: 1.3 }, { scale: 0.7 }]} />
        </div>
      </div>
    </div>
    <div style={{ flex: 1, background: night.ground, padding: 80, display: "flex", flexDirection: "column", gap: 40 }}>
      <Lockup height={160} on="dark" />
      <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 120, color: night.ink, letterSpacing: "-0.02em", ...TABULAR }}>
        $366.00
      </div>
      <div style={{ background: day.brand, padding: 48, borderRadius: 24 }}>
        <Lockup height={120} on="marigold" />
      </div>
    </div>
  </AbsoluteFill>
);
