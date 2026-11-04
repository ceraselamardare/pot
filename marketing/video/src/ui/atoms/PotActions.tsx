// The Pot's action row (apps/web/components/pot/PotActions.tsx, 2026-11-03): four round 56 px buttons with a label
// under each, an even 4-up grid (4 px gaps) right under the balance:
//   Add money (the screen's ONE marigold circle: eggplant icon, 1 px brand-deep edge in Day) · Spend · Ask · More
// (surface-sunken circles, ink icons). Pressed: marigold → brand-deep, neutral → `line`, both at scale 0.94.
import { ArrowUpRight, Ellipsis, HandCoins, Plus, type LucideIcon } from "lucide-react";
import React from "react";
import { interpolateColors } from "remotion";
import { copy } from "../copy";
import { clamp01 } from "../ease";
import { useUi } from "../theme";
import { T } from "../type";
import { TouchDot } from "./Touch";

export type PotActionKey = "add" | "spend" | "ask" | "more";

export const POT_ACTIONS: { key: PotActionKey; label: string; Icon: LucideIcon }[] = [
  { key: "add", label: copy["pot.cta.add"], Icon: Plus },
  { key: "spend", label: copy["pot.cta.spend"], Icon: ArrowUpRight },
  { key: "ask", label: copy["pot.action.ask"], Icon: HandCoins },
  { key: "more", label: copy["pot.action.more"], Icon: Ellipsis },
];

export const PotActions: React.FC<{
  /** Which circle is under the finger and how far it's pressed (0..1). */
  press?: { target: PotActionKey; amount?: number } | null;
  /** Add money gives up the marigold while another card holds it (an arrived deposit). */
  addVariant?: "primary" | "secondary";
  /** Actions that can't run now (closing, the goal lock): half opacity. */
  dim?: Partial<Record<PotActionKey, boolean>>;
  /** Show the 44 px touch dot centred on the pressed circle. */
  touchDot?: boolean;
  style?: React.CSSProperties;
}> = ({ press = null, addVariant = "primary", dim, touchDot, style }) => {
  const { c, brandBorder } = useUi();
  return (
    <div data-ui="pot-actions" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 4, ...style }}>
      {POT_ACTIONS.map(({ key, label, Icon }) => {
        const p = press?.target === key ? clamp01(press.amount ?? 1) : 0;
        const marigold = key === "add" && addVariant === "primary";
        const bg = marigold
          ? interpolateColors(p, [0, 1], [c.brand, c.brandDeep])
          : p > 0
            ? interpolateColors(p, [0, 1], [c.surfaceSunken, c.line])
            : c.surfaceSunken;
        return (
          <div
            key={key}
            style={{
              display: "flex",
              minWidth: 0,
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
              textAlign: "center",
              opacity: dim?.[key] ? 0.5 : 1,
            }}
          >
            <span
              style={{
                position: "relative",
                boxSizing: "border-box",
                display: "grid",
                width: 56,
                height: 56,
                flexShrink: 0,
                placeItems: "center",
                borderRadius: 999,
                border: `1px solid ${marigold ? brandBorder : "transparent"}`,
                background: bg,
                backgroundClip: "padding-box",
                color: marigold ? c.onBrand : c.ink,
                transform: p > 0 ? `scale(${1 - 0.06 * p})` : undefined,
              }}
            >
              <Icon size={24} strokeWidth={2} style={{ display: "block" }} aria-hidden />
              {touchDot && p > 0 ? <TouchDot press={p} inside /> : null}
            </span>
            <span style={{ ...T.bodySm, color: c.ink, overflowWrap: "break-word" }}>{label}</span>
          </div>
        );
      })}
    </div>
  );
};
