// The Pot screen (apps/web/components/pot/PotScreen.tsx), state-driven: header, BalanceHero, Activity · Members ·
// Rules, the feed (with "Waiting on you" pinned above it), and the tab bar. Everything a scene animates is a prop:
// balance (count-up), goalProgress, feed items' `appear`, tabIndex (slide), scrollY, button presses.
import React from "react";
import { copy } from "../copy";
import { CREW, LISBON, MAYA, type Person } from "../data";
import { useUi } from "../theme";
import { SCREEN_TEXT, T } from "../type";
import { ActivityFeed, type FeedGroup } from "../atoms/Feed";
import { Appear } from "../atoms/Appear";
import { RequestCard } from "../atoms/Approvals";
import { Tabs, type PotTab, POT_TABS } from "../atoms/Controls";
import { TabBar, type TabName } from "../atoms/TabBar";
import { BalanceHero, DemoBanner, PotHeader, type HeroPress } from "./PotParts";
import { MembersTab, RulesTab, type MemberLine } from "./PotTabs";
import { ClosedMoment } from "../sheets/CloseSheet";
import { Button } from "../atoms/Button";

export type WaitingRequest = { who: Person; amount: number; reason: string; approvals: number; k: number; expires: string; appear?: number };

export type PotScreenProps = {
  potName?: string;
  emoji?: string;
  cover?: number;
  members?: Person[];
  /** Dollars in the Pot (interpolate for the 500 ms count-up). */
  balance: number;
  yourShare: number;
  putIn: number;
  collected?: number;
  goal?: number | null;
  goalProgress?: number;
  /** "+$150 on the way" under the share line. */
  pendingIn?: number;
  activeTab?: PotTab;
  /** Fractional tab index (0..2) to slide the tab indicator; overrides activeTab for the indicator. */
  tabIndex?: number;
  feed?: FeedGroup[];
  /** "Waiting on you" request cards pinned above the feed (Activity tab). */
  waiting?: WaitingRequest[];
  /** Members tab content. */
  memberLines?: MemberLine[];
  memberTotals?: { in: number; spent: number; left: number };
  /** Rules tab options. */
  rules?: React.ComponentProps<typeof RulesTab>;
  /** "Demo · test money on NEAR testnet" strip (off by default for the video). */
  showDemoBanner?: boolean;
  demoPerson?: Person;
  tabBar?: { active?: TabName; badge?: number; badgeAppear?: number } | false;
  /** Page scroll in px (positive = scrolled down). */
  scrollY?: number;
  press?: HeroPress;
  addVariant?: "primary" | "secondary";
  /** Closed Pot: hero says "Closed {date}", buttons go, and the "Pot closed" card leads the Activity tab. */
  closed?: { date: string; refund: number } | null;
  /** Hide the balance card (keeps its space) while a breakout twin is on screen. */
  hideHero?: boolean;
  /** Overlays rendered inside the screen root, above the tab bar (sheets, toasts, taps). */
  children?: React.ReactNode;
  style?: React.CSSProperties;
};

export const PotScreen: React.FC<PotScreenProps> = ({
  potName = LISBON.name,
  emoji = LISBON.emoji,
  cover = LISBON.cover,
  members = CREW,
  balance,
  yourShare,
  putIn,
  collected = LISBON.goal,
  goal = LISBON.goal,
  goalProgress,
  pendingIn = 0,
  activeTab = "activity",
  tabIndex,
  feed = [],
  waiting = [],
  memberLines,
  memberTotals,
  rules,
  showDemoBanner = false,
  demoPerson = MAYA,
  tabBar = { active: "pots" },
  scrollY = 0,
  press = null,
  addVariant = "primary",
  closed = null,
  hideHero,
  children,
  style,
}) => {
  const { c, safeTop, safeBottom, shadowCard } = useUi();
  const tabBarH = tabBar === false ? 0 : 57 + safeBottom;
  const shownTab: PotTab = tabIndex !== undefined ? POT_TABS[Math.round(Math.max(0, Math.min(2, tabIndex)))] : activeTab;
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 0, background: c.ground, color: c.ink, overflow: "hidden", ...SCREEN_TEXT, ...style }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, transform: scrollY ? `translateY(${-scrollY}px)` : undefined }}>
        <div style={{ height: safeTop }} />
        {showDemoBanner ? <DemoBanner person={demoPerson} /> : null}
        <main style={{ padding: `0 16px ${32 + tabBarH}px` }}>
          <PotHeader name={potName} emoji={emoji} cover={cover} members={members} />
          <BalanceHero
            balance={balance}
            yourShare={yourShare}
            putIn={putIn}
            collected={collected}
            goal={goal}
            goalProgress={goalProgress}
            pendingIn={pendingIn}
            closedDate={closed?.date ?? null}
            addVariant={addVariant}
            press={press}
            style={hideHero ? { visibility: "hidden" } : undefined}
          />
          <div style={{ marginTop: 24 }}>
            <Tabs active={activeTab} index={tabIndex} />
          </div>
          <div style={{ marginTop: 16 }}>
            {shownTab === "rules" ? (
              <RulesTab potName={potName} {...rules} />
            ) : shownTab === "members" ? (
              <MembersTab members={memberLines ?? []} totals={memberTotals} />
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {closed ? (
                  <section style={{ borderRadius: 24, background: c.surface, padding: 16, boxShadow: shadowCard, marginBottom: 16 }}>
                    <h2 style={{ margin: 0, textAlign: "center", ...T.heading, color: c.ink }}>{copy["close.done.title"]}</h2>
                    <ClosedMoment refund={closed.refund} />
                    <Button fullWidth>{copy["close.summary.cta"]}</Button>
                  </section>
                ) : null}
                {waiting.length > 0 ? (
                  <section style={{ display: "flex", flexDirection: "column", marginBottom: 16 }}>
                    <h2 style={{ margin: 0, ...T.heading, color: c.ink }}>{copy["pot.waiting.header"]}</h2>
                    {waiting.map((w, i) => (
                      <Appear key={i} appear={w.appear ?? 1} gap={8}>
                        <RequestCard who={w.who} amount={w.amount} reason={w.reason} approvals={w.approvals} k={w.k} expires={w.expires} />
                      </Appear>
                    ))}
                  </section>
                ) : null}
                <div style={{ marginTop: closed || waiting.length > 0 ? 0 : -8 }}>
                  <ActivityFeed groups={feed} />
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
      {safeTop > 0 && scrollY > 0 ? <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: safeTop, background: c.ground, zIndex: 20 }} /> : null}
      {tabBar === false ? null : <TabBar active={tabBar.active} badge={tabBar.badge} badgeAppear={tabBar.badgeAppear} />}
      {children}
    </div>
  );
};
