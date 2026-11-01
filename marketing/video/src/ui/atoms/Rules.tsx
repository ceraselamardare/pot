// Rules (apps/web/components/pot/Tabs.tsx RulesTab): GoHenry-style rows, a 24 px Lucide icon + the rule as a
// sentence on surface, radius-md, 16 px padding. The per-person meter is ink on surface-sunken (never marigold).
import { Hourglass, UserCheck, UserRound, Users, Zap, type LucideIcon } from "lucide-react";
import React from "react";
import { copy } from "../copy";
import { formatUsd } from "../format";
import { useUi } from "../theme";
import { T } from "../type";

export const RuleRow: React.FC<{
  icon: LucideIcon;
  text: string;
  /** Optional meter under the text (0..1) with its caption ("You've used $0 of it."). */
  meter?: { progress: number; caption: string };
  /** Highlight (e.g. while a scene points at this rule): blends the row to brand-soft. */
  highlight?: boolean;
  style?: React.CSSProperties;
}> = ({ icon: Icon, text, meter, highlight, style }) => {
  const { c } = useUi();
  return (
    <div data-ui="rule-row" style={{ display: "flex", gap: 12, borderRadius: 16, background: highlight ? c.brandSoft : c.surface, padding: 16, ...style }}>
      <Icon size={24} strokeWidth={2} color={c.ink} style={{ display: "block", flexShrink: 0, marginTop: 2 }} aria-hidden />
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ margin: 0, ...T.body, color: c.ink, fontVariantNumeric: "tabular-nums" }}>{text}</p>
        {meter ? (
          <div style={{ marginTop: 12 }}>
            <div style={{ height: 6, overflow: "hidden", borderRadius: 999, background: c.surfaceSunken }}>
              <div style={{ height: "100%", width: `${Math.max(0, Math.min(1, meter.progress)) * 100}%`, borderRadius: 999, background: c.ink }} />
            </div>
            <p style={{ margin: "6px 0 0", ...T.bodySm, color: c.inkMuted }}>{meter.caption}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export type RuleKey = "instant" | "threshold" | "budget" | "recipients" | "expiry";

/** The Trip rules as the Rules tab lists them (zap / users / user-round / user-check / hourglass). */
export function tripRules(opts?: { instantLimit?: number; k?: number; n?: number; memberBudget?: number; used?: number; expiryDays?: number }) {
  const { instantLimit = 100, k = 2, n = 3, memberBudget = 200, used = 0, expiryDays = 7 } = opts ?? {};
  return [
    { key: "instant" as const, icon: Zap, text: copy["rules.instant"](formatUsd(instantLimit, "whole")) },
    { key: "threshold" as const, icon: Users, text: copy["rules.threshold"](k, n) },
    {
      key: "budget" as const,
      icon: UserRound,
      text: copy["rules.budget"](formatUsd(memberBudget, "whole")),
      meter: { progress: memberBudget > 0 ? used / memberBudget : 0, caption: copy["rules.budget.used"](formatUsd(used, "whole")) },
    },
    { key: "recipients" as const, icon: UserCheck, text: copy["rules.recipients"] },
    { key: "expiry" as const, icon: Hourglass, text: copy["rules.expiry"](expiryDays) },
  ];
}
