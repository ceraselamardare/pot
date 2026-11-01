// 1:1 comparison screens (390 × 844, no bezel, no safe areas, demo banner on) matching notes/screens/*.png.
// Render at --scale=3 to compare pixel-for-pixel with the app's 3× captures.
import React from "react";
import { BareScreen } from "../Phone";
import type { ThemeName } from "../theme";
import { PotScreen } from "../screens/PotScreen";
import { SpendSheet } from "../sheets/SpendSheet";
import { CloseSheet, defaultRefundRows } from "../sheets/CloseSheet";
import { FEED_FULL, feedAfterGroceries } from "../fixtures";
import { MAYA, SAM, LEO, CREW } from "../data";
import { InviteLanding } from "../screens/InviteLanding";

export const CmpPot: React.FC<{ theme: ThemeName }> = ({ theme }) => (
  <BareScreen theme={theme}>
    <PotScreen showDemoBanner balance={450} yourShare={150} putIn={150} collected={450} feed={FEED_FULL} />
  </BareScreen>
);

export const CmpInstant: React.FC<{ theme: ThemeName }> = ({ theme }) => (
  <BareScreen theme={theme}>
    <PotScreen showDemoBanner balance={366} yourShare={122} putIn={150} collected={450} feed={feedAfterGroceries()} />
    <SpendSheet step="sent" amount={84} />
  </BareScreen>
);

export const CmpRules: React.FC<{ theme: ThemeName }> = ({ theme }) => (
  <BareScreen theme={theme}>
    <PotScreen showDemoBanner balance={450} yourShare={150} putIn={150} collected={450} activeTab="rules" feed={FEED_FULL} />
  </BareScreen>
);

/** p2-day-close.png: the sheet over the Pot scrolled down (the capture shows $450 rows). */
export const CmpClose: React.FC<{ theme: ThemeName }> = ({ theme }) => (
  <BareScreen theme={theme}>
    <PotScreen showDemoBanner balance={450} yourShare={150} putIn={150} collected={450} feed={FEED_FULL} scrollY={398} />
    <CloseSheet mode="propose" rows={defaultRefundRows(150)} />
  </BareScreen>
);

export const CmpCloseApprove: React.FC<{ theme: ThemeName }> = ({ theme }) => (
  <BareScreen theme={theme}>
    <PotScreen showDemoBanner balance={450} yourShare={150} putIn={150} collected={450} feed={FEED_FULL} scrollY={398} />
    <CloseSheet mode="vote" me={SAM} proposer={MAYA} rows={defaultRefundRows(150)} />
  </BareScreen>
);

export const CmpClosed: React.FC<{ theme: ThemeName }> = ({ theme }) => (
  <BareScreen theme={theme}>
    <PotScreen showDemoBanner balance={0} yourShare={0} putIn={150} collected={450} feed={FEED_FULL} closed={{ date: "Oct 22", refund: 150 }} scrollY={420} />
    <CloseSheet mode="closed" me={SAM} rows={defaultRefundRows(150)} />
  </BareScreen>
);

/** day-invite-landing.png uses Porto Weekend (🍷, cover 3, $300 of $450, Maya + Sam). */
export const CmpInvite: React.FC<{ theme: ThemeName }> = ({ theme }) => (
  <BareScreen theme={theme}>
    <InviteLanding potName="Porto Weekend" emoji="🍷" cover={3} members={CREW.slice(0, 2)} expiry="Oct 27" />
  </BareScreen>
);

/** live-day-pot.png: the testnet capture with an approved $300 and an instant $20 (cover 3). */
export const CmpLivePot: React.FC<{ theme: ThemeName }> = ({ theme }) => (
  <BareScreen theme={theme}>
    <PotScreen
      showDemoBanner
      cover={3}
      balance={130}
      yourShare={43.33}
      putIn={150}
      collected={450}
      feed={[
        {
          label: "Today",
          items: [
            { kind: "approved", to: MAYA, amount: 300, reason: "tickets", approvedBy: ["Maya", "Leo"] },
            { kind: "instant", who: MAYA, amount: 20, reason: "groceries", instantLimit: 100 },
            { kind: "contribution", who: LEO, amount: 150, when: "just now" },
          ],
        },
      ]}
    />
  </BareScreen>
);
