// Pot screen parts (apps/web/components/pot/PotParts.tsx, BalanceHero.tsx, app-shell DemoBanner):
//  - DemoBanner: surface-sunken strip "Demo · test money on NEAR testnet" + the persona switcher;
//  - PotHeader: back · cover tile · Pot name (title) · avatar stack · ⋮ (pt 12, pb 16);
//  - BalanceHero: "In the Pot", the balance (Gabarito 44, two decimals, tabular), "Your share … · You put in …",
//    the goal bar + its text twin, [+ Add money] (the screen's one marigold) and [↗ Spend] (secondary, 52 px).
import { ArrowUpRight, ChevronDown, ChevronLeft, Clock, EllipsisVertical, Plus } from "lucide-react";
import React from "react";
import { copy } from "../copy";
import type { Person } from "../data";
import { formatUsd } from "../format";
import { useUi } from "../theme";
import { T } from "../type";
import { Avatar, AvatarStack } from "../atoms/Avatar";
import { Button } from "../atoms/Button";
import { CoverTile } from "../atoms/CoverTile";
import { GoalBar } from "../atoms/GoalBar";
import { MoneyText } from "../atoms/MoneyText";

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

export const PotHeader: React.FC<{ name: string; emoji: string; cover: number; members: Person[]; showBack?: boolean }> = ({
  name,
  emoji,
  cover,
  members,
  showBack = true,
}) => {
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
      <span style={{ marginRight: -8, display: "grid", placeItems: "center", width: 44, height: 44, flexShrink: 0, borderRadius: 999, color: c.ink }}>
        <EllipsisVertical size={24} strokeWidth={2} style={{ display: "block" }} aria-hidden />
      </span>
    </header>
  );
};

export type HeroPress = { target: "add" | "spend"; amount?: number } | null;

export const BalanceHero: React.FC<{
  balance: number;
  yourShare: number;
  putIn: number;
  collected: number;
  goal: number | null;
  /** 0..1 override for the goal bar fill. */
  goalProgress?: number;
  /** "+$150 on the way" line (pending add), dollars; 0 hides it. */
  pendingIn?: number;
  /** A closed Pot: "Closed {date}", no goal bar, no buttons. */
  closedDate?: string | null;
  /** [Add money] becomes secondary when another card holds the marigold. */
  addVariant?: "primary" | "secondary";
  press?: HeroPress;
  /** Dim the money buttons (closing). */
  dimButtons?: boolean;
  style?: React.CSSProperties;
}> = ({ balance, yourShare, putIn, collected, goal, goalProgress, pendingIn = 0, closedDate = null, addVariant = "primary", press = null, dimButtons, style }) => {
  const { c, shadowCard } = useUi();
  return (
    <section data-ui="hero" style={{ borderRadius: 24, background: c.surface, padding: 16, boxShadow: shadowCard, ...style }}>
      <p style={{ margin: 0, ...T.bodySm, color: c.inkMuted }}>{closedDate ? copy["pot.closed.hero"](closedDate) : copy["pot.hero.label"]}</p>
      <p style={{ margin: "4px 0 0", ...T.body, lineHeight: "24px" }}>
        <MoneyText amount={balance} variant="hero" color={c.ink} />
      </p>
      <p style={{ margin: "4px 0 0", ...T.bodySm, color: c.inkMuted }}>
        {copy["pot.hero.share"](formatUsd(yourShare, "whole"), formatUsd(putIn, "whole"))}
      </p>
      {pendingIn > 0 ? (
        <p style={{ margin: "8px 0 0", display: "inline-flex", alignItems: "center", gap: 6, ...T.bodySm, color: c.inkMuted }}>
          <Clock size={16} strokeWidth={2} style={{ display: "block" }} aria-hidden />
          {copy["pot.hero.pending"](formatUsd(pendingIn, "whole"))}
        </p>
      ) : null}
      {goal !== null && goal > 0 && !closedDate ? <GoalBar collected={collected} goal={goal} progress={goalProgress} style={{ marginTop: 16 }} /> : null}
      {closedDate ? null : (
        <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Button
            variant={addVariant}
            icon={Plus}
            height={52}
            fullWidth
            dim={dimButtons}
            pressed={press?.target === "add" ? (press.amount ?? 1) : 0}
          >
            {copy["pot.cta.add"]}
          </Button>
          <Button icon={ArrowUpRight} height={52} fullWidth dim={dimButtons} pressed={press?.target === "spend" ? (press.amount ?? 1) : 0}>
            {copy["pot.cta.spend"]}
          </Button>
        </div>
      )}
    </section>
  );
};
