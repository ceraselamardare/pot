// Frame-driven list insert (the app's 280 ms `pot-enter`: fade + 6 px drop), plus a height collapse so the items
// below make room smoothly (CSS grid 0fr → 1fr, which sizes to a fraction of the content height).
import React from "react";
import { clamp01, easeEnter, easeStandard } from "../ease";

export const Appear: React.FC<{
  /** 0 = collapsed and invisible, 1 = in place. */
  appear?: number;
  /** Space above the item when fully in (collapses with it). */
  gap?: number;
  /** "drop" (feed: from 6 px above), "rise" (chat: from below, with a slight scale), "fade". */
  from?: "drop" | "rise" | "fade";
  /** Transform origin for "rise" (e.g. "bottom left" for an incoming bubble). */
  origin?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ appear = 1, gap = 0, from = "drop", origin = "center", style, children }) => {
  const a = clamp01(appear);
  if (a >= 1) return <div style={{ marginTop: gap, ...style }}>{children}</div>;
  const h = easeStandard(clamp01(a / 0.6));
  const o = easeEnter(clamp01((a - 0.2) / 0.8));
  const transform =
    from === "drop" ? `translateY(${(1 - o) * -6}px)` : from === "rise" ? `translateY(${(1 - o) * 14}px) scale(${0.86 + 0.14 * o})` : undefined;
  return (
    <div style={{ display: "grid", gridTemplateRows: `${h}fr`, marginTop: gap * h, ...style }}>
      {/* "rise" anchors the content to the bottom (it grows up from the list's end, like a new chat bubble) */}
      <div style={{ minHeight: 0, overflow: "hidden", ...(from === "rise" ? { display: "flex", flexDirection: "column", justifyContent: "flex-end" } : null) }}>
        <div style={{ opacity: o, transform, transformOrigin: origin, flexShrink: 0 }}>{children}</div>
      </div>
    </div>
  );
};
