// s12-tech (builder E): "Under the hood, every Pot is a Sputnik DAO on NEAR. Its rules are enforced on-chain,
// not by a person. Every action is gasless. And no one can take money out alone."
// Night x-ray. Frame 0 continues S11Close's screen-off rig (act4/xray.tsx): the line-art phone finishes its turn
// to isometric, then the phone separates into five layers (App · Gasless relay · Pot rules · Your Pot · Dollars).
// A marigold request pulse runs down the stack (getPointAtLength), lighting each layer's border; the VO then
// focuses the layers it names (Sputnik DAO → Your Pot, enforced on-chain → Pot rules + the app's own copy,
// gasless → Gasless relay). On "And no one can take money out alone" the stack collapses into a shield and the
// trust sentence fills the frame; track chips settle along the bottom; hold to the bar line (hard cut to cream).
import { Check, ShieldCheck } from "lucide-react";
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { getLength, getPointAtLength } from "@remotion/paths";
import { noise2D } from "@remotion/noise";
import {
  alpha,
  clamp01,
  exit as exitEase,
  Grain,
  inOut,
  land,
  lerp,
  punch,
  ramp,
  Sfx,
  sineInOut,
  springAt,
  Vignette,
  voLanding,
  WordRise,
  type TimedWord,
} from "../../motion";
import { night } from "../../brand/tokens";
import { DISPLAY, SANS } from "../../brand/fonts";
import type { SceneId } from "../../data/timeline";
import { Avatar, copy, LEO, MAYA, names, SAM, UiTheme } from "../../ui";
import { CAM } from "../shared";
import { cameraMatrix, chain, layerMatrix, toScreen, translate, type Mat4 } from "./xray-math";
import { STACK, XR_PERSPECTIVE, xrayCamera, xrayLayerPose, xrayStackPose, XrayScene, type StackExtra } from "./xray";
import { anchorLocal, CLOSE_PATH, Plate, PLATES, plateZ, PULSE_LOCAL, SPEND300_PATH, SPEND84_PATH } from "./s12-plates";
import { FOCUS, S12 } from "./s12-timing";

export const S12_SCENES: SceneId[] = ["s12-tech"];

// ─── layout constants (from the rest pose, no drift) ──────────────────────────────
const restM = chain(cameraMatrix({ ...CAM.maya }), layerMatrix(xrayLayerPose(120)));
const REST_ANCHORS = PLATES.map((_, k) => toScreen(chain(restM, translate(0, 0, plateZ(k))), anchorLocal(k), XR_PERSPECTIVE));
/** Callout column: left edge, and one fixed slot per layer at its corner's resting height. */
const X_COL = Math.round(Math.max(...REST_ANCHORS.map((a) => a.x)) + 78);
const SLOT_Y = REST_ANCHORS.map((a) => Math.round(a.y));
const CALLOUT_H = 82;
/** The app's own words (rules.footer), set in the headline slot on "on-chain": one sentence per line. */
const QUOTE_LINES = copy["rules.footer"]("Maya").split(/(?<=\.)\s+/); // ["The Pot enforces these rules itself.", "No one, including Maya, can skip them."]
/** The trust sentence's second half, the product's own words (landing.trust). */
const TRUST_SUB = copy["landing.trust"].split(/(?<=\.)\s+/).slice(1).join(" "); // "Small spends follow the Pot's rules; bigger ones need the group."
/** Story pulses' result lines (real copy): spend.approved, approve.decided.ok, feed.approved.sub. */
const APPROVED_BY_RULES = "Approved by Pot rules";
const APPROVED_BY_OK = copy["approve.decided.ok"](LEO.name, "$300", MAYA.name)[0]; // "Approved by Leo's OK"
const APPROVED_BY_GROUP = copy["feed.approved.sub"](names([MAYA.name, SAM.name])); // "Approved by Maya and Sam"
/** The close request's pill: the majority it needs (closing is a 2-of-3 call, as in s11). */
const CLOSE_TAG = "Close · 2 of 3";

const HEADLINE: TimedWord[] = [
  { text: "Under", startFrame: voLanding(S12.wUnder) },
  { text: "the", startFrame: voLanding(S12.wThe) },
  { text: "hood", startFrame: voLanding(S12.wHood) },
];

const TRUST_TEXT = ["No", "one", "can", "take", "money", "out", "alone."];
const TRUST: TimedWord[] = TRUST_TEXT.map((text, i) => ({ text, startFrame: voLanding(S12.trustWords[i]), breakBefore: i === 4 }));

const CHIPS = ["Sputnik DAO", "Meta-transactions", "Named accounts", "Stablecoins"];

/** Shield position (screen) the stack collapses into; world point under CAM.maya. */
const SHIELD = { x: 960, y: 290, size: 144 } as const;

// ─── state helpers ──────────────────────────────────────────────────────────────
const explodeStart = (k: number) => S12.explode + k * S12.explodeGap;
const explodeT = (f: number, k: number) => ramp(f, explodeStart(k), explodeStart(k) + S12.explodeDur, land);

/** Focus amount of layer k (0..1), smooth in/out at each window's edges. */
const focusOf = (f: number, k: number) =>
  FOCUS.filter((w) => w.plate === k).reduce((m, w) => Math.max(m, ramp(f, w.start, w.start + 8) * (1 - ramp(f, w.end - 8, w.end))), 0);

/** The x-ray scan across a layer (15-20 f, ending on its VO word), −1 when idle. */
const sweepOf = (f: number, k: number) => {
  for (const w of FOCUS) if (w.plate === k && w.sweep !== undefined && f >= w.sweep - 18 && f <= w.sweep + 2) return (f - (w.sweep - 18)) / 20;
  return -1;
};

/** A story pulse's progress in stations (0 … n), one eased run from `leave` to `arrive`. */
const storyStation = (f: number, leave: number, arrive: number, n: number) => n * inOut(clamp01((f - leave) / (arrive - leave)));

/** Frame at which a story pulse passes station i (inverts the eased run). */
const passFrame = (i: number, leave: number, arrive: number, n: number) => {
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 30; k++) {
    const mid = (lo + hi) / 2;
    if (n * inOut(mid) < i) lo = mid;
    else hi = mid;
  }
  return Math.round(leave + ((lo + hi) / 2) * (arrive - leave));
};

const P84 = S12.spend84;
const P300 = S12.spend300;
const PC = S12.close;
/** Every moment a pulse touches a layer: [layer, frame]. The overview pulse, then $84, $300 and the close. The
 *  close is the group's call: it is relayed (Gasless relay flashes) and lands at Your Pot, but Pot rules don't
 *  decide it, so it passes that slab's edge without lighting it. */
const TOUCHES: [number, number][] = [
  ...S12.pulseArrive.map((at, k) => [k, at] as [number, number]),
  [0, P84.leave],
  [1, passFrame(1, P84.leave, P84.arrive, 2)],
  [2, P84.arrive],
  [0, P300.leave],
  [1, passFrame(1, P300.leave, P300.arrive, 2)],
  [2, P300.arrive],
  [0, PC.leave],
  [1, passFrame(1, PC.leave, PC.arrive, 3)],
  [3, PC.arrive],
];

/** Border flash when a pulse touches a layer (decays over ~30 f). */
const flashOf = (f: number, k: number) =>
  TOUCHES.reduce((m, [layer, at]) => (layer === k && f >= at ? Math.max(m, Math.exp(-(f - at) / 9)) : m), 0);

/** Pulse progress along the path, in "stations" (0 = App … 4 = Dollars), with eased hops between them. */
const pulseStation = (f: number): number => {
  const A = S12.pulseArrive;
  const L = S12.pulseLeave;
  if (f < L[0]) return 0;
  for (let i = 0; i < 4; i++) {
    if (f < A[i + 1]) return i + inOut(clamp01((f - L[i]) / (A[i + 1] - L[i])));
    if (i + 1 < 4 && f < L[i + 1]) return i + 1;
  }
  return 4;
};

const fmt = (n: number) => n.toFixed(1);

export const S12Tech: React.FC = () => {
  const f = useCurrentFrame();

  // ── stack life: separate → (focus) → collapse into the shield ──────────────────
  // plates snap together (16 f), then the stack shrinks into the shield: up first, across later, so it clears
  // the sentence's first line before "No" arrives
  const collapseT = inOut(ramp(f, S12.collapse, S12.collapse + 14));
  const upT = ramp(f, S12.collapse + 10, S12.collapse + 24, land);
  const acrossT = ramp(f, S12.collapse + 10, S12.collapse + 28, inOut);
  const shrinkT = ramp(f, S12.collapse + 10, S12.collapse + 26, inOut);
  const fadeT = ramp(f, S12.collapse + 20, S12.collapse + 30);
  // a slow orbit (the stack turns ≈ 5° on its table and leans 2.5°, with a faint hand-held wobble) and a 5 % creep,
  // from the end of the iso turn to the collapse: no hold in Act 4 is static
  const orbitT = sineInOut(ramp(f, 36, S12.collapse));
  const wob = (seed: string) => noise2D(seed, f / 240, 0) * ramp(f, 36, 96);
  const creep = 1 + 0.05 * ramp(f, 36, S12.collapse, inOut);
  const stackExtra: StackExtra = {
    dx: acrossT * (SHIELD.x - 960 - STACK.x),
    dy: upT * (SHIELD.y - 540 - STACK.y),
    rotZ: 5 * orbitT + 0.6 * wob("s12-orbit-z"),
    rotY: -2.5 * orbitT + 0.4 * wob("s12-orbit-y"),
    scale: creep * lerp(1, 0.16, shrinkT),
  };
  const zOf = (k: number) => lerp(plateZ(k) * explodeT(f, k), (2 - k) * 0.6, collapseT);
  const appearOf = (k: number) => (k === 0 ? 1 : ramp(f, explodeStart(k), explodeStart(k) + 6)) * (1 - fadeT);

  // ── projections for the screen-space overlay (same matrices as the 3D stage) ───
  const cam = xrayCamera(f);
  const M: Mat4 = chain(cameraMatrix(cam), layerMatrix(xrayStackPose(f, stackExtra)));
  const plateM = (k: number) => chain(M, translate(0, 0, zOf(k)));
  const anchors = PLATES.map((_, k) => toScreen(plateM(k), anchorLocal(k), XR_PERSPECTIVE));
  const stations = PULSE_LOCAL.map((p, k) => toScreen(plateM(k), p, XR_PERSPECTIVE));

  // ── focus levels ───────────────────────────────────────────────────────────────
  const focus = PLATES.map((_, k) => focusOf(f, k));
  const anyFocus = Math.max(...focus);
  const subP = ramp(f, S12.subLabel, S12.subLabel + 16) * (1 - ramp(f, S12.subLabelOut, S12.subLabelOut + 12));
  // type and leaders leave before the stack moves (one callout every 2 f, 8 f each; leaders retract first)
  const calloutsOut = (k: number) => ramp(f, S12.collapse - 12 + k * 2, S12.collapse - 4 + k * 2, exitEase);
  const leadersOut = ramp(f, S12.collapse - 14, S12.collapse - 6, exitEase);

  // ── the pulse path (screen space, rebuilt each frame from the projected stations) ─
  const pathD = (() => {
    let d = `M ${fmt(stations[0].x)} ${fmt(stations[0].y)}`;
    for (let i = 0; i < 4; i++) {
      const a = stations[i];
      const b = stations[i + 1];
      const h = (b.y - a.y) * 0.5;
      d += ` C ${fmt(a.x)} ${fmt(a.y + h)} ${fmt(b.x)} ${fmt(b.y - h)} ${fmt(b.x)} ${fmt(b.y)}`;
    }
    return d;
  })();
  const segLen = [0, 1, 2, 3].map((i) => {
    const a = stations[i];
    const b = stations[i + 1];
    const h = (b.y - a.y) * 0.5;
    return getLength(`M ${fmt(a.x)} ${fmt(a.y)} C ${fmt(a.x)} ${fmt(a.y + h)} ${fmt(b.x)} ${fmt(b.y - h)} ${fmt(b.x)} ${fmt(b.y)}`);
  });
  const total = segLen.reduce((s, v) => s + v, 0);
  const lengthAt = (fr: number) => {
    const stv = pulseStation(fr);
    const i = Math.min(3, Math.floor(stv));
    return segLen.slice(0, i).reduce((s, v) => s + v, 0) + segLen[i] * (stv - i);
  };
  const lenAt = lengthAt(f);
  const dot = getPointAtLength(pathD, Math.min(total, lenAt)) ?? { x: stations[0].x, y: stations[0].y };
  const pulseIn = springAt(f, S12.pulseSpawn, "uiPop");
  const pulseOut = ramp(f, S12.pulseOut, S12.pulseOut + 12, exitEase);
  const pulseScale = Math.max(0, pulseIn) * (1 - pulseOut);
  // the tail is where the pulse was over the last 8 frames: it stretches with speed and vanishes at rest
  const tail = Math.min(170, Math.max(0, lenAt - lengthAt(f - 8)));

  // ── the story we just watched: "$84.00" stops at Pot rules; "$300.00" goes on to the group ─────
  const story = (path: { layer: number; at: [number, number, number] }[], t: { spawn: number; leave: number; arrive: number; out: number }) => {
    const pts = path.map((p) => toScreen(plateM(p.layer), p.at, XR_PERSPECTIVE));
    const n = pts.length - 1;
    const segs = pts.slice(0, -1).map((a, i) => {
      const b = pts[i + 1];
      const h = (b.y - a.y) * 0.5;
      return `M ${fmt(a.x)} ${fmt(a.y)} C ${fmt(a.x)} ${fmt(a.y + h)} ${fmt(b.x)} ${fmt(b.y - h)} ${fmt(b.x)} ${fmt(b.y)}`;
    });
    const d = `M ${fmt(pts[0].x)} ${fmt(pts[0].y)}` + segs.map((sg) => sg.slice(sg.indexOf("C") - 1)).join("");
    const lens = segs.map((sg) => getLength(sg));
    const totalLen = lens.reduce((a, b) => a + b, 0);
    const lenOf = (fr: number) => {
      const stv = storyStation(fr, t.leave, t.arrive, n);
      const i = Math.min(n - 1, Math.floor(stv));
      return lens.slice(0, i).reduce((a, b) => a + b, 0) + lens[i] * (stv - i);
    };
    const len = lenOf(f);
    const pos = getPointAtLength(d, Math.min(totalLen, len)) ?? pts[0];
    const tailLen = Math.min(150, Math.max(0, len - lenOf(f - 8)));
    const show = Math.max(0, springAt(f, t.spawn, "uiPop")) * (1 - ramp(f, t.out, t.out + 12, exitEase));
    const arrived = ramp(f, t.arrive, t.arrive + 8);
    return { d, pos, len, tailLen, totalLen, show, arrived };
  };
  const s84 = story(SPEND84_PATH, P84);
  const s300 = story(SPEND300_PATH, P300);
  const sClose = story(CLOSE_PATH, PC);

  // ── trust sentence + shield + chips ───────────────────────────────────────────
  const shieldAt = S12.collapse + 22;
  const shieldPop = springAt(f, shieldAt, "uiPop");
  const holdCreep = 1 + 0.03 * ramp(f, S12.collapse + 30, S12.len, inOut);

  return (
    <AbsoluteFill style={{ background: night.ground }}>
      <XrayScene
        g={f}
        stackExtra={stackExtra}
        phoneZ={zOf(0)}
        phoneLit={focus[0]}
        phoneFlash={flashOf(f, 0) * 0.9}
        phoneOpacity={1 - fadeT}
      >
        {PLATES.map((def, k) =>
          k === 0 ? null : (
            <Plate
              key={def.key}
              def={def}
              z={zOf(k)}
              look={{ appear: appearOf(k), focus: focus[k], flash: flashOf(f, k), sweep: sweepOf(f, k) }}
            />
          ),
        )}
      </XrayScene>
      {/* grain on the x-ray plate only (type stays crisp above it) */}
      <Grain opacity={0.28} />

      {/* ── screen-space overlay: leader lines, the pulse ── */}
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        {PLATES.map((def, k) => {
          const a = anchors[k];
          const appear = ramp(f, S12.pulseArrive[k] - 4, S12.pulseArrive[k] + 10, land);
          const vis = appear * (1 - leadersOut);
          if (vis <= 0.001) return null;
          const level = lerp(anyFocus > 0.01 ? 0.6 : 0.8, 1, focus[k]);
          const x2 = X_COL - 22;
          const y2 = SLOT_Y[k];
          const mid = { x: a.x + 18, y: a.y };
          const d = `M ${fmt(a.x)} ${fmt(a.y)} L ${fmt(mid.x)} ${fmt(mid.y)} L ${fmt(x2)} ${fmt(y2)}`;
          const len = Math.hypot(mid.x - a.x, mid.y - a.y) + Math.hypot(x2 - mid.x, y2 - mid.y);
          return (
            <g key={def.key} opacity={vis * level}>
              <path
                d={d}
                fill="none"
                stroke={focus[k] > 0.5 ? night.inkMuted : night.lineStrong}
                strokeWidth={1.5}
                strokeDasharray={`${len} ${len}`}
                strokeDashoffset={len * (1 - appear)}
              />
              <circle cx={a.x} cy={a.y} r={3.5} fill={night.lineStrong} />
            </g>
          );
        })}
        {pulseScale > 0.001 ? (
          <g>
            {tail > 1 ? (
              <path
                d={pathD}
                fill="none"
                stroke={alpha(night.brand, 0.5 * (1 - pulseOut))}
                strokeWidth={3}
                strokeLinecap="round"
                strokeDasharray={`0 ${Math.max(0, lenAt - tail).toFixed(1)} ${tail.toFixed(1)} ${(total + tail).toFixed(1)}`}
              />
            ) : null}
            <circle cx={dot.x} cy={dot.y} r={20 * pulseScale} fill={alpha(night.brand, 0.16)} />
            <circle cx={dot.x} cy={dot.y} r={9 * pulseScale} fill={night.brand} />
          </g>
        ) : null}
        {[s84, s300, sClose].map((sp, i) =>
          sp.show > 0.001 ? (
            <g key={i}>
              {sp.tailLen > 1 ? (
                <path
                  d={sp.d}
                  fill="none"
                  stroke={alpha(night.brand, 0.45 * sp.show)}
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeDasharray={`0 ${Math.max(0, sp.len - sp.tailLen).toFixed(1)} ${sp.tailLen.toFixed(1)} ${(sp.totalLen + sp.tailLen).toFixed(1)}`}
                />
              ) : null}
              <circle cx={sp.pos.x} cy={sp.pos.y} r={18 * sp.show} fill={alpha(night.brand, 0.14)} />
              {/* each request is approved where it stops: its dot becomes the approved check */}
              <circle cx={sp.pos.x} cy={sp.pos.y} r={8 * sp.show * (1 - sp.arrived)} fill={night.brand} />
            </g>
          ) : null,
        )}
      </svg>

      {/* ── the story pulses' tags (HTML, crisp type). Everything sits LEFT of (or under) its dot, over the slabs'
          label-free left bands and the empty margin: amount pill beside the dot, result chip under it ── */}
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        {(() => {
          const pill: React.CSSProperties = {
            position: "absolute",
            height: 44,
            display: "flex",
            alignItems: "center",
            borderRadius: 999,
            fontFamily: SANS,
            fontSize: 28,
            color: night.ink,
            whiteSpace: "nowrap",
          };
          const amountStyle: React.CSSProperties = {
            ...pill,
            padding: "0 16px",
            border: `1.5px solid ${alpha(night.lineStrong, 0.6)}`,
            background: night.surface,
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
          };
          const resultStyle: React.CSSProperties = {
            ...pill,
            gap: 8,
            padding: "0 16px 0 12px",
            background: night.surfaceSunken,
            fontWeight: 600,
          };
          /** The approved check a request becomes where it stops (status colour + icon; the chip carries the word). */
          const check = (pos: { x: number; y: number }, scale: number, key: string) => (
            <div
              key={key}
              style={{
                position: "absolute",
                left: pos.x - 16,
                top: pos.y - 16,
                width: 32,
                height: 32,
                borderRadius: 999,
                background: night.approved,
                color: night.surface,
                display: "grid",
                placeItems: "center",
                transform: `scale(${scale})`,
              }}
            >
              <Check size={20} strokeWidth={2} style={{ display: "block" }} aria-hidden />
            </div>
          );
          const resultChip = (text: string, right: number, top: number, pop: number, opacity: number, transform?: string) => (
            <div style={{ ...resultStyle, right: 1920 - right, top, opacity, transformOrigin: "100% 0%", transform: `${transform ?? ""} scale(${pop})` }}>
              <Check size={22} strokeWidth={2} color={night.approved} style={{ display: "block" }} aria-hidden />
              {text}
            </div>
          );
          const avatar = (p: typeof MAYA, left: number, top: number, scale: number) => (
            <div key={p.id} style={{ position: "absolute", left, top, transform: `scale(${scale})` }}>
              <Avatar person={p} size="sm" ring={night.ground} />
            </div>
          );
          // 1. $84: lands on Pot rules → the check, "✓ Approved by Pot rules" under the pill; then pill + chip fold
          //    into the check (the $300 lands beside it); the check stays until the close comes down
          const r84 = Math.max(0, springAt(f, P84.arrive + 4, "uiPop"));
          const fold84 = ramp(f, P84.fold, P84.fold + 10, exitEase);
          const foldT = (fold: number, dx: number, dy: number) =>
            fold > 0 ? `translate(${(dx * fold).toFixed(1)}px, ${(dy * fold).toFixed(1)}px) scale(${1 - 0.6 * fold})` : undefined;
          // 2. $300: also lands on Pot rules → the check + Leo's dot (his one OK), "✓ Approved by Leo's OK"
          const r300 = Math.max(0, springAt(f, P300.arrive + 4, "uiPop"));
          const leoPop = Math.max(0, springAt(f, P300.arrive + 2, "uiPop"));
          const fold300 = ramp(f, P300.fold, P300.fold + 10, exitEase);
          // 3. Close · 2 of 3: lands on Your Pot → the pill makes room, Maya's and Sam's dots light up, the check,
          //    "✓ Approved by Maya and Sam"
          const rC = Math.max(0, springAt(f, PC.arrive + 4, "uiPop"));
          const slide = 80 * ramp(f, PC.arrive, PC.arrive + 10, land);
          return (
            <UiTheme theme="night">
              {s84.show > 0.001 ? (
                <>
                  {fold84 < 1 ? (
                    <div
                      style={{
                        ...amountStyle,
                        right: 1920 - (s84.pos.x - 20),
                        top: s84.pos.y - 22,
                        opacity: s84.show * (1 - fold84),
                        transformOrigin: "100% 50%",
                        transform: foldT(fold84, 20, 0),
                      }}
                    >
                      $84.00
                    </div>
                  ) : null}
                  {s84.arrived > 0 ? check(s84.pos, r84 * s84.show, "c84") : null}
                  {s84.arrived > 0 && fold84 < 1
                    ? resultChip(APPROVED_BY_RULES, s84.pos.x - 20, s84.pos.y + 32, r84, s84.show * (1 - fold84), foldT(fold84, 20, -54))
                    : null}
                </>
              ) : null}
              {s300.show > 0.001 ? (
                <>
                  {fold300 < 1 ? (
                    <div
                      style={{
                        ...amountStyle,
                        right: 1920 - (s300.pos.x - 20),
                        top: s300.pos.y - 22,
                        opacity: s300.show * (1 - fold300),
                        transformOrigin: "100% 50%",
                        transform: foldT(fold300, 20, 0),
                      }}
                    >
                      $300.00
                    </div>
                  ) : null}
                  {s300.arrived > 0 ? check(s300.pos, r300 * s300.show, "c300") : null}
                  {s300.arrived > 0 ? avatar(LEO, s300.pos.x + 20, s300.pos.y - 16, leoPop * s300.show) : null}
                  {s300.arrived > 0 && fold300 < 1
                    ? resultChip(APPROVED_BY_OK, s300.pos.x + 50, s300.pos.y + 34, r300, s300.show * (1 - fold300), foldT(fold300, -30, -56))
                    : null}
                </>
              ) : null}
              {sClose.show > 0.001 ? (
                <>
                  <div
                    style={{
                      ...amountStyle,
                      right: 1920 - (sClose.pos.x - 20 - slide),
                      top: sClose.pos.y - 22,
                      opacity: sClose.show,
                    }}
                  >
                    {CLOSE_TAG}
                  </div>
                  {sClose.arrived > 0
                    ? [MAYA, SAM].map((p, j) =>
                        avatar(p, sClose.pos.x - 94 + j * 40, sClose.pos.y - 16, Math.max(0, springAt(f, PC.arrive + 2 + j * 4, "uiPop")) * sClose.show),
                      )
                    : null}
                  {sClose.arrived > 0 ? check(sClose.pos, rC * sClose.show, "cC") : null}
                  {sClose.arrived > 0 ? resultChip(APPROVED_BY_GROUP, sClose.pos.x + 50, sClose.pos.y + 34, rC, sClose.show) : null}
                </>
              ) : null}
            </UiTheme>
          );
        })()}
      </AbsoluteFill>

      {/* ── headline + callouts ── */}
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <div style={{ position: "absolute", left: X_COL, top: SLOT_Y[0] - CALLOUT_H / 2 - 128 }}>
          <WordRise
            words={HEADLINE}
            fontSize={76}
            align="left"
            color={night.ink}
            letterSpacing="-0.02em"
            exit={{ at: S12.headlineOut, stagger: 2, duration: 7 }}
          />
        </div>
        {PLATES.map((def, k) => {
          const appear = ramp(f, S12.pulseArrive[k] - 6, S12.pulseArrive[k] + 12, land);
          const out = calloutsOut(k);
          const vis = appear * (1 - out);
          if (vis <= 0.001) return null;
          // readable at every moment: inactive rows ≥ 62 %, the active row full and 15 % larger
          const level = lerp(anyFocus > 0.01 ? 0.62 : 0.85, 1, focus[k]);
          const grow = 1 + 0.15 * focus[k];
          const Icon = def.Icon;
          const blur = 10 * (1 - appear) + 8 * out;
          return (
            <div
              key={def.key}
              style={{
                position: "absolute",
                left: X_COL,
                top: SLOT_Y[k] - CALLOUT_H / 2,
                height: CALLOUT_H,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                opacity: vis * level,
                filter: blur > 0.3 ? `blur(${blur.toFixed(2)}px)` : undefined,
                transform: `translateX(${(1 - appear) * 14 + out * 30}px) scale(${grow})`,
                transformOrigin: "0% 50%",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: DISPLAY, fontWeight: 700, fontSize: 40, lineHeight: "44px", color: night.ink, letterSpacing: "-0.01em" }}>
                <Icon size={34} strokeWidth={2} color={focus[k] > 0.5 ? night.ink : night.lineStrong} style={{ display: "block" }} aria-hidden />
                {def.title}
              </div>
              <div style={{ marginTop: 4, fontFamily: SANS, fontWeight: 500, fontSize: 28, lineHeight: "34px", color: night.inkMuted, whiteSpace: "nowrap", paddingLeft: 46 }}>
                {def.label}
              </div>
            </div>
          );
        })}

        {/* the app's own words take the headline slot on "on-chain"; the rows below never move */}
        {subP > 0.001 ? (
          <div
            style={{
              position: "absolute",
              left: X_COL,
              top: SLOT_Y[0] - CALLOUT_H / 2 - 132,
              paddingLeft: 22,
              borderLeft: `3px solid ${night.lineStrong}`,
              fontFamily: SANS,
              fontWeight: 600,
              fontSize: 38,
              lineHeight: "50px",
              color: night.ink,
              whiteSpace: "nowrap",
              opacity: subP,
              filter: subP < 0.98 ? `blur(${(8 * (1 - subP)).toFixed(2)}px)` : undefined,
              transform: `translateY(${(1 - subP) * 14}px)`,
            }}
          >
            {QUOTE_LINES.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        ) : null}
      </AbsoluteFill>

      {/* ── the trust sentence ── */}
      {f >= S12.collapse ? (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", pointerEvents: "none", transform: `scale(${holdCreep})` }}>
          <div
            style={{
              position: "absolute",
              left: SHIELD.x - SHIELD.size / 2,
              top: SHIELD.y - SHIELD.size / 2,
              width: SHIELD.size,
              height: SHIELD.size,
              transform: `scale(${Math.max(0, shieldPop)})`,
              opacity: ramp(f, shieldAt, shieldAt + 6),
              color: night.ink,
            }}
          >
            <ShieldCheck size={SHIELD.size} strokeWidth={2} color={night.ink} style={{ display: "block" }} aria-hidden />
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, top: 404, display: "flex", justifyContent: "center" }}>
            <WordRise words={TRUST} fontSize={132} lineHeight={1.06} color={night.ink} letterSpacing="-0.025em" ease={punch} />
          </div>
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 714,
              textAlign: "center",
              fontFamily: SANS,
              fontWeight: 500,
              fontSize: 40,
              lineHeight: "50px",
              color: night.inkMuted,
              opacity: ramp(f, S12.subLine, S12.subLine + 12),
              filter: f < S12.subLine + 16 ? `blur(${(8 * (1 - ramp(f, S12.subLine, S12.subLine + 16, land))).toFixed(2)}px)` : undefined,
              transform: `translateY(${(1 - ramp(f, S12.subLine, S12.subLine + 20, land)) * 24}px)`,
            }}
          >
            {TRUST_SUB}
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, top: 840, display: "flex", justifyContent: "center", gap: 16 }}>
            {CHIPS.map((c, i) => {
              const p = ramp(f, S12.chips + i * 5, S12.chips + i * 5 + 18, land);
              return (
                <div
                  key={c}
                  style={{
                    padding: "10px 24px",
                    borderRadius: 999,
                    border: `1.5px solid ${night.line}`,
                    background: night.surface,
                    fontFamily: SANS,
                    fontWeight: 600,
                    fontSize: 28,
                    lineHeight: "36px",
                    color: night.inkMuted,
                    whiteSpace: "nowrap",
                    opacity: p,
                    transform: `translateY(${(1 - p) * 22}px)`,
                    filter: p < 0.98 ? `blur(${(6 * (1 - p)).toFixed(2)}px)` : undefined,
                  }}
                >
                  {c}
                </div>
              );
            })}
          </div>
        </AbsoluteFill>
      ) : null}

      <Vignette strength={0.08} theme="night" />

      {/* Sound (sparse): a quiet tick per layer the overview request reaches and where $84, $300 and the close land;
          one stamp on the trust sentence */}
      {[...S12.pulseArrive, P84.arrive, P300.arrive, PC.arrive].map((at) => (
        <Sfx key={at} name="tick" at={at} volume={0.13} />
      ))}
      <Sfx name="stamp" at={shieldAt} volume={0.38} />
    </AbsoluteFill>
  );
};
