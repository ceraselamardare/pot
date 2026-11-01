import React from "react";
import { AbsoluteFill } from "remotion";
import { GlyphParts, PotMark } from "../../../brand/Logo";
import { day } from "../../../brand/tokens";

export const GlyphTest: React.FC = () => (
  <AbsoluteFill style={{ background: day.brand, flexDirection: "row", alignItems: "center", justifyContent: "space-around" }}>
    <PotMark size={500} variant="glyph" />
    <GlyphParts size={500} />
    <GlyphParts size={500} lid={{ dy: -120, rot: -8 }} handles={[{ dx: 40, opacity: 0.5 }, { dx: 40 }]} iris={150} dots={[{ scale: 1.2 }, {}, { scale: 0.6 }]} />
  </AbsoluteFill>
);
