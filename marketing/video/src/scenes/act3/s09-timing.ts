// s09-instant beat sheet (scene-local frames). Every beat is keyed to its VO word via voWord() (fallbacks = the
// locked takes), so the scene follows the voice if the timeline shifts by a few frames.
// VO (voAt 15): Small 18 · spends 44 · approve 69 · themselves 91 | Eighty-four 159 · dollars 171 · groceries 212 |
//               Pot 273 · checks 285 · rules 308 | approved 356 | and 406 · paid 417 · back 432 · seconds 464 (end 495)
import { voWord } from "../../data/vo";
import { scene } from "../../data/timeline";

const ID = "s09-instant" as const;
const w = (word: string, fallback: number, occurrence = 0) => voWord(ID, word, fallback, occurrence);

const vSmall = w("Small", 18);
const vSpends = w("spends", 44);
const vApprove = w("approve", 69);
const vThemselves = w("themselves", 91);
const vEightyFour = w("Eighty-four", 159);
const vGroceries = w("groceries", 212);
const vPot = w("Pot", 273);
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
  // ── Spend → the sheet rises, the camera pushes onto the form ──
  spendTouch: vEightyFour - 39,
  sheetIn: vEightyFour - 31,
  pushStart: vEightyFour - 35,
  pushEnd: vEightyFour + 3,
  // ── "Eighty-four dollars for groceries?" ──
  key8: vEightyFour - 4, // finger on "8"; the digit lands 2 f later, just before the word
  key4: vEightyFour + 4,
  chipTouch: vGroceries - 8,
  chipSelect: vGroceries - 5,
  sticker: vGroceries - 4,
  stickerOut: vGroceries + 36, // gone (< 5 %, unmounted) before the move to the result starts
  ctaTouch: vGroceries + 38,
  // ── "Pot checks the rules…" (≈ 90 f hold, then a 0.7 snap toward the dots) ──
  // a 14 f blur-matched move from the form to the result; the sheet content switches at its peak speed
  reframeStart: vGroceries + 44,
  checking: vGroceries + 51,
  reframeEnd: vGroceries + 58,
  snap: vApproved - 22, // 72 f into the check; an 18 f land tail before the hit
  // ── "approved" (the ONE celebration) ──
  approved: vApproved - 4,
  pullBack: 40,
  // ── "and paid back in seconds" ──
  sending: vAnd - 8,
  sent: vPaid - 2,
  moneyIn: vAnd - 8,
  tick: vPaid - 2,
  cardReturn: vApproved + 114,
  // ── back to the handoff state (CAM.maya, $366.00, feedAfterGroceries, no sheet) ──
  doneTouch: vApproved + 136,
  sheetOut: vApproved + 144,
  feedIn: vApproved + 148,
  moneyExit: vApproved + 200, // the money holds while the phone settles; cleared (empty type zone) by f566
  camHome: vApproved + 210, // lands f566: 3 f of drift + s10's 8 f before its first word = 11 f across the seam
} as const;

/** The dots' first peak triad (dot 0 peaks 480 ms into the 1200 ms loop): the blips cue lands on it. */
export const S09_BLIPS = S09.checking + 29;
