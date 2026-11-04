// Earned trust (apps/web/components/wave4/Trust.tsx, hub 1.1.0): a badge (icon + word, ink on surface-sunken: trust is
// not a status) New (sprout) → Trusted (shield-check) → Very trusted (badge-check), the member row that carries it
// ("Can spend up to $200 without asking"), the "Your instant limit" card, and the level-up line.
import { BadgeCheck, ShieldCheck, Sprout } from "lucide-react";
import React from "react";
import { copy } from "../copy";
import { LISBON, MAYA, type Person } from "../data";
import { formatUsd } from "../format";
import { clamp01, pop as popAnim } from "../ease";
import { useUi } from "../theme";
import { T } from "../type";
import { Avatar } from "./Avatar";
import { MoneyText } from "./MoneyText";

export type TrustLevel = 0 | 1 | 2;
const ICONS = [Sprout, ShieldCheck, BadgeCheck] as const;
export const trustWord = (level: TrustLevel) => copy[`trust.level.${level}`];

export const TrustBadge: React.FC<{ level: TrustLevel; /** 0..1 pop when it changes */ pop?: number; style?: React.CSSProperties }> = ({ level, pop = 1, style }) => {
  const { c } = useUi();
  const Icon = ICONS[level];
  const pp = popAnim(pop);
  return (
    <span
      data-ui="trust-badge"
      style={{
        display: "inline-flex",
        height: 24,
        flexShrink: 0,
        alignItems: "center",
        gap: 4,
        borderRadius: 999,
        background: c.surfaceSunken,
        padding: "0 8px 0 6px",
        ...T.bodySm,
        fontWeight: 600,
        whiteSpace: "nowrap",
        color: c.ink,
        transform: pop < 1 ? `scale(${pp.scale})` : undefined,
        opacity: pp.opacity,
      }}
    >
      <Icon size={14} strokeWidth={2} style={{ display: "block" }} aria-hidden />
      <span>{trustWord(level)}</span>
    </span>
  );
};

/**
 * A member row with trust (Members tab, trust-members-day.png): avatar, "Maya (you)" + the badge, "Put in $150.00 ·
 * Share of spending $28.00", "Can spend up to $200 without asking", and "Gets back $122.00" on the right.
 */
export const TrustRow: React.FC<{
  person?: Person;
  isMe?: boolean;
  level?: TrustLevel;
  /** 0..1 pop of the badge (on a level-up). */
  badgePop?: number;
  /** What they can spend without asking, in dollars (interpolate 100 → 200 for the roll). */
  upTo?: number;
  putIn?: number;
  spentShare?: number;
  getsBack?: number;
  /** "member" → "Can spend up to $200 without asking"; "you" → "You can spend up to $200 at a time without asking." */
  upToWording?: "member" | "you";
  style?: React.CSSProperties;
}> = ({
  person = MAYA,
  isMe = true,
  level = 1,
  badgePop = 1,
  upTo = 200,
  putIn = 150,
  spentShare = 28,
  getsBack = 122,
  upToWording = "member",
  style,
}) => {
  const { c } = useUi();
  const amount = formatUsd(upTo, "whole");
  return (
    <div
      data-ui="trust-row"
      style={{ display: "flex", minHeight: 64, boxSizing: "border-box", alignItems: "center", gap: 12, borderRadius: 16, background: c.surface, padding: 12, ...style }}
    >
      <Avatar person={person} size="md" />
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ margin: 0, display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 4, ...T.label, color: c.ink }}>
          {isMe ? copy["members.you"](person.name) : person.name}
          <TrustBadge level={level} pop={badgePop} />
        </p>
        <p style={{ margin: 0, ...T.bodySm, color: c.inkMuted, fontVariantNumeric: "tabular-nums" }}>
          {copy["members.row.short"](formatUsd(putIn), formatUsd(spentShare))}
        </p>
        <p style={{ margin: 0, ...T.bodySm, color: c.inkMuted, fontVariantNumeric: "tabular-nums" }}>
          {upToWording === "you" ? copy["trust.person.body.you"](amount) : copy["trust.member.up_to"](amount)}
        </p>
      </div>
      <div style={{ flexShrink: 0, textAlign: "right" }}>
        <p style={{ margin: 0, ...T.bodySm, color: c.inkMuted }}>{copy["members.gets_back"]}</p>
        <MoneyText amount={getsBack} />
      </div>
    </div>
  );
};

/** "Your instant limit" (Settings → Rules, You): the badge, what you can spend now, the 3-step streak, the next level. */
export const MyTrustCard: React.FC<{
  level?: TrustLevel;
  upTo?: number;
  /** paid spends to the next level (0..step) */
  nextIn?: number;
  step?: number;
  next?: number | null;
  minQualifying?: number;
  title?: string;
  style?: React.CSSProperties;
}> = ({ level = 0, upTo = LISBON.instantLimit, nextIn = 3, step = LISBON.trustStep, next = 200, minQualifying = 10, title = copy["trust.you.title"], style }) => {
  const { c } = useUi();
  const done = step - nextIn;
  return (
    <section data-ui="my-trust" style={{ borderRadius: 16, background: c.surface, padding: 16, ...style }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <h3 style={{ margin: 0, ...T.label, color: c.ink }}>{title}</h3>
        <TrustBadge level={level} />
      </div>
      <p style={{ margin: "4px 0 0", ...T.body, color: c.ink, fontVariantNumeric: "tabular-nums" }}>{copy["trust.you.up_to"](formatUsd(upTo, "whole"))}</p>
      {next !== null ? (
        <>
          <div style={{ marginTop: 12, display: "flex", gap: 4 }}>
            {Array.from({ length: step }, (_, i) => (
              <span key={i} style={{ height: 6, flex: 1, borderRadius: 999, background: i < done ? c.ink : c.surfaceSunken }} />
            ))}
          </div>
          <p style={{ margin: "6px 0 0", ...T.bodySm, color: c.inkMuted, fontVariantNumeric: "tabular-nums" }}>{copy["trust.you.next"](nextIn, formatUsd(next, "whole"))}</p>
          <p style={{ margin: "2px 0 0", ...T.bodySm, color: c.inkMuted, fontVariantNumeric: "tabular-nums" }}>{copy["trust.you.counts"](formatUsd(minQualifying, "whole"))}</p>
        </>
      ) : (
        <p style={{ margin: "6px 0 0", ...T.bodySm, color: c.inkMuted }}>{copy["trust.you.top"]}</p>
      )}
    </section>
  );
};

/** The level-up line ("You're now Trusted in Lisbon Trip: you can spend up to $200 without asking."), calm, no burst. */
export const TrustLevelUp: React.FC<{ level?: TrustLevel; potName?: string; upTo?: number; appear?: number; style?: React.CSSProperties }> = ({
  level = 1,
  potName = LISBON.name,
  upTo = 200,
  appear = 1,
  style,
}) => {
  const { c } = useUi();
  const Icon = ICONS[level];
  const a = clamp01(appear);
  return (
    <div
      data-ui="trust-level-up"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        borderRadius: 16,
        background: c.surfaceSunken,
        padding: 12,
        opacity: a,
        transform: a < 1 ? `translateY(${(1 - a) * 6}px)` : undefined,
        ...style,
      }}
    >
      <Icon size={20} strokeWidth={2} color={c.ink} style={{ display: "block", flexShrink: 0, marginTop: 2 }} aria-hidden />
      <p style={{ margin: 0, ...T.label, color: c.ink, fontVariantNumeric: "tabular-nums" }}>{copy["trust.level_up"](trustWord(level), potName, formatUsd(upTo, "whole"))}</p>
    </div>
  );
};
