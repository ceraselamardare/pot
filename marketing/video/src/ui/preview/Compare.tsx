// 1:1 comparison screens (390 × 844, no bezel, no safe areas) matching the app captures in notes/screens/*.png
// (2026-11-02/03). Render at --scale=3 to compare pixel-for-pixel with the 3× captures. Captures of other Pots (Ski
// Chalet, Porto Weekend) or of the Pots list behind a sheet only match in the sheet's region; see the notes.
import React from "react";
import { BareScreen } from "../Phone";
import type { ThemeName } from "../theme";
import { PotScreen } from "../screens/PotScreen";
import { SpendSheet } from "../sheets/SpendSheet";
import { ApproveSheet } from "../sheets/ApproveSheet";
import { AddMoneySheet } from "../sheets/AddMoneySheet";
import { CloseSheet, defaultRefundRows } from "../sheets/CloseSheet";
import { CreatePotSheet } from "../sheets/CreatePotSheet";
import { AskSheet, MoreSheet } from "../sheets/MenuSheets";
import { PayInSheet } from "../screens/Links";
import { FEED_FULL, feedAfterGroceries } from "../fixtures";
import { CREW, MAYA, SAM, type Person } from "../data";
import { InviteLanding } from "../screens/InviteLanding";

const pot450 = { balance: 450, yourShare: 150, putIn: 150, collected: 450, feed: FEED_FULL } as const;

/** day-pot.png / night-pot.png: Lisbon Trip at $450, the round actions, Activity, the compact feed, "$0.00". */
export const CmpPot: React.FC<{ theme: ThemeName }> = ({ theme }) => (
  <BareScreen theme={theme}>
    <PotScreen {...pot450} />
  </BareScreen>
);

/** day-pot-more.png: More options over the Pot (the capture has Settings selected underneath). */
export const CmpPotMore: React.FC<{ theme: ThemeName }> = ({ theme }) => (
  <BareScreen theme={theme}>
    <PotScreen {...pot450} activeTab="settings" />
    <MoreSheet />
  </BareScreen>
);

/** day-instant-approval.png: $84 sent to you, Receipt ↗, over the Pot at $366. */
export const CmpInstant: React.FC<{ theme: ThemeName }> = ({ theme }) => (
  <BareScreen theme={theme}>
    <PotScreen balance={366} yourShare={122} putIn={150} collected={450} feed={feedAfterGroceries()} />
    <SpendSheet step="sent" amount={84} />
  </BareScreen>
);

/** settings-day.png (full page, 390 × 2376): the seeded Lisbon Trip (no trust / one OK, links off, 1 pay-in link). */
export const SETTINGS_PAGE_H = 2376;
export const CmpSettings: React.FC<{ theme: ThemeName }> = ({ theme }) => (
  <BareScreen theme={theme} height={SETTINGS_PAGE_H}>
    <PotScreen {...pot450} activeTab="settings" settings={{ trust: false, oneOkCap: 0, links: false, myTrust: null, payInLinks: 1 }} />
  </BareScreen>
);

/** payin-add-day.png: Add money step 1, nothing typed, "Someone else paying? Send them a link". */
export const CmpAdd1: React.FC<{ theme: ThemeName }> = ({ theme }) => (
  <BareScreen theme={theme}>
    <PotScreen {...pot450} />
    <AddMoneySheet step={1} typed="" balance={450} collected={450} putIn={150} />
  </BareScreen>
);

/** add-step2-day.png: $50, the sources, the digital-dollar note (shown here to match), the footer lines. */
export const CmpAdd2: React.FC<{ theme: ThemeName }> = ({ theme }) => (
  <BareScreen theme={theme}>
    <PotScreen {...pot450} />
    <AddMoneySheet step={2} typed="50" balance={450} collected={450} putIn={150} showDollarNote />
  </BareScreen>
);

/** spend-step1-day.png (Nov 2: pill buttons behind): How much? $84, Scan receipt, approved instantly, [Next]. */
export const CmpSpend1: React.FC<{ theme: ThemeName }> = ({ theme }) => (
  <BareScreen theme={theme}>
    <PotScreen {...pot450} />
    <SpendSheet step="howMuch" typed="84" />
  </BareScreen>
);

/** spend-step2-day.png: $84, Groceries, Me, the note link, the decision, [Get $84 back], Back. */
export const CmpSpend2: React.FC<{ theme: ThemeName }> = ({ theme }) => (
  <BareScreen theme={theme}>
    <PotScreen {...pot450} />
    <SpendSheet step="details" typed="84" category="groceries" chipsScrollX={0} />
  </BareScreen>
);

/** trust-spend-day.png (Ski Chalet): $250 tickets → "This needs one OK from anyone else", [Ask for one OK]. */
export const CmpSpendOneOk: React.FC<{ theme: ThemeName }> = ({ theme }) => (
  <BareScreen theme={theme}>
    <PotScreen {...pot450} potName="Ski Chalet" />
    <SpendSheet step="details" potName="Ski Chalet" typed="250" category="tickets" />
  </BareScreen>
);

const SAM_CHALET: Person = { ...SAM, joinIndex: 0 };

/** trust-approve-day.png (Ski Chalet): "Sam asks for $250", the one-OK block, the details, [OK $250]. */
export const CmpApproveOneOk: React.FC<{ theme: ThemeName }> = ({ theme }) => (
  <BareScreen theme={theme}>
    <PotScreen {...pot450} potName="Ski Chalet" />
    <ApproveSheet asker={SAM_CHALET} potName="Ski Chalet" amount={250} reason="Lift passes" time="3h ago" balanceAfter={335} />
  </BareScreen>
);

/** p2-day-close.png: Close Lisbon Trip? over the Pot at $450. */
export const CmpClose: React.FC<{ theme: ThemeName }> = ({ theme }) => (
  <BareScreen theme={theme}>
    <PotScreen {...pot450} />
    <CloseSheet mode="propose" rows={defaultRefundRows(150)} />
  </BareScreen>
);

export const CmpCloseApprove: React.FC<{ theme: ThemeName }> = ({ theme }) => (
  <BareScreen theme={theme}>
    <PotScreen {...pot450} />
    <CloseSheet mode="vote" me={SAM} proposer={MAYA} rows={defaultRefundRows(150)} />
  </BareScreen>
);

export const CmpClosed: React.FC<{ theme: ThemeName }> = ({ theme }) => (
  <BareScreen theme={theme}>
    <PotScreen balance={0} yourShare={150} putIn={150} collected={450} feed={FEED_FULL} closed={{ date: "Nov 3", refund: 150 }} />
    <CloseSheet mode="closed" me={SAM} rows={defaultRefundRows(150)} />
  </BareScreen>
);

/** day-invite-landing.png: Porto Weekend (🍷, cover 3, $300 of $450, Maya + 1 other, no one-OK tier, Nov 8). */
export const CmpInvite: React.FC<{ theme: ThemeName }> = ({ theme }) => (
  <BareScreen theme={theme}>
    <InviteLanding potName="Porto Weekend" emoji="🍷" cover={3} members={CREW.slice(0, 2)} expiry="Nov 8" oneOkCap={0} />
  </BareScreen>
);

/** payin-ask-day.png: Ask for money over the Pot. */
export const CmpAsk: React.FC<{ theme: ThemeName }> = ({ theme }) => (
  <BareScreen theme={theme}>
    <PotScreen {...pot450} />
    <AskSheet />
  </BareScreen>
);

/** payin-ready-day.png: Ask anyone to pay in, the link ready ("Payment · $25 · Until Nov 17"). The QR content differs. */
export const CmpPayInReady: React.FC<{ theme: ThemeName }> = ({ theme }) => (
  <BareScreen theme={theme}>
    <PotScreen {...pot450} />
    <PayInSheet tone="payment" amount={25} until="Nov 17" />
  </BareScreen>
);

const ALEX: Person = { id: "alex", name: "Alex", initials: "A", joinIndex: null };

/** payin-feed-day.png: $475, "Alex · Paid in · by link" + From outside on top of the feed. */
export const CmpPayInFeed: React.FC<{ theme: ThemeName }> = ({ theme }) => (
  <BareScreen theme={theme}>
    <PotScreen balance={475} yourShare={158.33} putIn={150} collected={475} feed={[{ label: "Today", items: [{ id: "alex", kind: "payin", who: ALEX, amount: 25, when: "just now" }] }, ...FEED_FULL]} />
  </BareScreen>
);

/** create-lean-day.png: Start a Pot (✈️, "Lisbon Trip" typed, not focused) over the Pots list (not in the kit). */
export const CmpCreateLean: React.FC<{ theme: ThemeName }> = ({ theme }) => (
  <BareScreen theme={theme}>
    <CreatePotSheet step={1} emoji="✈️" caret={false} />
  </BareScreen>
);

/** create-rules-day.png (full page, 390 × 1678): the Pot rules step. */
export const CREATE_RULES_PAGE_H = 1678;
export const CmpCreateRules: React.FC<{ theme: ThemeName }> = ({ theme }) => (
  <BareScreen theme={theme} height={CREATE_RULES_PAGE_H}>
    <CreatePotSheet step={2} emoji="✈️" />
  </BareScreen>
);
