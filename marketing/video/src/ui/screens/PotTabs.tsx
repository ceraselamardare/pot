// The Pot's Members and Rules tabs (apps/web/components/pot/Tabs.tsx).
import React from "react";
import { copy } from "../copy";
import type { Person } from "../data";
import { formatUsd } from "../format";
import { useUi } from "../theme";
import { T } from "../type";
import { Avatar } from "../atoms/Avatar";
import { Button } from "../atoms/Button";
import { MoneyText } from "../atoms/MoneyText";
import { RuleRow, tripRules, type RuleKey } from "../atoms/Rules";
import { Appear } from "../atoms/Appear";

export type MemberLine = { person: Person; putIn: number; spentShare: number; getsBack: number; isMe?: boolean };

export const MembersTab: React.FC<{ members: MemberLine[]; totals?: { in: number; spent: number; left: number } }> = ({ members, totals }) => {
  const { c } = useUi();
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h2 style={{ margin: 0, ...T.heading, color: c.ink }}>{copy["members.header"](members.length)}</h2>
        <Button height={44} style={{ padding: "6px 16px" }}>
          {copy["members.invite_cta"]}
        </Button>
      </div>
      <p style={{ margin: "-8px 0 0", ...T.bodySm, color: c.inkMuted }}>{copy["members.refund_hint"]}</p>
      {totals ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, borderRadius: 16, background: c.surfaceSunken, padding: 12 }}>
          {(
            [
              [copy["members.totals.in"], totals.in],
              [copy["members.totals.spent"], totals.spent],
              [copy["members.totals.left"], totals.left],
            ] as const
          ).map(([k, v]) => (
            <div key={k} style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ ...T.bodySm, color: c.inkMuted }}>{k}</span>
              <MoneyText amount={v} />
            </div>
          ))}
        </div>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {members.map((m) => (
          <div key={m.person.id} style={{ display: "flex", minHeight: 64, alignItems: "center", gap: 12, borderRadius: 16, background: c.surface, padding: 12, boxSizing: "border-box" }}>
            <Avatar person={m.person} size="md" />
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ margin: 0, ...T.label, color: c.ink }}>{m.isMe ? copy["members.you"](m.person.name) : m.person.name}</p>
              <p style={{ margin: 0, ...T.bodySm, color: c.inkMuted, fontVariantNumeric: "tabular-nums" }}>
                {copy["members.row.short"](formatUsd(m.putIn), formatUsd(m.spentShare))}
              </p>
            </div>
            <div style={{ flexShrink: 0, textAlign: "right" }}>
              <p style={{ margin: 0, ...T.bodySm, color: c.inkMuted }}>{copy["members.gets_back"]}</p>
              <MoneyText amount={m.getsBack} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export const RulesTab: React.FC<{
  potName?: string;
  creator?: string;
  instantLimit?: number;
  k?: number;
  n?: number;
  memberBudget?: number;
  /** what the phone owner has used of the per-person budget */
  used?: number;
  /** Which rules to list (the app lists all five; the first three fill a phone screen). */
  show?: RuleKey[];
  /** Highlight one rule row (brand-soft) while a scene points at it. */
  highlight?: RuleKey | null;
  /** Per-rule 0..1 entrance, keyed by rule. */
  appear?: Partial<Record<RuleKey, number>>;
  /** Show the footer, the change-rule button and its note. */
  footer?: boolean;
  /** Hide one rule row (keeps its space) while a breakout twin is on screen. */
  hideRule?: RuleKey | null;
  style?: React.CSSProperties;
}> = ({ potName = "Lisbon Trip", creator = "Maya", instantLimit = 100, k = 2, n = 3, memberBudget = 200, used = 0, show, highlight = null, appear, footer = true, hideRule = null, style }) => {
  const { c } = useUi();
  const rules = tripRules({ instantLimit, k, n, memberBudget, used }).filter((r) => !show || show.includes(r.key));
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 16, ...style }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <h2 style={{ margin: 0, ...T.heading, color: c.ink }}>{copy["rules.title"](potName)}</h2>
        <span
          style={{
            display: "inline-flex",
            height: 28,
            alignItems: "center",
            borderRadius: 999,
            background: c.surfaceSunken,
            padding: "0 12px",
            ...T.bodySm,
            fontWeight: 600,
            color: c.ink,
          }}
        >
          {copy["rules.preset.trip"]}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {rules.map((r, i) => (
          <Appear key={r.key} appear={appear?.[r.key] ?? 1} gap={i === 0 ? 0 : 8}>
            <RuleRow
              icon={r.icon}
              text={r.text}
              meter={"meter" in r ? r.meter : undefined}
              highlight={highlight === r.key}
              style={hideRule === r.key ? { visibility: "hidden" } : undefined}
            />
          </Appear>
        ))}
      </div>
      {footer ? (
        <>
          <p style={{ margin: 0, ...T.bodySm, color: c.inkMuted }}>{copy["rules.footer"](creator)}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Button fullWidth>{copy["rules.change.cta"]}</Button>
            <p style={{ margin: 0, ...T.bodySm, color: c.inkMuted }}>{copy["rules.change.note"](k, n)}</p>
          </div>
        </>
      ) : null}
    </section>
  );
};
