// Logs the screen-relative rects of [data-ui] elements for the key states (inside a phone: safe areas 50 / 34),
// so src/ui/layout.ts can publish exact breakout positions. Run:
//   node src/ui/preview/measure.mjs   (the CLI does not forward browser logs; the renderer API does)
import React, { useLayoutEffect, useRef } from "react";
import { AbsoluteFill, continueRender, delayRender } from "remotion";
import { SAFE_BOTTOM, SAFE_TOP, SCREEN_H, SCREEN_W } from "../Phone";
import { DISPLAY, SANS } from "../type";
import { UiTheme } from "../theme";
import { PotScreen } from "../screens/PotScreen";
import { SpendSheet } from "../sheets/SpendSheet";
import { ApproveSheet } from "../sheets/ApproveSheet";
import { CloseSheet } from "../sheets/CloseSheet";
import { CreatePotSheet } from "../sheets/CreatePotSheet";
import { AddMoneySheet } from "../sheets/AddMoneySheet";
import { MoreSheet } from "../sheets/MenuSheets";
import { PayInSheet } from "../screens/Links";
import { LockScreen } from "../screens/Push";
import { ChatScreen, shareText } from "../screens/ChatScreen";
import { FEED_FULL, feedAfterGroceries, feedAfterBoat, feedBoatPending, memberLines, TRUST_NEW } from "../fixtures";
import { MAYA, SAM, LEO } from "../data";

export const MEASURE_COLS = 8;
export const MEASURE_ROWS = 4;

const Screen: React.FC<{ name: string; children: React.ReactNode }> = ({ name, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const handle = delayRender(`measure ${name}`);
    // measure only once the brand fonts are in (layout depends on them)
    const loads = ["700", "800"].map((w) => document.fonts.load(`${w} 44px ${DISPLAY}`)).concat(["400", "600", "700"].map((w) => document.fonts.load(`${w} 16px ${SANS}`)));
    Promise.all(loads).then(() => new Promise((r) => setTimeout(r, 200))).then(() => {
      const root = ref.current;
      if (root) {
        const r0 = root.getBoundingClientRect();
        const k = r0.width / SCREEN_W; // undo the render scale
        const out: Record<string, number[]> = {};
        root.querySelectorAll("[data-ui]").forEach((el, i) => {
          const r = el.getBoundingClientRect();
          const key = `${el.getAttribute("data-ui")}${out[el.getAttribute("data-ui") ?? ""] ? `#${i}` : ""}`;
          out[key] = [(r.left - r0.left) / k, (r.top - r0.top) / k, r.width / k, r.height / k].map((v) => Math.round(v * 100) / 100);
        });
        // eslint-disable-next-line no-console
        console.log(`UIMEASURE ${name} ${JSON.stringify(out)}`);
      }
      continueRender(handle);
    });
  }, [name]);
  return (
    <div ref={ref} style={{ position: "relative", width: SCREEN_W, height: SCREEN_H, overflow: "hidden", flexShrink: 0 }}>
      <UiTheme theme="day" safeTop={SAFE_TOP} safeBottom={SAFE_BOTTOM}>
        {children}
      </UiTheme>
    </div>
  );
};

const pot366 = { balance: 366, yourShare: 122, putIn: 150, feed: feedAfterGroceries() } as const;

export const Measure: React.FC = () => (
  <AbsoluteFill style={{ flexDirection: "row", flexWrap: "wrap", gap: 0 }}>
    <Screen name="pot">
      <PotScreen balance={450} yourShare={150} putIn={150} feed={FEED_FULL} />
    </Screen>
    <Screen name="spendHowMuch">
      <PotScreen balance={450} yourShare={150} putIn={150} feed={FEED_FULL} />
      <SpendSheet step="howMuch" typed="84" />
    </Screen>
    <Screen name="spendDetails">
      <PotScreen balance={450} yourShare={150} putIn={150} feed={FEED_FULL} />
      <SpendSheet step="details" typed="84" category="groceries" />
    </Screen>
    <Screen name="spendDetailsOneOk">
      <PotScreen {...pot366} />
      <SpendSheet step="details" typed="300" category="tickets" note="the boat trip" />
    </Screen>
    <Screen name="spendSent">
      <PotScreen {...pot366} />
      <SpendSheet step="sent" amount={84} />
    </Screen>
    <Screen name="spendApproved">
      <PotScreen {...pot366} />
      <SpendSheet step="approved" amount={84} />
    </Screen>
    <Screen name="spendOneOkSent">
      <PotScreen {...pot366} />
      <SpendSheet step="oneOkSent" amount={300} category="tickets" />
    </Screen>
    <Screen name="spendVoteSentGroup">
      <PotScreen {...pot366} />
      <SpendSheet step="voteSent" amount={300} category="tickets" tier="group" />
    </Screen>
    <Screen name="approve">
      <PotScreen {...pot366} feed={feedBoatPending()} />
      <ApproveSheet state="ready" />
    </Screen>
    <Screen name="approveDone">
      <PotScreen balance={66} yourShare={22} putIn={150} feed={feedAfterBoat()} />
      <ApproveSheet state="approved" />
    </Screen>
    <Screen name="approveGroup">
      <PotScreen {...pot366} feed={feedBoatPending(1, "group")} />
      <ApproveSheet state="ready" variant="group" />
    </Screen>
    <Screen name="closePropose">
      <PotScreen balance={66} yourShare={22} putIn={150} feed={feedAfterBoat()} />
      <CloseSheet mode="propose" />
    </Screen>
    <Screen name="closed">
      <PotScreen balance={66} yourShare={22} putIn={150} feed={feedAfterBoat()} />
      <CloseSheet mode="closed" />
    </Screen>
    <Screen name="settings">
      <PotScreen balance={450} yourShare={150} putIn={150} activeTab="settings" />
    </Screen>
    <Screen name="members">
      <PotScreen balance={450} yourShare={150} putIn={150} activeTab="members" memberLines={memberLines(450, MAYA.id, TRUST_NEW)} memberTotals={{ in: 450, spent: 0, left: 450 }} />
    </Screen>
    <Screen name="lock">
      <LockScreen notifications={[{ id: "n", progress: 1 }]} />
    </Screen>
    <Screen name="createLean">
      <CreatePotSheet step={1} />
    </Screen>
    <Screen name="createRules">
      <CreatePotSheet step={2} />
    </Screen>
    <Screen name="addStep1">
      <PotScreen balance={300} yourShare={0} putIn={0} collected={300} feed={FEED_FULL.slice(1)} />
      <AddMoneySheet step={1} />
    </Screen>
    <Screen name="addStep2">
      <PotScreen balance={300} yourShare={0} putIn={0} collected={300} feed={FEED_FULL.slice(1)} />
      <AddMoneySheet step={2} />
    </Screen>
    <Screen name="payIn">
      <PotScreen balance={450} yourShare={150} putIn={150} feed={FEED_FULL} />
      <PayInSheet />
    </Screen>
    <Screen name="more">
      <PotScreen balance={450} yourShare={150} putIn={150} feed={FEED_FULL} />
      <MoreSheet />
    </Screen>
    <Screen name="sendLink">
      <PotScreen balance={450} yourShare={150} putIn={150} feed={FEED_FULL} />
      <SpendSheet step="sent" amount={40} category="other" payee="link" linkLabel="Casa Lisboa host" />
    </Screen>
    <Screen name="potWaiting">
      <PotScreen
        {...pot366}
        feed={feedBoatPending()}
        waiting={[{ who: MAYA, amount: 300, reason: "the boat trip", approvals: 1, k: 2, expires: "in 7 days" }]}
        tabBar={{ active: "pots", badge: 1 }}
      />
    </Screen>
    <Screen name="potGoal">
      <PotScreen balance={300} yourShare={150} putIn={150} collected={300} goal={450} goalBanner={{ state: "collecting", collected: 300, goal: 450 }} feed={FEED_FULL.slice(1)} />
    </Screen>
    <Screen name="chat">
      <ChatScreen
        messages={[
          { id: "1", from: SAM, text: "Who's paying for the boat? 🛥️", time: "21:02" },
          { id: "2", from: LEO, text: "I'll pay you back, promise", time: "21:03" },
          { id: "4", from: MAYA, kind: "link", text: shareText(), time: "21:05", link: { members: [MAYA, SAM] } },
        ]}
      />
    </Screen>
  </AbsoluteFill>
);
