// AmountKeypad (apps/web/components/money/Keypad.tsx): 3 × 4 keys, 56 px tall, full-width columns with 8 px gaps,
// surface-sunken, radius-md, digits in Gabarito `title`; a pressed key is `line` + scale 0.97. AmountDisplay:
// the "How much?" label over the typed amount in balance-hero (title size past 7 characters).
import { Delete } from "lucide-react";
import React from "react";
import { interpolateColors } from "remotion";
import { keypadDisplay } from "../format";
import { useUi } from "../theme";
import { T } from "../type";

export const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"] as const;
export type KeyName = (typeof KEYS)[number];

export const Keypad: React.FC<{
  /** The key being pressed (shows the pressed state). */
  pressedKey?: KeyName | null;
  /** 0..1 press depth for `pressedKey` (default 1). */
  press?: number;
  keyHeight?: number;
  style?: React.CSSProperties;
}> = ({ pressedKey = null, press = 1, keyHeight = 56, style }) => {
  const { c } = useUi();
  return (
    <div data-ui="keypad" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, ...style }}>
      {KEYS.map((k) => {
        const p = k === pressedKey ? Math.max(0, Math.min(1, press)) : 0;
        return (
          <span
            key={k}
            style={{
              display: "grid",
              placeItems: "center",
              height: keyHeight,
              borderRadius: 16,
              background: p > 0 ? interpolateColors(p, [0, 1], [c.surfaceSunken, c.line]) : c.surfaceSunken,
              color: c.ink,
              transform: p > 0 ? `scale(${1 - 0.03 * p})` : undefined,
              ...T.title,
            }}
          >
            {k === "del" ? <Delete size={24} strokeWidth={2} style={{ display: "block" }} aria-hidden /> : k}
          </span>
        );
      })}
    </div>
  );
};

export const AmountDisplay: React.FC<{
  /** What was typed on the keypad: "", "8", "84", "84.5". */
  typed: string;
  label: string;
  /** Optional scale pop on the number (e.g. 1 → 1.04 → 1 per key press). */
  pop?: number;
  style?: React.CSSProperties;
}> = ({ typed, label, pop = 1, style }) => {
  const { c } = useUi();
  const shown = keypadDisplay(typed);
  const big = shown.length <= 7;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, ...style }}>
      <p style={{ margin: 0, ...T.bodySm, color: c.inkMuted }}>{label}</p>
      <p
        style={{
          margin: 0,
          ...(big ? T.hero : T.title),
          fontVariantNumeric: "tabular-nums",
          color: typed ? c.ink : c.inkMuted,
          transform: pop !== 1 ? `scale(${pop})` : undefined,
        }}
      >
        {shown}
      </p>
    </div>
  );
};
