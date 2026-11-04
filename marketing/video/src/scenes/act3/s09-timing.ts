// s09-instant beat sheet v2 (scene-local frames; 540 f at global 2250). Every beat is keyed to its VO word via
// voWord() (fallbacks = the locked take, unchanged in v2), so the scene follows the voice if the timeline shifts.
// VO (voAt 15): Small 18 · spends 44 · approve 69 · themselves 91 | Eighty-four 159 · dollars 171 · groceries 212 |
//               Pot 273 · checks 285 · rules 308 | approved 356 | and 406 · paid 417 · back 432 · seconds 464 (end 495)
// v2 (the app of Nov 3): Spend is the round action → "How much?" (8, 4) → [Next] → details (Groceries, Who gets paid:
// Me, the decision ⓘ opened: "Anyone can spend up to $100 without asking.") → [Get $84 back]; tighter tail.
import { voWord } from "../../data/vo";
import { scene } from "../../data/timeline";

const ID = "s09-instant" as const;
const w = (word: string, fallback: number, occurrence = 0) => voWord(ID, word, fallback, occurrence);

const vSmall = w("Small", 18);
const vSpends = w("spends", 44);
const vApprove = w("approve", 69);
const vThemselves = w("themselves", 91);
const vEightyFour = w("Eighty-four", 159);
const vDollars = w("dollars", 171);
const vGroceries = w("groceries", 212);
const vApproved = w("approved", 356);
const vAnd = w("and", 406);
const vPaid = w("paid", 417);

const LEAD = 10; // WordRise entry starts this many frames before the spoken word (lands 0-4 f early)

export const S09 = {
  duration: scene(ID).duration,
  // ── "Small spends / approve themselves." (TypeZone) ──
  tSmall: vSmall - LEAD,
  tSpends: vSpends - LEAD,
  tApprove: vApprove - LEAD,
  tThemselves: vThemselves - LEAD,
  hlApprove: vThemselves + 13,
  hlThemselves: vThemselves + 18,
  typeExit: vEightyFour - 21,
  // ── the round Spend action → "How much?" rises, the camera pushes onto the keypad ──
  spendTouch: vEightyFour - 41,
  sheetIn: vEightyFour - 35,
  pushStart: vEightyFour - 39,
  pushEnd: vEightyFour - 1,
  // ── "Eighty-four dollars …" ──
  key8: vEightyFour - 4, // finger on "8"; the digit lands 2 f later, just before the word
  key4: vEightyFour + 4,
  nextTouch: vDollars + 11, // [Next] right after "dollars"
  stepMoveStart: vDollars + 13, // 14 f blur-matched move on speedRamp; step 2 ("details") switches in at peak speed
  details: vDollars + 20,
  stepMoveEnd: vDollars + 27,
  // ── "… for groceries?" ──
  chipTouch: vGroceries - 8,
  chipSelect: vGroceries - 5,
  sticker: vGroceries - 4,
  stickerOut: vGroceries + 30, // gone (< 5 %, unmounted) before the move to the result
  infoTouch: vGroceries + 4, // the decision line's ⓘ: "Anyone can spend up to $100 without asking."
  openStart: vGroceries + 6,
  openEnd: vGroceries + 20,
  ctaTouch: vGroceries + 38, // [Get $84 back]
  // ── "Pot checks the rules…" (≈ 72 f of dots, then a 0.7 snap toward the dots) ──
  reframeStart: vGroceries + 44, // 14 f blur-matched move to the result; "checking" switches in at its peak
  checking: vGroceries + 51,
  reframeEnd: vGroceries + 58,
  snap: vApproved - 22, // 71 f into the check; an 18 f land tail before the hit
  // ── "approved" (the ONE celebration) ──
  approved: vApproved - 4,
  pullBack: 40,
  // ── "and paid back in seconds" ──
  sending: vAnd - 8,
  sent: vPaid - 2,
  moneyIn: vAnd - 8,
  tick: vPaid - 2,
  cardReturn: vApproved + 96, // lifted ≈ 1.7 s, back by +20 f
  // ── back to the handoff state (CAM.maya, $366.00, feedAfterGroceries, no sheet, $84.00 in the tab bar) ──
  doneTouch: vApproved + 118,
  sheetOut: vApproved + 124,
  feedIn: vApproved + 128,
  tabTick: vApproved + 128, // the tab bar's Pot dollars tick $0.00 → $84.00 as the sheet clears it
  moneyExit: vApproved + 150, // the big roll holds ≈ 0.8 s; cleared (empty type zone) by +160
  camHome: vApproved + 172, // lands f528: ≤ 11 f of drift before the cut to s10
} as const;

/** The dots' first peak triad (dot 0 peaks 480 ms into the 1200 ms loop): the blips cue lands on it. */
export const S09_BLIPS = S09.checking + 29;
