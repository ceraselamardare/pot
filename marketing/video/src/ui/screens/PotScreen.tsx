// The Pot screen (apps/web/components/pot/PotScreen.tsx, 2026-11-03), state-driven: header, BalanceHero (the round
// action row Add money · Spend · Ask · More), Activity · Members · Settings, the Activity panel (the closing / closed
// card, "Waiting on you" pinned above the compact feed), and the tab bar with your Pot dollars. Everything a scene
// animates is a prop: balance (count-up), goalProgress, feed items' `appear`, tabIndex (slide), scrollY, presses.
import { Check, Clock } from "lucide-react";
import React from "react";
import { copy } from "../copy";
import { CREW, LISBON, MAYA, type Person } from "../data";
import { useUi } from "../theme";
import { SCREEN_TEXT, T } from "../type";
import { ActivityFeed, type FeedGroup, type SpendTier } from "../atoms/Feed";
import { Appear } from "../atoms/Appear";
import { RequestCard } from "../atoms/Approvals";
import { Tabs, type PotTab, POT_TABS, tabIndexOf } from "../atoms/Controls";
import { GoalBanner } from "../atoms/Goal";
import { TabBar, type TabName } from "../atoms/TabBar";
import { BalanceHero, DemoBanner, PotHeader, type HeroPress } from "./PotParts";
import { MembersTab, SettingsTab, type MemberLine, type SettingsTabProps } from "./PotTabs";
import { ClosedMoment } from "../sheets/CloseSheet";
import { Button } from "../atoms/Button";

export type WaitingRequest = {
  who: Person;
  amount: number;
  reason: string;
  approvals: number;
  k: number;
  expires: string;
  /** "one_ok" → "Needs one OK" + [✓ OK $300]; "group" → "1 of 2 approvals" + [✓ Approve $300]. Default by amount. */
  tier?: SpendTier;
  appear?: number;
  /** Which inline button is pressed, and how much (0..1). */
  pressed?: "approve" | "decline" | null;
  press?: number;
};

export type PotScreenProps = {
  potName?: string;
  emoji?: string;
  cover?: number;
  members?: Person[];
  /** Dollars in the Pot (interpolate for the 500 ms count-up). */
  balance: number;
  /** "You'd get back $x" (what a close would pay you now). */
  yourShare: number;
  /** "You put in $y". */
  putIn: number;
  collected?: number;
  goal?: number | null;
  goalProgress?: number;
  /** The goal bar's text twin override (e.g. "$300 of $450 · 3 days left"). */
  goalText?: string;
  /** The all-or-nothing goal banner in the hero (replaces the plain goal bar); null/undefined = plain bar. */
  goalBanner?: React.ComponentProps<typeof GoalBanner> | null;
  /** "+$150 on the way" under the share line. */
  pendingIn?: number;
  /** "activity" | "members" | "settings" ("rules" = LEGACY name of "settings"). */
  activeTab?: PotTab;
  /** Fractional tab index (0..2) to slide the tab indicator; overrides activeTab for the indicator. */
  tabIndex?: number;
  feed?: FeedGroup[];
  /** "Waiting on you" request cards pinned above the feed (Activity tab). */
  waiting?: WaitingRequest[];
  /** Members tab content. */
  memberLines?: MemberLine[];
  memberTotals?: { in: number; spent: number; left: number };
  /** Settings tab options (the RULES section and the sections under it). */
  settings?: SettingsTabProps;
  /** LEGACY name of `settings`. */
  rules?: SettingsTabProps;
  /** LEGACY: the demo persona strip (gone from the app; off by default). */
  showDemoBanner?: boolean;
  demoPerson?: Person;
  /** Tab bar: active tab, the Requests badge, and your Pot dollars on the third tab (`balance`, default $0.00). */
  tabBar?: { active?: TabName; badge?: number; badgeAppear?: number; balance?: number | null } | false;
  /** Page scroll in px (positive = scrolled down). */
  scrollY?: number;
  /** Which hero action is pressed: {target: "add" | "spend" | "ask" | "more", amount 0..1}. */
  press?: HeroPress;
  /** Show the finger dot on the pressed action. */
  touchDot?: boolean;
  /** 0..1 press on the "You'd get back … ⓘ" row. */
  sharePress?: number;
  addVariant?: "primary" | "secondary";
  /** Closing: the "Adding money and spending are paused" card leads the Activity tab, the money actions dim. */
  closing?: boolean;
  /** Closed Pot: hero says "Closed {date}", the actions go, and the "Pot closed" card leads the Activity tab. */
  closed?: { date: string; refund: number; putIn?: number } | null;
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
  goalText,
  goalBanner = null,
  pendingIn = 0,
  activeTab = "activity",
  tabIndex,
  feed = [],
  waiting = [],
  memberLines,
  memberTotals,
  settings,
  rules,
  showDemoBanner = false,
  demoPerson = MAYA,
  tabBar = { active: "pots" },
  scrollY = 0,
  press = null,
  touchDot,
  sharePress,
  addVariant = "primary",
  closing = false,
  closed = null,
  hideHero,
  children,
  style,
}) => {
  const { c, safeTop, safeBottom, shadowCard } = useUi();
  const tabBarH = tabBar === false ? 0 : 57 + safeBottom;
  const shownTab: PotTab = tabIndex !== undefined ? POT_TABS[Math.round(Math.max(0, Math.min(2, tabIndex)))] : activeTab === "rules" ? "settings" : activeTab;
  const lead = closed || closing;
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 0, background: c.ground, color: c.ink, overflow: "hidden", ...SCREEN_TEXT, ...style }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, transform: scrollY ? `translateY(${-scrollY}px)` : undefined }}>
        <div style={{ height: safeTop }} />
        {showDemoBanner ? <DemoBanner person={demoPerson} /> : null}
        <main style={{ padding: `0 16px ${32 + tabBarH}px` }}>
          <PotHeader name={potName} emoji={emoji} cover={cover} members={members} showMore={!!closed} />
          <BalanceHero
            balance={balance}
            yourShare={yourShare}
            putIn={putIn}
            collected={collected}
            goal={goal}
            goalProgress={goalProgress}
            goalText={goalText}
            goalSlot={goalBanner ? <GoalBanner {...goalBanner} /> : undefined}
            pendingIn={pendingIn}
            closedDate={closed?.date ?? null}
            addVariant={addVariant}
            press={press}
            touchDot={touchDot}
            sharePress={sharePress}
            dimButtons={closing}
            spendBlocked={!!goalBanner && (goalBanner.state ?? "collecting") === "collecting" && goalBanner.allOrNothing !== false}
            style={hideHero ? { visibility: "hidden" } : undefined}
          />
          <div style={{ marginTop: 24 }}>
            <Tabs active={activeTab} index={tabIndex ?? tabIndexOf(activeTab)} />
          </div>
          <div style={{ marginTop: 16 }}>
            {shownTab === "settings" ? (
              <SettingsTab potName={potName} {...rules} {...settings} />
            ) : shownTab === "members" ? (
              <MembersTab members={memberLines ?? []} totals={memberTotals} />
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {closed ? (
                  <section style={{ borderRadius: 24, background: c.surface, padding: 16, boxShadow: shadowCard, marginBottom: 16 }}>
                    <h2 style={{ margin: 0, textAlign: "center", ...T.heading, color: c.ink }}>{copy["close.done.title"]}</h2>
                    <ClosedMoment refund={closed.refund} putIn={closed.putIn} />
                    <Button fullWidth>{copy["close.summary.cta"]}</Button>
                  </section>
                ) : closing ? (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12, borderRadius: 16, background: c.surfaceSunken, padding: 12, marginBottom: 16 }}>
                    <Clock size={20} strokeWidth={2} color={c.waiting} style={{ display: "block", flexShrink: 0, marginTop: 2 }} aria-hidden />
                    <p style={{ margin: 0, minWidth: 0, flex: 1, ...T.bodySm, color: c.ink }}>{copy["pot.closing"]}</p>
                    <Button variant="ghost" icon={Check} height={44} style={{ margin: "-4px 0", padding: "6px 16px" }}>
                      {copy["approve.cta.review"]}
                    </Button>
                  </div>
                ) : null}
                {waiting.length > 0 ? (
                  <section style={{ display: "flex", flexDirection: "column", marginBottom: 16 }}>
                    <h2 style={{ margin: 0, ...T.heading, color: c.ink }}>{copy["pot.waiting.header"]}</h2>
                    {waiting.map((w, i) => (
                      <Appear key={i} appear={w.appear ?? 1} gap={8}>
                        <RequestCard
                          who={w.who}
                          amount={w.amount}
                          reason={w.reason}
                          approvals={w.approvals}
                          k={w.k}
                          expires={w.expires}
                          tier={w.tier}
                          pressed={w.pressed}
                          press={w.press}
                        />
                      </Appear>
                    ))}
                  </section>
                ) : null}
                <div style={{ marginTop: lead || waiting.length > 0 ? 0 : -8 }}>
                  <ActivityFeed groups={feed} />
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
      {safeTop > 0 && scrollY > 0 ? <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: safeTop, background: c.ground, zIndex: 20 }} /> : null}
      {tabBar === false ? null : <TabBar active={tabBar.active} badge={tabBar.badge} badgeAppear={tabBar.badgeAppear} balance={tabBar.balance} />}
      {children}
    </div>
  );
};
