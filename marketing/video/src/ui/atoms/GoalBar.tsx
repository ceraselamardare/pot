// GoalBar (apps/web/components/pot/GoalBar.tsx): `brand` fill with a 1 px `brand-deep` inset edge on a
// `brand-soft` pill track, ALWAYS with its text twin ("$300 of $450 collected").
import React from "react";
import { copy } from "../copy";
import { formatUsd } from "../format";
import { useUi } from "../theme";
import { T } from "../type";

export const GoalBar: React.FC<{
  /** Dollars collected so far (drives the text twin, and the bar unless `progress` is set). */
  collected: number;
  goal: number;
  /** 0..1 override for the bar fill (e.g. a smooth fill while the text shows whole dollars). */
  progress?: number;
  size?: "sm" | "md";
  /** Override the text twin. `false` hides it (only for break-out shots; the app never hides it). */
  text?: string | false;
  style?: React.CSSProperties;
}> = ({ collected, goal, progress, size = "md", text, style }) => {
  const { c } = useUi();
  const p = Math.max(0, Math.min(1, progress ?? (goal > 0 ? collected / goal : 0)));
  const label = text ?? copy["pot.goal"](formatUsd(collected, "whole"), formatUsd(goal, "whole"));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, ...style }}>
      <div style={{ width: "100%", height: size === "sm" ? 6 : 10, borderRadius: 999, background: c.brandSoft, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${p * 100}%`,
            minWidth: p > 0 ? 10 : 0,
            borderRadius: 999,
            background: c.brand,
            boxShadow: `inset 0 0 0 1px ${c.brandDeep}`,
          }}
        />
      </div>
      {label !== false ? <p style={{ margin: 0, ...T.bodySm, color: c.inkMuted, fontVariantNumeric: "tabular-nums" }}>{label}</p> : null}
    </div>
  );
};
