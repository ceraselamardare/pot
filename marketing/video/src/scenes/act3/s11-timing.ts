// s11-close timing (builder E). Every beat is keyed to the VO (src/data/vo/s11-close.json) through voWord(),
// with the measured frames as fallbacks; scene boundaries come from src/data/timeline.ts. Frames are scene-local
// (frame 0 = the s10 → s11 cut).
//   VO (scene frames): When 18 · trip's 32 · over 53 · close 91 · Pot 117 · Everyone 166 · gets 191 ·
//   fair 217 · share 230 · back 244 (ends ≈ 263).
import { addPose, bars, cameraAt, driftAt, inOut, land, type CameraKey, type CameraPose } from "../../motion";
import { scene } from "../../data/timeline";
import { voWord } from "../../data/vo";
import { CAM, WORLD } from "../shared";

const ID = "s11-close" as const;
const w = (word: string, fallback: number, occurrence = 0) => voWord(ID, word, fallback, occurrence);

const LEN = scene(ID).duration; // v2: 360
const FROM = scene(ID).from; // v2: 3510
const S12_START = scene("s12-tech").from; // v2: 3870

/** The screen-off lands on the bar line where the music enters "Under the hood": the last bar line at or before
 *  s12's start (v2: global 3840 = s11 f330), and never later than 30 f before the cut, so the Night rect
 *  (24 f) fills the frame inside s11. */
const SCREEN_OFF = Math.min(Math.floor(S12_START / bars(1)) * bars(1), S12_START - 30) - FROM;

const wWhen = w("When", 18);
const wThe = w("the", 25);
const wTrips = w("trip's", 32);
const wOver = w("over", 53);
const wClose = w("close", 91);
const wThe2 = w("the", 110, 1);
const wPot = w("Pot", 117);
const wGets = w("gets", 191);
const wFair = w("fair", 217);
const wBack = w("back", 244);

/** The refund breakout: just before "gets", once the group's 2 of 2 has been read. */
const breakout = wGets - 3;
/** The lifted table's "Gets back" cells are emphasised 3-4 f apart (research §3.3: siblings 2-6 f apart, uneven). */
const rowLand = [breakout + 3, breakout + 6, breakout + 10] as const;
/** Kept for reference: the old count length (the twin no longer re-rolls its values). */
const COUNT = 42;

/** v2 order (brief 06 §5.4): More → MoreSheet → Close Pot → the CloseSheet → "Ask the group to close" on "close the
 *  Pot" → Approvals 1 of 2 → Sam approves → 2 of 2 (held) → on "fair share" the refund table breaks out and rolls
 *  to $22.00 each → "$22.00 each." → Pot closed → the screen-off on the music's bar line. */
export const S11 = {
  len: LEN,
  // VO words
  wWhen,
  wThe,
  wTrips,
  wOver,
  wClose,
  wThe2,
  wPot,
  wGets,
  wFair,
  wBack,
  // The round More action → the MoreSheet → "Close Pot"
  /** Finger on More (the hero's round action row) during "trip's over". */
  morePress: wClose - 67,
  /** The MoreSheet rises (360 ms = 22 f, ease-enter). */
  moreIn: wClose - 63,
  /** Finger on "Close Pot" (the sheet's last row) after "over". */
  closeItemPress: wClose - 29,
  /** The MoreSheet leaves (280 ms = 17 f, ease-exit) as the CloseSheet rises onto "close". */
  moreOut: wClose - 25,
  sheetIn: wClose - 21,
  // Ask the group (closing needs 2 of 3; Maya's own approval counts)
  /** Press "Ask the group to close" on "close the Pot". */
  ctaPress: wClose + 11,
  /** The sheet turns to "waiting": close.sent + "Approvals · 1 of 2". The readable twin rises on the type side. */
  waitingAt: wClose + 17,
  /** Sam approves: his row flips to ✓, "Approvals · 2 of 2" (no burst: a group approval). */
  samApproves: wClose + 51,
  /** The phase-1 line and the approvals twin leave (2 of 2 held ≥ 30 f before that). */
  typeOut: breakout - 2,
  twinOut: breakout + 8,
  // The fair share
  breakout,
  rowLand,
  countDur: COUNT,
  /** Last count lands just before "back". */
  countsDone: rowLand[2] + COUNT,
  /** "$22.00 each." rises once the emphasised cells have been read; the marigold bar wipes once the line is readable. */
  bigType: wBack - 18,
  bigTypeEach: wBack - 10,
  barAt: wBack + 6,
  /** "Pot closed": the sheet shows the closed moment, the twin settles into its table, Maya's dollars go 384 → 406. */
  closedAt: wBack + 18,
  breakoutReturn: wBack + 18,
  closedLine: wBack + 22,
  // The screen-off into Night (accent 3), on the music's bar line
  screenOff: SCREEN_OFF,
} as const;

/** Phone-centred camera parametrisation: at scale 1 it is identical to CAM.maya, and Maya's phone stays at the
 *  same screen x while the camera pushes (cx = x = the phone's world x). */
const PH = { cx: WORLD.maya.x, x: WORLD.maya.x } as const;

/** s11 camera keys (scene frames). Starts exactly on CAM.maya (the s10 handoff) and is back on CAM.maya before
 *  the screen-off, which the act-4 transition rig relies on. */
export const S11_CAMERA_KEYS: CameraKey[] = [
  { at: 0, ...CAM.maya },
  { at: S11.morePress - 12, ...CAM.maya },
  // a small push toward the round action row for the More press
  { at: S11.morePress + 6, ...PH, scale: 1.06, cy: -40, ease: inOut },
  // glide down with the MoreSheet to its "Close Pot" row
  { at: S11.closeItemPress - 4, ...PH, scale: 1.06, cy: 90, ease: inOut },
  // settle (a touch lower) on the CloseSheet and the group's approvals
  { at: S11.ctaPress, ...PH, scale: 1.02, cy: 24, ease: inOut },
  // a 1.5 % creep while the approvals are read, then the breakout dwell: a slow push toward the lifted table
  { at: S11.breakout, ...PH, scale: 1.035, cy: 26, ease: land },
  { at: S11.closedAt, ...PH, scale: 1.07, cy: 40, ease: land },
  // back to CAM.maya for the screen-off
  { at: S11.screenOff - 12, ...CAM.maya, ease: inOut },
];

/** The scene camera as a pure function (same maths as useWorldCamera: keys in scene frames, drift from the
 *  GLOBAL frame with the shared "act3" seed, so it never jumps at a cut). */
export const s11CameraAt = (local: number): CameraPose => {
  const global = local + scene(ID).from;
  const base = cameraAt(local, S11_CAMERA_KEYS, { rest: CAM.maya, drift: false });
  return addPose(base, driftAt(global, { seed: "act3" }));
};
