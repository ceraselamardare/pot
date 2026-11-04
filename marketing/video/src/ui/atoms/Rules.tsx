// Rules (apps/web/components/pot/Tabs.tsx RulesSection, the first section of the Settings tab): GoHenry-style rows,
// a 24 px Lucide icon + the rule as a sentence on surface, radius-md, 16 px padding. The per-person meter is ink on
// surface-sunken (never marigold). A new Pot's rules (hub 1.1.0 defaults): instant $100 · trust grows · one OK up to
// $300 · bigger spends 2 of 3 · $200 per person · members only · 7 days · leftovers · 40 people · send by link on.
import { Hand, Hourglass, Link2, Sprout, Undo2, UserCheck, UserRound, Users, UsersRound, Zap, type LucideIcon } from "lucide-react";
import React from "react";
import { interpolateColors } from "remotion";
import { copy } from "../copy";
import { LISBON } from "../data";
import { formatUsd } from "../format";
import { clamp01 } from "../ease";
import { useUi } from "../theme";
import { T } from "../type";

export const RuleRow: React.FC<{
  icon: LucideIcon;
  text: string;
  /** Optional meter under the text (0..1) with its caption ("You've used $0 of it."). */
  meter?: { progress: number; caption: string };
  /** Highlight (a scene points at this rule): blends the row to brand-soft (boolean or 0..1). */
  highlight?: boolean | number;
  style?: React.CSSProperties;
}> = ({ icon: Icon, text, meter, highlight, style }) => {
  const { c } = useUi();
  const h = typeof highlight === "number" ? clamp01(highlight) : highlight ? 1 : 0;
  return (
    <div
      data-ui="rule-row"
      style={{ display: "flex", gap: 12, borderRadius: 16, background: h > 0 ? interpolateColors(h, [0, 1], [c.surface, c.brandSoft]) : c.surface, padding: 16, ...style }}
    >
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

export type RuleKey = "instant" | "trust" | "oneOk" | "threshold" | "budget" | "recipients" | "expiry" | "leftovers" | "size" | "links";

export type RuleOpts = {
  instantLimit?: number;
  oneOkCap?: number;
  trust?: boolean;
  k?: number;
  n?: number;
  memberBudget?: number;
  used?: number;
  expiryDays?: number;
  links?: boolean;
  maxMembers?: number;
};

export type RuleLine = { key: RuleKey; icon: LucideIcon; text: string; meter?: { progress: number; caption: string } };

/** The Settings tab's rule list for a Pot made today (one OK and trust on by default). */
export function potRules(opts?: RuleOpts): RuleLine[] {
  const {
    instantLimit = LISBON.instantLimit,
    oneOkCap = LISBON.oneOkCap,
    trust = true,
    k = LISBON.k,
    n = LISBON.n,
    memberBudget = LISBON.memberBudget,
    used = 0,
    expiryDays = LISBON.expiryDays,
    links = true,
    maxMembers = LISBON.maxMembers,
  } = opts ?? {};
  const w = (x: number) => formatUsd(x, "whole");
  return [
    { key: "instant", icon: Zap, text: copy["rules.instant"](w(instantLimit)) },
    ...(trust ? [{ key: "trust" as const, icon: Sprout, text: copy["rules.trust"](LISBON.trustStep, w(instantLimit), w(instantLimit * 3)) }] : []),
    ...(oneOkCap > 0 ? [{ key: "oneOk" as const, icon: Hand, text: copy["rules.one_ok"](w(oneOkCap)) }] : []),
    { key: "threshold", icon: Users, text: copy["rules.threshold"](k, n) },
    {
      key: "budget",
      icon: UserRound,
      text: copy["rules.budget"](w(memberBudget)),
      meter: { progress: memberBudget > 0 ? used / memberBudget : 0, caption: copy["rules.budget.used"](w(used)) },
    },
    { key: "recipients", icon: UserCheck, text: copy["rules.recipients"] },
    { key: "expiry", icon: Hourglass, text: copy["rules.expiry"](expiryDays) },
    { key: "leftovers", icon: Undo2, text: copy["rules.leftovers"] },
    { key: "size", icon: UsersRound, text: copy["rules.size"](maxMembers) },
    { key: "links", icon: Link2, text: links ? copy["rules.links.on"] : copy["rules.links.off"] },
  ];
}

/** The three spend tiers of today's rules, in order: zap $100 instant · hand one OK up to $300 · users the group. */
export function ruleTiers(opts?: RuleOpts): RuleLine[] {
  const all = potRules(opts);
  return (["instant", "oneOk", "threshold"] as const).map((k) => all.find((r) => r.key === k)!).filter(Boolean);
}

/** LEGACY (Oct 22 Rules tab order): instant · 2 of 3 · per person · members · expiry. Prefer potRules() / ruleTiers(). */
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
