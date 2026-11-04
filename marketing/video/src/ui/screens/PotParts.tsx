// Pot screen parts (apps/web/components/pot/PotParts.tsx, BalanceHero.tsx, PotActions.tsx; 2026-11-03):
//  - PotHeader: back · cover tile · Pot name (title) · avatar stack (pt 12, pb 16). The ••• moved into the action row's
//    More; only a closed Pot keeps a ••• in its header.
//  - BalanceHero: "In the Pot", the balance (Gabarito 44, two decimals, tabular), "You'd get back $150 · You put in
//    $150 ⓘ" (a quiet 44 px tap row: it opens what you'd get back), the goal bar + its text twin (or the all-or-nothing
//    goal banner), then the round action row: Add money (the one marigold) · Spend · Ask · More.
//  - DemoBanner: LEGACY (the demo persona strip is gone from the app).
import { ChevronDown, ChevronLeft, Clock, Ellipsis, Info } from "lucide-react";
import React from "react";
import { copy } from "../copy";
import type { Person } from "../data";
import { formatUsd } from "../format";
import { useUi } from "../theme";
import { T } from "../type";
import { Avatar, AvatarStack } from "../atoms/Avatar";
import { CoverTile } from "../atoms/CoverTile";
import { GoalBar } from "../atoms/GoalBar";
import { MoneyText } from "../atoms/MoneyText";
import { PotActions, type PotActionKey } from "../atoms/PotActions";

/** LEGACY: the demo persona banner (removed from the app on 2026-11-01). */
export const DemoBanner: React.FC<{ person: Person; text?: string }> = ({ person, text = copy["demo.banner"] }) => {
  const { c } = useUi();
  return (
    <div style={{ borderBottom: `1px solid ${c.line}`, background: c.surfaceSunken }}>
      <div style={{ display: "flex", minHeight: 44, alignItems: "center", gap: 8, padding: "4px 16px" }}>
        <p style={{ margin: 0, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", ...T.bodySm, color: c.ink }}>
          {text}
        </p>
        <span style={{ display: "flex", height: 44, alignItems: "center", gap: 8, borderRadius: 999, padding: "0 8px 0 4px", ...T.label, color: c.ink }}>
          <Avatar person={person} size="xs" />
          <span>{person.name}</span>
          <ChevronDown size={16} strokeWidth={2} style={{ display: "block" }} aria-hidden />
        </span>
      </div>
    </div>
  );
};

export const PotHeader: React.FC<{
  name: string;
  emoji: string;
  cover: number;
  members: Person[];
  showBack?: boolean;
  /** The header's ••• (only a closed Pot has one now). */
  showMore?: boolean;
  /** 0..1 press on the header ••• */
  morePress?: number;
}> = ({ name, emoji, cover, members, showBack = true, showMore = false, morePress = 0 }) => {
  const { c } = useUi();
  return (
    <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "12px 0 16px" }}>
      {showBack ? (
        <span style={{ marginLeft: -8, display: "grid", placeItems: "center", width: 44, height: 44, flexShrink: 0, borderRadius: 999, color: c.ink }}>
          <ChevronLeft size={24} strokeWidth={2} style={{ display: "block" }} aria-hidden />
        </span>
      ) : null}
      <CoverTile emoji={emoji} cover={cover} size="sm" />
      <h1 style={{ margin: 0, minWidth: 120, flex: 1, ...T.title, color: c.ink, overflowWrap: "break-word" }}>{name}</h1>
      <AvatarStack people={[...members].sort((a, b) => (a.joinIndex ?? 0) - (b.joinIndex ?? 0))} size="sm" ring="ground" />
      {showMore ? (
        <span
          style={{
            marginRight: -8,
            display: "grid",
            placeItems: "center",
            width: 44,
            height: 44,
            flexShrink: 0,
            borderRadius: 999,
            color: c.ink,
            background: morePress > 0 ? c.surfaceSunken : undefined,
          }}
        >
          <Ellipsis size={24} strokeWidth={2} style={{ display: "block" }} aria-hidden />
        </span>
      ) : null}
    </header>
  );
};

/** Which action is pressed (0..1). "add"/"spend" kept their names from the old pill buttons. */
export type HeroPress = { target: PotActionKey; amount?: number } | null;

export const BalanceHero: React.FC<{
  balance: number;
  /** "You'd get back" (what a close would pay you now). */
  yourShare: number;
  putIn: number;
  collected: number;
  goal: number | null;
  /** 0..1 override for the goal bar fill. */
  goalProgress?: number;
  /** Replaces the goal bar's text twin (e.g. "$300 of $450 · 3 days left"). */
  goalText?: string;
  /** Replaces the whole goal block (the all-or-nothing GoalBanner). */
  goalSlot?: React.ReactNode;
  /** "+$150 on the way" line (pending add), dollars; 0 hides it. */
  pendingIn?: number;
  /** A closed Pot: "Closed {date}", no goal bar, no actions. */
  closedDate?: string | null;
  /** Add money gives up the marigold while another card holds it. */
  addVariant?: "primary" | "secondary";
  press?: HeroPress;
  /** Dim the money actions (closing). */
  dimButtons?: boolean;
  /** Dim Spend only (an all-or-nothing goal still collecting: "Spending opens once the goal is reached."). */
  spendBlocked?: boolean;
  /** Show the touch dot on the pressed action. */
  touchDot?: boolean;
  /** 0..1 press on the "You'd get back … ⓘ" row (it opens the refund explainer). */
  sharePress?: number;
  style?: React.CSSProperties;
}> = ({
  balance,
  yourShare,
  putIn,
  collected,
  goal,
  goalProgress,
  goalText,
  goalSlot,
  pendingIn = 0,
  closedDate = null,
  addVariant = "primary",
  press = null,
  dimButtons,
  spendBlocked,
  touchDot,
  sharePress = 0,
  style,
}) => {
  const { c, shadowCard } = useUi();
  return (
    <section data-ui="hero" style={{ borderRadius: 24, background: c.surface, padding: 16, boxShadow: shadowCard, ...style }}>
      <p style={{ margin: 0, ...T.bodySm, color: c.inkMuted }}>{closedDate ? copy["pot.closed.hero"](closedDate) : copy["pot.hero.label"]}</p>
      <p style={{ margin: "4px 0 0", ...T.body, lineHeight: "24px" }}>
        <MoneyText amount={balance} variant="hero" color={c.ink} />
      </p>
      <div
        style={{
          margin: "2px -4px 0",
          display: "inline-flex",
          minHeight: 44,
          maxWidth: "100%",
          alignItems: "center",
          gap: 6,
          borderRadius: 10,
          padding: "0 4px",
          ...T.bodySm,
          color: sharePress > 0 ? c.ink : c.inkMuted,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <span>{copy["pot.hero.share"](formatUsd(yourShare, "whole"), formatUsd(putIn, "whole"))}</span>
        <Info size={16} strokeWidth={2} style={{ display: "block", flexShrink: 0 }} aria-hidden />
      </div>
      {pendingIn > 0 ? (
        <p style={{ margin: "8px 0 0", display: "flex", alignItems: "center", gap: 6, ...T.bodySm, color: c.inkMuted }}>
          <Clock size={16} strokeWidth={2} style={{ display: "block" }} aria-hidden />
          {copy["pot.hero.pending"](formatUsd(pendingIn, "whole"))}
        </p>
      ) : null}
      {closedDate ? null : goalSlot ? (
        <div style={{ marginTop: 16 }}>{goalSlot}</div>
      ) : goal !== null && goal > 0 ? (
        <GoalBar collected={collected} goal={goal} progress={goalProgress} text={goalText} style={{ marginTop: 16 }} />
      ) : null}
      {closedDate ? null : (
        <PotActions
          press={press}
          addVariant={addVariant}
          touchDot={touchDot}
          dim={dimButtons ? { add: true, spend: true, ask: true } : spendBlocked ? { spend: true } : undefined}
          style={{ marginTop: 16 }}
        />
      )}
    </section>
  );
};
