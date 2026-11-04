// s10-group beat sheet v2 (scene-local frames; 360 f at global 2790): the one-OK flow (hub 1.1.0). Every beat is keyed
// to its VO word via voWord() (fallbacks = the v2 take). VO (voAt 15, 4.985 s):
//   Bigger 18 · spends 41 · need 67 · one 90 · OK 107 (end 138) | Leo 174 · taps 190 · it 208 (end 215) |
//   right 235 · from 247 · a 254 · notification 259 (end 304)
// Maya asks for $300 (How much? → details: Tickets + "the boat trip" → "This needs one OK from anyone else" →
// [Ask for one OK] → "Sent · One OK from anyone else…"); the request whips to Leo and lands as the push; Leo opens it
// and presses [OK $300] ON "taps"; "Done. Your OK sent $300 to Maya."; the whip home; Maya $366.00 → $66.00.
import { voWord } from "../../data/vo";
import { scene } from "../../data/timeline";

const ID = "s10-group" as const;
const w = (word: string, fallback: number, occurrence = 0) => voWord(ID, word, fallback, occurrence);

const vBigger = w("Bigger", 18);
const vSpends = w("spends", 41);
const vNeed = w("need", 67);
const vOne = w("one", 90);
const vOK = w("OK", 107);
const vLeo = w("Leo", 174);
const vTaps = w("taps", 190);
const vIt = w("it", 208);
const vRight = w("right", 235);
const vFrom = w("from", 247);
const vA = w("a", 254);
const vNotification = w("notification", 259);

const LEAD = 10;

export const S10 = {
  duration: scene(ID).duration,
  // ── "Bigger spends / need one OK." (a marigold block under "one OK") ──
  tBigger: vBigger - LEAD,
  tSpends: vSpends - LEAD,
  tNeed: vNeed - LEAD,
  tOne: vOne - LEAD,
  tOK: vOK - LEAD,
  hlOneOk: vOK + 5,
  typeExit: vOK + 45, // review-3: holds ~10 f longer, beside Leo's push
  // ── Maya: Spend → How much? 3-0-0 → [Next] → details ──
  spendTouch: 1,
  sheetIn: 6,
  pushStart: 3,
  pushEnd: 34,
  key3: 24,
  key0a: 30,
  key0b: 36,
  nextTouch: 45,
  stepMoveStart: 46, // 14 f blur-matched move on speedRamp; step 2 switches in at peak speed
  details: 53,
  stepMoveEnd: 60,
  chipsScroll: 60, // the finger flicks the chip row to Tickets (10 f)
  ticketsTouch: 71,
  ticketsSelect: 74,
  sticker: 75,
  stickerOut: 109,
  noteTouch: 78,
  noteType: 81, // "the boat trip": 13 chars at 1.5 f, done by 101
  askTouch: vOne + 12, // [Ask for one OK] on "one OK"
  submitting: vOne + 17, // the grey ask with the dots; a 14 f blur-matched move onto the result starts here
  oneOkSent: vOne + 24, // switches in at peak speed
  sentMoveEnd: vOne + 31,
  // ── the request whips to Leo and lands as the push (review-3: 12 f earlier, so the push holds ≈ 28-30 f) ──
  flightStart: vOK + 11,
  whipStart: vOK + 17,
  whipMid: vOK + 25,
  whipEnd: vOK + 33,
  flightEnd: vOK + 35,
  // ── "Leo taps it" ──
  pushTouch: vLeo - 8, // Leo taps the push; his sheet opens on "Leo"
  approveIn: vLeo - 4,
  unlock: vLeo - 4,
  approveMoveEnd: vTaps - 6,
  okTouch: vTaps - 5, // the press peaks on "taps"
  approving: vTaps + 1,
  approvedMoveStart: vIt - 6, // 14 f blur-matched move on speedRamp: the sheet's layout changes at peak speed
  approved: vIt + 1, // "Done. Your OK sent $300 to Maya."
  approvedMoveEnd: vIt + 8,
  tLeo: vLeo - LEAD,
  tTaps: vTaps - LEAD,
  tIt: vIt - LEAD,
  tRight: vRight - LEAD,
  tFrom: vFrom - LEAD,
  tA: vA - LEAD,
  tNotification: vNotification - LEAD,
  leoTypeExit: vNotification + 38,
  // ── "… notification": the whip home, anchored by the "✓ One OK" chip; Maya $366.00 → $66.00 ──
  chipPop: vNotification - 7,
  returnStart: vNotification - 1,
  returnMid: vNotification + 8,
  returnEnd: vNotification + 17,
  chipLand: vNotification + 17,
  moneyIn: vNotification + 17,
  tick: vNotification + 21, // 30 f roll (lands +51), with Maya's hero and her Pot dollars $84.00 → $384.00
  mayaPillIn: vNotification + 15,
  mayaPillOut: vNotification + 65,
  moneyExit: vNotification + 81, // the big roll holds ≈ 0.5 s; cleared (empty type zone) by +91
  camHome: vNotification + 89, // lands f348: ≤ 11 f of drift before the cut to s10b
  mayaSheetGone: vTaps, // Maya's sheet closes while the camera is on Leo (off screen)
  leoRest: vNotification + 21, // Leo's phone settles to his Pot screen, off screen
} as const;
