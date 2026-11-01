// StatusChip (apps/web/components/pot/StatusChip.tsx): status = icon + word + colour, a 28 px pill on
// surface-sunken, Figtree 14/600. approved/sent = check, needs = clock (waiting), declined/failed = x,
// sending = send (ink-muted), expired = hourglass (ink-muted).
import { Check, Clock, Hourglass, Send, X, type LucideIcon } from "lucide-react";
import React from "react";
import { copy } from "../copy";
import { useUi, type Palette } from "../theme";
import { T } from "../type";

export type ChipStatus = "sending" | "sent" | "approved" | "needs" | "declined" | "expired" | "failed";

const META: Record<ChipStatus, { icon: LucideIcon; color: keyof Palette; word: string }> = {
  sending: { icon: Send, color: "inkMuted", word: copy["chip.sending"] },
  sent: { icon: Check, color: "approved", word: copy["chip.sent"] },
  approved: { icon: Check, color: "approved", word: copy["chip.approved"] },
  needs: { icon: Clock, color: "waiting", word: copy["chip.needs"] },
  declined: { icon: X, color: "declined", word: copy["chip.declined"] },
  expired: { icon: Hourglass, color: "inkMuted", word: copy["chip.expired"] },
  failed: { icon: X, color: "declined", word: copy["chip.failed"] },
};

export const StatusChip: React.FC<{
  status: ChipStatus;
  /** A more specific word, e.g. "1 of 2 approvals" for `needs`. */
  children?: React.ReactNode;
  /** Drop the pill background (the RequestCard's inline status). */
  bare?: boolean;
  style?: React.CSSProperties;
}> = ({ status, children, bare, style }) => {
  const { c } = useUi();
  const m = META[status];
  const Icon = m.icon;
  return (
    <span
      style={{
        boxSizing: "border-box",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        height: 28,
        flexShrink: 0,
        padding: bare ? 0 : "0 10px 0 8px",
        borderRadius: 999,
        background: bare ? "transparent" : c.surfaceSunken,
        color: c[m.color],
        whiteSpace: "nowrap",
        ...T.bodySm,
        fontWeight: 600,
        ...style,
      }}
    >
      <Icon size={16} strokeWidth={2} style={{ display: "block", flexShrink: 0 }} aria-hidden />
      <span>{children ?? m.word}</span>
    </span>
  );
};
