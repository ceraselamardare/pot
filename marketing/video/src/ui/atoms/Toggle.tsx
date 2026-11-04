// The app's switch (CreatePotSheet Toggle, gifts/Switch): a 48 × 28 pill in `ink` when on, `line-strong` when off,
// with a 24 px `surface` knob; inside a 56 × 44 tap box. Never marigold. `on` may be fractional (0..1) to slide.
import React from "react";
import { interpolateColors } from "remotion";
import { clamp01, easeStandard } from "../ease";
import { useUi } from "../theme";

export const Toggle: React.FC<{ on?: boolean | number; style?: React.CSSProperties }> = ({ on = true, style }) => {
  const { c } = useUi();
  const t = easeStandard(clamp01(typeof on === "boolean" ? (on ? 1 : 0) : on));
  return (
    <span style={{ display: "grid", height: 44, width: 56, flexShrink: 0, placeItems: "center", ...style }}>
      <span style={{ position: "relative", height: 28, width: 48, borderRadius: 999, background: interpolateColors(t, [0, 1], [c.lineStrong, c.ink]) }}>
        <span
          style={{
            position: "absolute",
            top: 2,
            left: 2,
            width: 24,
            height: 24,
            borderRadius: 999,
            background: c.surface,
            boxShadow: "0 1px 3px rgba(43, 27, 58, 0.18), 0 1px 2px rgba(43, 27, 58, 0.12)",
            transform: `translateX(${20 * t}px)`,
          }}
        />
      </span>
    </span>
  );
};
