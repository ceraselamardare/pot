// Ready-made feeds and member lines for the D-61 story beats, so scenes don't rebuild them.
// Day labels follow the app's real capture (Oct 19 Maya starts, Oct 20 Sam, yesterday Leo, today the spends).
import { copy } from "./copy";
import { LEO, LISBON, MAYA, SAM, STORY } from "./data";
import type { FeedGroup, FeedItem } from "./atoms/Feed";
import type { MemberLine } from "./screens/PotTabs";

const today = copy["feed.day.today"];
const yesterday = copy["feed.day.yesterday"];

/** Oct 20 / Oct 19 history (Sam and Maya chip in). */
export const HISTORY: FeedGroup[] = [
  { label: "Oct 20", items: [{ id: "sam-add", kind: "contribution", who: SAM, amount: 150, when: "2 days ago" }] },
  {
    label: "Oct 19",
    items: [
      { id: "sam-joined", kind: "joined", who: SAM },
      { id: "maya-add", kind: "contribution", who: MAYA, amount: 150, when: "2 days ago" },
      { id: "created", kind: "created", who: MAYA, potName: LISBON.name },
    ],
  },
];

/** $300 of $450: before Leo joins. */
export const FEED_BEFORE_LEO: FeedGroup[] = HISTORY;

/** Leo's add as it lands: "Adding $150…" (Sending…) then "Leo added $150" · just now. */
export function feedLeoAdding(state: "adding" | "added", appear = 1): FeedGroup[] {
  const leo: FeedItem =
    state === "adding"
      ? { id: "leo-add", kind: "adding", who: LEO, amount: 150, appear }
      : { id: "leo-add", kind: "contribution", who: LEO, amount: 150, when: "just now", appear };
  return [{ label: today, items: [leo, { id: "leo-joined", kind: "joined", who: LEO }] }, ...HISTORY];
}

/** $450 of $450, the next day (as the real day-pot.png capture). */
export const FEED_FULL: FeedGroup[] = [
  {
    label: yesterday,
    items: [
      { id: "leo-add", kind: "contribution", who: LEO, amount: 150, when: "23h ago" },
      { id: "leo-joined", kind: "joined", who: LEO },
    ],
  },
  ...HISTORY,
];

export const groceriesItem = (appear = 1): FeedItem => ({
  id: "groceries",
  kind: "instant",
  who: MAYA,
  amount: STORY.groceries,
  reason: "groceries",
  instantLimit: LISBON.instantLimit,
  appear,
});

/** $366: Maya's $84 groceries approved by Pot rules (the brand-soft row). */
export const feedAfterGroceries = (appear = 1): FeedGroup[] => [{ label: today, items: [groceriesItem(appear)] }, ...FEED_FULL];

/** Maya's $300 request waiting (1 of 2). */
export const boatPendingItem = (appear = 1): FeedItem => ({
  id: "boat",
  kind: "pending",
  who: MAYA,
  amount: STORY.boat,
  reason: "the boat trip",
  approvals: 1,
  k: LISBON.k,
  expires: copy["time.in_days"](LISBON.expiryDays),
  appear,
});

export const feedBoatPending = (appear = 1): FeedGroup[] => [{ label: today, items: [boatPendingItem(appear), groceriesItem()] }, ...FEED_FULL];

/** $66: the boat trip approved by Maya and Leo. */
export const boatApprovedItem = (appear = 1): FeedItem => ({
  id: "boat",
  kind: "approved",
  to: MAYA,
  amount: STORY.boat,
  reason: "the boat trip",
  approvedBy: [MAYA.name, LEO.name],
  appear,
});

export const feedAfterBoat = (appear = 1): FeedGroup[] => [{ label: today, items: [boatApprovedItem(appear), groceriesItem()] }, ...FEED_FULL];

/** Closed: "Pot closed Everyone got their share back." + the close request line. */
export const feedClosed = (appear = 1): FeedGroup[] => [
  {
    label: today,
    items: [
      { id: "closed", kind: "closed", appear },
      { id: "close-asked", kind: "closeRequested", who: MAYA, k: LISBON.k },
      boatApprovedItem(),
      groceriesItem(),
    ],
  },
  ...FEED_FULL,
];

/** Members tab lines at a balance (pro rata: everyone put in $150). */
export function memberLines(balance: number, me = MAYA.id): MemberLine[] {
  const spent = STORY.full - balance;
  return [MAYA, SAM, LEO].map((p) => ({ person: p, putIn: 150, spentShare: spent / 3, getsBack: balance / 3, isMe: p.id === me }));
}
