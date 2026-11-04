// The goal with a date (apps/web/components/wave4/GoalBanner.tsx, hub 1.1.0), in the hero in place of the plain goal
// bar:
//   collecting: the goal bar with "$300 of $450 · 3 days left"; all-or-nothing adds 🔒 "Spending opens once the goal is
//               reached." and the promise "All or nothing: if we don't reach $450 by Nov 12, everyone gets their money
//               back automatically.";
//   reached:    a calm ✓ "Goal reached" · "$450 collected. Spending is open." on surface-sunken (no burst).
// GoalCard is the hero card around it ("In the Pot", the balance), standalone for breakouts.
import { Check, Lock } from "lucide-react";
import React from "react";
import { interpolateColors } from "remotion";
import { copy } from "../copy";
import { formatUsd } from "../format";
import { clamp01, pop as popAnim } from "../ease";
import { useUi } from "../theme";
import { T } from "../type";
import { GoalBar } from "./GoalBar";
import { MoneyText } from "./MoneyText";

export type GoalState = "collecting" | "reached";

export const GoalBanner: React.FC<{
  state?: GoalState;
  collected?: number;
  goal?: number;
  /** 0..1 bar fill override (smooth roll). */
  progress?: number;
  daysLeft?: number;
  /** The goal's date, e.g. "Nov 12". */
  date?: string;
  allOrNothing?: boolean;
  /** 0..1 pop of the reached check. */
  reachedPop?: number;
  style?: React.CSSProperties;
}> = ({ state = "collecting", collected = 300, goal = 450, progress, daysLeft = 3, date = "Nov 12", allOrNothing = true, reachedPop = 1, style }) => {
  const { c } = useUi();
  const g = formatUsd(goal, "whole");
  if (state === "reached") {
    const pp = popAnim(reachedPop);
    return (
      <div data-ui="goal-banner" style={{ display: "flex", alignItems: "flex-start", gap: 12, borderRadius: 16, background: c.surfaceSunken, padding: 12, ...style }}>
        <span style={{ marginTop: 2, flexShrink: 0, transform: reachedPop < 1 ? `scale(${pp.scale})` : undefined, opacity: pp.opacity }}>
          <Check size={20} strokeWidth={2} color={c.approved} style={{ display: "block" }} aria-hidden />
        </span>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, ...T.label, color: c.ink }}>{copy["goal.reached.title"]}</p>
          <p style={{ margin: "2px 0 0", ...T.bodySm, color: c.inkMuted, fontVariantNumeric: "tabular-nums" }}>
            {allOrNothing ? copy["goal.reached.body"](g) : `${g} collected.`}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div data-ui="goal-banner" style={{ display: "flex", flexDirection: "column", gap: 8, ...style }}>
      <GoalBar
        collected={collected}
        goal={goal}
        progress={progress}
        text={`${copy["goal.progress"](formatUsd(collected, "whole"), g)} · ${copy["goal.left.days"](daysLeft)}`}
      />
      {allOrNothing ? (
        <>
          <p style={{ margin: 0, display: "flex", alignItems: "flex-start", gap: 8, ...T.bodySm, color: c.ink }}>
            <Lock size={16} strokeWidth={2} color={c.inkMuted} style={{ display: "block", flexShrink: 0, marginTop: 2 }} aria-hidden />
            {copy["goal.spends_paused"]}
          </p>
          <p style={{ margin: 0, ...T.bodySm, color: c.inkMuted, fontVariantNumeric: "tabular-nums" }}>{copy["goal.aon.note"](g, date)}</p>
        </>
      ) : null}
    </div>
  );
};

/** The hero card with the goal: "In the Pot", the balance (count it up), and the goal banner. */
export const GoalCard: React.FC<
  React.ComponentProps<typeof GoalBanner> & {
    balance?: number;
    /** 0..1 blend of the card body to brand-soft (a highlight beat; default none). */
    highlight?: number;
  }
> = ({ balance, highlight = 0, style, ...banner }) => {
  const { c, shadowCard } = useUi();
  const bal = balance ?? banner.collected ?? 300;
  return (
    <section
      data-ui="goal-card"
      style={{
        borderRadius: 24,
        background: highlight > 0 ? interpolateColors(clamp01(highlight), [0, 1], [c.surface, c.brandSoft]) : c.surface,
        padding: 16,
        boxShadow: shadowCard,
        ...style,
      }}
    >
      <p style={{ margin: 0, ...T.bodySm, color: c.inkMuted }}>{copy["pot.hero.label"]}</p>
      <p style={{ margin: "4px 0 0", ...T.body, lineHeight: "24px" }}>
        <MoneyText amount={bal} variant="hero" />
      </p>
      <GoalBanner {...banner} style={{ marginTop: 16 }} />
    </section>
  );
};
