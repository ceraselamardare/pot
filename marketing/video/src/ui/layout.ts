// Measured rects of the breakout cards inside a phone screen (390 × 844, safe areas 50 top / 34 bottom, default
// props of each state, fonts loaded). Units: logical px from the SCREEN's top-left. Add SCREEN_RECT.x/y for the
// phone's top-left, then multiply by your stage scale. Re-measure after changing content:
//   node src/ui/preview/measure.mjs        (2026-11-03: the app of Nov 3, one-OK story)
import { SCREEN_RECT } from "./Phone";

export type Rect = { x: number; y: number; w: number; h: number };

const r = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

export const LAYOUT = {
  // ── Pot screen (PotScreen, scrollY 0, Activity) ─────────────────────────────────────────────────────────────
  /** The balance card: label, $450.00, "You'd get back … ⓘ", the goal bar, the round actions. (Oct 22: h 250.38.) */
  potHero: r(16, 122, 358, 302.38),
  /** The round action row inside the hero (4 columns of 78.5, 4 px gaps): circles 56 px + 6 px + the label. */
  potActions: r(32, 326.38, 326, 82),
  /** Each 56 px circle: Add money (the marigold), Spend, Ask, More. */
  potActionAdd: r(43.25, 326.38, 56, 56),
  potActionSpend: r(125.75, 326.38, 56, 56),
  potActionAsk: r(208.25, 326.38, 56, 56),
  potActionMore: r(290.75, 326.38, 56, 56),
  /** Activity · Members · Settings. */
  potTabs: r(16, 448.38, 358, 52),
  /** The first compact row under the first day heading (FEED_FULL: Leo · Added money; feedAfterGroceries: the
   * groceries row). Rows are 70.97 tall: the next row starts 8 px lower under the same day, or 48 px lower across
   * a day heading. */
  feedFirstRow: r(16, 536.38, 358, 70.97),
  /** "Waiting on you": the one-OK RequestCard ([✓ OK $300] · [Decline]) under its heading. */
  potWaitingCard: r(16, 548.38, 358, 200),
  /** The tab bar (Pots · Requests · $0.00): a 1 px line, 57 px of tabs and the 34 px home area. */
  tabBar: r(0, 752, 390, 92),
  /** With an all-or-nothing goal collecting (goalBanner): the hero grows to 378.38, the banner sits at: */
  potGoalBanner: r(32, 272.38, 326, 114),

  // ── Spend (SpendSheet) ───────────────────────────────────────────────────────────────────────────────────────
  /** step "howMuch" ($84): the decision line, [Next], the keypad. */
  spendHowMuchDecision: r(16, 404, 358, 52),
  spendHowMuchNext: r(16, 486, 358, 52),
  spendKeypad: r(16, 550, 358, 248),
  /** step "details": the decision line pinned over the ask, and the ask ("Get $84 back" / "Ask for one OK"). */
  spendDetailsDecision: r(16, 626, 358, 52),
  spendDetailsCta: r(16, 690, 358, 52),
  /** step "sent": the whole result block (amount + capsule + sent row + Receipt ↗) and the capsule alone.
   * (Oct 22: result (16, 503.63, 358, 212.38), capsule y 604: the receipt row moved them up 44 px.) */
  spendSentResult: r(16, 459.63, 358, 256.38),
  spendSentCapsule: r(16, 560, 358, 64),
  /** step "approved" (no footer yet, so the sheet is shorter and the capsule sits lower). Unchanged. */
  spendApprovedResult: r(16, 663.63, 358, 164.38),
  spendApprovedCapsule: r(16, 764, 358, 64),
  /** step "oneOkSent" ($300): the result block and its "Sent · One OK from anyone else…" box. */
  spendOneOkSentResult: r(16, 485.63, 358, 230.38),
  spendOneOkSentStatus: r(16, 586, 358, 86),
  /** step "voteSent" with tier "group": the result, the status box and Approvals · 1 of 2. */
  spendVoteSentStatus: r(16, 438, 358, 86),
  spendVoteSentTimeline: r(16, 544, 358, 128),
  /** payee "link", step "sent": the send-by-link card (heading → key line) and its QR block (full width; the white
   * plate is 232 px centred in it: 200 QR + 16 padding, then the "They point their phone camera at it." hint). */
  sendLinkCard: r(16, 317.38, 358, 478),
  sendLinkQr: r(16, 381.38, 358, 268),

  // ── Approve (ApproveSheet, Leo) ──────────────────────────────────────────────────────────────────────────────
  /** Default (one OK, ready): "One OK needed" block, the details table, [OK $300]. */
  approveOneOk: r(16, 385.38, 358, 84),
  approveFacts: r(16, 489.38, 358, 196),
  approveCta: r(16, 690, 358, 52),
  /** state "approved" (one OK): the block with "You · gave the OK", the 2-row table, the "Done. Your OK sent …" box. */
  approveDoneOneOk: r(16, 410, 358, 84),
  approveDoneFacts: r(16, 514, 358, 100),
  approveDoneStatus: r(16, 670, 358, 46),
  /** variant "group" (ready): the ApprovalTimeline. (Oct 22: y 400.) */
  approveTimeline: r(16, 385.38, 358, 128),

  // ── Close (CloseSheet) ─ unchanged ──────────────────────────────────────────────────────────────────────────
  closeProposeTable: r(16, 331.75, 358, 248.25),
  closedTable: r(16, 467.75, 358, 248.25),

  // ── Settings tab (PotScreen activeTab "settings"; was "rules"), scrollY 0 ──────────────────────────────────────
  /** "Your instant limit" (trust on), first under "RULES · the group decides". */
  myTrust: r(16, 544.38, 358, 170),
  /** Each rule card, in the app's order. (Oct 22 rules tab: instant y 508.38, threshold 596.38, budget 662.38,
   * recipients 794.38, expiry 860.38; the hero grew 52 px and "Your instant limit" + trust + one OK came first.) */
  ruleInstant: r(16, 730.38, 358, 80),
  ruleTrust: r(16, 818.38, 358, 104),
  ruleOneOk: r(16, 930.38, 358, 80),
  ruleThreshold: r(16, 1018.38, 358, 58),
  ruleBudget: r(16, 1084.38, 358, 124),
  ruleRecipients: r(16, 1216.38, 358, 58),
  ruleExpiry: r(16, 1282.38, 358, 58),
  ruleLeftovers: r(16, 1348.38, 358, 104),
  ruleSize: r(16, 1460.38, 358, 58),
  ruleLinks: r(16, 1526.38, 358, 80),

  // ── Members tab (trust badges on) ────────────────────────────────────────────────────────────────────────────
  /** The first member row (Maya (you) + "New" + "Can spend up to $100 without asking"); rows are 128 apart. */
  memberFirstRow: r(16, 688.38, 358, 128),

  // ── Lock screen ──────────────────────────────────────────────────────────────────────────────────────────────
  /** The push card at stackTop 330 (one-OK copy: two body lines). */
  lockPush: r(8, 330, 374, 102),

  // ── Create (CreatePotSheet) ──────────────────────────────────────────────────────────────────────────────────
  /** step 1 (lean): the cover card, the name field, the "chips in / rules summary" box. */
  createCoverCard: r(16, 137, 358, 80),
  createName: r(16, 311, 358, 52),
  createSummary: r(16, 383, 358, 158),
  /** step 2 "Pot rules" (bodyScroll 0): each rule card (the body scrolls under the footer from y 676). */
  createRuleInstant: r(16, 201, 358, 136),
  createRulePerPerson: r(16, 353, 358, 108),
  createRuleTrust: r(16, 477, 358, 192),
  createRuleOneOk: r(16, 685, 358, 156),
  createRulePayees: r(16, 857, 358, 154),
  createRuleGoal: r(16, 1027, 358, 80),
  createRulesFixed: r(16, 1123, 358, 228),

  // ── Add money (AddMoneySheet, Leo at $300) ───────────────────────────────────────────────────────────────────
  addStep1Body: r(16, 264, 358, 192),
  addStep2Body: r(16, 342, 358, 264),

  // ── Pay in, More options ─────────────────────────────────────────────────────────────────────────────────────
  /** PayInSheet: the ready card (✓ line → "Payment · $25 · Until Nov 17") and its QR block (the 248 px white plate:
   * 216 QR + 16 padding, then 12 px and the "Scan to pay into Lisbon Trip" hint). */
  payInCard: r(16, 300, 358, 360),
  payInQr: r(71, 340, 248, 284),
  /** MoreSheet: the first row (Invite friends); rows are 60 tall, 382 wide (the app's -mx-3). */
  moreFirstItem: r(4, 520, 382, 60),

  // ── Chat ─ unchanged ─────────────────────────────────────────────────────────────────────────────────────────
  /** ChatScreen with 3 messages (Sam, Leo, then Maya's link): the link preview card (264 wide). */
  chatLinkPreviewExample: r(50, 455.41, 264, 232.59),
} as const;

/** A screen rect in phone coordinates (adds the bezel offset). */
export const inPhone = (rect: Rect): Rect => ({ ...rect, x: rect.x + SCREEN_RECT.x, y: rect.y + SCREEN_RECT.y });
