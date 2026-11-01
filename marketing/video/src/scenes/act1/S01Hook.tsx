// s01-hook. VO: "Every group trip has a money problem."
// 1. Frame 0 is mid-avalanche: generic "Lisbon Trip ✈️" notification banners slam in from the top with gaps of
//    8, 6, 6, 5, 4, 4, 3 f (each slides 65-110 px on `snap` with a 1 f vertical smear; the stack drops in
//    one-frame jumps). The app icon is a generic message-circle tile (Pot doesn't exist yet).
// 2. On "Every" the camera snaps back (revealSnapKeys, ratio 0.6, 24 f `land` tail) to a wall of chat bubbles
//    centred on a giant incoming bubble "who's holding the trip money?" (content changes on the snap frame:
//    a one-frame scale cut). The avalanche's last three gaps (4, 4, 3 f) pop bubbles into the wall.
// 3. Kinetic line on the voice: "Every group trip" (above) / "has a money problem." (below), Gabarito 800 Night
//    ink, "money problem." on a member-4 pink HighlightBar with eggplant text (no marigold in Act 1).
// 4. Out: everything whips left on the last word and has left the frame by the last two frames (clean frame);
//    s02 continues the vector (Maya arrives from the right).
import React from "react";
import { AbsoluteFill, random, useCurrentFrame } from "remotion";
import { scene, type SceneId } from "../../data/timeline";
import { voWord, voWords } from "../../data/vo";
import { DISPLAY } from "../../brand/fonts";
import {
  DirectionalBlur,
  HighlightBar,
  Sfx,
  WordRise,
  alpha,
  cameraAt,
  clamp01,
  exit,
  land,
  lerp,
  ramp,
  revealSnapKeys,
  smearSigma,
  snap,
  softInOut,
  springAt,
  voLanding,
  type CameraPose,
} from "../../motion";
import { FilmBubble, LEO, MAYA, N, NightFinish, NightGround, NotificationBanner, ON_FILL, PINK, SAM, type BannerMsg, type BubbleFrom } from "./common";
import { FrontChaseArrival, WHIP_OVERLAP } from "./S02S03FrontChase";

export const S01_SCENES: SceneId[] = ["s01-hook"];

const ID: SceneId = "s01-hook";
export const S01_DURATION = scene(ID).duration;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9$]/g, "");
const wordEnd = (w: string, fallback: number) => voWords(ID).find((x) => norm(x.text) === w)?.end ?? fallback;

/** Spoken frames (relative to the scene start). */
export const S01_VO = {
  every: voWord(ID, "Every", 27),
  group: voWord(ID, "group", 46),
  trip: voWord(ID, "trip", 62),
  has: voWord(ID, "has", 110),
  a: voWord(ID, "a", 122),
  money: voWord(ID, "money", 132),
  problem: voWord(ID, "problem", 148),
  problemEnd: wordEnd("problem", 179),
};

/** The snap-back: the first wall frame, 2 f before "Every" (a voice-led visual lands 0-4 f early). */
export const S01_SNAP = S01_VO.every - 2;
/** The whip out: everything accelerates left on `exit` and reaches the cut at peak speed. Its last WHIP_OVERLAP
 *  frames also draw s02's whip-in (Maya arriving from the right), so the seam has no empty frame. */
const WHIP_FRAMES = 12;
export const S01_WHIP = S01_DURATION - WHIP_FRAMES;
/** Highlight on "money problem." as soon as the phrase has landed (it reaches "problem" on the word), so the
 *  finished line holds ~35 f before the whip moves. */
export const S01_HIGHLIGHT = S01_VO.problem - 8;

// ─── Avalanche (close-up, screen space) ─────────────────────────────────────────
/** Research/storyboard gaps between banner slams, oldest → newest. The last slam is 1 f before the snap. */
const GAPS = [8, 6, 6, 5, 4, 4, 3];
const LAST_SLAM = S01_SNAP - 1;
const SLAMS: number[] = (() => {
  const out = [LAST_SLAM];
  for (let i = GAPS.length - 1; i >= 0; i--) out.unshift(out[0] - GAPS[i]);
  return out; // e.g. -12, -4, 2, 8, 13, 17, 21, 24
})();

/** Banners in arrival order. One older banner is already settled at frame 0; the storyboard's six messages ride
 *  the slams that are visible from frame 0 on. */
const BANNERS: Array<BannerMsg & { at: number }> = [
  { at: SLAMS[0] - 28, from: MAYA, text: "flights booked! ✈️" },
  { at: SLAMS[0], from: LEO, text: "LISBON!! 🇵🇹" },
  { at: SLAMS[1], from: SAM, text: "who booked the flat??" },
  { at: SLAMS[2], from: LEO, text: "i'll pay you back!!" },
  { at: SLAMS[3], from: SAM, text: "wait how much was the car" },
  { at: SLAMS[4], from: LEO, text: "can someone front the tickets 🙏" },
  { at: SLAMS[5], from: MAYA, text: "I paid for dinner btw" },
  { at: SLAMS[6], from: SAM, text: "how much do I owe again?" },
  { at: SLAMS[7], from: LEO, text: "😅" },
];

const BW = 1480;
const BH = 270;
const PITCH = 304;
const BX = (1920 - BW) / 2;
const BTOP = 64;
const SLIDE = 12;
/** Close-up zoom relative to the wall (the snap jumps by 0.6, then the tail settles a further 0.96). */
const CLOSE = 1 / (0.6 * 0.96);

const Avalanche: React.FC<{ frame: number; pose: CameraPose }> = ({ frame, pose }) => {
  const arrived = BANNERS.map((b, i) => ({ ...b, i })).filter((b) => b.at <= frame);
  const n = arrived.length;
  // The banner layer gets the camera's push (relative to the close-up scale) and drift.
  const s = pose.scale / CLOSE;
  return (
    <AbsoluteFill style={{ transform: `translate(${pose.x}px, ${pose.y}px) rotate(${pose.rotZ}deg) scale(${s})`, transformOrigin: "50% 40%" }}>
      {arrived.map((b) => {
        const k = n - 1 - arrived.indexOf(b); // 0 = newest, at the top
        if (k > 4) return null;
        const t = frame - b.at;
        const dist = 65 + random(`s01-slide-${b.i}`) * 45; // 65-110 px
        const e = snap(clamp01(t / SLIDE));
        const y = BTOP + k * PITCH - dist * (1 - e);
        const newest = k === 0;
        // 1 f vertical smear on the slam (and a light one on the one-frame stack drop).
        const justDropped = !newest && arrived.some((o) => o.at === frame);
        const sigma = t === 0 ? 26 : t === 1 ? 7 : justDropped ? 9 : 0;
        const scale = newest ? lerp(1.035, 1, e) : 1;
        const opacity = newest ? lerp(0.35, 1, clamp01(t / 3)) : 1;
        return (
          <div key={b.i} style={{ position: "absolute", left: BX, top: y, width: BW, height: BH, transform: `scale(${scale})`, opacity }}>
            <DirectionalBlur y={sigma} region={0.3}>
              <NotificationBanner msg={b} width={BW} height={BH} />
            </DirectionalBlur>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// ─── The wall (world space, camera after the snap) ──────────────────────────────
type WallMsg = { from: BubbleFrom; text: string };
const POOL: WallMsg[] = [
  { from: SAM, text: "did anyone keep the receipt" },
  { from: LEO, text: "i'll pay you back!!" },
  { from: "me", text: "the flat was $840" },
  { from: SAM, text: "wait how much was the car" },
  { from: LEO, text: "can you cover me 🙏" },
  { from: SAM, text: "is it 3 ways or 4?" },
  { from: "me", text: "I paid for dinner btw" },
  { from: LEO, text: "i'm broke till friday 😅" },
  { from: SAM, text: "who paid for the taxi" },
  { from: LEO, text: "how much was the boat" },
  { from: "me", text: "screenshot the bill pls" },
  { from: SAM, text: "we owe maya right?" },
  { from: LEO, text: "i'll sort it tomorrow" },
  { from: SAM, text: "how much do I owe again?" },
  { from: "me", text: "add it to the list" },
  { from: LEO, text: "pay you back sunday" },
  { from: SAM, text: "who booked the flat??" },
  { from: LEO, text: "can someone front the tickets 🙏" },
  { from: SAM, text: "ok who's tracking this" },
  { from: LEO, text: "lol same" },
  { from: "me", text: "guys??" },
  { from: SAM, text: "split the dinner?" },
  { from: LEO, text: "🙏🙏🙏" },
  { from: SAM, text: "wait which card did you use" },
];

const WALL_K = 1.85;
const ROWS = 10;
const ROW_PITCH = 130;
const COLS = [-735, -245, 245, 735];
const CELL_W = 470;

type Cell = { key: string; left: number; y: number; align: "left" | "right"; msg: WallMsg; maxW: number; popAt: number | null };

/** The avalanche's last three gaps (4, 4, 3 f) after the snap: bubbles slam into the wall. */
const TAIL_POPS = [S01_SNAP + 4, S01_SNAP + 8, S01_SNAP + 11];

const CELLS: Cell[] = (() => {
  const cells: Cell[] = [];
  let m = 0;
  for (let i = 0; i < ROWS; i++) {
    const y = -((ROWS - 1) / 2) * ROW_PITCH + i * ROW_PITCH;
    const shift = i % 2 === 0 ? -105 : 105;
    COLS.forEach((cx, j) => {
      const central = Math.abs(y) < 170; // the giant bubble's rows
      if (central && (j === 1 || j === 2)) return;
      if (random(`wall-empty-${i}-${j}`) < 0.1) return;
      const msg = POOL[m++ % POOL.length];
      const out = msg.from === "me";
      const jitterX = (random(`wall-x-${i}-${j}`) - 0.5) * 60;
      const jitterY = (random(`wall-y-${i}-${j}`) - 0.5) * 18;
      let maxW = CELL_W - 30;
      let left = cx + shift + jitterX - CELL_W / 2;
      let align: Cell["align"] = out ? "right" : "left";
      if (central) {
        // The giant bubble's rows: only short bubbles hugging the frame edges, clear of its ±640 px span.
        maxW = 290;
        align = j === 0 ? "left" : "right";
        left = j === 0 ? -945 : 945 - maxW;
      }
      cells.push({ key: `${i}-${j}`, left, y: y + jitterY, align, msg, maxW, popAt: null });
    });
  }
  // Three visible cells pop in as the avalanche's tail.
  const picks = ["2-0", "7-3", "3-2"];
  picks.forEach((key, n) => {
    const c = cells.find((x) => x.key === key);
    if (c) c.popAt = TAIL_POPS[n];
  });
  return cells;
})();

const WallBubble: React.FC<{ cell: Cell; frame: number }> = ({ cell, frame }) => {
  const { msg, align, maxW } = cell;
  let scale = 1;
  let opacity = 1;
  let sigma = 0;
  if (cell.popAt !== null) {
    if (frame < cell.popAt) return null;
    const p = springAt(frame, cell.popAt, "uiPop");
    scale = lerp(0.72, 1, p);
    opacity = clamp01((frame - cell.popAt + 1) / 3);
    sigma = frame === cell.popAt ? 14 : 0;
  }
  return (
    <div
      style={{
        position: "absolute",
        left: cell.left + 960,
        top: cell.y + 540 - 50,
        width: maxW,
        display: "flex",
        justifyContent: align === "left" ? "flex-start" : "flex-end",
        transform: `scale(${scale})`,
        transformOrigin: align === "left" ? "0% 100%" : "100% 100%",
        opacity,
      }}
    >
      <DirectionalBlur inline y={sigma} region={0.3}>
        <FilmBubble from={msg.from} k={WALL_K} maxWidth={msg.from === "me" ? maxW : maxW - 64} weight={500} fontSize={30} showName={msg.from !== "me"}>
          {msg.text}
        </FilmBubble>
      </DirectionalBlur>
    </div>
  );
};

const GiantBubble: React.FC<{ frame: number }> = ({ frame }) => {
  // Lands with the snap (content changes on the snap frame), settling 6 % over the camera's tail.
  const e = land(clamp01((frame - S01_SNAP) / 24));
  const scale = lerp(1.06, 1, e);
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: "50% 50%" }}>
        <FilmBubble from={SAM} k={4} fill="sunken" weight={700} fontSize={70} maxWidth={1400} outline padding="26px 50px 34px 46px">
          who’s holding the trip money?
        </FilmBubble>
      </div>
    </div>
  );
};

/** 2D camera transform for a 1920 × 1080 world (look-at cx/cy from the centre, zoom, drift). */
const camera2D = (p: CameraPose) =>
  `translate(${p.x}px, ${p.y}px) rotate(${p.rotZ}deg) scale(${p.scale}) translate(${-p.cx}px, ${-p.cy}px)`;

const Wall: React.FC<{ frame: number; pose: CameraPose }> = ({ frame, pose }) => {
  // The wall steps back (dims) as the kinetic line arrives; the giant bubble stays bright.
  const dim = ramp(frame, S01_SNAP + 4, S01_SNAP + 30, softInOut);
  return (
    <AbsoluteFill style={{ transform: camera2D(pose), transformOrigin: "50% 50%" }}>
      <AbsoluteFill style={{ opacity: lerp(1, 0.34, dim) }}>
        {CELLS.map((c) => (
          <WallBubble key={c.key} cell={c} frame={frame} />
        ))}
      </AbsoluteFill>
      <GiantBubble frame={frame} />
    </AbsoluteFill>
  );
};

// ─── Kinetic line (screen space, on the voice) ──────────────────────────────────
const TYPE_SIZE = 128;
const LINE1_TOP = 132;
const LINE2_TOP = 806;

/** Feathered Night-ground bands behind the two type lines (token colour + alpha), so the wall reads as texture. */
const TypeScrim: React.FC<{ frame: number }> = ({ frame }) => {
  const a = 0.55 * ramp(frame, S01_SNAP + 2, S01_SNAP + 26, softInOut);
  const band = (centre: number) => {
    const h = 330;
    return (
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: centre - h / 2,
          height: h,
          background: `linear-gradient(180deg, ${alpha(N.ground, 0)} 0%, ${alpha(N.ground, a)} 30%, ${alpha(N.ground, a)} 70%, ${alpha(N.ground, 0)} 100%)`,
        }}
      />
    );
  };
  return (
    <AbsoluteFill>
      {band(LINE1_TOP + TYPE_SIZE / 2)}
      {band(LINE2_TOP + TYPE_SIZE / 2)}
    </AbsoluteFill>
  );
};
const NBSP = "\u00a0";

const KineticLine: React.FC = () => (
  <>
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", top: LINE1_TOP }}>
      <WordRise
        words={[
          { text: "Every", startFrame: voLanding(S01_VO.every) },
          { text: "group", startFrame: voLanding(S01_VO.group) },
          { text: "trip", startFrame: voLanding(S01_VO.trip) },
        ]}
        fontSize={TYPE_SIZE}
        color={N.ink}
        rise={56}
      />
    </AbsoluteFill>
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", top: LINE2_TOP }}>
      <WordRise
        words={[
          { text: "has", startFrame: voLanding(S01_VO.has) },
          { text: "a", startFrame: voLanding(S01_VO.a) },
          { text: `money${NBSP}problem.`, startFrame: voLanding(S01_VO.money) },
        ]}
        fontSize={TYPE_SIZE}
        color={N.ink}
        rise={56}
        renderWord={(w) =>
          w.startsWith("money") ? (
            <HighlightBar at={S01_HIGHLIGHT} color={PINK} onBarColor={ON_FILL}>
              {w}
            </HighlightBar>
          ) : (
            w
          )
        }
      />
    </AbsoluteFill>
  </>
);

// ─── Scene ──────────────────────────────────────────────────────────────────────
export const S01Hook: React.FC = () => {
  const frame = useCurrentFrame();
  // One camera for both phases: close-up push, then the 1-frame snap back by 0.6 and a 24 f land tail,
  // then the scene's 4 % creep. Drift is 2D only (no tilt).
  const pose = cameraAt(
    frame,
    [{ at: 0, scale: CLOSE * 0.965 }, ...revealSnapKeys(S01_SNAP - 1, CLOSE, { ratio: 0.6, tail: 24, settle: 0.96 })],
    { creep: { start: S01_SNAP + 25, end: S01_WHIP, amount: 0.04 }, drift: { amount: 8, roll: 0.4, tilt: 0, seed: "s01" } },
  );
  const walled = frame >= S01_SNAP;
  // Whip out: everything accelerates left on `exit` and is gone after WHIP_FRAMES (clean frames to the cut).
  const wx = (f: number) => -2700 * exit(clamp01((f - S01_WHIP) / WHIP_FRAMES));
  const dx = wx(frame);
  const v = Math.abs(wx(frame + 0.5) - wx(frame - 0.5));
  const gone = frame >= S01_WHIP + WHIP_FRAMES;
  const arriving = frame >= S01_DURATION - WHIP_OVERLAP;
  return (
    <NightGround>
      {!gone ? (
        <AbsoluteFill style={{ transform: `translateX(${dx}px)` }}>
          <DirectionalBlur x={Math.min(110, smearSigma(v, 0.5, 110))} region={0.05}>
            {walled ? (
              <>
                <Wall frame={frame} pose={pose} />
                <TypeScrim frame={frame} />
                <KineticLine />
              </>
            ) : (
              <Avalanche frame={frame} pose={pose} />
            )}
          </DirectionalBlur>
        </AbsoluteFill>
      ) : null}
      {/* s02's whip-in overlaps the whip-out: Maya is already arriving from the right on the last frames. */}
      {arriving ? <FrontChaseArrival frame={frame - S01_DURATION} /> : null}
      <NightFinish />
      {/* SFX (sparse): a buzz under the avalanche, notif on two banners, a whoosh into the snap and the whip. */}
      <Sfx name="buzz" at={0} volume={0.18} />
      <Sfx name="notif" at={SLAMS[2]} volume={0.5} />
      <Sfx name="notif" at={SLAMS[4]} volume={0.42} />
      <Sfx name="whoosh-fast" at={S01_SNAP - 3} volume={0.3} />
      <Sfx name="whoosh-fast" at={S01_WHIP + WHIP_FRAMES - 6} volume={0.22} />
    </NightGround>
  );
};

/** Typography check helper for the README (Gabarito 800 at TYPE_SIZE). */
export const S01_TYPE = { family: DISPLAY, size: TYPE_SIZE };
