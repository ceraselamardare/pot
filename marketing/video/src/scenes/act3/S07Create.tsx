// s07-create (builder C, v2: the lean Create of Nov 3): Maya starts a Pot and sets the rules.
// VO (s07): "Start a Pot for the trip, and set the rules in plain words."
//  - f0 = PHONE_HANDOFF: the marigold rect from s06 IS Maya's phone screen (frontal, CAM.maya, no drift); the phone
//    body appears around it in one frame. The "Start a Pot" sheet rises over the marigold; the phone eases to
//    PHONE_HOME.
//  - "Start a Pot for the trip": "Lisbon Trip" types in bursts (solid caret) on the one-screen Create, the tram sticker
//    pops on "trip", then the picture: tap the cover → the picker → 🇵🇹 → [Done]. "Everyone chips in $150 each" is on;
//    the rules summary + [Change].
//  - [Change] → "Pot rules". On "rules", "plain" and "words" the three tiers break out of their rule cards (the list
//    scrolls between them) and land as big type in the TypeZone, marigold blocks behind the numbers:
//      ⚡ "Anyone can spend up to $100 without asking." · ✋ "Up to $300? Just one OK." ·
//      👥 "Over $300? Most of the group." (review 3: parallel to line 2, so it never contradicts s10's "one OK")
//    All three stay readable together for ~1.3 s.
//  - [Create Pot] (on the rules step) → "Creating Lisbon Trip…" beside the type.
//  - Out: the camera pushes into the chat close-up while the app-switch whip runs inside the same phone (cut at peak
//    speed on the scene boundary; s08 lands on the chat).
import { Hand, Users, Zap } from "lucide-react";
import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from "remotion";
import { scene, type SceneId } from "../../data/timeline";
import { voWord } from "../../data/vo";
import { STICKERS } from "../../data/stickers";
import { day } from "../../brand/tokens";
import { CreatePotSheet, CreateRuleCard, SAFE_BOTTOM, SAFE_TOP, UiPiece, type CreateRuleKind } from "../../ui";
import { TouchDot, pressAt } from "../../ui/atoms/Touch";
import { Sfx, StickerPop, alpha, inOut, land, linear, ramp, softInOut, typedCount, typedEnd, uiEase, type CameraKey } from "../../motion";
import { CAM, PHONE_HOME, PersonaPill, TypeZone, WorldPhone, WorldStage, useWorldCamera } from "../shared";
import { LiftTwin } from "./c-lib/LiftTwin";
import { BigLine, wordsAt } from "./c-lib/BigLine";
import { ScreenWhipLayer, SCREEN_WHIP } from "./c-lib/whip";
import { CUT_MOVE, POSE_CHAT, POSE_PRECUT, worldCamAt } from "./c-lib/poses";
import { localForScreen, phoneLayerPose, screenToLocal } from "./c-lib/project";

export const S07_SCENES: SceneId[] = ["s07-create"];
const ID: SceneId = "s07-create";

const NAME = "Lisbon Trip";
const TYPE_SEED = "lisbon";

/** Frame plan (scene-local). Voice-led moments key off the VO words. */
const plan = () => {
  const dur = scene(ID).duration;
  const trip = voWord(ID, "trip", 81);
  const rules = voWord(ID, "rules", 163);
  const plain = voWord(ID, "plain", 195);
  const words = voWord(ID, "words", 218);
  const typeLen = typedEnd(NAME, { start: 0, seed: TYPE_SEED });
  // each tier's first word lands 0-4 f before its VO word: the twin lifts 9 f before the words start, words land in ~10 f
  const lift1 = rules - 23;
  const lift2 = plain - 23;
  const lift3 = words - 26;
  return {
    dur,
    sheetIn: 1,
    sheetFrames: 18,
    settle: 30,
    pillIn: 14,
    pillOut: 100,
    typeStart: Math.max(18, trip - 6 - typeLen),
    typeLen,
    sticker: trip - 7,
    stickerOut: lift1 - 8,
    // the picture: tap the cover → picker → 🇵🇹 → Done
    cover: trip - 1,
    pickerOpen: trip + 4,
    flag: trip + 13,
    flagOn: trip + 16,
    done: trip + 25,
    pickerClose: trip + 30,
    // [Change] → Pot rules
    change: lift1 - 24,
    step2: lift1 - 17,
    lift1,
    lift2,
    lift3,
    // the rules list scrolls between the lifts: 0 → 400 (the one-OK card to mid-screen), 400 → 690 (the fixed box)
    scrollA: [lift1 + 6, lift2 - 3] as const,
    scrollB: [lift2 + 1, lift3 - 1] as const,
    create: dur - 46,
    step3: dur - 39,
    created: dur - 12,
    typeExit: dur - 22,
  };
};

/** In-screen positions (390 × 844 logical px), measured with preview-c/Measure.tsx. */
const POS = {
  coverTile: { x: 56, y: 177 },
  flag: { x: 109.5, y: 349.5 },
  done: { x: 326, y: 557 },
  change: { x: 319.6, y: 491 },
  createStep2: { x: 195, y: 716 },
  /** Pot rules cards at bodyScroll 0 (centres; y moves up with the scroll). */
  ruleInstant: { x: 195, y: 269 },
  ruleOneOk: { x: 195, y: 763 },
  /** "Every Pot works like this": only its header + first row (the majority line) lifts: top 1123, 108 tall. */
  rulesFixedTop: { x: 195, y: 1177 },
};
/** Height of the cropped majority twin: 16 padding + 20 header + 8 + 48 (two-line row) + 16. */
const FIXED_CROP = 108;
const SCROLL_A = 400;
const SCROLL_B = 690;

const L1 = "Anyone can spend up to $100 without asking.";
const L2 = "Up to $300? Just one OK.";
const L3 = "Over $300? Most\u00A0of\u00A0the\u00A0group.";
/** Screen centres of the three type slots (TypeZone, measured from a render) where the twins dissolve. */
const SLOT = [
  { x: 1340, y: 323 },
  { x: 1240, y: 536 },
  { x: 1300, y: 768 },
];

export const S07Create: React.FC = () => {
  const f = useCurrentFrame();
  const P = plan();

  // ── camera: exactly CAM.maya on f0 (PHONE_HANDOFF), drift fades in, push toward the form while typing and picking
  //    the picture, back for the rules, a slow creep, then the push into the chat close-up that s08 finishes.
  const cutFrom = P.dur + CUT_MOVE.from;
  const keys: CameraKey[] = [
    { at: 0, ...CAM.maya },
    { at: 26, ...CAM.maya },
    { at: P.cover - 6, ...CAM.maya, scale: 1.3, cx: -200, cy: -150, ease: softInOut },
    { at: P.pickerClose, ...CAM.maya, scale: 1.31, cx: -200, cy: -150, ease: linear },
    { at: P.lift1 - 4, ...CAM.maya, ease: inOut },
    { at: cutFrom, ...POSE_PRECUT, ease: linear },
    { at: P.dur + CUT_MOVE.to, ...POSE_CHAT, ease: inOut },
  ];
  const d = ramp(f, 0, 48, softInOut);
  const driftScale = (frame: number) => ramp(frame, 0, 48, softInOut);
  const cam = useWorldCamera(ID, keys, { drift: { amount: 8 * d, roll: 0.4 * d, tilt: 0.3 * d } });

  // ── phone: frontal on f0, eases into PHONE_HOME on `land`
  const r = ramp(f, 0, P.settle, land);
  const rotation = { rotX: PHONE_HOME.rotX * r, rotY: PHONE_HOME.rotY * r, rotZ: PHONE_HOME.rotZ * r };

  // ── screen
  const step: 1 | 2 | 3 = f < P.step2 ? 1 : f < P.step3 ? 2 : 3;
  const sheetP = ramp(f, P.sheetIn, P.sheetIn + P.sheetFrames, linear);
  // behind the sheet: marigold → cream first, then the app's scrim (never marigold under the scrim: that reads brown)
  const marigold = 1 - ramp(f, 7, 15, softInOut);
  const scrim = ramp(f, 13, 23, uiEase.standard);
  const typed = typedCount(f, NAME, { start: P.typeStart, seed: TYPE_SEED });
  const coverPress = pressAt(f - P.cover);
  const flagPress = pressAt(f - P.flag);
  const donePress = pressAt(f - P.done);
  const changePress = pressAt(f - P.change);
  const createPress = pressAt(f - P.create);
  const picker = f >= P.pickerOpen && f < P.pickerClose;
  const bodyScroll =
    SCROLL_A * uiEase.standard(ramp(f, P.scrollA[0], P.scrollA[1])) + (SCROLL_B - SCROLL_A) * uiEase.standard(ramp(f, P.scrollB[0], P.scrollB[1]));
  // the card whose twin is lifting tints brand-soft for a moment (the scene points at it)
  const tint = (L: number) => ramp(f, L - 2, L + 3) * (1 - ramp(f, L + 14, L + 22, softInOut));
  const highlightRule: CreateRuleKind | null = f < P.lift2 - 4 ? "instant" : f < P.lift3 - 4 ? "oneOk" : null;
  const highlightAmount = highlightRule === "instant" ? tint(P.lift1) : highlightRule === "oneOk" ? tint(P.lift2) : 0;
  const g = f >= P.dur - SCREEN_WHIP.out ? f - P.dur : null;

  const screen = (
    <ScreenWhipLayer g={g} bleed={day.surface}>
      <div style={{ position: "absolute", inset: 0, background: day.ground }} />
      <div style={{ position: "absolute", inset: 0, background: alpha(day.ink, 0.45), opacity: scrim }} />
      {marigold > 0 ? <div style={{ position: "absolute", inset: 0, background: day.brand, opacity: marigold }} /> : null}
      <CreatePotSheet
        step={step}
        progress={sheetP}
        scrim={false}
        typedChars={typed}
        caretFrame={f}
        caret={step === 1 && !picker && f < P.cover}
        emoji={f < P.flagOn ? "✈️" : "🇵🇹"}
        picker={picker}
        emojiSelect={f < P.flagOn ? 1 : ramp(f, P.flagOn, P.flagOn + 8, uiEase.standard)}
        coverPress={coverPress}
        changePress={changePress}
        bodyScroll={step === 2 ? bodyScroll : 0}
        highlightRule={highlightRule}
        highlightAmount={highlightAmount}
        ctaPress={step === 2 ? createPress : 0}
        created={f >= P.created}
        dotsFrame={f - P.step3}
      />
      {/* f0 = PHONE_HANDOFF: the screen is pure marigold (status bar and home indicator masked; the island is hardware),
          then the status bar fades in with the rising UI */}
      {f <= 8 ? <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: SAFE_TOP, background: day.brand, opacity: 1 - ramp(f, 1, 8), zIndex: 101 }} /> : null}
      {f === 0 ? <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: SAFE_BOTTOM, background: day.brand, zIndex: 101 }} /> : null}
      {step === 1 ? <TouchDot press={coverPress} x={POS.coverTile.x} y={POS.coverTile.y} /> : null}
      {step === 1 && picker ? <TouchDot press={flagPress} x={POS.flag.x} y={POS.flag.y} /> : null}
      {step === 1 && picker ? <TouchDot press={donePress} x={POS.done.x} y={POS.done.y} /> : null}
      {step === 1 ? <TouchDot press={changePress} x={POS.change.x} y={POS.change.y} /> : null}
      {step === 2 ? <TouchDot press={createPress} x={POS.createStep2.x} y={POS.createStep2.y} /> : null}
    </ScreenWhipLayer>
  );

  // ── the three tiers break out of their "Pot rules" cards (phone-local twins that face the lens) and fly into their
  //    type slots, dissolving as the words rise out of them
  const layer = phoneLayerPose("maya");
  const twinTo = (i: number, at: number, z = 220, scale = 1.6, dy = 0) => ({
    ...localForScreen(worldCamAt(ID, keys, at, driftScale(at)), layer, SLOT[i].x, SLOT[i].y + dy, z),
    z,
    scale,
  });
  const liftT = (L: number) => ramp(f, L, L + 22, land);
  const liftA = (L: number) => (f < L ? 0 : ramp(f, L, L + 4) * (1 - ramp(f, L + 11, L + 20, softInOut)));
  const scrollAt = (frame: number) =>
    SCROLL_A * uiEase.standard(ramp(frame, P.scrollA[0], P.scrollA[1])) + (SCROLL_B - SCROLL_A) * uiEase.standard(ramp(frame, P.scrollB[0], P.scrollB[1]));
  const twins: { at: number; kind: CreateRuleKind; from: { x: number; y: number }; to: ReturnType<typeof twinTo> }[] = [
    { at: P.lift1, kind: "instant", from: screenToLocal(POS.ruleInstant.x, POS.ruleInstant.y - scrollAt(P.lift1)), to: twinTo(0, P.lift1 + 22) },
    { at: P.lift2, kind: "oneOk", from: screenToLocal(POS.ruleOneOk.x, POS.ruleOneOk.y - scrollAt(P.lift2)), to: twinTo(1, P.lift2 + 22) },
    // the majority row only, smaller and aimed under line 3's centre, so its path stays below line 2's block
    { at: P.lift3, kind: "fixed", from: screenToLocal(POS.rulesFixedTop.x, POS.rulesFixedTop.y - scrollAt(P.lift3)), to: twinTo(2, P.lift3 + 22, 140, 1.15, 40) },
  ];

  // ── big type: words start as the cards reach their slots, 2 f apart; the blocks wipe once the word has landed
  const w1 = wordsAt(L1, P.lift1 + 9, 2);
  const w2 = wordsAt(L2, P.lift2 + 9, 2);
  const w3 = wordsAt(L3, P.lift3 + 9, 2);

  const pill = ramp(f, P.pillIn, P.pillIn + 12, land) * (1 - ramp(f, P.pillOut, P.pillOut + 12, softInOut));

  return (
    <AbsoluteFill style={{ background: day.ground }}>
      <WorldStage pose={cam}>
        <WorldPhone who="maya" rotation={rotation} screen={screen}>
          <PersonaPill person="maya" appear={pill} />
          {/* tram sticker off the phone's right edge, facing the lens */}
          <AbsoluteFill
            style={{
              alignItems: "center",
              justifyContent: "center",
              transform: `translate3d(236px, -318px, 60px) rotateX(${-PHONE_HOME.rotX}deg) rotateY(${-PHONE_HOME.rotY}deg)`,
            }}
          >
            <StickerPop at={P.sticker} outAt={P.stickerOut} rotate={7}>
              <Img src={staticFile(STICKERS.tram.src)} style={{ width: 270, display: "block" }} />
            </StickerPop>
          </AbsoluteFill>
          {twins.map((t) =>
            f >= t.at && f < t.at + 22 ? (
              <LiftTwin key={t.kind} t={liftT(t.at)} from={t.from} to={t.to} face={PHONE_HOME} opacity={liftA(t.at)}>
                <UiPiece theme="day" width={358}>
                  {t.kind === "fixed" ? (
                    <div style={{ height: FIXED_CROP, overflow: "hidden", borderRadius: 16 }}>
                      <CreateRuleCard kind="fixed" />
                    </div>
                  ) : (
                    <CreateRuleCard kind={t.kind} />
                  )}
                </UiPiece>
              </LiftTwin>
            ) : null,
          )}
        </WorldPhone>
      </WorldStage>

      <TypeZone>
        <BigLine words={w1} icon={Zap} highlight={{ index: 5, at: w1[5].startFrame + 14 }} exit={{ at: P.typeExit }} />
        <BigLine
          words={w2}
          icon={Hand}
          highlight={[
            { index: 2, at: w2[2].startFrame + 13 },
            { index: 4, at: w2[4].startFrame + 13 },
          ]}
          exit={{ at: P.typeExit + 2 }}
          style={{ marginTop: 30 }}
        />
        <BigLine
          words={w3}
          icon={Users}
          highlight={[
            { index: 1, at: w3[1].startFrame + 12 },
            { index: 2, at: w3[2].startFrame + 12 },
          ]}
          exit={{ at: P.typeExit + 4 }}
          style={{ marginTop: 30 }}
        />
      </TypeZone>

      <Sfx name="swoosh-up" at={P.sheetIn} volume={0.3} />
      <Sfx name="typing" at={P.typeStart} volume={0.26} durationInFrames={P.typeLen + 8} />
      <Sfx name="pop-soft" at={P.sticker} volume={0.22} />
      <Sfx name="click" at={P.create + 3} volume={0.3} />
      <Sfx name="whoosh-fast" at={P.dur - 8} volume={0.32} />
    </AbsoluteFill>
  );
};
