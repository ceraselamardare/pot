// Button (apps/web/components/ui/button.tsx): rounded-md, 1 px border, Figtree label 15/600, 20 px icons, 8 px gap.
//  - primary: the ONE marigold button per screen, eggplant `on-brand` text, 1 px brand-deep border in Day (none in
//    Night, padding-box fill), brand-deep when pressed; 52 px.
//  - secondary: surface fill (transparent in Night), line-strong border, ink text; 48 px (52 in the Pot hero).
//  - ghost: no border, ink text; 48 px.
// `pressed` (0..1 or boolean) blends to the pressed colour and scales to 0.97, like :active (drive it with
// pressAt(): in over 4-6 f, out over 10-12 f). `touchDot` adds the 44 px finger dot while pressed.
import type { LucideIcon } from "lucide-react";
import React from "react";
import { interpolateColors } from "remotion";
import { useUi } from "../theme";
import { T } from "../type";
import { TouchDot } from "./Touch";

export type ButtonVariant = "primary" | "secondary" | "ghost";

export const Button: React.FC<{
  variant?: ButtonVariant;
  children: React.ReactNode;
  icon?: LucideIcon;
  /** Custom leading element (e.g. <GoogleMark />). */
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  pressed?: number | boolean;
  /** The Spend/Add sheets' empty-amount style: surface-sunken fill, ink-muted text, no border. */
  disabled?: boolean;
  height?: number;
  fullWidth?: boolean;
  /** Dims the button like the app's aria-disabled (opacity 50 %). */
  dim?: boolean;
  /** Show the touch dot while pressed: true = centred, or {x, y} in px from the button's top-left. */
  touchDot?: boolean | { x: number; y: number };
  style?: React.CSSProperties;
  labelStyle?: React.CSSProperties;
  /** A data-ui marker for measuring (preview/Measure.tsx). */
  dataUi?: string;
}> = ({ variant = "secondary", children, icon: Icon, leading, trailing, pressed = 0, disabled, height, fullWidth, dim, touchDot, style, labelStyle, dataUi }) => {
  const { c, brandBorder, secondaryBg } = useUi();
  const p = typeof pressed === "boolean" ? (pressed ? 1 : 0) : Math.max(0, Math.min(1, pressed));
  let bg: string;
  let border: string;
  let color: string;
  if (disabled) {
    bg = c.surfaceSunken;
    border = "transparent";
    color = c.inkMuted;
  } else if (variant === "primary") {
    bg = interpolateColors(p, [0, 1], [c.brand, c.brandDeep]);
    border = brandBorder;
    color = c.onBrand;
  } else if (variant === "secondary") {
    bg = p > 0 ? interpolateColors(p, [0, 1], [secondaryBg === "transparent" ? c.surface : secondaryBg, c.surfaceSunken]) : secondaryBg;
    border = c.lineStrong;
    color = c.ink;
  } else {
    bg = p > 0 ? interpolateColors(p, [0, 1], [c.surface, c.surfaceSunken]) : "transparent";
    border = "transparent";
    color = c.ink;
  }
  const h = height ?? (variant === "primary" ? 52 : 48);
  return (
    <span
      data-ui={dataUi}
      style={{
        position: "relative",
        boxSizing: "border-box",
        display: fullWidth ? "flex" : "inline-flex",
        width: fullWidth ? "100%" : undefined,
        flexShrink: 0,
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        minHeight: h,
        padding: `8px ${variant === "primary" ? 24 : 20}px`,
        borderRadius: 16,
        border: `1px solid ${border}`,
        background: bg,
        backgroundClip: "padding-box",
        color,
        textAlign: "center",
        transform: p > 0 ? `scale(${1 - 0.03 * p})` : undefined,
        opacity: dim ? 0.5 : 1,
        userSelect: "none",
        ...style,
      }}
    >
      {leading}
      {Icon ? <Icon size={20} strokeWidth={2} style={{ display: "block", flexShrink: 0 }} aria-hidden /> : null}
      <span style={{ ...T.label, ...labelStyle }}>{children}</span>
      {trailing}
      {touchDot && p > 0 ? (
        typeof touchDot === "object" ? <TouchDot press={p} x={touchDot.x} y={touchDot.y} /> : <TouchDot press={p} inside />
      ) : null}
    </span>
  );
};
