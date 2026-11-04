// The invite landing (/j/[slug]: apps/web/app/j/[slug]/page.tsx + components/landing/JoinCta.tsx, 2026-11-03): the
// lockup, the cover banner, "Maya invited you to Lisbon Trip", who's in (plain seats: only the inviter's carries
// initials, privacy audit 2026-11-02; + an empty dashed seat) with "Maya and 1 other are in", the Pot card ($300.00,
// the goal bar, "Everyone's chipping in $150"), the trust sentence with a shield-check, the rules peek ("Up to $100
// without asking · up to $300 with one OK · bigger spends need most of the group"), the invite's date, then
// [G Join with Google] (the one marigold), [✉ Continue with email], [More ways to join ⌄] and "Pot is for groups who
// know each other. No app to download.". `joinVariant="live"` is the testnet build's set: Google, More ways (the
// "I have a NEAR wallet" link only with `showWalletLink`: it names a banned word).
// joinStep 1..3 swaps the buttons for the setup progress ("Welcome, Leo" · Setting up… · Joining… · You're in).
import { ChevronDown, Mail, ShieldCheck } from "lucide-react";
import React from "react";
import { Lockup } from "../../brand/Logo";
import { copy } from "../copy";
import { LISBON, MAYA, SAM, type Person } from "../data";
import { formatUsd, names } from "../format";
import { useUi } from "../theme";
import { SCREEN_TEXT, T } from "../type";
import { AvatarStack } from "../atoms/Avatar";
import { Button } from "../atoms/Button";
import { CoverTile } from "../atoms/CoverTile";
import { GoalBar } from "../atoms/GoalBar";
import { GoogleMark } from "../atoms/GoogleMark";
import { MoneyText } from "../atoms/MoneyText";
import { ProgressSteps, type StepState } from "../atoms/ProgressSteps";

export type InviteLandingProps = {
  inviter?: Person;
  potName?: string;
  emoji?: string;
  cover?: number;
  /** People already in (join order). */
  members?: Person[];
  emptySeats?: number;
  balance?: number;
  collected?: number;
  goal?: number;
  goalProgress?: number;
  suggested?: number;
  instantLimit?: number;
  /** The one-OK ceiling (0 = a Pot without the one-OK tier: the shorter rules line). */
  oneOkCap?: number;
  /** "This invite works until {date}." */
  expiry?: string;
  /** Show every seat's initials (the Oct 22 look). Default: only the inviter's. */
  allInitials?: boolean;
  /** "mock" (Google · email · More ways; the default) or "live" (Google · More ways). */
  joinVariant?: "mock" | "live";
  /** live: the "I have a NEAR wallet" link under the buttons. */
  showWalletLink?: boolean;
  /** 0..1 press on [More ways to join]. */
  morePress?: number;
  /** Page scroll in px (the CTA sits below the fold on a phone). */
  scrollY?: number;
  /** 0 = the join buttons; 1 = setting up the account, 2 = joining, 3 = you're in. */
  joinStep?: 0 | 1 | 2 | 3;
  firstName?: string;
  googlePress?: number;
  emailPress?: number;
  dotsFrame?: number;
  /** Per-seat 0..1 pop for the avatars (indexed like members). */
  seatAppear?: number[];
  children?: React.ReactNode;
  style?: React.CSSProperties;
};

export const InviteLanding: React.FC<InviteLandingProps> = ({
  inviter = MAYA,
  potName = LISBON.name,
  emoji = LISBON.emoji,
  cover = LISBON.cover,
  members = [MAYA, SAM],
  emptySeats = 1,
  balance = 300,
  collected,
  goal = LISBON.goal,
  goalProgress,
  suggested = LISBON.goalEach,
  instantLimit = LISBON.instantLimit,
  oneOkCap = LISBON.oneOkCap,
  expiry = "Nov 7",
  allInitials = false,
  joinVariant = "mock",
  showWalletLink = false,
  morePress = 0,
  scrollY = 0,
  joinStep = 0,
  firstName = "Leo",
  googlePress = 0,
  emailPress = 0,
  dotsFrame,
  seatAppear,
  children,
  style,
}) => {
  const { c, theme, safeTop, safeBottom, shadowCard } = useUi();
  // who's in: the inviter by name, everyone else as a count (privacy audit 2026-11-02)
  const inviterIn = members.some((m) => m.id === inviter.id);
  const others = members.length - 1;
  const whoIn = allInitials
    ? members.length === 1
      ? copy["landing.members.one"](members[0].name)
      : copy["landing.members"](names(members.map((m) => m.name)))
    : inviterIn
      ? others <= 0
        ? copy["landing.members.one"](inviter.name)
        : copy["landing.members.with"](inviter.name, others)
      : copy["landing.members.count"](members.length);
  const steps: StepState[] = [1, 2, 3].map((n) => (n < joinStep ? "done" : n === joinStep ? "current" : "next"));
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 0, background: c.ground, color: c.ink, overflow: "hidden", ...SCREEN_TEXT, ...style }}>
      <main
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          display: "flex",
          flexDirection: "column",
          padding: `${safeTop + 48}px 16px ${16 + safeBottom}px`,
          transform: scrollY ? `translateY(${-scrollY}px)` : undefined,
        }}
      >
        <div style={{ marginBottom: 24, display: "flex", justifyContent: "center" }}>
          <Lockup height={40} on={theme === "night" ? "dark" : "light"} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <CoverTile emoji={emoji} cover={cover} size="banner" />
          <h1 style={{ margin: 0, textAlign: "center", ...T.title, color: c.ink, textWrap: "balance" }}>{copy["landing.title"](inviter.name, potName)}</h1>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <AvatarStack people={members} size="sm" ring="ground" emptySeats={emptySeats} appear={seatAppear} initialsOnly={allInitials ? undefined : inviter.id} />
            <p style={{ margin: 0, ...T.bodySm, color: c.inkMuted }}>{whoIn}</p>
          </div>
          <section style={{ borderRadius: 24, background: c.surface, padding: 16, boxShadow: shadowCard }}>
            <p style={{ margin: 0, ...T.bodySm, color: c.inkMuted }}>{copy["pot.hero.label"]}</p>
            {balance > 0 ? (
              <p style={{ margin: "4px 0 0", ...T.body }}>
                <MoneyText amount={balance} variant="hero" />
              </p>
            ) : (
              <p style={{ margin: "4px 0 0", ...T.heading, color: c.ink }}>{copy["landing.balance.zero"](potName)}</p>
            )}
            <GoalBar collected={collected ?? balance} goal={goal} progress={goalProgress} style={{ marginTop: 16 }} />
            <p style={{ margin: "4px 0 0", ...T.bodySm, color: c.ink }}>{copy["landing.share"](formatUsd(suggested, "whole"))}</p>
          </section>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, borderRadius: 16, background: c.surfaceSunken, padding: 12 }}>
            <ShieldCheck size={20} strokeWidth={2} color={c.ink} style={{ display: "block", flexShrink: 0, marginTop: 2 }} aria-hidden />
            <p style={{ margin: 0, ...T.bodySm, color: c.ink }}>{copy["landing.trust"]}</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, textAlign: "center", ...T.bodySm, color: c.inkMuted }}>
            <p style={{ margin: 0 }}>
              {oneOkCap > 0
                ? copy["landing.rules_peek.one_ok"](formatUsd(instantLimit, "whole"), formatUsd(oneOkCap, "whole"))
                : copy["landing.rules_peek"](formatUsd(instantLimit, "whole"))}
            </p>
            <p style={{ margin: 0 }}>{copy["landing.expiry"](expiry)}</p>
          </div>
        </div>
        <div style={{ marginTop: 32, display: "flex", minHeight: 208, flexDirection: "column", gap: 12 }}>
          {joinStep === 0 ? (
            <>
              <Button variant="primary" fullWidth leading={<GoogleMark />} pressed={googlePress}>
                {copy["landing.cta.google"]}
              </Button>
              {joinVariant === "mock" ? (
                <Button fullWidth icon={Mail} pressed={emailPress}>
                  {copy["landing.more.email"]}
                </Button>
              ) : null}
              <Button variant="ghost" fullWidth pressed={morePress} trailing={<ChevronDown size={20} strokeWidth={2} style={{ display: "block" }} aria-hidden />}>
                {copy["landing.cta.more"]}
              </Button>
              {joinVariant === "live" && showWalletLink ? (
                <span style={{ alignSelf: "center", display: "inline-flex", minHeight: 44, alignItems: "center", ...T.bodySm, color: c.link }}>{copy["landing.more.wallet"]}</span>
              ) : null}
              <p style={{ margin: "4px 0 0", display: "flex", flexWrap: "wrap", justifyContent: "center", columnGap: 4, textAlign: "center", ...T.bodySm, color: c.inkMuted }}>
                <span>{copy["landing.legal"]}</span>
                <span>{copy["landing.no_app"]}</span>
              </p>
            </>
          ) : (
            <section style={{ borderRadius: 24, background: c.surface, padding: 16, boxShadow: shadowCard }}>
              <p style={{ margin: "0 0 16px", ...T.heading, color: c.ink }}>{copy["setup.greeting"](firstName)}</p>
              <ProgressSteps
                dotsFrame={dotsFrame}
                steps={[
                  { label: copy["setup.progress.1"], state: steps[0] },
                  { label: copy["setup.progress.2"](potName), state: steps[1] },
                  { label: copy["setup.progress.3"], state: steps[2] },
                ]}
              />
              <p style={{ margin: "12px 0 0", ...T.bodySm, color: c.inkMuted }}>{copy["setup.time"]}</p>
            </section>
          )}
        </div>
      </main>
      {/* status bar backdrop once the page scrolls under it */}
      {safeTop > 0 && scrollY > 0 ? <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: safeTop, background: c.ground, zIndex: 20 }} /> : null}
      {children}
    </div>
  );
};
