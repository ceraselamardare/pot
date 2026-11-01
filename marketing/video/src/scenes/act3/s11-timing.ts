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

const LEN = scene(ID).duration; // v1.1: 420
const FROM = scene(ID).from; // v1.1: 3450
const S12_START = scene("s12-tech").from; // v1.1: 3870

/** The screen-off lands on the bar line where the music enters "Under the hood": the last bar line at or before
 *  s12's start (v1.1: global 3840 = s11 f390), and never later than 30 f before the cut, so the Night rect
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

/** Breakout lift: just before "gets" so the table is up and counting through "fair share back". */
const breakout = wGets - 3;
/** Rows of the lifted table land 3-4 f apart (research §3.3: siblings 2-6 f apart, uneven). */
const rowLand = [breakout + 3, breakout + 6, breakout + 10] as const;
/** Each "Gets back" count: research §3.5 (≈ 20 decaying values in 42 f, lands exactly). */
const COUNT = 42;

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
  // Act: the ⋮ menu
  /** Finger lands on ⋮ in the pause after "over". */
  dotsPress: wClose - 25,
  /** Menu pops 4 f after the press (Base UI popup: 120 ms opacity + scale .95 → 1). */
  menuOpen: wClose - 21,
  /** Finger on "Close Pot" just before "close" is spoken. */
  itemPress: wClose - 5,
  menuClose: wClose + 1,
  /** The CloseSheet rises (360 ms = 22 f, ease-enter) on "close the Pot". */
  sheetIn: wClose + 2,
  // The fair share
  breakout,
  rowLand,
  countDur: COUNT,
  /** Last count lands on "back". */
  countsDone: rowLand[2] + COUNT,
  /** Line 1-2 type exits (one word every 2 f) as the table lifts. */
  typeOut: breakout - 4,
  /** "$22.00 each." rises as the counts land; the marigold bar wipes once the line is readable. */
  bigType: wBack - 18,
  bigTypeEach: wBack - 10,
  barAt: wBack + 6,
  /** The twin settles back into the sheet once "$22.00 each." has landed (dwell ≈ 1.1 s, then 20 f return). */
  breakoutReturn: wBack + 12,
  // Close for real: the group approves (closing needs 2 of 3; Maya's own approval counts)
  /** Press "Ask the group to close". */
  ctaPress: wBack + 34,
  /** The sheet turns to "waiting": close.sent + "Approvals · 1 of 2" (Maya ✓ asked, approval counted). The
   *  readable twin of the timeline rises on the type side and "$22.00 each." moves up to make room. 30 f. */
  waitingAt: wBack + 40,
  /** Sam approves: his row flips to ✓, "Approvals · 2 of 2" (no burst: a group approval). Held 32 f. */
  samApproves: wBack + 70,
  /** 2 of 2 → the Pot closes: the closed sheet (glyph + check), "Pot closed. $22.00 is in your Pot account."
   *  Held 44 f in the phone (40 f for the type-side line) before the screen-off. */
  closedAt: wBack + 102,
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
  // a small push toward the header while the ⋮ menu is used
  { at: S11.dotsPress - 8, ...CAM.maya },
  { at: S11.itemPress, ...PH, scale: 1.08, cy: -110, ease: inOut },
  // settle back (a touch lower) as the sheet rises
  { at: S11.sheetIn + 26, ...PH, scale: 1.02, cy: 24, ease: inOut },
  // a 1.5 % creep while the sheet is read, then the breakout dwell: a slow push toward the lifted table
  { at: S11.breakout, ...PH, scale: 1.035, cy: 26, ease: land },
  { at: S11.breakoutReturn, ...PH, scale: 1.07, cy: 40, ease: land },
  // the approval beat: a slight settle, then back to CAM.maya for the screen-off
  { at: S11.closedAt, ...PH, scale: 1.04, cy: 30, ease: inOut },
  { at: S11.screenOff - 12, ...CAM.maya, ease: inOut },
];

/** The scene camera as a pure function (same maths as useWorldCamera: keys in scene frames, drift from the
 *  GLOBAL frame with the shared "act3" seed, so it never jumps at a cut). */
export const s11CameraAt = (local: number): CameraPose => {
  const global = local + scene(ID).from;
  const base = cameraAt(local, S11_CAMERA_KEYS, { rest: CAM.maya, drift: false });
  return addPose(base, driftAt(global, { seed: "act3" }));
};
