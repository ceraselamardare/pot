// The Spend sheet's decision line (apps/web/components/sheets/RulePreview.tsx DecisionLine, 2026-11-01): one line on
// surface-sunken, icon + the decision ("This will be approved instantly", "This needs one OK from anyone else"), and
// the why (the limit, what you'd get back) behind an ⓘ. Paths follow the Pot's three tiers:
//   empty   → "Anyone can spend up to $100 without asking." (quiet, no icon)
//   instant → ✓ (approved) "This will be approved instantly" · Anyone can spend up to $100 without asking.
//   one_ok  → ✋ (waiting) "This needs one OK from anyone else" · It's over your $100 instant limit.
//   group   → ⏱ (waiting) "This needs 2 of 3 approvals" · It's over the $100 instant limit.
import { Check, Clock, Hand, Info } from "lucide-react";
import React from "react";
import { copy } from "../copy";
import { LISBON } from "../data";
import { formatUsd } from "../format";
import { useUi } from "../theme";
import { T } from "../type";

export type DecisionPath = "empty" | "instant" | "one_ok" | "group";

/** The tier a spend falls in under the Pot's rules (instant ≤ $100 < one OK ≤ $300 < the group). */
export function decisionPath(amount: number, opts?: { instantLimit?: number; oneOkCap?: number }): DecisionPath {
  const instant = opts?.instantLimit ?? LISBON.instantLimit;
  const oneOk = opts?.oneOkCap ?? LISBON.oneOkCap;
  if (amount <= 0) return "empty";
  if (amount <= instant) return "instant";
  if (oneOk > 0 && amount <= oneOk) return "one_ok";
  return "group";
}

export function decisionCopy(path: DecisionPath, opts?: { instantLimit?: number; k?: number; n?: number }): [string, string | null] {
  const limit = formatUsd(opts?.instantLimit ?? LISBON.instantLimit, "whole");
  switch (path) {
    case "empty":
      return [copy["preview.empty"](limit), null];
    case "instant":
      return copy["preview.instant"](limit);
    case "one_ok":
      return copy["preview.one_ok.over_cap"](limit);
    case "group":
      return copy["preview.vote.over_cap"](opts?.k ?? LISBON.k, opts?.n ?? LISBON.n, limit);
  }
}

export const DecisionLine: React.FC<{
  path: DecisionPath;
  instantLimit?: number;
  k?: number;
  n?: number;
  /** Extra lines for the ⓘ panel (the app's "Once it's paid, you'd get back $122 …"). */
  details?: string[];
  /** Show the ⓘ panel open (0..1 reveals it). */
  open?: number;
  style?: React.CSSProperties;
}> = ({ path, instantLimit, k, n, details = [], open = 0, style }) => {
  const { c } = useUi();
  const [title, body] = decisionCopy(path, { instantLimit, k, n });
  const more = [...(body ? [body] : []), ...details];
  const icon =
    path === "instant" ? (
      <Check size={20} strokeWidth={2} color={c.approved} style={{ display: "block" }} aria-hidden />
    ) : path === "one_ok" ? (
      <Hand size={20} strokeWidth={2} color={c.waiting} style={{ display: "block" }} aria-hidden />
    ) : path === "group" ? (
      <Clock size={20} strokeWidth={2} color={c.waiting} style={{ display: "block" }} aria-hidden />
    ) : null;
  return (
    <div data-ui="decision" style={{ borderRadius: 16, background: c.surfaceSunken, ...style }}>
      <div style={{ display: "flex", minHeight: 48, boxSizing: "border-box", alignItems: "center", gap: 10, padding: `4px ${more.length ? 2 : 12}px 4px 12px` }}>
        {icon ? <span style={{ flexShrink: 0 }}>{icon}</span> : null}
        <p style={{ margin: 0, minWidth: 0, flex: 1, ...(body ? T.label : T.bodySm), color: body ? c.ink : c.inkMuted }}>{title}</p>
        {more.length ? (
          <span style={{ display: "grid", width: 44, height: 44, flexShrink: 0, placeItems: "center", borderRadius: 999, color: open > 0.5 ? c.ink : c.inkMuted }}>
            <Info size={20} strokeWidth={2} style={{ display: "block" }} aria-hidden />
          </span>
        ) : null}
      </div>
      {more.length && open > 0 ? (
        <div style={{ display: "grid", gridTemplateRows: `${Math.min(1, open)}fr` }}>
          <div style={{ minHeight: 0, overflow: "hidden" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "0 12px 12px 42px", ...T.bodySm, color: c.inkMuted, opacity: Math.min(1, open * 1.5) }}>
              {more.map((m) => (
                <p key={m} style={{ margin: 0, fontVariantNumeric: "tabular-nums" }}>
                  {m}
                </p>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
