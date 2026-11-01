// The app's toast (sonner, top-center: apps/web/components/ui/sonner.tsx): 356 px, surface, 1 px `line` border,
// radius-md, 16 px padding, Figtree 13/500, a filled check-circle in ink. E.g. "Added. Lisbon Trip now has $450.00."
import React from "react";
import { clamp01, easeEnter } from "../ease";
import { useUi } from "../theme";
import { SANS } from "../type";

export const Toast: React.FC<{
  text: string;
  /** 0..1 entrance (slides down 12 px + fades), like sonner. */
  progress?: number;
  /** Top offset inside the screen (defaults to safe area + 8). */
  top?: number;
  icon?: "success" | "none";
  style?: React.CSSProperties;
}> = ({ text, progress = 1, top, icon = "success", style }) => {
  const { c, safeTop, shadowCard } = useUi();
  const p = easeEnter(clamp01(progress));
  if (progress <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: top ?? safeTop + 8,
        width: 356,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: 16,
        borderRadius: 16,
        border: `1px solid ${c.line}`,
        background: c.surface,
        color: c.ink,
        boxShadow: shadowCard,
        fontFamily: SANS,
        fontSize: 13,
        lineHeight: 1.5,
        fontWeight: 500,
        zIndex: 70,
        opacity: p,
        transform: `translateX(-50%) translateY(${(1 - p) * -12}px)`,
        ...style,
      }}
    >
      {icon === "success" ? (
        <span style={{ display: "flex", width: 16, height: 16, alignItems: "center", marginLeft: -3, marginRight: 4, flexShrink: 0 }}>
          <svg viewBox="0 0 20 20" width={20} height={20} fill={c.ink} style={{ display: "block" }}>
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
            />
          </svg>
        </span>
      ) : null}
      <span>{text}</span>
    </div>
  );
};
