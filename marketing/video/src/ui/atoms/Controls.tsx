// Small brand controls (apps/web/components/pot/Controls.tsx):
//  - Chip: selectable chip, 48 px, radius-sm (pill for amount chips), selected = brand-soft + brand-deep edge + check
//    (never marigold);
//  - Segmented: pill track on surface-sunken, the selected segment is surface with a soft shadow;
//  - Tabs: the Pot's Activity · Members · Rules tablist (sliding surface indicator, 52 px).
import { Check } from "lucide-react";
import React from "react";
import { interpolateColors } from "remotion";
import { copy } from "../copy";
import { clamp01 } from "../ease";
import { useUi } from "../theme";
import { T } from "../type";

const SEG_SHADOW = "0 1px 2px rgba(43, 27, 58, 0.12)";

export const Chip: React.FC<{
  selected?: boolean | number;
  children: React.ReactNode;
  /** Amount chips in Add money are pills. */
  pill?: boolean;
  /** 0..1 press (scale 0.97). */
  pressed?: number;
  style?: React.CSSProperties;
}> = ({ selected = false, children, pill, pressed = 0, style }) => {
  const { c } = useUi();
  const s = typeof selected === "boolean" ? (selected ? 1 : 0) : clamp01(selected);
  return (
    <span
      style={{
        boxSizing: "border-box",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        flexShrink: 0,
        height: 48,
        padding: "0 14px",
        borderRadius: pill ? 999 : 10,
        border: `1px solid ${interpolateColors(s, [0, 1], [c.lineStrong, c.brandDeep])}`,
        // pressed: an unselected chip goes surface-sunken (its hover/active state in the app)
        background: interpolateColors(s, [0, 1], [pressed > 0 ? interpolateColors(clamp01(pressed), [0, 1], [c.surface, c.surfaceSunken]) : c.surface, c.brandSoft]),
        color: c.ink,
        whiteSpace: "nowrap",
        transform: pressed > 0 ? `scale(${1 - 0.03 * clamp01(pressed)})` : undefined,
        ...T.label,
        ...style,
      }}
    >
      {s > 0 ? (
        <span style={{ display: "block", width: 16 * Math.min(1, s * 2), overflow: "hidden", flexShrink: 0 }}>
          <Check size={16} strokeWidth={2} style={{ display: "block", opacity: s }} aria-hidden />
        </span>
      ) : null}
      {children}
    </span>
  );
};

export const Segmented: React.FC<{
  options: string[];
  /** Selected index (fractional values slide the highlight). */
  index?: number;
  style?: React.CSSProperties;
}> = ({ options, index = 0, style }) => {
  const { c } = useUi();
  const n = options.length;
  return (
    <div style={{ position: "relative", display: "flex", borderRadius: 999, background: c.surfaceSunken, padding: 4, ...style }}>
      <span
        style={{
          position: "absolute",
          top: 4,
          bottom: 4,
          left: 4,
          width: `calc((100% - 8px) / ${n})`,
          borderRadius: 999,
          background: c.surface,
          boxShadow: SEG_SHADOW,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {options.map((o, i) => {
        const on = 1 - clamp01(Math.abs(i - index));
        return (
          <span
            key={o}
            style={{
              position: "relative",
              flex: 1,
              minWidth: 0,
              minHeight: 44,
              display: "grid",
              placeItems: "center",
              padding: "0 8px",
              borderRadius: 999,
              color: interpolateColors(on, [0, 1], [c.inkMuted, c.ink]),
              ...T.label,
            }}
          >
            {o}
          </span>
        );
      })}
    </div>
  );
};

export type PotTab = "activity" | "members" | "rules";
export const POT_TABS: PotTab[] = ["activity", "members", "rules"];

/** Activity · Members · Rules. `active` or a fractional `index` (0 = Activity … 2 = Rules) to slide. */
export const Tabs: React.FC<{ active?: PotTab; index?: number; labels?: [string, string, string]; style?: React.CSSProperties }> = ({
  active = "activity",
  index,
  labels = [copy["pot.tabs.activity"], copy["pot.tabs.members"], copy["pot.tabs.rules"]],
  style,
}) => {
  const { c } = useUi();
  const idx = index ?? POT_TABS.indexOf(active);
  return (
    <div style={{ position: "relative", display: "flex", borderRadius: 999, background: c.surfaceSunken, padding: 4, ...style }}>
      <span
        style={{
          position: "absolute",
          top: 4,
          bottom: 4,
          left: 4,
          width: "calc((100% - 8px) / 3)",
          borderRadius: 999,
          background: c.surface,
          boxShadow: SEG_SHADOW,
          transform: `translateX(${idx * 100}%)`,
        }}
      />
      {labels.map((l, i) => {
        const on = 1 - clamp01(Math.abs(i - idx));
        return (
          <span
            key={l}
            style={{
              position: "relative",
              zIndex: 1,
              flex: 1,
              minWidth: 0,
              height: 44,
              display: "grid",
              placeItems: "center",
              padding: "0 8px",
              borderRadius: 999,
              color: interpolateColors(on, [0, 1], [c.inkMuted, c.ink]),
              whiteSpace: "nowrap",
              ...T.label,
            }}
          >
            {l}
          </span>
        );
      })}
    </div>
  );
};
