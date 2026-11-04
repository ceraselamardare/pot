// s10b-more (builder B, Act 3): "And more", the feature blitz. VO at f15 (4.893 s):
//   "Plus: trust that grows, all-or-nothing goals, and links to pay in, or pay out."
// "And more." lands BIG on "Plus" (Gabarito 800, 120 px, ink), then shrinks and glides into the small heading as the
// first card launches. Four feature cards (the website's "What else a Pot can do", in the app's own names) land one
// per VO beat as a 2 × 2 grid beside Maya's phone, each with its Pot chip:
//   1 Trust grows · 🇵🇹 Lisbon Trip     breaks out of Maya's phone (Settings tab), lands on "trust": her honest state
//                                      (New, $100): two paid spends fill 2 of 3 → "1 more paid spend to $200" on "grows"
//   2 All or nothing · 🎸 Festival Fund  enters from the right, lands on "all-or-nothing": $150 → $300 of $1,200
//   3 Ask anyone to pay in · 🍷 Porto Weekend  enters from below on "links": the QR, then Grandma pays in on "in"
//   4 Send by link · 🏄 Surf Camp        enters from the right on the second "pay": "✓ Claimed" on "out"
// Only Trust is Maya's Pot: the other three are other Pots of the app's world, so nothing contradicts Lisbon's $66.00
// (review-3 P1-1). Grammar: the {150,20} breakout spring, token shadows (lift), smear on fast moves, a camera that
// makes room, creeps and kicks softly on each landing, and comes home. Full grid from "out", held ≥ 30 f, then the
// cards are thrown out (right column first, every 3 f) back to the empty TypeZone.
// Handoffs: frame 0 = s10's end = the LAST frame = s11's start: CAM.maya (+ the act's global drift), Maya's PotScreen
// $66.00 · "You'd get back $22" · feedAfterBoat(), no sheet, tab bar $384.00, empty TypeZone.
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import {
  DirectionalBlur,
  Sfx,
  WordRise,
  clamp01,
  depthShadow,
  driftAt,
  exit as exitEase,
  inOut,
  lerp,
  linear,
  logLerp,
  ramp,
  smearSigma,
  speedRamp,
  springAt,
  velocity,
  type CameraKey,
  type CameraPose,
} from "../../motion";
import { LAYOUT, PotScreen, feedAfterBoat } from "../../ui";
import { day } from "../../brand/tokens";
import { DISPLAY } from "../../brand/fonts";
import { scene, type SceneId } from "../../data/timeline";
import { CAM, PHONE_SCALE, WORLD, WorldPhone, WorldStage, useWorldCamera } from "../shared/world";
import { EXIT_RANK, FLIGHT, S10B, S10B_ID } from "./s10b-timing";
import { CARD_H, CARD_W, GRID, GoalFeature, PayInFeature, SendLinkFeature, TrustFeature, cardRect } from "./s10b-cards";

export const S10B_SCENES: SceneId[] = [S10B_ID];

// ─── Camera ───────────────────────────────────────────────────────────────────────────────────────────
/** Room for the grid: a 5.5 % pull-back that slides the phone left (the "hyper" speed-ramp move), a 1.6 % creep
 *  through the blitz, and home to CAM.maya exactly on the last frame (inOut). Drift = the act's global drift. */
const ROOM = { ...CAM.maya, scale: 0.945, cx: 62 };
const CAMERA: CameraKey[] = [
  { at: 0, ...CAM.maya },
  { at: S10B.camRoomAt, ...CAM.maya },
  { at: S10B.camRoomEnd, ...ROOM, ease: speedRamp },
  { at: S10B.camCreepEnd, ...ROOM, scale: 0.961, cx: 56, ease: linear },
  { at: S10B.LAST, ...CAM.maya, ease: inOut },
];

/** Card i reads as landed here (4 f before its word, the spring at ~96 %); the camera kicks softly (0.7 %) on it. */
const LAUNCH = [S10B.c1Launch, S10B.c2Launch, S10B.c3Launch, S10B.c4Launch] as const;
const landAt = (i: number) => LAUNCH[i] + FLIGHT - 2;
const kick = (f: number) =>
  LAUNCH.reduce((s, _, i) => {
    const t = f - landAt(i);
    return t < 0 || t > 48 ? s : s + (t < 4 ? t / 4 : Math.exp(-(t - 4) / 6));
  }, 0);

// ─── Maya's phone ─────────────────────────────────────────────────────────────────────────────────────
/** Trust (Maya's own) breaks out of her Settings tab (screen px). */
const TRUST_ENTRY = { x: LAYOUT.potTabs.x + (LAYOUT.potTabs.w * 5) / 6, y: LAYOUT.potTabs.y + LAYOUT.potTabs.h / 2 };

/** Frame px of a screen point on Maya's phone for a camera pose (2D: ignores the small home tilt; good for a launch
 *  point, where the card starts small and leaves fast). */
const onPhone = (cam: CameraPose, p: { x: number; y: number }) => {
  const k = PHONE_SCALE * cam.scale;
  return {
    x: 960 + cam.x + (WORLD.maya.x - cam.cx) * cam.scale + (12 + p.x - 207) * k,
    y: 540 + cam.y + (WORLD.maya.y - cam.cy) * cam.scale + (12 + p.y - 434) * k,
  };
};

// ─── A card: in (out of the phone, or from off-frame), land in its slot, hold, thrown out ──────────────
const EXIT_TRAVEL = { x: 1180, y: -48 };
/** How each card arrives: Trust breaks out of the phone (from 0.22×); the other Pots' cards enter from off-frame,
 *  already lifted (scale 0.92, a token lift shadow) and settle into the slot. */
type Entry = { kind: "phone" } | { kind: "offframe"; dx: number; dy: number; rot: number };
const ENTRIES: Entry[] = [
  { kind: "phone" },
  { kind: "offframe", dx: 1920 + CARD_W / 2 + 60 - (cardRect(1).x + CARD_W / 2), dy: 0, rot: 4 },
  { kind: "offframe", dx: 0, dy: 1080 + CARD_H / 2 + 60 - (cardRect(2).y + CARD_H / 2), rot: -3 },
  { kind: "offframe", dx: 1920 + CARD_W / 2 + 60 - (cardRect(3).x + CARD_W / 2), dy: 0, rot: 4 },
];

type CardPose = { x: number; y: number; s: number; rot: number; lift: number; opacity: number };

const cardPose = (f: number, i: number, phonePoint: { x: number; y: number }): CardPose | null => {
  const launch = LAUNCH[i];
  const exitStart = S10B.exitAt + EXIT_RANK[i] * S10B.exitStagger;
  if (f < launch || f >= exitStart + S10B.exitDur) return null;
  const r = cardRect(i);
  const to = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  const p = springAt(f, launch, "breakout"); // {150, 20}: fast head, a 1.2 % settle
  const q = ramp(f, exitStart, exitStart + S10B.exitDur, exitEase);
  const e = ENTRIES[i];
  const from = e.kind === "phone" ? phonePoint : { x: to.x + e.dx, y: to.y + e.dy };
  return {
    x: lerp(from.x, to.x, p) + EXIT_TRAVEL.x * q,
    y: lerp(from.y, to.y, p) + EXIT_TRAVEL.y * q,
    s: logLerp(e.kind === "phone" ? 0.22 : 0.92, 1, p),
    rot: (e.kind === "phone" ? -5 : e.rot) * (1 - clamp01(p)) + 3 * q,
    lift: (e.kind === "phone" ? 240 * Math.sin(Math.PI * clamp01(p)) : 160 * (1 - clamp01(p))) + 120 * q,
    opacity: e.kind === "phone" ? clamp01((f - launch + 1) / 4) : 1,
  };
};

const FEATURES = [TrustFeature, GoalFeature, PayInFeature, SendLinkFeature] as const;

const FlyingCard: React.FC<{ f: number; i: number; phonePoint: { x: number; y: number } }> = ({ f, i, phonePoint }) => {
  const pose = cardPose(f, i, phonePoint);
  if (!pose) return null;
  // directional smear from the card's own velocity (σ = 0.5 × px/f, capped), gone as it settles
  const vx = velocity((k) => cardPose(k, i, phonePoint)?.x ?? pose.x, f);
  const vy = velocity((k) => cardPose(k, i, phonePoint)?.y ?? pose.y, f);
  const Feature = FEATURES[i];
  return (
    <div
      style={{
        position: "absolute",
        left: pose.x - CARD_W / 2,
        top: pose.y - CARD_H / 2,
        width: CARD_W,
        height: CARD_H,
        transform: `rotate(${pose.rot}deg) scale(${pose.s})`,
        opacity: pose.opacity,
      }}
    >
      {/* a 5 px/f dead zone: full streak at flight speed, crisp as the card settles into its slot */}
      <DirectionalBlur x={smearSigma(Math.max(0, Math.abs(vx) - 5), 0.5, 44)} y={smearSigma(Math.max(0, Math.abs(vy) - 5), 0.5, 44)} region={0.25}>
        <Feature f={f} shadow={depthShadow(pose.lift, "day")} />
      </DirectionalBlur>
    </div>
  );
};

// ─── "And more." big, then the small heading ─────────────────────────────────────────────────────────
/** The big line (Gabarito 800, 120 px, ink, tracking −2.5 %) lands top-right of the frame (clear of the phone and of
 *  card 1's path), then shrinks to 34 px and glides into the heading spot above the grid as card 1 launches. */
const HEAD_BIG = { x: 852, y: 36, size: 120 };
const HEAD_SMALL = { x: GRID.x + 2, y: GRID.y - 52, size: 34 };

const Heading: React.FC<{ f: number }> = ({ f }) => {
  if (f < S10B.headAt || f >= S10B.exitAt + 14) return null;
  const g = ramp(f, S10B.headGlideAt, S10B.headGlideAt + S10B.headGlideDur, inOut);
  const k = logLerp(1, HEAD_SMALL.size / HEAD_BIG.size, g);
  return (
    <div style={{ position: "absolute", left: lerp(HEAD_BIG.x, HEAD_SMALL.x, g), top: lerp(HEAD_BIG.y, HEAD_SMALL.y, g), transform: `scale(${k})`, transformOrigin: "0 0" }}>
      <WordRise
        text="And more."
        start={S10B.headAt}
        stagger={6}
        fontFamily={DISPLAY}
        fontWeight={800}
        fontSize={HEAD_BIG.size}
        letterSpacing="-0.025em"
        color={day.ink}
        align="left"
        rise={48}
        style={{ whiteSpace: "nowrap" }}
        exit={{ at: S10B.exitAt - 4, stagger: 2, duration: 8 }}
      />
    </div>
  );
};

// ─── The scene ────────────────────────────────────────────────────────────────────────────────────────
export const S10bMore: React.FC = () => {
  const f = useCurrentFrame();
  const base = useWorldCamera(S10B_ID, CAMERA);
  const k = kick(f);
  const cam: CameraPose = { ...base, scale: base.scale * (1 + 0.007 * k) };
  const phonePoint = onPhone(cam, TRUST_ENTRY);
  // the grid floats with half the act's hand-held drift: the camera stays alive during the hold
  const g = f + scene(S10B_ID).from;
  const dr = driftAt(g, { seed: "act3" });
  const gx = (dr.x ?? 0) * 0.5;
  const gy = (dr.y ?? 0) * 0.5;
  const gr = (dr.rotZ ?? 0) * 0.5;
  return (
    <AbsoluteFill style={{ background: day.ground }}>
      <WorldStage pose={cam}>
        <WorldPhone who="maya" screen={<PotScreen balance={66} yourShare={22} putIn={150} feed={feedAfterBoat()} tabBar={{ balance: 384 }} />} />
      </WorldStage>
      <AbsoluteFill style={{ transform: `translate(${gx}px, ${gy}px) rotate(${gr}deg)`, transformOrigin: `${GRID.x + GRID.w / 2}px ${GRID.y + GRID.h / 2}px` }}>
        <Heading f={f} />
        {/* Depth order: Trust rises from the phone behind nothing; the others enter from off-frame, below the cards
            already landed (reverse order), so an entering card never covers a card that is being read. */}
        {[3, 2, 1, 0].map((i) => (
          <FlyingCard key={i} f={f} i={i} phonePoint={phonePoint} />
        ))}
      </AbsoluteFill>
      {/* Sound: one soft whoosh into the blitz (peaks with the camera's room move), a quiet pop per card, no burst. */}
      <Sfx name="whoosh-long" at={S10B.camRoomAt + 6} volume={0.3} />
      {LAUNCH.map((_, i) => (
        <Sfx key={i} name="pop-soft" at={landAt(i) - 1} volume={0.35} />
      ))}
    </AbsoluteFill>
  );
};

export default S10bMore;
