// Gallery compositions (1920 × 1080, 60 fps): several phones side by side in key story states (the app of
// 2026-11-03: round actions, compact feed, two-step sheets, one OK). A few props are driven by the frame so the
// galleries double as motion checks (burst, typing dots, caret, presses).
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { day, night } from "../../brand/tokens";
import { SANS } from "../../brand/fonts";
import { Phone, PHONE_H, PHONE_W } from "../Phone";
import type { ThemeName } from "../theme";
import { PotScreen } from "../screens/PotScreen";
import { SpendSheet } from "../sheets/SpendSheet";
import { ApproveSheet, OneOkLine, SpendFacts } from "../sheets/ApproveSheet";
import { CloseSheet, defaultRefundRows } from "../sheets/CloseSheet";
import { InviteLanding } from "../screens/InviteLanding";
import { YoureInSheet } from "../sheets/YoureInSheet";
import { AddMoneySheet } from "../sheets/AddMoneySheet";
import { CreatePotSheet, CreateRuleCard, CreateSummaryBox } from "../sheets/CreatePotSheet";
import { AskSheet, MoreSheet } from "../sheets/MenuSheets";
import { ChatScreen, shareText, type ChatMessage } from "../screens/ChatScreen";
import { LockScreen, PushNotification } from "../screens/Push";
import { PayInCard, PayInSheet, SendLinkCard } from "../screens/Links";
import { Toast } from "../atoms/Toast";
import { TouchDot, pressAt } from "../atoms/Touch";
import { copy } from "../copy";
import { CREW, LEO, LISBON, MAYA, SAM, STORY } from "../data";
import { formatUsd } from "../format";
import {
  FEED_FULL,
  feedAfterBoat,
  feedAfterGroceries,
  feedBoatPending,
  feedClosed,
  feedLeoAdding,
  feedPayIn,
  memberLines,
  payInItem,
  TRUST_NEW,
} from "../fixtures";
import { UiPiece } from "../Standalone";
import { RulesCapsule } from "../atoms/ResultCards";
import { DecisionLine } from "../atoms/Decision";
import { RefundTable } from "../atoms/RefundTable";
import { RuleRow, ruleTiers } from "../atoms/Rules";
import { FeedRow } from "../atoms/Feed";
import { GoalCard } from "../atoms/Goal";
import { MyTrustCard, TrustLevelUp, TrustRow } from "../atoms/Trust";
import { PotActions } from "../atoms/PotActions";
import { LinkPreviewCard } from "../screens/ChatScreen";
import { OgCard } from "../screens/OgCard";

const Stage: React.FC<{ theme?: ThemeName; children: React.ReactNode; gap?: number }> = ({ theme = "day", children, gap = 44 }) => (
  <AbsoluteFill
    style={{
      background: theme === "night" ? night.ground : day.ground,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap,
    }}
  >
    {children}
  </AbsoluteFill>
);

const Slot: React.FC<{ label: string; theme?: ThemeName; zoom?: number; children: React.ReactNode }> = ({ label, theme = "day", zoom = 1, children }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
    <div style={{ fontFamily: SANS, fontSize: 18, fontWeight: 600, color: theme === "night" ? night.inkMuted : day.inkMuted }}>{label}</div>
    <div style={{ width: PHONE_W * zoom, height: PHONE_H * zoom }}>{children}</div>
  </div>
);

const clampRamp = (f: number, a: number, b: number) => interpolate(f, [a, b], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

const waitingBoat = [{ who: MAYA, amount: 300, reason: "the boat trip", approvals: 1, k: 2, expires: copy["time.in_days"](7) }];

/** Story beats: Pot $450 · approved by Pot rules ($366, burst) · Leo gives one OK ($300) · closed ($22.00). */
export const GalleryStory: React.FC<{ theme?: ThemeName }> = ({ theme = "day" }) => {
  const f = useCurrentFrame();
  const burst = clampRamp(f, 10, 46);
  const z = 1;
  return (
    <Stage theme={theme}>
      <Slot label="Pot · $450.00" theme={theme} zoom={z}>
        <Phone theme={theme} zoom={z}>
          <PotScreen balance={450} yourShare={150} putIn={150} feed={FEED_FULL} />
        </Phone>
      </Slot>
      <Slot label="Approved by Pot rules · burst" theme={theme} zoom={z}>
        <Phone theme={theme} zoom={z}>
          <PotScreen balance={STORY.afterGroceries} yourShare={122} putIn={150} feed={feedAfterGroceries()} tabBar={{ active: "pots", balance: 84 }} />
          <SpendSheet
            step="approved"
            amount={84}
            burstProgress={burst}
            burstVariant="cinematic"
            burstDistance={1.5}
            burstSize={1.5}
            checkPop={clampRamp(f, 8, 28)}
          />
        </Phone>
      </Slot>
      <Slot label="Leo gives one OK · $300" theme={theme} zoom={z}>
        <Phone theme={theme} zoom={z}>
          <PotScreen balance={STORY.afterGroceries} yourShare={122} putIn={150} feed={feedBoatPending()} waiting={waitingBoat} tabBar={{ active: "pots", badge: 1 }} />
          <ApproveSheet state="ready" />
        </Phone>
      </Slot>
      <Slot label="Pot closed · $22.00" theme={theme} zoom={z}>
        <Phone theme={theme} zoom={z}>
          <PotScreen balance={0} yourShare={22} putIn={150} feed={feedClosed()} closed={{ date: "Nov 3", refund: 22 }} tabBar={{ active: "pots", balance: 406 }} />
          <CloseSheet mode="closed" />
        </Phone>
      </Slot>
    </Stage>
  );
};

/** Joining: the invite landing, the join progress, You're in!, Add $150 (step 2), Added with the toast. */
export const GalleryJoin: React.FC<{ theme?: ThemeName }> = ({ theme = "day" }) => {
  const f = useCurrentFrame();
  const z = 0.82;
  const press = pressAt(f - 20);
  return (
    <Stage theme={theme} gap={30}>
      <Slot label="Invite landing" theme={theme} zoom={z}>
        <Phone theme={theme} zoom={z}>
          <InviteLanding scrollY={300} googlePress={press} />
          <TouchDot press={press} x={195} y={570} />
        </Phone>
      </Slot>
      <Slot label="Joining…" theme={theme} zoom={z}>
        <Phone theme={theme} zoom={z}>
          <InviteLanding scrollY={300} joinStep={2} />
        </Phone>
      </Slot>
      <Slot label="You're in!" theme={theme} zoom={z}>
        <Phone theme={theme} zoom={z}>
          <InviteLanding scrollY={300} joinStep={3} members={[MAYA, SAM, LEO]} emptySeats={0} />
          <YoureInSheet />
        </Phone>
      </Slot>
      <Slot label="Add $150 · step 2" theme={theme} zoom={z}>
        <Phone theme={theme} zoom={z}>
          <PotScreen balance={300} yourShare={0} putIn={0} collected={300} feed={FEED_FULL.slice(1)} />
          <AddMoneySheet ctaPress={press} />
        </Phone>
      </Slot>
      <Slot label="Added · $450.00" theme={theme} zoom={z}>
        <Phone theme={theme} zoom={z}>
          <PotScreen balance={450} yourShare={150} putIn={150} collected={450} feed={feedLeoAdding("added")} />
          <Toast text={copy["add.success"](LISBON.name, formatUsd(450))} />
        </Phone>
      </Slot>
    </Stage>
  );
};

const chatMessages = (f: number): ChatMessage[] => [
  { id: "1", from: SAM, text: "Who's paying for the boat? 🛥️", time: "21:02" },
  { id: "2", from: LEO, text: "I'll pay you back, promise", time: "21:03" },
  { id: "3", from: SAM, text: "you said that about the airbnb 😅", time: "21:03" },
  {
    id: "4",
    from: MAYA,
    kind: "link",
    text: shareText(),
    time: "21:05",
    link: { members: [MAYA, SAM] },
    appear: clampRamp(f, 10, 40),
  },
  { id: "5", from: LEO, kind: "typing", appear: clampRamp(f, 44, 64) },
];

/** The chat (Night + Day), Leo's one-OK push on the lock screen, and Create (lean, typing) + Pot rules. */
export const GalleryChat: React.FC = () => {
  const f = useCurrentFrame();
  const z = 0.82;
  const typed = interpolate(f, [0, 66], [0, 11], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: `linear-gradient(90deg, ${night.ground} 0%, ${night.ground} 40.5%, ${day.ground} 40.5%, ${day.ground} 100%)`, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 30 }}>
      <Slot label="Group chat · Night" theme="night" zoom={z}>
        <Phone theme="night" zoom={z}>
          <ChatScreen messages={chatMessages(f)} />
        </Phone>
      </Slot>
      <Slot label="Push · one OK" theme="night" zoom={z}>
        <Phone theme="day" zoom={z} statusBarTone="dark">
          <LockScreen notifications={[{ id: "ok", progress: clampRamp(f, 6, 30) }]} />
        </Phone>
      </Slot>
      <Slot label="Group chat · Day" theme="day" zoom={z}>
        <Phone theme="day" zoom={z}>
          <ChatScreen messages={chatMessages(70)} />
          <PushNotification progress={clampRamp(f, 20, 44)} />
        </Phone>
      </Slot>
      <Slot label="Start a Pot · typing" theme="day" zoom={z}>
        <Phone theme="day" zoom={z}>
          <PotScreen balance={0} yourShare={0} putIn={0} collected={0} feed={[]} />
          <CreatePotSheet step={1} typedChars={typed} />
        </Phone>
      </Slot>
      <Slot label="Pot rules ([Change])" theme="day" zoom={z}>
        <Phone theme="day" zoom={z}>
          <PotScreen balance={0} yourShare={0} putIn={0} collected={0} feed={[]} />
          <CreatePotSheet step={2} bodyScroll={260} highlightRule={f > 30 ? "oneOk" : null} />
        </Phone>
      </Slot>
    </AbsoluteFill>
  );
};

/** The Spend flow beat by beat: How much? · What's it for? · checking · sent · $300 needs one OK · sent. */
export const GallerySpend: React.FC<{ theme?: ThemeName }> = ({ theme = "day" }) => {
  const f = useCurrentFrame();
  const z = 0.72;
  const press = pressAt(f - 10);
  return (
    <Stage theme={theme} gap={20}>
      <Slot label="1 · How much? $84" theme={theme} zoom={z}>
        <Phone theme={theme} zoom={z}>
          <PotScreen balance={450} yourShare={150} putIn={150} feed={FEED_FULL} />
          <SpendSheet step="howMuch" typed="84" pressedKey="4" keyPress={press} />
        </Phone>
      </Slot>
      <Slot label="2 · Groceries · Me" theme={theme} zoom={z}>
        <Phone theme={theme} zoom={z}>
          <PotScreen balance={450} yourShare={150} putIn={150} feed={FEED_FULL} />
          <SpendSheet step="details" typed="84" category="groceries" ctaPress={press} />
        </Phone>
      </Slot>
      <Slot label="Checking Pot rules…" theme={theme} zoom={z}>
        <Phone theme={theme} zoom={z}>
          <PotScreen balance={450} yourShare={150} putIn={150} feed={FEED_FULL} />
          <SpendSheet step="checking" amount={84} />
        </Phone>
      </Slot>
      <Slot label="$84 sent to you" theme={theme} zoom={z}>
        <Phone theme={theme} zoom={z}>
          <PotScreen balance={366} yourShare={122} putIn={150} feed={feedAfterGroceries()} tabBar={{ active: "pots", balance: 84 }} />
          <SpendSheet step="sent" amount={84} donePress={press} />
        </Phone>
      </Slot>
      <Slot label="$300 · needs one OK" theme={theme} zoom={z}>
        <Phone theme={theme} zoom={z}>
          <PotScreen balance={366} yourShare={122} putIn={150} feed={feedAfterGroceries()} />
          <SpendSheet step="details" typed="300" category="tickets" note="the boat trip" decisionOpen={clampRamp(f, 30, 50)} />
        </Phone>
      </Slot>
      <Slot label="Sent · one OK" theme={theme} zoom={z}>
        <Phone theme={theme} zoom={z}>
          <PotScreen balance={366} yourShare={122} putIn={150} feed={feedBoatPending()} />
          <SpendSheet step="oneOkSent" amount={300} category="tickets" />
        </Phone>
      </Slot>
    </Stage>
  );
};

/** Leo's OK (ready → sending → done), the Pot at $66, closing (propose, vote in flight). */
export const GalleryDecide: React.FC<{ theme?: ThemeName }> = ({ theme = "day" }) => {
  const f = useCurrentFrame();
  const z = 0.82;
  return (
    <Stage theme={theme} gap={30}>
      <Slot label="One OK · ready (Leo)" theme={theme} zoom={z}>
        <Phone theme={theme} zoom={z}>
          <PotScreen balance={STORY.afterGroceries} yourShare={122} putIn={150} feed={feedBoatPending()} waiting={waitingBoat} />
          <ApproveSheet state="ready" approvePress={pressAt(f - 20)} />
        </Phone>
      </Slot>
      <Slot label="Sending your OK…" theme={theme} zoom={z}>
        <Phone theme={theme} zoom={z}>
          <PotScreen balance={STORY.afterGroceries} yourShare={122} putIn={150} feed={feedBoatPending()} waiting={waitingBoat} />
          <ApproveSheet state="approving" />
        </Phone>
      </Slot>
      <Slot label="Done. Your OK sent $300" theme={theme} zoom={z}>
        <Phone theme={theme} zoom={z}>
          <PotScreen balance={STORY.afterBoat} yourShare={22} putIn={150} feed={feedAfterBoat()} />
          <ApproveSheet state="approved" tickPop={clampRamp(f, 0, 20)} statusAppear={clampRamp(f, 6, 24)} />
        </Phone>
      </Slot>
      <Slot label="Close Lisbon Trip?" theme={theme} zoom={z}>
        <Phone theme={theme} zoom={z}>
          <PotScreen balance={STORY.afterBoat} yourShare={22} putIn={150} feed={feedAfterBoat()} tabBar={{ active: "pots", balance: 384 }} />
          <CloseSheet mode="propose" />
        </Phone>
      </Slot>
      <Slot label="Approving… (Leo)" theme={theme} zoom={z}>
        <Phone theme={theme} zoom={z}>
          <PotScreen balance={STORY.afterBoat} yourShare={22} putIn={150} feed={feedAfterBoat()} closing />
          <CloseSheet mode="vote" me={LEO} proposer={MAYA} voting votePop={clampRamp(f, 0, 20)} />
        </Phone>
      </Slot>
    </Stage>
  );
};

/** Standalone breakout pieces at in-phone size (358 wide), plus a yawed phone with body depth. */
export const GalleryPieces: React.FC = () => {
  const f = useCurrentFrame();
  const burst = clampRamp(f, 10, 46);
  const tiers = ruleTiers();
  return (
    <AbsoluteFill style={{ background: day.ground, padding: 50, flexDirection: "row", gap: 44, alignItems: "flex-start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <UiPiece theme="day" style={{ marginTop: 40 }}>
          <RulesCapsule state="approved" burstProgress={burst} burstVariant="cinematic" burstDistance={1.6} burstSize={1.6} />
        </UiPiece>
        <UiPiece theme="day" card="surface" padding={12}>
          <DecisionLine path="one_ok" open={clampRamp(f, 20, 40)} details={[copy["spend.refund_after"]("$22")]} />
        </UiPiece>
        <UiPiece theme="day" card="surface" padding={16} shadow>
          <OneOkLine okBy={f > 40 ? LEO : null} okPop={clampRamp(f, 40, 58)} />
        </UiPiece>
        <UiPiece theme="day" card="surface" padding={16}>
          <SpendFacts status="waiting" approved={copy["record.approved.none"]} balanceAfter={66} expires="in 7 days" />
        </UiPiece>
        <UiPiece theme="night" card="surface" padding={16}>
          <RulesCapsule state="approved" />
        </UiPiece>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {tiers.map((t) => (
          <UiPiece key={t.key} theme="day">
            <RuleRow icon={t.icon} text={t.text} highlight={t.key === "oneOk" ? clampRamp(f, 20, 36) : 0} />
          </UiPiece>
        ))}
        <UiPiece theme="day" card="surface" padding={16} shadow style={{ marginTop: 10 }}>
          <RefundTable rows={defaultRefundRows()} me={MAYA.id} />
        </UiPiece>
        <UiPiece theme="day" width={374}>
          <PushNotification variant="lock" />
        </UiPiece>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24, alignItems: "center" }}>
        <UiPiece theme="day" card="surface" padding={16} shadow width={326}>
          <PotActions press={{ target: "spend", amount: pressAt(f - 20) }} touchDot />
        </UiPiece>
        <UiPiece theme="day" width={264}>
          <LinkPreviewCard link={{ members: CREW }} />
        </UiPiece>
        <OgCard width={420} />
        <div style={{ perspective: 2400, marginTop: 6 }}>
          <div style={{ transformStyle: "preserve-3d", transform: `rotateY(${-28 + Math.sin(f / 30) * 4}deg) rotateX(6deg)`, zoom: 0.42 }}>
            <Phone theme="day" depth={12}>
              <PotScreen balance={450} yourShare={150} putIn={150} feed={FEED_FULL} />
            </Phone>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** "And more" (builder B): earned trust, the goal with a date, money from outside, paying by link. */
export const GalleryMore: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: day.ground, padding: 50, flexDirection: "row", gap: 40, alignItems: "flex-start", justifyContent: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <UiPiece theme="day">
          <TrustRow level={f > 30 ? 1 : 0} badgePop={f > 30 ? clampRamp(f, 30, 46) : 1} upTo={interpolate(clampRamp(f, 30, 50), [0, 1], [100, 200])} />
        </UiPiece>
        <UiPiece theme="day">
          <TrustLevelUp appear={clampRamp(f, 40, 58)} />
        </UiPiece>
        <UiPiece theme="day">
          <MyTrustCard level={0} nextIn={1} />
        </UiPiece>
        <UiPiece theme="day">
          <GoalCard collected={300} goal={450} daysLeft={3} progress={clampRamp(f, 0, 30) * (300 / 450)} />
        </UiPiece>
        <UiPiece theme="day">
          <GoalCard state="reached" balance={450} collected={450} goal={450} reachedPop={clampRamp(f, 20, 38)} />
        </UiPiece>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <UiPiece theme="day">
          <PayInCard qrReveal={clampRamp(f, 0, 40)} />
        </UiPiece>
        <UiPiece theme="day" card="surface" padding={12}>
          <FeedRow item={payInItem()} />
        </UiPiece>
        <UiPiece theme="day" card="surface" padding={12}>
          <FeedRow item={payInItem(1, "gift", 10)} />
        </UiPiece>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <UiPiece theme="day">
          <SendLinkCard who="Casa Lisboa host" claimed={f > 50} claimedPop={clampRamp(f, 50, 66)} qrReveal={clampRamp(f, 0, 40)} />
        </UiPiece>
        <UiPiece theme="day">
          <CreateRuleCard kind="oneOk" highlight={clampRamp(f, 20, 36)} />
        </UiPiece>
        <UiPiece theme="day">
          <CreateSummaryBox />
        </UiPiece>
      </div>
    </AbsoluteFill>
  );
};

/** Night versions of key beats. */
export const GalleryNight: React.FC = () => {
  const f = useCurrentFrame();
  const z = 0.82;
  return (
    <Stage theme="night" gap={30}>
      <Slot label="Pot" theme="night" zoom={z}>
        <Phone theme="night" zoom={z}>
          <PotScreen balance={450} yourShare={150} putIn={150} feed={FEED_FULL} />
        </Phone>
      </Slot>
      <Slot label="How much?" theme="night" zoom={z}>
        <Phone theme="night" zoom={z}>
          <PotScreen balance={450} yourShare={150} putIn={150} feed={FEED_FULL} />
          <SpendSheet step="howMuch" typed="84" />
        </Phone>
      </Slot>
      <Slot label="Approved" theme="night" zoom={z}>
        <Phone theme="night" zoom={z}>
          <PotScreen balance={366} yourShare={122} putIn={150} feed={feedAfterGroceries()} />
          <SpendSheet step="approved" amount={84} burstProgress={clampRamp(f, 10, 46)} />
        </Phone>
      </Slot>
      <Slot label="One OK" theme="night" zoom={z}>
        <Phone theme="night" zoom={z}>
          <PotScreen balance={366} yourShare={122} putIn={150} feed={feedBoatPending()} />
          <ApproveSheet state="ready" />
        </Phone>
      </Slot>
      <Slot label="Closed" theme="night" zoom={z}>
        <Phone theme="night" zoom={z}>
          <PotScreen balance={0} yourShare={22} putIn={150} feed={feedClosed()} closed={{ date: "Nov 3", refund: 22 }} />
          <CloseSheet mode="closed" />
        </Phone>
      </Slot>
    </Stage>
  );
};

/** Mid-animation checks: sheet slide + scrim, feed insert + count-up, tab slide to Settings, chat pop, push slide. */
export const GalleryMotion: React.FC = () => {
  const f = useCurrentFrame();
  const ramp = (a: number, b: number) => clampRamp(f, a, b);
  const z = 0.82;
  return (
    <Stage theme="day" gap={30}>
      <Slot label="Sheet in (360 ms)" zoom={z}>
        <Phone theme="day" zoom={z}>
          <PotScreen balance={450} yourShare={150} putIn={150} feed={FEED_FULL} press={{ target: "spend", amount: pressAt(f) }} touchDot />
          <SpendSheet step="howMuch" typed="" progress={ramp(10, 32)} />
        </Phone>
      </Slot>
      <Slot label="Insert + count-up" zoom={z}>
        <Phone theme="day" zoom={z}>
          <PotScreen
            balance={interpolate(ramp(0, 30), [0, 1], [300, 450])}
            yourShare={150}
            putIn={150}
            collected={interpolate(ramp(0, 30), [0, 1], [300, 450])}
            pendingIn={f < 10 ? 150 : 0}
            feed={feedLeoAdding(f < 10 ? "adding" : "added", ramp(0, 17))}
          />
        </Phone>
      </Slot>
      <Slot label="Tab slide · Settings" zoom={z}>
        <Phone theme="day" zoom={z}>
          <PotScreen
            balance={450}
            yourShare={150}
            putIn={150}
            feed={FEED_FULL}
            tabIndex={interpolate(ramp(0, 17), [0, 1], [0, 2])}
            settings={{ appear: { instant: ramp(10, 30), trust: ramp(14, 34), oneOk: ramp(18, 38) } }}
          />
        </Phone>
      </Slot>
      <Slot label="Chat pop" zoom={z}>
        <Phone theme="night" zoom={z}>
          <ChatScreen messages={chatMessages(f)} />
        </Phone>
      </Slot>
      <Slot label="Push slide + press" zoom={z}>
        <Phone theme="day" zoom={z}>
          <PotScreen balance={366} yourShare={122} putIn={150} feed={feedAfterGroceries()} />
          <PushNotification progress={ramp(0, 22)} pressed={pressAt(f - 30)} />
        </Phone>
      </Slot>
    </Stage>
  );
};

/** Remaining states: Members with trust, More options, Ask, Settings scrolled, pay in, add step 1, creating. */
export const GalleryMisc: React.FC = () => {
  const z = 0.72;
  return (
    <Stage theme="day" gap={20}>
      <Slot label="Members · trust" zoom={z}>
        <Phone theme="day" zoom={z}>
          <PotScreen balance={450} yourShare={150} putIn={150} activeTab="members" memberLines={memberLines(450, MAYA.id, TRUST_NEW)} memberTotals={{ in: 450, spent: 0, left: 450 }} scrollY={330} />
        </Phone>
      </Slot>
      <Slot label="More options" zoom={z}>
        <Phone theme="day" zoom={z}>
          <PotScreen balance={450} yourShare={150} putIn={150} feed={FEED_FULL} />
          <MoreSheet />
        </Phone>
      </Slot>
      <Slot label="Ask for money" zoom={z}>
        <Phone theme="day" zoom={z}>
          <PotScreen balance={450} yourShare={150} putIn={150} feed={FEED_FULL} />
          <AskSheet />
        </Phone>
      </Slot>
      <Slot label="Settings" zoom={z}>
        <Phone theme="day" zoom={z}>
          <PotScreen balance={450} yourShare={150} putIn={150} activeTab="settings" scrollY={420} />
        </Phone>
      </Slot>
      <Slot label="Pay-in link ready" zoom={z}>
        <Phone theme="day" zoom={z}>
          <PotScreen balance={475} yourShare={158.33} putIn={150} collected={475} feed={feedPayIn()} />
          <PayInSheet />
        </Phone>
      </Slot>
      <Slot label="Add · step 1" zoom={z}>
        <Phone theme="day" zoom={z}>
          <PotScreen balance={450} yourShare={150} putIn={150} feed={FEED_FULL} />
          <AddMoneySheet step={1} typed="" balance={450} collected={450} putIn={150} />
        </Phone>
      </Slot>
    </Stage>
  );
};
