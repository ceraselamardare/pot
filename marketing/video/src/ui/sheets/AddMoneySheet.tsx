// Add money (apps/web/components/sheets/AddMoneySheet.tsx, two steps since 2026-11-03, like Spend):
//  1 "How much?": the big amount, the chips (Your share $150 · $50 · $100, pills), a quiet "Someone else paying? Send
//    them a link" (pay in), and the footer [Next] (the one marigold) over the keypad;
//  2 "How do you want to add it?": the amount ("$150" + [Change]), the source list (Demo dollars (test money) [Test] ·
//    Pot dollars you have · $0.00 "You don't have any yet" · Another app or exchange), and the footer: "Lisbon Trip
//    will have $450.00. Goal reached." + "After this, you'd get back $150 if the Pot closed.", [Add $150], [‹ Back].
// "Add my $150 share" (You're in) opens straight on step 2, so that's the default `step`; the round Add money action
// opens step 1. The real sheet closes at once on submit; the Pot screen then shows "Adding $150…" + Sending… (a feed
// row, and "+$150 on the way" in the hero) and a toast "Added. Lisbon Trip now has $450.00." (PotScreen + Toast).
// The first-time digital-dollar note is off by default (`showDollarNote`): it names a word the film doesn't show.
import { Info } from "lucide-react";
import React from "react";
import { copy } from "../copy";
import { LISBON } from "../data";
import { formatUsd, keypadDisplay } from "../format";
import { useUi } from "../theme";
import { T } from "../type";
import { AmountDisplay, Keypad, type KeyName } from "../atoms/Keypad";
import { Button } from "../atoms/Button";
import { Chip } from "../atoms/Controls";
import { Sheet, SheetBack, type SheetProps } from "./Sheet";

export type AddSource = "demo" | "pot_dollars" | "other";

const SourceRow: React.FC<{ checked: boolean; label: string; sub?: string; pill?: string; disabled?: boolean; last?: boolean }> = ({
  checked,
  label,
  sub,
  pill,
  disabled,
  last,
}) => {
  const { c } = useUi();
  return (
    <div
      style={{
        display: "flex",
        minHeight: 56,
        alignItems: "center",
        gap: 12,
        borderBottom: last ? undefined : `1px solid ${c.line}`,
        padding: "6px 12px",
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
        <span style={{ display: "block", ...T.label, color: disabled ? c.inkMuted : c.ink, fontVariantNumeric: "tabular-nums" }}>{label}</span>
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
  /** 1 "How much?" or 2 "How do you want to add it?" (default 2: "Add my $150 share" lands there). */
  step?: 1 | 2;
  potName?: string;
  /** Keypad string; "150" when prefilled from "Add my $150 share" ("" shows $0). */
  typed?: string;
  suggested?: number;
  /** Balance before adding (for "{potName} will have {balance}."). */
  balance?: number;
  /** Total put in so far vs the goal (decides "Goal reached."). */
  collected?: number;
  /** What the person adding has put in so far (for "After this, you'd get back $x"). */
  putIn?: number;
  goal?: number | null;
  source?: AddSource;
  /** The person's own Pot dollars (0 = "You don't have any yet", the row can't be picked). */
  ownDollars?: number;
  pressedKey?: KeyName | null;
  keyPress?: number;
  /** 0..1 press on the footer's primary: [Next] on step 1, [Add $150] on step 2. */
  ctaPress?: number;
  /** 0..1 press on [‹ Back] (step 2). */
  backPress?: number;
  /** Amount chip under the finger (0 = "Your share", 1 = $50, 2 = $100) and its 0..1 press. */
  pressedChip?: number | null;
  chipPress?: number;
  /** Step 1's "Someone else paying? Send them a link" (pay in is on in the app). */
  someoneElse?: boolean;
  /** The first-time note about the digital dollar (off for the film). */
  showDollarNote?: boolean;
};

export const AddMoneySheet: React.FC<AddMoneySheetProps> = ({
  step = 2,
  potName = LISBON.name,
  typed = "150",
  suggested = LISBON.goalEach,
  balance = 300,
  collected = 300,
  putIn = 0,
  goal = LISBON.goal,
  source = "demo",
  ownDollars = 0,
  pressedKey = null,
  keyPress = 1,
  ctaPress = 0,
  backPress = 0,
  pressedChip = null,
  chipPress = 1,
  someoneElse = true,
  showDollarNote = false,
  ...sheet
}) => {
  const { c } = useUi();
  const amount = Number(typed) || 0;
  const reachesGoal = goal !== null && collected < goal && collected + amount >= goal;
  const after = balance + amount;
  const refundAfter = amount > 0 && collected + amount > 0 ? Math.floor((after * (putIn + amount)) / (collected + amount)) : null;
  const chips = [
    { label: copy["add.chip.share"](formatUsd(suggested, "whole")), amount: suggested },
    { label: formatUsd(50, "whole"), amount: 50 },
    { label: formatUsd(100, "whole"), amount: 100 },
  ];

  if (step === 1) {
    return (
      <Sheet
        {...sheet}
        title={copy["add.title"](potName)}
        footer={
          <>
            <Button variant="primary" fullWidth disabled={amount <= 0} pressed={ctaPress}>
              {copy["add.next"]}
            </Button>
            <Keypad pressedKey={pressedKey} press={keyPress} />
          </>
        }
      >
        <div data-ui="add-step1" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, paddingTop: 4 }}>
          <AmountDisplay typed={typed} label={copy["add.step.amount"]} />
          <div style={{ margin: "12px -16px 0", padding: "0 16px 4px", display: "flex", gap: 8, alignSelf: "stretch", overflow: "hidden" }}>
            {chips.map((ch, i) => (
              <Chip key={ch.label} pill selected={amount === ch.amount} pressed={pressedChip === i ? chipPress : 0}>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{ch.label}</span>
              </Chip>
            ))}
          </div>
          {someoneElse ? (
            <span
              style={{
                display: "inline-flex",
                minHeight: 44,
                alignItems: "center",
                padding: "0 4px",
                ...T.bodySm,
                color: c.inkMuted,
                textDecoration: "underline",
                textDecorationColor: c.lineStrong,
                textUnderlineOffset: 4,
              }}
            >
              {copy["add.someone_else"]}
            </span>
          ) : null}
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      {...sheet}
      title={copy["add.title"](potName)}
      footerGap={8}
      footer={
        <>
          {amount > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 2, textAlign: "center", ...T.bodySm, color: c.inkMuted, fontVariantNumeric: "tabular-nums" }}>
              <p style={{ margin: 0 }}>{reachesGoal ? copy["add.after.goal"](potName, formatUsd(after)) : copy["add.after"](potName, formatUsd(after))}</p>
              {refundAfter !== null ? <p style={{ margin: 0 }}>{copy["add.refund_after"](formatUsd(refundAfter, "whole"))}</p> : null}
            </div>
          ) : null}
          <Button variant="primary" fullWidth disabled={amount <= 0} pressed={ctaPress} style={{ marginTop: 4 }}>
            {amount > 0 ? copy["add.cta"](formatUsd(amount, "whole")) : copy["add.cta.empty"]}
          </Button>
          <SheetBack pressed={backPress} />
        </>
      }
    >
      <div data-ui="add-step2" style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 4 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <p style={{ margin: 0, ...T.title, color: c.ink, fontVariantNumeric: "tabular-nums" }}>{keypadDisplay(typed)}</p>
          <span style={{ marginRight: -4, display: "inline-flex", minHeight: 44, alignItems: "center", padding: "0 4px", ...T.label, color: c.link }}>{copy["add.amount.change"]}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={{ margin: 0, ...T.bodySm, color: c.inkMuted }}>{copy["add.source.title"]}</p>
          <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: 16, border: `1px solid ${c.line}` }}>
            <SourceRow checked={source === "demo"} label={copy["add.source.demo"]} pill={copy["add.source.test_pill"]} />
            <SourceRow
              checked={source === "pot_dollars"}
              label={copy["add.source.pot_dollars"](formatUsd(ownDollars))}
              sub={ownDollars <= 0 ? copy["add.source.pot_dollars.none"] : undefined}
              disabled={ownDollars <= 0}
            />
            <SourceRow checked={source === "other"} label={copy["add.source.other_wallet"]} sub={copy["add.source.other_hint"]} last />
          </div>
        </div>
        {showDollarNote ? (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, borderRadius: 16, background: c.surfaceSunken, padding: 12 }}>
            <Info size={20} strokeWidth={2} color={c.ink} style={{ display: "block", flexShrink: 0, marginTop: 2 }} aria-hidden />
            <div style={{ ...T.bodySm, color: c.ink }}>
              <p style={{ margin: 0 }}>{copy["add.usdc_note"]}</p>
              <span style={{ margin: "4px 0 0 -4px", display: "inline-flex", minHeight: 44, alignItems: "center", padding: "0 4px", ...T.label, color: c.link }}>{copy["add.usdc_note.ok"]}</span>
            </div>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
};
