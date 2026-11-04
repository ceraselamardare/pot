// Ready-made feeds and member lines for the story beats, so scenes don't rebuild them. Days and times follow the
// app's seeded world as captured on 2026-11-03 (notes/screens/day-pot.png; lib/client/mock/world.ts): Maya starts
// Lisbon Trip on Oct 31 (adds $150 at 5:24 PM), Sam joins that evening and adds $150 on Nov 1 at 5:19 PM, Leo joins
// yesterday and adds $150 at 5:23 PM; today Maya's $84 groceries go through instantly, then the $300 boat tickets
// get one OK from Leo. Numbers (one-OK story, hub 1.1.0):
//   In the Pot     $450 → $366 → $66 → closed ($0)
//   You'd get back $150 → $122 → $22 (each of the three)
//   Maya's Pot dollars (tab bar)  $0.00 → $84.00 → $384.00 → $406.00 after the close; Leo's $0.00 → $22.00.
import { copy } from "./copy";
import { GRANDMA, LEO, LISBON, MAYA, SAM, STORY } from "./data";
import type { FeedGroup, FeedItem } from "./atoms/Feed";
import type { MemberLine } from "./screens/PotTabs";

const today = copy["feed.day.today"];
const yesterday = copy["feed.day.yesterday"];
const justNow: string = copy["time.just_now"];

/** Nov 1 / Oct 31 history (Sam and Maya chip in). */
export const HISTORY: FeedGroup[] = [
  { label: "Nov 1", items: [{ id: "sam-add", kind: "contribution", who: SAM, amount: 150, when: "5:19 PM" }] },
  {
    label: "Oct 31",
    items: [
      { id: "sam-joined", kind: "joined", who: SAM },
      { id: "maya-add", kind: "contribution", who: MAYA, amount: 150, when: "5:24 PM" },
      { id: "created", kind: "created", who: MAYA, potName: LISBON.name },
    ],
  },
];

/** $300 of $450: before Leo joins. */
export const FEED_BEFORE_LEO: FeedGroup[] = HISTORY;

/** Leo's add as it lands: "Adding $150…" (Sending…) then "Leo · Added money" ✓ Sent · just now. */
export function feedLeoAdding(state: "adding" | "added", appear = 1): FeedGroup[] {
  const leo: FeedItem =
    state === "adding"
      ? { id: "leo-add", kind: "adding", who: LEO, amount: 150, appear }
      : { id: "leo-add", kind: "contribution", who: LEO, amount: 150, when: justNow, chip: "sent", appear };
  return [{ label: today, items: [leo, { id: "leo-joined", kind: "joined", who: LEO }] }, ...HISTORY];
}

/** $450 of $450, the next day (the real day-pot.png capture). */
export const FEED_FULL: FeedGroup[] = [
  {
    label: yesterday,
    items: [
      { id: "leo-add", kind: "contribution", who: LEO, amount: 150, when: "5:23 PM" },
      { id: "leo-joined", kind: "joined", who: LEO },
    ],
  },
  ...HISTORY,
];

/** Maya's $84 groceries: "Maya · Groceries" · ⚡ Instant · just now · "− $84.00". */
export const groceriesItem = (appear = 1, when: string = justNow): FeedItem => ({
  id: "groceries",
  kind: "instant",
  who: MAYA,
  amount: STORY.groceries,
  reason: "groceries",
  category: "groceries",
  instantLimit: LISBON.instantLimit,
  when,
  appear,
});

/** $366: Maya's $84 groceries went through on their own. */
export const feedAfterGroceries = (appear = 1): FeedGroup[] => [{ label: today, items: [groceriesItem(appear)] }, ...FEED_FULL];

/** Maya's $300 tickets for the boat trip, asked: "Maya · Tickets" · ⏱ Needs one OK · "$300.00". */
export const boatPendingItem = (appear = 1, tier: "one_ok" | "group" = "one_ok"): FeedItem => ({
  id: "boat",
  kind: "pending",
  who: MAYA,
  amount: STORY.boat,
  reason: "the boat trip",
  category: "tickets",
  tier,
  approvals: 1,
  k: LISBON.k,
  expires: copy["time.in_days"](LISBON.expiryDays),
  when: justNow,
  appear,
});

export const feedBoatPending = (appear = 1, tier: "one_ok" | "group" = "one_ok"): FeedGroup[] => [
  { label: today, items: [boatPendingItem(appear, tier), groceriesItem(1, "2 min ago")] },
  ...FEED_FULL,
];

/** $66: the boat tickets paid on Leo's OK: "Maya · Tickets" · ✓ One OK · "− $300.00" (`tier: "group"`: ✓ Approved). */
export const boatApprovedItem = (appear = 1, tier: "one_ok" | "group" = "one_ok"): FeedItem => ({
  id: "boat",
  kind: "approved",
  to: MAYA,
  amount: STORY.boat,
  reason: "the boat trip",
  category: "tickets",
  approvedBy: tier === "one_ok" ? [MAYA.name] : [MAYA.name, LEO.name],
  okBy: tier === "one_ok" ? LEO.name : undefined,
  when: justNow,
  appear,
});

export const feedAfterBoat = (appear = 1, tier: "one_ok" | "group" = "one_ok"): FeedGroup[] => [
  { label: today, items: [boatApprovedItem(appear, tier), groceriesItem(1, "3 min ago")] },
  ...FEED_FULL,
];

/** Closed: "Pot closed. Everyone got their share back." + the close request line. */
export const feedClosed = (appear = 1): FeedGroup[] => [
  {
    label: today,
    items: [
      { id: "closed", kind: "closed", appear },
      { id: "close-asked", kind: "closeRequested", who: MAYA, k: LISBON.k },
      boatApprovedItem(1),
      groceriesItem(1, "8 min ago"),
    ],
  },
  ...FEED_FULL,
];

/** Money from outside: "Grandma · Paid in · by link" · ↙ From outside · "+ $25.00" (or tone "gift": "Sent a gift ☕"). */
export const payInItem = (appear = 1, tone: "payment" | "gift" = "payment", amount = 25, when: string = justNow): FeedItem => ({
  id: "grandma-payin",
  kind: "payin",
  who: GRANDMA,
  amount,
  tone,
  when,
  appear,
});

/** $475: Grandma's $25 paid in by link on top of the full Pot (the payin-feed capture). */
export const feedPayIn = (appear = 1, tone: "payment" | "gift" = "payment"): FeedGroup[] => [{ label: today, items: [payInItem(appear, tone)] }, ...FEED_FULL];

/** Members tab lines at a balance (pro rata: everyone put in $150). `trust` adds the badge + "Can spend up to …". */
export function memberLines(balance: number, me = MAYA.id, trust?: Partial<Record<string, { level: 0 | 1 | 2; upTo: number }>>): MemberLine[] {
  const spent = STORY.full - balance;
  return [MAYA, SAM, LEO].map((p) => ({
    person: p,
    putIn: 150,
    spentShare: spent / 3,
    getsBack: balance / 3,
    isMe: p.id === me,
    trust: trust?.[p.id] ?? null,
  }));
}

/** Everyone New (a Pot made today): each can spend up to $100 without asking. */
export const TRUST_NEW = { maya: { level: 0 as const, upTo: 100 }, sam: { level: 0 as const, upTo: 100 }, leo: { level: 0 as const, upTo: 100 } };
