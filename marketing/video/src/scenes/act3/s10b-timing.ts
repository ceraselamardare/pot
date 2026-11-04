// s10b-more timing (builder B). Scene-local frames (global = local + scene("s10b-more").from = 3150).
// VO at f15 (4.893 s): "Plus: trust that grows, all-or-nothing goals, and links to pay in, or pay out."
// Every beat is keyed to its spoken word with voWord(); the fallbacks are the measured frames of the current take.
import { scene, type SceneId } from "../../data/timeline";
import { voWord } from "../../data/vo";

export const S10B_ID: SceneId = "s10b-more";
const DUR = scene(S10B_ID).duration;

const w = (word: string, fallback: number, occurrence = 0) => voWord(S10B_ID, word, fallback, occurrence);

export const S10B_VO = {
  plus: w("Plus", 18),
  trust: w("trust", 58),
  grows: w("grows", 88),
  allOrNothing: w("all-or-nothing", 133),
  goals: w("goals", 168),
  links: w("links", 210),
  pay: w("pay", 235),
  in: w("in", 250),
  pay2: w("pay", 276, 1),
  out: w("out", 289),
} as const;

/** Launch-to-word frames (minus 2): the {150,20} breakout spring is at ~96 % 4 f before the word (it reads as
 *  landed) and ~99 % on the word itself (crisp, no smear). Cards land 0-4 f before their word. */
export const FLIGHT = 22;

export const S10B = {
  LAST: DUR - 1,
  // the camera makes room on "Plus" (the whoosh peaks with it), creeps through the blitz, comes home by the last frame
  camRoomAt: 6,
  camRoomEnd: 40,
  camCreepEnd: 300,
  // the big "And more." lands on "Plus" (110-130 px kinetic type), then shrinks and glides into the small heading
  // above the grid as card 1 launches (review-3 P1-5)
  headAt: S10B_VO.plus - 10,
  headGlideAt: S10B_VO.trust - FLIGHT - 2,
  headGlideDur: 20,
  // 1 · Trust grows: launches from the Settings tab, lands on "trust"; Maya's two paid spends fill two of the three
  //     segments one after the other, the second one (→ "1 more paid spend to $200") completing on "grows"
  c1Launch: S10B_VO.trust - FLIGHT - 2,
  c1Seg1At: S10B_VO.trust + 4,
  c1Seg2At: S10B_VO.grows - 8,
  c1SegFill: 12,
  // 2 · All or nothing (Festival Fund): enters from off-frame right, lands on "all-or-nothing"; fills toward "goals"
  c2Launch: S10B_VO.allOrNothing - FLIGHT - 2,
  c2FillAt: S10B_VO.allOrNothing + 4,
  c2FillEnd: S10B_VO.goals + 8,
  // 3 · Ask anyone to pay in (Porto Weekend): enters from below, lands on "links"; the QR draws in, then
  //     "Grandma · Paid in · by link" lands on "in"
  c3Launch: S10B_VO.links - FLIGHT - 2,
  c3QrAt: S10B_VO.links - 6,
  c3QrEnd: S10B_VO.pay,
  c3ReadyPop: S10B_VO.pay - 2,
  c3RowAt: S10B_VO.in - 12,
  // 4 · Send by link (Surf Camp): enters from off-frame right, lands on the second "pay"; "✓ Claimed" pops on "out"
  c4Launch: S10B_VO.pay2 - FLIGHT - 2,
  c4QrAt: S10B_VO.pay2 - 8,
  c4QrEnd: S10B_VO.out - 4,
  c4Claimed: S10B_VO.out - 3,
  // full grid from "out"; ≥ 30 f hold; then the exit (right column first, every 3 f), empty TypeZone by f351
  exitAt: S10B_VO.out + 33,
  exitStagger: 3,
  exitDur: 20,
} as const;

/** Exit rank per card (cards: 0 Trust · 1 All or nothing · 2 Pay in · 3 Send by link). The right column leaves
 *  first (1, 3), then the left (0, 2), so no card crosses another on its way out to the right. */
export const EXIT_RANK = [2, 0, 3, 1] as const;
