// A placeholder 390×844 phone for motion demos only (scenes use src/ui/Phone).
import React from "react";
import { day } from "../../brand/tokens";
import { DISPLAY, SANS, TABULAR } from "../../brand/fonts";
import { depthShadow } from "../color";

export const PHONE_W = 390;
export const PHONE_H = 844;

export const DummyCard: React.FC<{ title: string; line: string; tone?: string; style?: React.CSSProperties }> = ({ title, line, tone = day.brandSoft, style }) => (
  <div
    style={{
      width: 342,
      background: tone,
      borderRadius: 24,
      padding: "20px 22px",
      boxSizing: "border-box",
      fontFamily: SANS,
      color: day.ink,
      ...style,
    }}
  >
    <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 22 }}>{title}</div>
    <div style={{ fontSize: 16, color: day.inkMuted, marginTop: 6 }}>{line}</div>
  </div>
);

export const PhoneDummy: React.FC<{ hideCard?: boolean; balance?: React.ReactNode }> = ({ hideCard, balance }) => (
  <div
    style={{
      width: PHONE_W,
      height: PHONE_H,
      borderRadius: 56,
      background: day.ink,
      padding: 12,
      boxSizing: "border-box",
      boxShadow: depthShadow(60),
    }}
  >
    <div style={{ width: "100%", height: "100%", borderRadius: 44, background: day.ground, overflow: "hidden", position: "relative" }}>
      <div style={{ padding: "64px 24px 0", fontFamily: SANS, color: day.inkMuted, fontSize: 15 }}>Lisbon Trip 🇵🇹</div>
      <div style={{ padding: "6px 24px 0", fontFamily: DISPLAY, fontWeight: 800, fontSize: 44, color: day.ink, letterSpacing: "-0.02em", ...TABULAR }}>
        {balance ?? "$450.00"}
      </div>
      <div style={{ margin: "18px 24px 0", height: 10, borderRadius: 999, background: day.brandSoft }}>
        <div style={{ width: "100%", height: "100%", borderRadius: 999, background: day.brand }} />
      </div>
      <div style={{ padding: "8px 24px 0", fontFamily: SANS, fontSize: 14, color: day.inkMuted }}>$450 of $450 collected</div>
      <div style={{ padding: "28px 24px 0", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ opacity: hideCard ? 0 : 1 }}>
          <DummyCard title="Approved by Pot rules" line="$84 sent to you" />
        </div>
        <DummyCard title="Groceries 🛒" line="Maya · −$84.00" tone={day.surface} />
        <DummyCard title="Maya added $150" line="+$150.00" tone={day.surface} />
      </div>
    </div>
  </div>
);
