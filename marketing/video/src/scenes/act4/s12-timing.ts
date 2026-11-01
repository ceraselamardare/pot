// s12-tech timing (builder E). Keyed to the VO (src/data/vo/s12-tech.json) via voWord(), measured fallbacks.
//   VO (scene frames): Under 48 · hood 67 · every 107 · Pot 125 · Sputnik 169 · DAO 190 · on 226 · NEAR 236 ·
//   Its 286 · rules 302 · enforced 326 · on-chain 358 · not 405 · person 432 (ends 458) · Every 494 ·
//   action 515 · gasless 548 (ends 587) · And 609 · no 620 · one 631 · can 641 · take 649 · money 662 ·
//   out 678 · alone 690 (ends ≈ 715). The scene ends on the bar line at 840 (hard cut to the cream end card).
import { voWord } from "../../data/vo";
import { scene } from "../../data/timeline";

const ID = "s12-tech" as const;
const w = (word: string, fallback: number, occurrence = 0) => voWord(ID, word, fallback, occurrence);

const wUnder = w("Under", 48);
const wThe = w("the", 61);
const wHood = w("hood", 67);
const wSputnik = w("Sputnik", 169);
const wDao = w("DAO", 190);
const wNear = w("NEAR", 236);
const wRules = w("rules", 302);
const wEnforced = w("enforced", 326);
const wOnchain = w("on-chain", 358);
const wPerson = w("person", 432);
const wGasless = w("gasless", 548);
const wAnd = w("And", 609);
const wNo = w("no", 620);
const wOne = w("one", 631);
const wCan = w("can", 641);
const wTake = w("take", 649);
const wMoney = w("money", 662);
const wOut = w("out", 678);
const wAlone = w("alone", 690);

/** A layer's focus window: [start, end) in scene frames; `sweep` = the x-ray scan that ends on the VO word. */
export type FocusWindow = { plate: number; start: number; end: number; sweep?: number };

export const S12 = {
  len: scene(ID).duration,
  wUnder,
  wThe,
  wHood,
  wSputnik,
  wDao,
  wNear,
  wRules,
  wEnforced,
  wOnchain,
  wPerson,
  wGasless,
  wAnd,
  trustWords: [wNo, wOne, wCan, wTake, wMoney, wOut, wAlone] as const,
  wAlone,
  /** The plates separate 5 f apart (App first), 24 f each on `land`. */
  explode: wUnder - 14,
  explodeGap: 5,
  explodeDur: 24,
  /** The request pulse: spawns on the App's Spend button on "hood", then arrives at each layer. Slab 4 (Your
   *  Pot) is reached just before "Sputnik", slab 5 (Dollars) on "NEAR". */
  pulseSpawn: wHood - 8,
  pulseArrive: [wHood + 4, wHood + 34, wHood + 64, wSputnik - 4, wNear - 2] as const,
  pulseLeave: [wHood + 8, wHood + 38, wHood + 68, wNear - 16] as const,
  pulseOut: wNear + 44,
  /** The story we just watched, on "Its rules are enforced on-chain, not by a person": an "$84.00" request stops
   *  at Pot rules on "enforced" (✓ Approved by Pot rules, held ≈ 1 s), its pill and chip fold into the check as a
   *  "$300.00" request leaves the app; the $300 passes the rules and lands at Your Pot on "not by a person", where
   *  Maya and Leo approve. Both lanes run down the slabs' left bands, so nothing covers an engraved label. */
  spend84: { spawn: wRules - 10, leave: wRules - 4, arrive: wEnforced - 2, fold: wOnchain + 28, out: wPerson + 20 },
  spend300: { spawn: wOnchain + 14, leave: wOnchain + 22, arrive: wPerson - 12, out: wPerson + 60 },
  /** The app's own copy ("The Pot enforces these rules itself. No one, including Maya, can skip them.") takes the
   *  headline slot on "on-chain" (the rows below never move); "Under the hood" makes way just before. */
  headlineOut: wOnchain - 26,
  subLabel: wOnchain - 10,
  subLabelOut: wPerson + 60,
  /** The collapse starts in the VO pause after "gasless" and becomes the shield on "And". */
  collapse: wAnd - 19,
  /** The trust sentence's second half (the product's own words), then the track chips. */
  subLine: wAlone + 8,
  chips: wAlone + 30,
} as const;

/** Which layer is in focus when (index 0 = App … 4 = Dollars). Sweeps land on the VO words (15-20 f), dwells
 *  run 60-90 f+. */
export const FOCUS: FocusWindow[] = [
  { plate: 0, start: S12.pulseSpawn, end: S12.pulseArrive[1] - 2 },
  { plate: 1, start: S12.pulseArrive[1] - 2, end: S12.pulseArrive[2] - 2 },
  { plate: 2, start: S12.pulseArrive[2] - 2, end: S12.pulseArrive[3] - 6 },
  { plate: 3, start: S12.pulseArrive[3] - 6, end: S12.pulseArrive[4] - 2, sweep: wSputnik },
  { plate: 4, start: S12.pulseArrive[4] - 2, end: wNear + 64 },
  { plate: 2, start: wEnforced - 22, end: wPerson + 68, sweep: wEnforced },
  // the $300.00 request lands at Your Pot: that row lights with Pot rules while Maya and Leo approve
  { plate: 3, start: S12.spend300.arrive - 4, end: S12.spend300.out + 8 },
  { plate: 1, start: wPerson + 68, end: wAnd - 27, sweep: wGasless },
];


