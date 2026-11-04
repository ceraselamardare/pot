// StatusChip (apps/web/components/pot/StatusChip.tsx): status = icon + word + colour, a pill on surface-sunken,
// Figtree 14/600. approved/sent = check, instant = zap (approved by the Pot's rules), needs = clock (waiting),
// declined/failed = x, sending = send (ink-muted), expired = hourglass (ink-muted), cancelled = ban (ink-muted).
// `size="sm"` is the compact row's chip (24 px, 14 px icon); `ground="surface"` puts the pill on surface (rows that
// are themselves sunken or tinted). Plus the pay-in chips (GiftRow): "From outside" (arrow-down-left) and "Gift",
// both ink: they are not statuses.
import { ArrowDownLeft, Ban, Check, Clock, Gift, Hourglass, Send, X, Zap, type LucideIcon } from "lucide-react";
import React from "react";
import { copy } from "../copy";
import { useUi, type Palette } from "../theme";
import { T } from "../type";

export type ChipStatus = "sending" | "sent" | "approved" | "instant" | "needs" | "declined" | "expired" | "failed" | "cancelled" | "outside" | "gift";

const META: Record<ChipStatus, { icon: LucideIcon; color: keyof Palette; word: string }> = {
  sending: { icon: Send, color: "inkMuted", word: copy["chip.sending"] },
  sent: { icon: Check, color: "approved", word: copy["chip.sent"] },
  approved: { icon: Check, color: "approved", word: copy["chip.approved"] },
  instant: { icon: Zap, color: "approved", word: copy["chip.instant"] },
  needs: { icon: Clock, color: "waiting", word: copy["chip.needs"] },
  declined: { icon: X, color: "declined", word: copy["chip.declined"] },
  expired: { icon: Hourglass, color: "inkMuted", word: copy["chip.expired"] },
  failed: { icon: X, color: "declined", word: copy["chip.failed"] },
  cancelled: { icon: Ban, color: "inkMuted", word: "Cancelled" },
  outside: { icon: ArrowDownLeft, color: "ink", word: copy["chip.outside"] },
  gift: { icon: Gift, color: "ink", word: copy["chip.gift"] },
};

export const StatusChip: React.FC<{
  status: ChipStatus;
  /** A more specific word, e.g. "Needs one OK" for `needs`. */
  children?: React.ReactNode;
  /** "md" 28 px (sheets, cards) or "sm" 24 px (compact rows). */
  size?: "md" | "sm";
  /** The pill's fill: surface-sunken (default) or surface (on a sunken/tinted row). */
  ground?: "sunken" | "surface";
  /** Drop the pill background (an inline status). */
  bare?: boolean;
  style?: React.CSSProperties;
}> = ({ status, children, size = "md", ground = "sunken", bare, style }) => {
  const { c } = useUi();
  const m = META[status];
  const Icon = m.icon;
  const sm = size === "sm";
  return (
    <span
      style={{
        boxSizing: "border-box",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        height: sm ? 24 : 28,
        flexShrink: 0,
        padding: bare ? 0 : sm ? "0 8px 0 6px" : "0 10px 0 8px",
        borderRadius: 999,
        background: bare ? "transparent" : ground === "surface" ? c.surface : c.surfaceSunken,
        color: c[m.color],
        whiteSpace: "nowrap",
        ...T.bodySm,
        fontWeight: 600,
        ...style,
      }}
    >
      <Icon size={sm ? 14 : 16} strokeWidth={2} style={{ display: "block", flexShrink: 0 }} aria-hidden />
      <span>{children ?? m.word}</span>
    </span>
  );
};
