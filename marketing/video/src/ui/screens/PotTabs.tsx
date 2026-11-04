// The Pot's Members and Settings tabs (apps/web/components/pot/Tabs.tsx, SettingsTab.tsx; 2026-11-03).
//  - Members: "3 people" + [Invite friends], the totals (Put in · Spent · Left), a row per person with the trust badge
//    and "Can spend up to $X without asking", "Gets back" on the right.
//  - Settings (was "Rules"): grouped sections whose header says who decides. RULES · the group decides: "Your instant
//    limit" (trust), the rule sentences, the footnote and "Changing the rules". Then MONEY FROM OUTSIDE · anyone, right
//    away; PAYING PEOPLE OUTSIDE; PEOPLE; RECORD; CLOSE POT. Ink rows on surface, no marigold.
import { ArrowUpRight, ChevronRight, Eye, Globe, Link2, ListChecks, LogOut, Send, ShieldCheck, UserPlus, type LucideIcon } from "lucide-react";
import React from "react";
import { copy } from "../copy";
import { LISBON, type Person } from "../data";
import { formatUsd } from "../format";
import { useUi } from "../theme";
import { T } from "../type";
import { Appear } from "../atoms/Appear";
import { Avatar } from "../atoms/Avatar";
import { Button } from "../atoms/Button";
import { MoneyText } from "../atoms/MoneyText";
import { potRules, RuleRow, type RuleKey } from "../atoms/Rules";
import { Toggle } from "../atoms/Toggle";
import { MyTrustCard, TrustBadge, type TrustLevel } from "../atoms/Trust";

export type MemberLine = {
  person: Person;
  putIn: number;
  spentShare: number;
  getsBack: number;
  isMe?: boolean;
  /** earned trust (hub 1.1.0): the badge and "Can spend up to $X without asking" */
  trust?: { level: TrustLevel; upTo: number } | null;
};

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
          <div key={m.person.id} data-ui="member-row" style={{ display: "flex", minHeight: 64, alignItems: "center", gap: 12, borderRadius: 16, background: c.surface, padding: 12, boxSizing: "border-box" }}>
            <Avatar person={m.person} size="md" />
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ margin: 0, display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 4, ...T.label, color: c.ink }}>
                {m.isMe ? copy["members.you"](m.person.name) : m.person.name}
                {m.trust ? <TrustBadge level={m.trust.level} /> : null}
              </p>
              <p style={{ margin: 0, ...T.bodySm, color: c.inkMuted, fontVariantNumeric: "tabular-nums" }}>
                {copy["members.row.short"](formatUsd(m.putIn), formatUsd(m.spentShare))}
              </p>
              {m.trust ? (
                <p style={{ margin: 0, ...T.bodySm, color: c.inkMuted, fontVariantNumeric: "tabular-nums" }}>{copy["trust.member.up_to"](formatUsd(m.trust.upTo, "whole"))}</p>
              ) : null}
            </div>
            <div style={{ flexShrink: 0, textAlign: "right" }}>
              <p style={{ margin: 0, ...T.bodySm, color: c.inkMuted }}>{copy["members.gets_back"]}</p>
              <MoneyText amount={m.getsBack} />
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 8 }}>
        <p style={{ margin: 0, ...T.bodySm, color: c.inkMuted }}>{copy["members.explainer"]}</p>
        <span style={{ display: "inline-flex", minHeight: 44, alignItems: "center", ...T.label, ...T.bodySm, fontWeight: 600, color: c.link }}>{copy["members.how"]}</span>
      </div>
    </section>
  );
};

/** A Settings section header: "RULES · the group decides". */
export const SettingsHeader: React.FC<{ title: string; who?: string }> = ({ title, who }) => {
  const { c } = useUi();
  return (
    <h2 style={{ margin: 0, padding: "0 4px", ...T.bodySm, color: c.inkMuted }}>
      <span style={{ fontWeight: 600, letterSpacing: "0.025em", color: c.ink, textTransform: "uppercase" }}>{title}</span>
      {who ? <span> · {who}</span> : null}
    </h2>
  );
};

const SettingsRow: React.FC<{ icon: LucideIcon; label: string; value?: string; external?: boolean; last?: boolean }> = ({ icon: Icon, label, value, external, last }) => {
  const { c } = useUi();
  // the divider sits outside the row's 52 px (the app's divide-y on the <li>, not inside the button)
  return (
    <div style={{ borderBottom: last ? undefined : `1px solid ${c.line}` }}>
    <div
      style={{
        display: "flex",
        minHeight: 52,
        boxSizing: "border-box",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        ...T.body,
        color: c.ink,
      }}
    >
      <Icon size={20} strokeWidth={2} style={{ display: "block", flexShrink: 0 }} aria-hidden />
      <span style={{ minWidth: 0, flex: 1 }}>{label}</span>
      {value ? <span style={{ flexShrink: 0, ...T.bodySm, color: c.inkMuted, fontVariantNumeric: "tabular-nums" }}>{value}</span> : null}
      {external ? (
        <ArrowUpRight size={20} strokeWidth={2} color={c.inkMuted} style={{ display: "block", flexShrink: 0 }} aria-hidden />
      ) : (
        <ChevronRight size={20} strokeWidth={2} color={c.inkMuted} style={{ display: "block", flexShrink: 0 }} aria-hidden />
      )}
    </div>
    </div>
  );
};

const Rows: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { c } = useUi();
  return <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: 16, background: c.surface }}>{children}</div>;
};

export type SettingsTabProps = {
  potName?: string;
  creator?: string;
  instantLimit?: number;
  oneOkCap?: number;
  trust?: boolean;
  k?: number;
  n?: number;
  memberBudget?: number;
  /** what the phone owner has used of the per-person budget */
  used?: number;
  links?: boolean;
  /** "Your instant limit" card at the top (trust on); null hides it. */
  myTrust?: React.ComponentProps<typeof MyTrustCard> | null;
  /** Which rules to list (default: all of today's). */
  show?: RuleKey[];
  /** Highlight one rule row (brand-soft, boolean or 0..1 via highlightAmount) while a scene points at it. */
  highlight?: RuleKey | null;
  highlightAmount?: number;
  /** Per-rule 0..1 entrance, keyed by rule. */
  appear?: Partial<Record<RuleKey, number>>;
  /** Show the footnote and "Changing the rules". */
  footer?: boolean;
  /** Show the sections after RULES (money from outside, people, record, close). */
  moreSections?: boolean;
  /** Active pay-in links (Money from outside → "Pay-in links · 1 active"; 0 = "None active"). */
  payInLinks?: number;
  /** The invite link's end date ("Until Nov 7"). */
  inviteUntil?: string;
  /** Hide one rule row (keeps its space) while a breakout twin is on screen. */
  hideRule?: RuleKey | null;
  style?: React.CSSProperties;
};

/** The Settings tab (formerly the Rules tab; `RulesTab` is the same component under its old name). */
export const SettingsTab: React.FC<SettingsTabProps> = ({
  potName = LISBON.name,
  creator = "Maya",
  instantLimit = LISBON.instantLimit,
  oneOkCap = LISBON.oneOkCap,
  trust = true,
  k = LISBON.k,
  n = LISBON.n,
  memberBudget = LISBON.memberBudget,
  used = 0,
  links = true,
  myTrust = {},
  show,
  highlight = null,
  highlightAmount = 1,
  appear,
  footer = true,
  moreSections = true,
  payInLinks = 0,
  inviteUntil = "Nov 7",
  hideRule = null,
  style,
}) => {
  const { c } = useUi();
  void potName;
  const rules = potRules({ instantLimit, oneOkCap, trust, k, n, memberBudget, used, links }).filter((r) => !show || show.includes(r.key));
  return (
    <div data-ui="settings" style={{ display: "flex", flexDirection: "column", gap: 32, ...style }}>
      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <SettingsHeader title={copy["settings.rules.h"]} who={copy["settings.who.group"]} />
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {trust && myTrust ? <MyTrustCard {...myTrust} /> : null}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {rules.map((r, i) => (
              <Appear key={r.key} appear={appear?.[r.key] ?? 1} gap={i === 0 ? 0 : 8}>
                <RuleRow
                  icon={r.icon}
                  text={r.text}
                  meter={r.meter}
                  highlight={highlight === r.key ? highlightAmount : 0}
                  style={hideRule === r.key ? { visibility: "hidden" } : undefined}
                />
              </Appear>
            ))}
          </div>
          {footer ? (
            <>
              <p style={{ margin: "-4px 0 0", display: "flex", alignItems: "flex-start", gap: 8, ...T.bodySm, color: c.inkMuted }}>
                <ShieldCheck size={16} strokeWidth={2} style={{ display: "block", flexShrink: 0, marginTop: 2 }} aria-hidden />
                {copy["rules.footer"](creator)}
              </p>
              <section style={{ display: "flex", flexDirection: "column", gap: 12, borderRadius: 16, background: c.surface, padding: 16 }}>
                <h3 style={{ margin: 0, ...T.label, color: c.ink }}>{copy["rules.change.h"]}</h3>
                <p style={{ margin: "-8px 0 0", ...T.bodySm, color: c.inkMuted }}>{copy["rules.change.note"](k, n)}</p>
                <Button fullWidth>{copy["rules.change.cta"]}</Button>
              </section>
            </>
          ) : null}
        </div>
      </section>
      {moreSections ? (
        <>
          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <SettingsHeader title={copy["settings.outside.h"]} who={copy["settings.who.anyone"]} />
            <div style={{ overflow: "hidden", borderRadius: 16, background: c.surface }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "8px 16px 12px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ minWidth: 0, flex: 1, paddingTop: 8 }}>
                    <p style={{ margin: 0, ...T.label, color: c.ink }}>{copy["settings.taking"]}</p>
                    <p style={{ margin: "2px 0 0", ...T.bodySm, color: c.inkMuted }}>{copy["settings.taking.on"]}</p>
                  </div>
                  <Toggle on />
                </div>
                <p style={{ margin: 0, display: "flex", alignItems: "flex-start", gap: 8, ...T.bodySm, color: c.inkMuted }}>
                  <ShieldCheck size={16} strokeWidth={2} style={{ display: "block", flexShrink: 0, marginTop: 2 }} aria-hidden />
                  {copy["settings.taking.safety"]}
                </p>
              </div>
              <div style={{ borderTop: `1px solid ${c.line}` }}>
                <SettingsRow icon={Globe} label={copy["settings.page"]} value={copy["settings.off"]} />
                <SettingsRow icon={Link2} label={copy["settings.payins"]} value={payInLinks > 0 ? copy["settings.payins.n"](payInLinks) : copy["settings.payins.none"]} last />
              </div>
            </div>
            <Button fullWidth icon={Link2}>
              {copy["settings.payins.make"]}
            </Button>
          </section>
          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <SettingsHeader title={copy["settings.sending.h"]} who={copy["settings.who.group"]} />
            <Rows>
              <SettingsRow icon={Send} label={copy["settings.sending"]} value={links ? copy["settings.on"] : copy["settings.off"]} last />
            </Rows>
          </section>
          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <SettingsHeader title={copy["settings.people.h"]} />
            <Rows>
              <SettingsRow icon={UserPlus} label={copy["settings.invite"]} value={copy["settings.invite.until"](inviteUntil)} />
              <SettingsRow icon={Eye} label={copy["privacy.menu"]} last />
            </Rows>
          </section>
          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <SettingsHeader title={copy["settings.record.h"]} />
            <Rows>
              <SettingsRow icon={ListChecks} label={copy["rules.record"]} />
              <SettingsRow icon={Globe} label={copy["settings.explorer"]} external last />
            </Rows>
          </section>
          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <SettingsHeader title={copy["settings.close.h"]} who={copy["settings.who.group"]} />
            <Rows>
              <SettingsRow icon={LogOut} label={copy["settings.close"]} last />
            </Rows>
          </section>
        </>
      ) : null}
    </div>
  );
};

/** LEGACY name: the Rules tab is the Settings tab's RULES section now. Same props as SettingsTab. */
export const RulesTab = SettingsTab;
