// Gallery compositions (1920 × 1080, 60 fps): several phones side by side in key story states. A few props are
// driven by the frame so the galleries double as motion checks (burst, typing dots, caret, presses).
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { day, night } from "../../brand/tokens";
import { SANS } from "../../brand/fonts";
import { Phone, PHONE_H, PHONE_W } from "../Phone";
import type { ThemeName } from "../theme";
import { PotScreen } from "../screens/PotScreen";
import { SpendSheet } from "../sheets/SpendSheet";
import { ApproveSheet } from "../sheets/ApproveSheet";
import { CloseSheet, defaultRefundRows } from "../sheets/CloseSheet";
import { InviteLanding } from "../screens/InviteLanding";
import { YoureInSheet } from "../sheets/YoureInSheet";
import { AddMoneySheet } from "../sheets/AddMoneySheet";
import { CreatePotSheet } from "../sheets/CreatePotSheet";
import { ChatScreen, shareText, type ChatMessage } from "../screens/ChatScreen";
import { LockScreen, PushNotification } from "../screens/Push";
import { Toast } from "../atoms/Toast";
import { TouchDot, pressAt } from "../atoms/Touch";
import { copy } from "../copy";
import { CREW, LEO, LISBON, MAYA, SAM, STORY } from "../data";
import { formatUsd } from "../format";
import { FEED_FULL, feedAfterBoat, feedAfterGroceries, feedBoatPending, feedClosed, feedLeoAdding, memberLines } from "../fixtures";
import { UiPiece } from "../Standalone";
import { RulesCapsule } from "../atoms/ResultCards";
import { ApprovalTimeline, timelineRows } from "../atoms/Approvals";
import { RefundTable } from "../atoms/RefundTable";
import { RuleRow, tripRules } from "../atoms/Rules";
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

/** Story beats 2-5: Pot $450 · instant approval ($366, burst) · Leo approves $300 · closed ($22.00). */
export const GalleryStory: React.FC<{ theme?: ThemeName }> = ({ theme = "day" }) => {
  const f = useCurrentFrame();
  const burst = interpolate(f, [10, 46], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
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
          <PotScreen balance={STORY.afterGroceries} yourShare={122} putIn={150} feed={feedAfterGroceries()} />
          <SpendSheet
            step="approved"
            amount={84}
            burstProgress={burst}
            burstVariant="cinematic"
            burstDistance={1.5}
            burstSize={1.5}
            checkPop={interpolate(f, [8, 28], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
          />
        </Phone>
      </Slot>
      <Slot label="Leo approves $300" theme={theme} zoom={z}>
        <Phone theme={theme} zoom={z}>
          <PotScreen
            balance={STORY.afterGroceries}
            yourShare={122}
            putIn={150}
            feed={feedBoatPending()}
            waiting={[{ who: MAYA, amount: 300, reason: "the boat trip", approvals: 1, k: 2, expires: copy["time.in_days"](7) }]}
            tabBar={{ active: "pots", badge: 1 }}
          />
          <ApproveSheet state="ready" />
        </Phone>
      </Slot>
      <Slot label="Pot closed · $22.00" theme={theme} zoom={z}>
        <Phone theme={theme} zoom={z}>
          <PotScreen balance={0} yourShare={0} putIn={150} feed={feedClosed()} closed={{ date: "Oct 22", refund: 22 }} />
          <CloseSheet mode="closed" />
        </Phone>
      </Slot>
    </Stage>
  );
};

/** Story beat 1-2: the invite landing, the join progress, You're in!, Add $150, the Pot at $450 with the toast. */
export const GalleryJoin: React.FC<{ theme?: ThemeName }> = ({ theme = "day" }) => {
  const f = useCurrentFrame();
  const z = 0.82;
  const press = pressAt(f - 20);
  return (
    <Stage theme={theme} gap={30}>
      <Slot label="Invite landing" theme={theme} zoom={z}>
        <Phone theme={theme} zoom={z}>
          <InviteLanding scrollY={300} googlePress={press} />
          <TouchDot press={press} x={195} y={566} />
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
      <Slot label="Add $150" theme={theme} zoom={z}>
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
    appear: interpolate(f, [10, 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
  },
  { id: "5", from: LEO, kind: "typing", appear: interpolate(f, [44, 64], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) },
];

/** The chat (Night + Day), Leo's push on the lock screen, and the Create sheet typing. */
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
      <Slot label="Push · lock screen" theme="night" zoom={z}>
        <Phone theme="day" zoom={z} statusBarTone="dark">
          <LockScreen
            notifications={[{ id: "ok", progress: interpolate(f, [6, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }]}
          />
        </Phone>
      </Slot>
      <Slot label="Group chat · Day" theme="day" zoom={z}>
        <Phone theme="day" zoom={z}>
          <ChatScreen messages={chatMessages(70)} />
          <PushNotification progress={interpolate(f, [20, 44], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} />
        </Phone>
      </Slot>
      <Slot label="Create · typing" theme="day" zoom={z}>
        <Phone theme="day" zoom={z}>
          <PotScreen balance={0} yourShare={0} putIn={0} collected={0} feed={[]} />
          <CreatePotSheet step={1} typedChars={typed} />
        </Phone>
      </Slot>
      <Slot label="Create · Trip rules" theme="day" zoom={z}>
        <Phone theme="day" zoom={z}>
          <PotScreen balance={0} yourShare={0} putIn={0} collected={0} feed={[]} />
          <CreatePotSheet step={2} />
        </Phone>
      </Slot>
    </AbsoluteFill>
  );
};

/** The Spend flow beat by beat: amount (key press), checking, sent, vote, vote sent. */
export const GallerySpend: React.FC<{ theme?: ThemeName }> = ({ theme = "day" }) => {
  const f = useCurrentFrame();
  const z = 0.82;
  const press = pressAt(f - 10);
  return (
    <Stage theme={theme} gap={30}>
      <Slot label="Spend · $84" theme={theme} zoom={z}>
        <Phone theme={theme} zoom={z}>
          <PotScreen balance={450} yourShare={150} putIn={150} feed={FEED_FULL} />
          <SpendSheet step="amount" typed="84" pressedKey="4" keyPress={press} />
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
          <PotScreen balance={366} yourShare={122} putIn={150} feed={feedAfterGroceries()} />
          <SpendSheet step="sent" amount={84} donePress={press} />
        </Phone>
      </Slot>
      <Slot label="$300 · needs 2 of 3" theme={theme} zoom={z}>
        <Phone theme={theme} zoom={z}>
          <PotScreen balance={366} yourShare={122} putIn={150} feed={feedAfterGroceries()} />
          <SpendSheet step="vote" note="the boat trip" ctaPress={press} />
        </Phone>
      </Slot>
      <Slot label="Sent to the group" theme={theme} zoom={z}>
        <Phone theme={theme} zoom={z}>
          <PotScreen balance={366} yourShare={122} putIn={150} feed={feedBoatPending()} />
          <SpendSheet step="voteSent" amount={300} />
        </Phone>
      </Slot>
    </Stage>
  );
};

/** Approve → approved, close propose / vote, rules tab. */
export const GalleryDecide: React.FC<{ theme?: ThemeName }> = ({ theme = "day" }) => {
  const f = useCurrentFrame();
  const z = 0.82;
  return (
    <Stage theme={theme} gap={30}>
      <Slot label="Approved! (Leo)" theme={theme} zoom={z}>
        <Phone theme={theme} zoom={z}>
          <PotScreen balance={STORY.afterBoat} yourShare={22} putIn={150} feed={feedAfterBoat()} />
          <ApproveSheet state="approved" tickPop={interpolate(f, [0, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} />
        </Phone>
      </Slot>
      <Slot label="Pot · $66.00" theme={theme} zoom={z}>
        <Phone theme={theme} zoom={z}>
          <PotScreen
            balance={interpolate(f, [10, 40], [STORY.afterGroceries, STORY.afterBoat], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
            yourShare={22}
            putIn={150}
            feed={feedAfterBoat(interpolate(f, [0, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }))}
          />
        </Phone>
      </Slot>
      <Slot label="Close Lisbon Trip?" theme={theme} zoom={z}>
        <Phone theme={theme} zoom={z}>
          <PotScreen balance={STORY.afterBoat} yourShare={22} putIn={150} feed={feedAfterBoat()} />
          <CloseSheet mode="propose" />
        </Phone>
      </Slot>
      <Slot label="Maya wants to close (Leo)" theme={theme} zoom={z}>
        <Phone theme={theme} zoom={z}>
          <PotScreen balance={STORY.afterBoat} yourShare={22} putIn={150} feed={feedAfterBoat()} />
          <CloseSheet mode="vote" me={LEO} proposer={MAYA} />
        </Phone>
      </Slot>
      <Slot label="Rules" theme={theme} zoom={z}>
        <Phone theme={theme} zoom={z}>
          <PotScreen balance={450} yourShare={150} putIn={150} activeTab="rules" scrollY={250} rules={{ highlight: f > 30 ? "instant" : null }} />
        </Phone>
      </Slot>
    </Stage>
  );
};

/** Standalone breakout pieces at in-phone size, plus a yawed phone with body depth. */
export const GalleryPieces: React.FC = () => {
  const f = useCurrentFrame();
  const burst = interpolate(f, [10, 46], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const rule = tripRules()[0];
  return (
    <AbsoluteFill style={{ background: day.ground, padding: 60, flexDirection: "row", gap: 50, alignItems: "flex-start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <UiPiece theme="day" style={{ marginTop: 60 }}>
          <RulesCapsule state="approved" burstProgress={burst} burstVariant="cinematic" burstDistance={1.6} burstSize={1.6} />
        </UiPiece>
        <UiPiece theme="day">
          <RulesCapsule state="checking" />
        </UiPiece>
        <UiPiece theme="day" card="surface" padding={16} shadow>
          <ApprovalTimeline rows={timelineRows({ asker: MAYA, approved: [MAYA, LEO], waiting: [SAM], me: LEO.id })} k={2} />
        </UiPiece>
        <UiPiece theme="day">
          <RuleRow icon={rule.icon} text={rule.text} />
        </UiPiece>
        <UiPiece theme="night" card="surface" padding={16}>
          <RulesCapsule state="approved" />
        </UiPiece>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <UiPiece theme="day" card="surface" padding={16} shadow>
          <RefundTable rows={defaultRefundRows()} me={MAYA.id} />
        </UiPiece>
        <UiPiece theme="day" width={264}>
          <LinkPreviewCard link={{ members: CREW }} />
        </UiPiece>
        <UiPiece theme="day" width={374}>
          <PushNotification variant="lock" />
        </UiPiece>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 28, alignItems: "center" }}>
        <OgCard width={560} />
        <div style={{ perspective: 2400, marginTop: 10 }}>
          <div style={{ transformStyle: "preserve-3d", transform: `rotateY(${-28 + Math.sin(f / 30) * 4}deg) rotateX(6deg)`, zoom: 0.62 }}>
            <Phone theme="day" depth={12}>
              <PotScreen balance={450} yourShare={150} putIn={150} feed={FEED_FULL} />
            </Phone>
          </div>
        </div>
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
      <Slot label="Checking" theme="night" zoom={z}>
        <Phone theme="night" zoom={z}>
          <PotScreen balance={450} yourShare={150} putIn={150} feed={FEED_FULL} />
          <SpendSheet step="checking" amount={84} />
        </Phone>
      </Slot>
      <Slot label="Approved" theme="night" zoom={z}>
        <Phone theme="night" zoom={z}>
          <PotScreen balance={366} yourShare={122} putIn={150} feed={feedAfterGroceries()} />
          <SpendSheet step="approved" amount={84} burstProgress={interpolate(f, [10, 46], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} />
        </Phone>
      </Slot>
      <Slot label="Approve" theme="night" zoom={z}>
        <Phone theme="night" zoom={z}>
          <PotScreen balance={366} yourShare={122} putIn={150} feed={feedBoatPending()} />
          <ApproveSheet state="approving" />
        </Phone>
      </Slot>
      <Slot label="Closed" theme="night" zoom={z}>
        <Phone theme="night" zoom={z}>
          <PotScreen balance={0} yourShare={0} putIn={150} feed={feedClosed()} closed={{ date: "Oct 22", refund: 22 }} />
          <CloseSheet mode="closed" />
        </Phone>
      </Slot>
    </Stage>
  );
};

/** Mid-animation checks: sheet slide + scrim, feed insert + count-up, tab slide, chat pop, push slide. */
export const GalleryMotion: React.FC = () => {
  const f = useCurrentFrame();
  const ramp = (a: number, b: number) => interpolate(f, [a, b], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const z = 0.82;
  return (
    <Stage theme="day" gap={30}>
      <Slot label="Sheet in (360 ms)" zoom={z}>
        <Phone theme="day" zoom={z}>
          <PotScreen balance={450} yourShare={150} putIn={150} feed={FEED_FULL} press={{ target: "spend", amount: pressAt(f) }} />
          <SpendSheet step="amount" typed="" progress={ramp(10, 32)} />
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
      <Slot label="Tab slide" zoom={z}>
        <Phone theme="day" zoom={z}>
          <PotScreen balance={450} yourShare={150} putIn={150} feed={FEED_FULL} tabIndex={interpolate(ramp(0, 17), [0, 1], [0, 2])} rules={{ appear: { instant: ramp(10, 30), threshold: ramp(14, 34), budget: ramp(18, 38) } }} />
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

/** Remaining states: Members tab, close waiting, create step 3, Night toast, empty Spend form. */
export const GalleryMisc: React.FC = () => {
  const z = 0.82;
  return (
    <Stage theme="day" gap={30}>
      <Slot label="Members" zoom={z}>
        <Phone theme="day" zoom={z}>
          <PotScreen balance={366} yourShare={122} putIn={150} activeTab="members" memberLines={memberLines(366)} memberTotals={{ in: 450, spent: 84, left: 366 }} scrollY={300} />
        </Phone>
      </Slot>
      <Slot label="Close · waiting" zoom={z}>
        <Phone theme="day" zoom={z}>
          <PotScreen balance={66} yourShare={22} putIn={150} feed={feedAfterBoat()} />
          <CloseSheet mode="waiting" />
        </Phone>
      </Slot>
      <Slot label="Creating…" zoom={z}>
        <Phone theme="day" zoom={z}>
          <PotScreen balance={0} yourShare={0} putIn={0} collected={0} feed={[]} />
          <CreatePotSheet step={3} />
        </Phone>
      </Slot>
      <Slot label="Toast · Night" zoom={z}>
        <Phone theme="night" zoom={z}>
          <PotScreen balance={450} yourShare={150} putIn={150} feed={feedLeoAdding("added")} />
          <Toast text={copy["add.success"](LISBON.name, formatUsd(450))} />
        </Phone>
      </Slot>
      <Slot label="Spend · empty" zoom={z}>
        <Phone theme="day" zoom={z}>
          <PotScreen balance={450} yourShare={150} putIn={150} feed={FEED_FULL} />
          <SpendSheet step="amount" typed="" />
        </Phone>
      </Slot>
    </Stage>
  );
};
