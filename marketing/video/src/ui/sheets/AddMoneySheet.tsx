// Add money (apps/web/components/sheets/AddMoneySheet.tsx): reads like a sentence. "Amount in dollars" + the
// typed amount ($150 prefilled from "Add my $150 share"), the amount chips (Your share $150 · $50 · $100), the
// source list (Demo dollars (test money) [Test] · Pot dollars you have · Another app or exchange), "Lisbon Trip
// will have $450.00. Goal reached.", and the footer [Add $150] (the one marigold) over the keypad.
// The real sheet closes at once on submit; the Pot screen then shows "Adding $150…" + Sending… (a feed row and
// "+$150 on the way" in the hero) and a toast "Added. Lisbon Trip now has $450.00." (see PotScreen + Toast).
import React from "react";
import { copy } from "../copy";
import { LISBON } from "../data";
import { formatUsd } from "../format";
import { useUi } from "../theme";
import { T } from "../type";
import { AmountDisplay, Keypad, type KeyName } from "../atoms/Keypad";
import { Button } from "../atoms/Button";
import { Chip } from "../atoms/Controls";
import { Sheet, type SheetProps } from "./Sheet";

export type AddSource = "demo" | "pot_dollars";

const SourceRow: React.FC<{ checked: boolean; label: string; sub?: string; pill?: string; last?: boolean }> = ({ checked, label, sub, pill, last }) => {
  const { c } = useUi();
  return (
    <div
      style={{
        display: "flex",
        minHeight: 56,
        alignItems: "center",
        gap: 12,
        borderBottom: last ? undefined : `1px solid ${c.line}`,
        padding: "0 12px",
        background: checked ? c.surfaceSunken : c.surface,
        boxSizing: "border-box",
      }}
    >
      <span
        style={{
          display: "grid",
          width: 20,
          height: 20,
          flexShrink: 0,
          placeItems: "center",
          borderRadius: 999,
          border: `2px solid ${checked ? c.ink : c.lineStrong}`,
          boxSizing: "border-box",
        }}
      >
        {checked ? <span style={{ width: 10, height: 10, borderRadius: 999, background: c.ink }} /> : null}
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: "block", ...T.label, color: c.ink }}>{label}</span>
        {sub ? <span style={{ display: "block", ...T.bodySm, color: c.inkMuted }}>{sub}</span> : null}
      </span>
      {pill ? (
        <span
          style={{
            borderRadius: 999,
            background: c.surface,
            padding: "2px 8px",
            ...T.bodySm,
            fontWeight: 600,
            color: c.inkMuted,
            boxShadow: `0 0 0 1px ${c.line}`,
          }}
        >
          {pill}
        </span>
      ) : null}
    </div>
  );
};

export type AddMoneySheetProps = Omit<SheetProps, "children" | "footer" | "title"> & {
  potName?: string;
  /** Keypad string; "150" when prefilled from "Add my $150 share". */
  typed?: string;
  suggested?: number;
  /** Balance before adding (for "{potName} will have {balance}."). */
  balance?: number;
  /** Total put in so far vs the goal (decides "Goal reached."). */
  collected?: number;
  goal?: number | null;
  source?: AddSource;
  ownDollars?: number;
  pressedKey?: KeyName | null;
  keyPress?: number;
  ctaPress?: number;
  /** Amount chip under the finger (0 = "Your share", 1 = $50, 2 = $100) and its 0..1 press. */
  pressedChip?: number | null;
  chipPress?: number;
};

export const AddMoneySheet: React.FC<AddMoneySheetProps> = ({
  potName = LISBON.name,
  typed = "150",
  suggested = LISBON.goalEach,
  balance = 300,
  collected = 300,
  goal = LISBON.goal,
  source = "demo",
  ownDollars = 0,
  pressedKey = null,
  keyPress = 1,
  ctaPress = 0,
  pressedChip = null,
  chipPress = 1,
  ...sheet
}) => {
  const { c } = useUi();
  const amount = Number(typed) || 0;
  const reachesGoal = goal !== null && collected < goal && collected + amount >= goal;
  const chips = [
    { label: copy["add.chip.share"](formatUsd(suggested, "whole")), amount: suggested },
    { label: formatUsd(50, "whole"), amount: 50 },
    { label: formatUsd(100, "whole"), amount: 100 },
  ];
  return (
    <Sheet
      {...sheet}
      title={copy["add.title"](potName)}
      footer={
        <>
          <Button variant="primary" fullWidth disabled={amount <= 0} pressed={ctaPress}>
            {amount > 0 ? copy["add.cta"](formatUsd(amount, "whole")) : copy["add.cta.empty"]}
          </Button>
          <Keypad pressedKey={pressedKey} press={keyPress} />
        </>
      }
    >
      <AmountDisplay typed={typed} label={copy["add.amount.label"]} style={{ paddingTop: 8 }} />
      <div style={{ margin: "16px -16px 0", padding: "0 16px 4px", display: "flex", gap: 8, overflow: "hidden" }}>
        {chips.map((ch, i) => (
          <Chip key={ch.label} pill selected={amount === ch.amount} pressed={pressedChip === i ? chipPress : 0}>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{ch.label}</span>
          </Chip>
        ))}
      </div>
      <div style={{ marginTop: 20 }}>
        <p style={{ margin: "0 0 8px", ...T.bodySm, color: c.inkMuted }}>{copy["add.source.label"]}</p>
        <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: 16, border: `1px solid ${c.line}` }}>
          <SourceRow checked={source === "demo"} label={copy["add.source.demo"]} pill={copy["add.source.test_pill"]} />
          <SourceRow checked={source === "pot_dollars"} label={copy["add.source.pot_dollars"](formatUsd(ownDollars))} />
          <SourceRow checked={false} label={copy["add.source.other_wallet"]} sub={copy["add.source.other_hint"]} last />
        </div>
      </div>
      {amount > 0 ? (
        <p style={{ margin: "16px 0 0", textAlign: "center", ...T.bodySm, color: c.inkMuted }}>
          {reachesGoal ? copy["add.after.goal"](potName, formatUsd(balance + amount)) : copy["add.after"](potName, formatUsd(balance + amount))}
        </p>
      ) : null}
    </Sheet>
  );
};
