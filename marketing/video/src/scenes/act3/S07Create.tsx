// s07-create (builder C): Maya starts a Pot and sets the rules.
// VO (s07): "Start a Pot for the trip, and set the rules in plain words."
//  - f0 = PHONE_HANDOFF: the marigold rect from s06 IS Maya's phone screen (frontal, CAM.maya, no drift); the phone
//    body appears around it in one frame. The Create sheet rises over the marigold, the phone eases to PHONE_HOME.
//  - "Start … trip": "Lisbon Trip" types in bursts (solid caret), 🇵🇹 is picked, the tram sticker pops on "trip".
//  - Next → step 2 (Trip preset selected). On "rules" the two rule sentences break out of the phone as RuleRow
//    cards and land as big type in the TypeZone on the next beats, with marigold blocks behind "$100" and "2 of 3".
//  - The rules hold ~2 s fully readable (director review 1); Create Pot is pressed during the hold, so step 3
//    ("Creating Lisbon Trip… · Free: we cover the setup.") plays in the phone beside the type.
//  - Out: the camera pushes from the rules framing into the chat close-up while the app-switch whip runs inside the
//    same phone (cut at peak speed on the scene boundary; s08 lands on the chat).
import { Users, Zap } from "lucide-react";
import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from "remotion";
import { scene, type SceneId } from "../../data/timeline";
import { voWord } from "../../data/vo";
import { STICKERS } from "../../data/stickers";
import { day } from "../../brand/tokens";
import { CreatePotSheet, RuleRow, SAFE_BOTTOM, SAFE_TOP, UiPiece, tripRules } from "../../ui";
import { TouchDot, pressAt } from "../../ui/atoms/Touch";
import { Sfx, StickerPop, alpha, inOut, land, linear, ramp, softInOut, typedCount, typedEnd, uiEase, type CameraKey } from "../../motion";
import { CAM, PHONE_HOME, PersonaPill, TypeZone, WorldPhone, WorldStage, useWorldCamera } from "../shared";
import { LiftTwin } from "./c-lib/LiftTwin";
import { BigLine, wordsAt } from "./c-lib/BigLine";
import { ScreenWhipLayer, SCREEN_WHIP } from "./c-lib/whip";
import { CUT_MOVE, POSE_CHAT, POSE_PRECUT } from "./c-lib/poses";
import { screenToLocal } from "./c-lib/project";

export const S07_SCENES: SceneId[] = ["s07-create"];
const ID: SceneId = "s07-create";

const NAME = "Lisbon Trip";
const TYPE_SEED = "lisbon";

/** Frame plan (scene-local). Voice-led moments key off the VO words. */
const plan = () => {
  const dur = scene(ID).duration;
  const trip = voWord(ID, "trip", 81);
  const rules = voWord(ID, "rules", 163);
  const typeLen = typedEnd(NAME, { start: 0, seed: TYPE_SEED });
  const typeStart = Math.max(20, trip - 3 - typeLen);
  return {
    dur,
    sheetIn: 1,
    sheetFrames: 18,
    settle: 30,
    pillIn: 14,
    pillOut: 104,
    typeStart,
    typeLen,
    sticker: trip - 3,
    stickerOut: 146,
    emoji: trip + 7,
    pullBack: [94, 122] as const,
    next: 122,
    step2: 129,
    lift1: rules - 7,
    lift2: rules - 7 + 22,
    typeExit: 334,
    create: 296,
    step3: 303,
    created: 340,
  };
};

/** In-screen positions (390 × 844 logical px), measured with preview-c/Measure.tsx. */
const POS = {
  flag: { x: 103.5, y: 457.5 },
  next: { x: 195, y: 772 },
  create: { x: 195, y: 716 },
  rule1: { x: 195, y: 239 },
  rule2: { x: 195, y: 267 },
};

const RULE_INSTANT = "Anyone can spend up to $100 without asking.";
const RULE_GROUP = "Bigger spends need 2 of 3 approvals.";

export const S07Create: React.FC = () => {
  const f = useCurrentFrame();
  const P = plan();

  // ── camera: exactly CAM.maya on f0 (PHONE_HANDOFF), drift fades in, push toward the name while typing, back for
  //    the rules, a slow creep through the rules and step 3, then the push into the chat close-up that s08 finishes
  //    (one move across the cut).
  const cutFrom = P.dur + CUT_MOVE.from;
  const keys: CameraKey[] = [
    { at: 0, ...CAM.maya },
    { at: 26, ...CAM.maya },
    { at: P.emoji, ...CAM.maya, scale: 1.3, cx: -200, cy: -150, ease: softInOut },
    { at: P.pullBack[0], ...CAM.maya, scale: 1.305, cx: -200, cy: -150, ease: linear },
    { at: P.pullBack[1], ...CAM.maya, ease: inOut },
    { at: cutFrom, ...POSE_PRECUT, ease: linear },
    { at: P.dur + CUT_MOVE.to, ...POSE_CHAT, ease: inOut },
  ];
  const d = ramp(f, 0, 48, softInOut);
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
  const flagAt = P.emoji + 3;
  const emojiPress = pressAt(f - P.emoji);
  const nextPress = pressAt(f - P.next);
  const createPress = pressAt(f - P.create);
  const g = f >= P.dur - SCREEN_WHIP.out ? f - P.dur : null;

  const screen = (
    <ScreenWhipLayer g={g} bleed={day.surface}>
      {/* behind the sheet: the app's ground under its scrim, and s06's marigold until the sheet has covered it */}
      <div style={{ position: "absolute", inset: 0, background: day.ground }} />
      <div style={{ position: "absolute", inset: 0, background: alpha(day.ink, 0.45), opacity: scrim }} />
      {marigold > 0 ? <div style={{ position: "absolute", inset: 0, background: day.brand, opacity: marigold }} /> : null}
      <CreatePotSheet
        step={step}
        progress={sheetP}
        scrim={false}
        typedChars={typed}
        caretFrame={f}
        emoji={f < flagAt ? "✈️" : "🇵🇹"}
        emojiSelect={f < flagAt ? 1 : ramp(f, flagAt, flagAt + 10, uiEase.standard)}
        ctaPress={step === 1 ? nextPress : step === 2 ? createPress : 0}
        created={f >= P.created}
        dotsFrame={f - P.step3}
      />
      {/* f0 = PHONE_HANDOFF: the screen is pure marigold (status bar and home indicator masked; the island is hardware),
          then the status bar fades in with the rising UI */}
      {f <= 8 ? <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: SAFE_TOP, background: day.brand, opacity: 1 - ramp(f, 1, 8), zIndex: 101 }} /> : null}
      {f === 0 ? <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: SAFE_BOTTOM, background: day.brand, zIndex: 101 }} /> : null}
      {step === 1 ? <TouchDot press={emojiPress} x={POS.flag.x} y={POS.flag.y} /> : null}
      {step === 1 ? <TouchDot press={nextPress} x={POS.next.x} y={POS.next.y} /> : null}
      {step === 2 ? <TouchDot press={createPress} x={POS.create.x} y={POS.create.y} /> : null}
    </ScreenWhipLayer>
  );

  // ── the rule cards breaking out of the Trip preset (phone-local, facing the lens as they lift)
  const rules = tripRules();
  // each card flies into its type slot (≈ screen x 1130) and dissolves there as the words rise out of it
  const liftT = (L: number) => ramp(f, L, L + 22, land);
  const liftA = (L: number) => (f < L ? 0 : ramp(f, L, L + 4) * (1 - ramp(f, L + 11, L + 20, softInOut)));
  const ruleCard = (i: 0 | 1) => (
    <UiPiece theme="day" width={358}>
      <RuleRow icon={rules[i].icon} text={rules[i].text} />
    </UiPiece>
  );

  // ── big type: words start as the cards reach the TypeZone, 2 f apart; blocks wipe once the word has landed
  const s1 = wordsAt(RULE_INSTANT, P.lift1 + 9, 2);
  const s2 = wordsAt(RULE_GROUP, P.lift2 + 9, 2);

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
          {f >= P.lift1 ? (
            <LiftTwin t={liftT(P.lift1)} from={screenToLocal(POS.rule1.x, POS.rule1.y)} to={{ x: 470, y: -160, z: 220, scale: 1.6 }} face={PHONE_HOME} opacity={liftA(P.lift1)}>
              {ruleCard(0)}
            </LiftTwin>
          ) : null}
          {f >= P.lift2 ? (
            <LiftTwin t={liftT(P.lift2)} from={screenToLocal(POS.rule2.x, POS.rule2.y)} to={{ x: 470, y: 50, z: 220, scale: 1.6 }} face={PHONE_HOME} opacity={liftA(P.lift2)}>
              {ruleCard(1)}
            </LiftTwin>
          ) : null}
        </WorldPhone>
      </WorldStage>

      <TypeZone>
        <BigLine words={s1} icon={Zap} highlight={{ index: 5, at: s1[5].startFrame + 16 }} exit={{ at: P.typeExit }} />
        <BigLine words={s2} icon={Users} highlight={{ index: 3, at: s2[3].startFrame + 16 }} exit={{ at: P.typeExit + 3 }} style={{ marginTop: 36 }} />
      </TypeZone>

      <Sfx name="swoosh-up" at={P.sheetIn} volume={0.3} />
      <Sfx name="typing" at={P.typeStart} volume={0.26} durationInFrames={P.typeLen + 8} />
      <Sfx name="pop-soft" at={P.sticker} volume={0.22} />
      <Sfx name="click" at={P.create + 3} volume={0.3} />
      <Sfx name="whoosh-fast" at={P.dur - 8} volume={0.32} />
    </AbsoluteFill>
  );
};
