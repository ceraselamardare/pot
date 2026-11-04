// The compact list row (apps/web/components/pot/CompactRow.tsx, 2026-11-02), ≈ 70 px:
//   [40 px lead]  line 1: who · what (one line, truncates)              amount (signed, tabular)
//                 line 2: [status chip: icon + one word] marks …         time
// The lead is the person's avatar with a small round badge for the reason (ShoppingCart, Ticket…) or the kind
// (Plus = money added, ArrowDownLeft = paid in from outside, Gift, Link2 = sent by link).
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import React from "react";
import { copy } from "../copy";
import type { Person } from "../data";
import { useUi } from "../theme";
import { T } from "../type";
import { Avatar } from "./Avatar";

/** What the row sits on: the page's surface card, a sheet's sunken row, or the brand-soft tint. */
export type RowGround = "surface" | "sunken" | "tint";

/** The person's 40 px avatar with the reason's badge (20 px, 12 px icon, 2 px ring in the row's colour). */
export const LeadAvatar: React.FC<{ person: Person; badge?: LucideIcon; ground?: RowGround; style?: React.CSSProperties }> = ({
  person,
  badge: Badge,
  ground = "surface",
  style,
}) => {
  const { c } = useUi();
  const rowBg = ground === "surface" ? c.surface : ground === "sunken" ? c.surfaceSunken : c.brandSoft;
  return (
    <span style={{ position: "relative", flexShrink: 0, display: "block", ...style }}>
      <Avatar person={person} size="md" ring={ground === "tint" ? "brandSoft" : "none"} />
      {Badge ? (
        <span
          style={{
            position: "absolute",
            right: -4,
            bottom: -4,
            display: "grid",
            width: 20,
            height: 20,
            placeItems: "center",
            borderRadius: 999,
            background: ground === "surface" ? c.surfaceSunken : c.surface,
            color: c.ink,
            boxShadow: `0 0 0 2px ${rowBg}`,
          }}
        >
          <Badge size={12} strokeWidth={2} style={{ display: "block" }} aria-hidden />
        </span>
      ) : null}
    </span>
  );
};

/** Line 1: "Maya · Groceries" (the name a touch bolder). */
export const RowTitle: React.FC<{ who?: string; what: string }> = ({ who, what }) => (
  <>
    {who ? (
      <>
        <span style={{ fontWeight: 600 }}>{who}</span>
        <span> · </span>
      </>
    ) : null}
    {what}
  </>
);

/** The quiet "Receipt ↗" explorer link (ink-muted, body-sm, never a button). */
export const ReceiptLink: React.FC<{ style?: React.CSSProperties }> = ({ style }) => {
  const { c } = useUi();
  return (
    <span style={{ display: "inline-flex", minHeight: 24, alignItems: "center", gap: 2, ...T.bodySm, whiteSpace: "nowrap", color: c.inkMuted, ...style }}>
      {copy["receipt.link"]}
      <ArrowUpRight size={14} strokeWidth={2} style={{ display: "block" }} aria-hidden />
    </span>
  );
};

export const CompactRow: React.FC<{
  lead: React.ReactNode;
  /** line 1 (one line, truncates) */
  title: React.ReactNode;
  /** line 2, left: the status chip, marks, the receipt link */
  meta?: React.ReactNode;
  /** line 2, right: the time */
  aside?: React.ReactNode;
  amount?: React.ReactNode;
  ground?: RowGround;
  /** 0..1 press (the row opens its details): sunken fill + scale .99 */
  pressed?: number;
  style?: React.CSSProperties;
}> = ({ lead, title, meta, aside, amount, ground = "surface", pressed = 0, style }) => {
  const { c } = useUi();
  const bg = ground === "surface" ? c.surface : ground === "sunken" ? c.surfaceSunken : c.brandSoft;
  return (
    <div
      data-ui="compact-row"
      style={{
        display: "flex",
        width: "100%",
        boxSizing: "border-box",
        alignItems: "center",
        gap: 12,
        borderRadius: 16,
        // py-2.5 in the app; its rows measure 71 px at 3× (0.33 px more above line 1, 0.67 px more below line 2 than
        // the arithmetic 70: line-box rounding in the browser), calibrated here so the feed lines up 1:1
        padding: "10.33px 12px 10.67px",
        background: pressed > 0 && ground === "surface" ? c.surfaceSunken : bg,
        textAlign: "left",
        transform: pressed > 0 ? `scale(${1 - 0.01 * pressed})` : undefined,
        ...style,
      }}
    >
      {lead}
      <span style={{ display: "flex", minWidth: 0, flex: 1, flexDirection: "column", gap: 2 }}>
        <span style={{ display: "flex", minWidth: 0, alignItems: "baseline", gap: 12 }}>
          <span style={{ minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", ...T.body, color: c.ink }}>{title}</span>
          {amount ? <span style={{ flexShrink: 0 }}>{amount}</span> : null}
        </span>
        {meta || aside ? (
          <span
            style={{
              display: "flex",
              minHeight: 24,
              flexWrap: "wrap",
              alignItems: "center",
              columnGap: 8,
              rowGap: 4,
              ...T.bodySm,
              color: ground === "tint" ? c.ink : c.inkMuted,
            }}
          >
            {meta}
            {aside ? <span style={{ marginLeft: "auto", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{aside}</span> : null}
          </span>
        ) : null}
      </span>
    </div>
  );
};

/** A quiet centred event line ("Leo joined · Receipt ↗"). */
export const SystemLine: React.FC<{ icon: React.ReactNode; text: string; receipt?: boolean }> = ({ icon, text, receipt = true }) => {
  const { c } = useUi();
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "center",
        columnGap: 6,
        padding: "8px 12px",
        textAlign: "center",
        ...T.bodySm,
        color: c.inkMuted,
      }}
    >
      <span style={{ display: "block", flexShrink: 0 }}>{icon}</span>
      {text}
      {receipt ? (
        <>
          <span>·</span>
          <ReceiptLink />
        </>
      ) : null}
    </div>
  );
};
