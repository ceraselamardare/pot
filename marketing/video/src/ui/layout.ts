// Measured rects of the breakout cards inside a phone screen (390 × 844, safe areas 50 top / 34 bottom, default
// props of each state, fonts loaded). Units: logical px from the SCREEN's top-left. Add SCREEN_RECT.x/y for the
// phone's top-left, then multiply by your stage scale. Re-measure after changing content:
//   node src/ui/preview/measure.mjs
import { SCREEN_RECT } from "./Phone";

export type Rect = { x: number; y: number; w: number; h: number };

const r = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

export const LAYOUT = {
  /** PotScreen: the balance card (no demo banner, scrollY 0). */
  potHero: r(16, 122, 358, 250.38),
  /** SpendSheet step "sent": the whole result block (amount + capsule + sent row) and the capsule alone. */
  spendSentResult: r(16, 503.63, 358, 212.38),
  spendSentCapsule: r(16, 604, 358, 64),
  /** SpendSheet step "approved" (no footer yet, so the sheet is shorter and the capsule sits lower). */
  spendApprovedResult: r(16, 663.63, 358, 164.38),
  spendApprovedCapsule: r(16, 764, 358, 64),
  /** ApproveSheet state "ready": the ApprovalTimeline. */
  approveTimeline: r(16, 400, 358, 128),
  /** CloseSheet: the RefundTable (mode "propose" and mode "closed"). */
  closeProposeTable: r(16, 331.75, 358, 248.25),
  closedTable: r(16, 467.75, 358, 248.25),
  /** PotScreen activeTab "rules", scrollY 0: each rule card. */
  ruleInstant: r(16, 508.38, 358, 80),
  ruleThreshold: r(16, 596.38, 358, 58),
  ruleBudget: r(16, 662.38, 358, 124),
  ruleRecipients: r(16, 794.38, 358, 58),
  ruleExpiry: r(16, 860.38, 358, 58),
  /** ChatScreen with 3 messages (Sam, Leo, then Maya's link): the link preview card (264 wide). */
  chatLinkPreviewExample: r(50, 455.41, 264, 232.59),
} as const;

/** A screen rect in phone coordinates (adds the bezel offset). */
export const inPhone = (rect: Rect): Rect => ({ ...rect, x: rect.x + SCREEN_RECT.x, y: rect.y + SCREEN_RECT.y });
