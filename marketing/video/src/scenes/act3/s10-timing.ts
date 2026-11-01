// s10-group beat sheet (scene-local frames), every beat keyed to its VO word via voWord() (fallbacks = the locked
// takes). VO (voAt 15): Bigger 18 · spends 39 · go 64 · to 75 · the 81 · group 87 (end 110) |
//   The 143 · three-hundred-dollar 147 · boat 194 · trip 206 · needs 225 · two 245 · of 257 · three 267 (end 289) |
//   so 312 · Leo 330 · approves 344 (end 379) | right 393 · from 406 · a 413 · notification 418 (end 466)
// Review 1: Leo taps the push on "so" and presses Approve on "approves", so the split comes right after "two of three".
import { voWord } from "../../data/vo";
import { scene } from "../../data/timeline";

const ID = "s10-group" as const;
const w = (word: string, fallback: number, occurrence = 0) => voWord(ID, word, fallback, occurrence);

const vBigger = w("Bigger", 18);
const vSpends = w("spends", 39);
const vGo = w("go", 64);
const vTo = w("to", 75);
const vThe = w("the", 81);
const vGroup = w("group", 87);
const vHundred = w("three-hundred-dollar", 147);
const vBoat = w("boat", 194);
const vNeeds = w("needs", 225);
const vTwo = w("two", 245);
const vOf = w("of", 257);
const vThree = w("three", 267);
const vSo = w("so", 312);
const vLeo = w("Leo", 330);
const vApproves = w("approves", 344);
const vRight = w("right", 393);
const vFrom = w("from", 406);
const vA = w("a", 413);
const vNotification = w("notification", 418);

const LEAD = 10;

export const S10 = {
  duration: scene(ID).duration,
  // ── "Bigger spends / go to the group." (one marigold block under "go to the group") ──
  tBigger: vBigger - LEAD,
  tSpends: vSpends - LEAD,
  tGo: vGo - LEAD,
  tTo: vTo - LEAD,
  tThe: vThe - LEAD,
  tGroup: vGroup - LEAD,
  hl: vGroup + 13,
  typeExit: vGroup + 45,
  spendTouch: vGroup + 17,
  sheetIn: vGroup + 25,
  pushStart: vGroup + 21,
  pushEnd: vGroup + 59,
  // ── "The three-hundred-dollar boat trip" ──
  key3: vHundred - 2,
  key0a: vHundred + 8,
  key0b: vHundred + 18,
  chipsScroll: vHundred + 21, // 12 f flick of the chip row to bring Tickets in
  ticketsTouch: vHundred + 35,
  ticketsSelect: vHundred + 38,
  bodyScroll: vBoat - 8, // the finger drags the form up 56 px (10 f) so the note row clears the footer
  sticker: vBoat - 2,
  stickerOut: vNeeds - 2,
  noteTouch: vBoat + 3, // tap on the (now visible) "+ Add a note"
  noteType: vBoat + 6, // "the boat trip" at 30 chars/s, done before "needs"
  // ── "needs two of three" ──
  askTouch: vNeeds + 4,
  reframeStart: vNeeds + 7, // blur-matched move to the phone-left framing; the content switches at its peak
  voteSent: vNeeds + 15,
  reframeEnd: vNeeds + 27,
  lift: vTwo - 3,
  tNeeds: vNeeds - LEAD,
  tTwoOfThree: vTwo - LEAD,
  hlTwoOfThree: vOf - 2,
  // ── the split: pull back, the request flies to Leo and lands as the push ──
  splitStart: vThree - 1,
  splitEnd: vThree + 19,
  splitPills: vThree + 5,
  flightStart: vThree + 5,
  flightEnd: vThree + 31,
  type2Exit: vThree + 21,
  timelineReturn: vThree + 25,
  leoPushStart: vThree + 25,
  leoPushEnd: vSo,
  // ── "so Leo approves, right from a notification" ──
  notifTouch: vSo + 4,
  approveIn: vSo + 8,
  unlock: vSo + 10,
  reframe2Start: vSo + 10,
  reframe2End: vApproves + 2,
  approveTouch: vApproves - 3, // the press peaks on "approves"
  approving: vApproves + 3,
  approved: vApproves + 21,
  tLeo: vLeo - LEAD,
  tApproves: vApproves - LEAD,
  tRight: vRight - LEAD,
  tFrom: vFrom - LEAD,
  tA: vA - LEAD,
  tNotification: vNotification - LEAD,
  leoTypeExit: vNotification + 38,
  // ── back to Maya: the approval travels home, the hero and the big roll tick $366.00 → $66.00 ──
  chipPop: vNotification + 42,
  whipStart: vNotification + 48,
  whipMid: vNotification + 58,
  whipEnd: vNotification + 68,
  chipLand: vNotification + 68,
  moneyIn: vNotification + 68,
  tick: vNotification + 70, // 36 f roll (lands 524), then a 0.5 s hold before it clears
  moneyExit: vNotification + 138, // the $66.00 holds ~0.5 s, cleared (empty type zone) by f566
  mayaPillIn: vNotification + 66,
  mayaPillOut: vNotification + 118,
  camHome: vNotification + 146, // lands f564: ≤ 6 f of pure drift before the cut to s11
  mayaSheetGone: vRight + 30, // Maya's sheet closes while the camera is on Leo (off screen)
  leoRest: vNotification + 88, // Leo's phone settles to his Pot screen, off screen
} as const;
