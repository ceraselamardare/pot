// The four "And more" feature cards (builder B, s10b-more), mirroring the website's "What else a Pot can do"
// (apps/web/components/landing/home/Features.tsx): a Pot chip (the app's CoverTile + the Pot's name), the website's
// Lucide icon (sprout / target / qr-code / send, stroke 2, ink, no tile) with the app's own title, and a LIVE
// fragment from the UI kit doing one micro-animation.
//   Titles = the app's names: create.trust.label · create.target.aon.label · payin.title · settings.sending.
// Coherence (review-3 P1-1): only Trust is Maya's Lisbon Trip (her honest state). The other three live on OTHER
// Pots of the app's own seeded world (apps/web/lib/client/mock), so nothing contradicts Lisbon's $66.00:
//   All or nothing → 🎸 Festival Fund (goal-collecting-day.png: $300 of $1,200 · 3 days left; the film's today is
//   Nov 3, so the date is Nov 6) · Ask anyone to pay in → 🍷 Porto Weekend (not the goal Pot: the app blocks pay-ins
//   while a Pot still collects for an all-or-nothing goal) · Send by link → 🏄 Surf Camp (paylink-share-day.png, $50).
// Every prop is a pure function of the scene frame `f`. Fragments render at a 411 px kit layout with CSS `zoom` 1.16
// (crisp text, the kit's own advice) to fill the card.
import { QrCode, Send, Sprout, Target, Check } from "lucide-react";
import React from "react";
import { day } from "../../brand/tokens";
import { DISPLAY, SANS } from "../../brand/fonts";
import { land, punch, ramp, uiEase } from "../../motion";
import { CoverTile, FeedRow, GoalCard, MoneyText, MyTrustCard, QrPlate, StatusChip, UiPiece, copy, payInItem, payInWhat } from "../../ui";
import { pop as appPop } from "../../ui/ease";
import { S10B } from "./s10b-timing";

// ─── Card geometry (frame px) ───────────────────────────────────────────────────────────────────────
/** The 2 × 2 grid beside Maya's phone, 31 px clear of the caption box (review-3 P2-1: it was 11 px). */
export const GRID = { x: 810, y: 112, w: 1070, h: 820, gap: 20 } as const;
export const CARD_W = (GRID.w - GRID.gap) / 2; // 525
export const CARD_H = (GRID.h - GRID.gap) / 2; // 400
const PAD = 24;
const CHIP_H = 30;
const CHIP_GAP = 10;
/** Titles at 48 px (review-3 P1-5: ≥ 44, ≈ 48-52 if they fit): "Ask anyone to pay in" is the longest (≈ 421 px). */
const TITLE = 48;
const ICON = 36;
const HEADER_H = 52;
const HEADER_GAP = 12;
/** The fragment area inside a card. */
export const FRAG = { w: CARD_W - 2 * PAD, h: CARD_H - 2 * PAD - CHIP_H - CHIP_GAP - HEADER_H - HEADER_GAP } as const; // 477 × 248
/** Kit px → frame px for the fragments: the kit lays out at FRAG_KIT_W wide. */
export const FRAG_ZOOM = 1.16;
const FRAG_KIT_W = Math.floor(FRAG.w / FRAG_ZOOM); // 411

/** Top-left of card i (0 Trust · 1 All or nothing · 2 Pay in · 3 Send by link), reading order (Z). */
export const cardRect = (i: number) => ({
  x: GRID.x + (i % 2) * (CARD_W + GRID.gap),
  y: GRID.y + Math.floor(i / 2) * (CARD_H + GRID.gap),
  w: CARD_W,
  h: CARD_H,
});

/** The Pots, from the app's seeded world (name, emoji, cover gradient index). */
export const POTS = {
  lisbon: { name: "Lisbon Trip", emoji: "🇵🇹", cover: 0 },
  festival: { name: "Festival Fund", emoji: "🎸", cover: 2 },
  porto: { name: "Porto Weekend", emoji: "🍷", cover: 3 },
  surf: { name: "Surf Camp", emoji: "🏄", cover: 1 },
} as const;
type PotRef = (typeof POTS)[keyof typeof POTS];

// ─── The card shell ─────────────────────────────────────────────────────────────────────────────────
type IconType = React.ComponentType<{ size?: number; strokeWidth?: number; color?: string; style?: React.CSSProperties }>;

/** The Pot a card belongs to, the app's look: the CoverTile and the Pot's name. */
const PotChip: React.FC<{ pot: PotRef }> = ({ pot }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, height: CHIP_H }}>
    <CoverTile emoji={pot.emoji} cover={pot.cover} size="sm" px={CHIP_H} />
    <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: 20, lineHeight: `${CHIP_H}px`, color: day.inkMuted, whiteSpace: "nowrap" }}>{pot.name}</span>
  </div>
);

export const FeatureCard: React.FC<{ pot: PotRef; icon: IconType; title: string; shadow: string; children: React.ReactNode }> = ({ pot, icon: Icon, title, shadow, children }) => (
  <div
    style={{
      width: CARD_W,
      height: CARD_H,
      boxSizing: "border-box",
      borderRadius: 24,
      background: day.surface,
      boxShadow: shadow,
      padding: PAD,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}
  >
    <PotChip pot={pot} />
    <div style={{ marginTop: CHIP_GAP, display: "flex", alignItems: "center", gap: 12, height: HEADER_H }}>
      <Icon size={ICON} strokeWidth={2} color={day.ink} style={{ display: "block", flexShrink: 0 }} aria-hidden />
      <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: TITLE, lineHeight: `${HEADER_H}px`, letterSpacing: "-0.02em", color: day.ink, whiteSpace: "nowrap" }}>
        {title}
      </div>
    </div>
    <div style={{ marginTop: HEADER_GAP, width: FRAG.w, height: FRAG.h, display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div style={{ zoom: FRAG_ZOOM }}>
        <UiPiece theme="day" width={FRAG_KIT_W}>
          {children}
        </UiPiece>
      </div>
    </div>
  </div>
);

/** A whole-dollar roll that never overshoots (decaying steps, lands exactly). */
const rollWhole = (f: number, at: number, end: number, from: number, to: number) => Math.round(from + (to - from) * ramp(f, at, end, punch));

/** The app's own pop (pot-pop, 320 ms = 19 f) as 0..1 from frame `at`. */
const popFrom = (f: number, at: number, dur = 19) => ramp(f, at, at + dur);

/** A row that slides up into place (the app's enter ease, 17 f), for a feed row landing inside a card. */
const SlideIn: React.FC<{ f: number; at: number; children: React.ReactNode }> = ({ f, at, children }) => {
  const t = ramp(f, at, at + 17, uiEase.enter);
  return <div style={{ opacity: f < at ? 0 : Math.min(1, t * 1.6), transform: `translateY(${(1 - t) * 18}px)` }}>{children}</div>;
};

// ─── 1 · Trust grows (Maya, Lisbon Trip) ────────────────────────────────────────────────────────────
/** The honest state of the story: Maya has made exactly two paid spends ($84, $300) and the rule is "every 3 paid
 *  spends raise someone's limit by $100", so she is still New. MyTrustCard as she sees it now: "Your instant limit"
 *  · New · "You can spend up to $100 without asking" · the 3-step streak · "1 more paid spend to $200" · "Spends of
 *  $10 or more count. A declined request lowers it." Her two paid spends fill two segments one after the other (the
 *  second, and "1 more paid spend to $200", on "grows"). The kit draws each segment on/off (nextIn 3 → 2 → 1); while
 *  one fills, an ink bar with the kit's exact segment geometry wipes in over it, then the kit's segment takes over. */
const SEG = { top: 16 + 24 + 4 + 24 + 12, left: 16, w: (FRAG_KIT_W - 32 - 8) / 3, gap: 4, h: 6 } as const;

export const TrustFeature: React.FC<{ f: number; shadow: string }> = ({ f, shadow }) => {
  const fills = [S10B.c1Seg1At, S10B.c1Seg2At].map((at) => ramp(f, at, at + S10B.c1SegFill, uiEase.standard));
  const done = fills.filter((x) => x >= 1).length; // segments the kit draws filled
  const filling = done < fills.length && fills[done] > 0 ? fills[done] : 0; // the one wiping in now
  return (
    <FeatureCard pot={POTS.lisbon} icon={Sprout} title="Trust grows" shadow={shadow}>
      <div style={{ position: "relative" }}>
        <MyTrustCard level={0} upTo={100} nextIn={3 - done} step={3} next={200} minQualifying={10} />
        {filling > 0 ? (
          <span
            style={{
              position: "absolute",
              left: SEG.left + done * (SEG.w + SEG.gap),
              top: SEG.top,
              width: SEG.w * filling,
              height: SEG.h,
              borderRadius: 999,
              background: day.ink,
            }}
          />
        ) : null}
      </div>
    </FeatureCard>
  );
};

// ─── 2 · All or nothing (Festival Fund) ─────────────────────────────────────────────────────────────
/** The app's goal-collecting capture: "In the Pot" rolls in to $300.00, the bar fills toward "goals" ($150 → $300 of
 *  $1,200 · 3 days left), the lock line and the all-or-nothing promise (by Nov 6) readable the whole time. */
export const GoalFeature: React.FC<{ f: number; shadow: string }> = ({ f, shadow }) => {
  const collected = rollWhole(f, S10B.c2FillAt, S10B.c2FillEnd, 150, 300);
  const progress = (150 + 150 * ramp(f, S10B.c2FillAt, S10B.c2FillEnd, land)) / 1200;
  return (
    <FeatureCard pot={POTS.festival} icon={Target} title="All or nothing" shadow={shadow}>
      <GoalCard
        balance={collected}
        collected={collected}
        goal={1200}
        progress={progress}
        daysLeft={3}
        date="Nov 6"
        allOrNothing
        style={{ boxShadow: "none", padding: 0, background: "transparent", borderRadius: 0 }}
      />
    </FeatureCard>
  );
};

// ─── 3 · Ask anyone to pay in (Porto Weekend) ───────────────────────────────────────────────────────
/** The pay-in link (compact PayInCard: the QR draws in, ✓ "Your pay-in link is ready", "Scan to pay into Porto
 *  Weekend", "Payment · $25 · Until Nov 17"), then the feed row "Grandma · Paid in · by link" + $25.00, From outside,
 *  at a clock time (it already happened this morning). */
export const PayInFeature: React.FC<{ f: number; shadow: string }> = ({ f, shadow }) => {
  const ready = appPop(popFrom(f, S10B.c3ReadyPop));
  return (
    <FeatureCard pot={POTS.porto} icon={QrCode} title="Ask anyone to pay in" shadow={shadow}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <QrPlate kind="payIn" size={96} reveal={ramp(f, S10B.c3QrAt, S10B.c3QrEnd)} />
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          <p style={{ margin: 0, display: "flex", alignItems: "flex-start", gap: 6, fontWeight: 600, fontSize: 15, lineHeight: "20px", color: day.ink }}>
            <span style={{ display: "block", flexShrink: 0, transform: `scale(${f < S10B.c3ReadyPop ? 0 : ready.scale})`, opacity: f < S10B.c3ReadyPop ? 0 : ready.opacity }}>
              <Check size={18} strokeWidth={2} color={day.approved} style={{ display: "block" }} aria-hidden />
            </span>
            {copy["payin.ready"]}
          </p>
          <p style={{ margin: 0, fontSize: 16, lineHeight: "22px", color: day.ink }}>{copy["payin.qr.hint"](POTS.porto.name)}</p>
          <p style={{ margin: 0, fontSize: 14, lineHeight: "20px", color: day.inkMuted, fontVariantNumeric: "tabular-nums" }}>{payInWhat("payment", 25, "Nov 17")}</p>
        </div>
      </div>
      {/* the money arrives: the app's feed row at the full width, under a hairline */}
      <div style={{ marginTop: 10, minHeight: 72, borderTop: `1px solid ${day.line}` }}>
        {f >= S10B.c3RowAt ? (
          <SlideIn f={f} at={S10B.c3RowAt}>
            <FeedRow item={payInItem(1, "payment", 25, "9:12 AM")} />
          </SlideIn>
        ) : null}
      </div>
    </FeatureCard>
  );
};

// ─── 4 · Send by link (Surf Camp) ───────────────────────────────────────────────────────────────────
/** The app's paylink capture: "Your link to send $50 is ready", "Send it to Casa Lisboa host. Whoever opens it gets
 *  $50.", the QR, and the amount card where "✓ Claimed" pops on "out". */
export const SendLinkFeature: React.FC<{ f: number; shadow: string }> = ({ f, shadow }) => {
  const claimed = f >= S10B.c4Claimed;
  const cp = appPop(popFrom(f, S10B.c4Claimed));
  return (
    <FeatureCard pot={POTS.surf} icon={Send} title="Send by link" shadow={shadow}>
      <p style={{ margin: 0, fontFamily: DISPLAY, fontWeight: 700, fontSize: 19, lineHeight: "24px", color: day.ink, fontVariantNumeric: "tabular-nums" }}>
        {copy["paylink.ready.title"]("$50")}
      </p>
      <p style={{ margin: "2px 0 0", fontSize: 14, lineHeight: "20px", color: day.inkMuted, fontVariantNumeric: "tabular-nums" }}>
        {copy["paylink.ready.body"]("Casa Lisboa host", "$50")}
      </p>
      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 14 }}>
        <QrPlate kind="sendLink" size={92} reveal={ramp(f, S10B.c4QrAt, S10B.c4QrEnd)} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8, borderRadius: 16, background: day.surfaceSunken, padding: 12 }}>
          <div>
            <MoneyText amount={50} variant="title" />
            <p style={{ margin: 0, fontSize: 14, lineHeight: "20px", color: day.inkMuted }}>{copy["paylink.share.for"]("Casa Lisboa host")}</p>
          </div>
          <span style={{ display: "block", height: 28, transformOrigin: "0% 50%", transform: `scale(${claimed ? cp.scale : 0})`, opacity: claimed ? cp.opacity : 0 }}>
            <StatusChip status="sent" ground="surface">
              {copy["paylink.chip.claimed"]}
            </StatusChip>
          </span>
        </div>
      </div>
    </FeatureCard>
  );
};
