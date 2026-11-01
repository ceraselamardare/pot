// s08-join (builder C): the link goes into the group chat; Leo joins with Google and adds his share in seconds.
// VO (s08): "Drop the link in the chat. Friends join with Google and chip in their share. No wallet. No seed phrase.
//            No gas."
//  - f0: the end of s07's app-switch whip lands on the chat (same phone; the camera finishes s07's push into a chat
//    close-up). Maya's invite lands with the marigold link card ("link"), Sam "in!", Leo "joining now".
//  - "Friends join with Google": the card lifts off the chat and anchors a 15 f whip to Leo's phone (one world, two
//    phones), where it settles into the invite landing. Persona pill "Leo". Big type "Join with Google." on the voice,
//    the press (click), "Welcome, Leo" steps → "You're in!".
//  - "chip in their share": big type "Chip in $150."; Add my $150 share → Add money → Add $150 → the sheet closes →
//    "Adding $150…" + "+$150 on the way" → Added. The money gets its own beat before the stamps (director review 1):
//    "In the Pot" + a big MoneyRoll $300.00 → $450.00 + the app's goal bar magnified, "$450 of $450 collected".
//  - "No wallet. No seed phrase. No gas.": three lines stack under the money, each "No" on a marigold block that hits
//    with its stamp. The bottom ~110 px of the right column stay free for the director's caption box.
//  - Out: a "+ $150.00" chip (Leo's avatar carries it) anchors the whip back to Maya; the whip's long tail lands on
//    the last frame, so nothing holds dead into the cut. LAST FRAME = CAM.maya (+ drift), Maya's PotScreen $450.00,
//    share 150, put in 150, FEED_FULL, no sheet (the s08 → s09 hand-off).
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { scene, type SceneId } from "../../data/timeline";
import { voWord } from "../../data/vo";
import { day } from "../../brand/tokens";
import { SANS } from "../../brand/fonts";
import {
  AddMoneySheet,
  Avatar,
  ChatScreen,
  FEED_FULL,
  GoalBar,
  InviteLanding,
  LEO,
  LISBON,
  LinkPreviewCard,
  MAYA,
  PotScreen,
  SAM,
  Toast,
  UiPiece,
  YoureInSheet,
  copy,
  feedLeoAdding,
  formatSigned,
  formatUsd,
} from "../../ui";
import { TouchDot, pressAt } from "../../ui/atoms/Touch";
import {
  DirectionalBlur,
  MoneyRoll,
  Sfx,
  exit as exitEase,
  inOut,
  land,
  lerp,
  linear,
  ramp,
  smearSigma,
  softInOut,
  speedRamp,
  uiEase,
  useFitText,
  voLanding,
  whip as whipEase,
  type CameraKey,
  type CameraPose,
  type TimedWord,
} from "../../motion";
import { CAM, PHONE_HOME, PersonaPill, TypeZone, WORLD, WorldPhone, WorldStage, cardOffset, useWorldCamera } from "../shared";
import { ScreenWhipLayer, SCREEN_WHIP } from "./c-lib/whip";
import { POSE_CHAT, camBaseAt, cutMoveKeys, worldCamAt } from "./c-lib/poses";
import { phoneLayerPose, projectPhoneLocal, projectScreenPoint } from "./c-lib/project";
import { mayaChat } from "./c-lib/chat";
import { LiftTwin } from "./c-lib/LiftTwin";
import { Flyer, type FlyState } from "./c-lib/Flyer";
import { BigLine, wordsAt } from "./c-lib/BigLine";
import { RiseIn } from "./c-lib/RiseIn";
import { tickValue } from "./c-lib/tick";

export const S08_SCENES: SceneId[] = ["s08-join"];
const ID: SceneId = "s08-join";

/** Frame plan (scene-local), keyed to the VO words. */
const plan = () => {
  const dur = scene(ID).duration;
  const link = voWord(ID, "link", 35);
  const join = voWord(ID, "join", 134);
  const withW = voWord(ID, "with", 146);
  const google = voWord(ID, "Google", 156);
  const chip = voWord(ID, "chip", 192);
  const no1 = voWord(ID, "No", 275, 0);
  const wallet = voWord(ID, "wallet", 285);
  const no2 = voWord(ID, "No", 327, 1);
  const seed = voWord(ID, "seed", 341);
  const phrase = voWord(ID, "phrase", 354);
  const no3 = voWord(ID, "No", 395, 2);
  const gas = voWord(ID, "gas", 407);
  const press = join + 6;
  const addShare = chip - 2;
  const addCta = addShare + 20;
  const added = 234;
  return {
    dur,
    words: { join, withW, google, chip, no1, wallet, no2, seed, phrase, no3, gas },
    // chat
    linkIn: link - 13,
    samIn: link + 15,
    leoIn: link + 31,
    // the whip to Leo, anchored by the invite card
    lift: 82,
    handoff: 92,
    whipA: 90,
    whipB: 105,
    land: 113,
    scroll: [122, 140] as const,
    pillIn: 103,
    pillOut: 150,
    // join
    google: press,
    step1: press + 10,
    step2: press + 17,
    step3: press + 24,
    youreIn: press + 22,
    // chip in
    addShare,
    youreOut: addShare + 5,
    addIn: addShare + 9,
    addCta,
    addOut: addCta + 6,
    adding: addCta + 6,
    added,
    toast: added + 2,
    roll: added + 2,
    // big type
    joinExit: 172,
    chipType: chip - 10,
    chipExit: 254,
    moneyIn: 228,
    moneyExit: 442,
    noExit: 446,
    // out
    chipIn: 452,
    chipLand: 494,
    whipBack: [466, 476, dur - 1] as const,
  };
};

/** In-screen positions (390 × 844 logical px), measured with preview-c/Measure.tsx. */
const POS = {
  linkCard: { x: 110, y: 327.41, w: 264, h: 232.59 },
  landingBanner: { x: 195, y: 226 },
  googleAt160: { x: 195, y: 708.4 },
  addShare: { x: 195, y: 738 },
  addCta: { x: 195, y: 512 },
  rowAmount: { x: 320.9, y: 510.4 },
};

/** TypeZone slots (px from the zone's top-left: the zone is x 900-1840, y 120-960). Nothing below y 860 on screen,
 *  so the director's caption box (bottom ≈ 110 px of the right column) never meets the type. */
const SLOT = { mid: 360, money: 30, no: 374 } as const;

/** Leo's framing: the phone stays at screen x ≈ 580 while the camera creeps in (scale s → cx = Leo + 380 / s). */
const leoCreep = (s: number): CameraPose => ({ ...CAM.leo, scale: s, cx: WORLD.leo.x + (960 - 580) / s });

const LINK_W = 264;
const LINK_H = 232.59;
const CHIP_W = 150;
const CHIP_H = 44;
/** Offset of the chip's amount text centre from the chip centre: 6 pad + 32 avatar + 8 gap + 41 half text − 75. */
const CHIP_TEXT_DX = 12;

/** The "+ $150.00" chip: Leo's avatar carries his share across (creative brief: avatars carry money chips). */
const MoneyChip: React.FC = () => (
  <UiPiece theme="day" width={CHIP_W} card="surface" radius={CHIP_H / 2} style={{ height: CHIP_H, display: "flex", alignItems: "center", gap: 8, padding: "0 14px 0 6px" }}>
    <Avatar person={LEO} size="sm" />
    <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 17, lineHeight: "24px", color: day.ink, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
      {formatSigned(150, "in")}
    </span>
  </UiPiece>
);

export const S08Join: React.FC = () => {
  const f = useCurrentFrame();
  const P = plan();
  const W = P.words;

  // ── camera: s07's push finishes on the chat close-up, creep, whip to Leo (15 f), a creep that keeps Leo's phone at
  //    x ≈ 580 (the right column is the type's), then the whip back: `exit` into peak speed, `whip` out with a long
  //    tail that lands exactly on CAM.maya on the last frame (no dead hold into s09).
  const [wb0, wb1, wb2] = P.whipBack;
  const leoEnd = leoCreep(1.04);
  const keys: CameraKey[] = [
    ...cutMoveKeys(0),
    { at: P.whipA, ...POSE_CHAT, scale: 1.66, ease: linear },
    { at: P.whipB, ...CAM.leo, ease: speedRamp },
    { at: wb0, ...leoEnd, ease: linear },
    { at: wb1, ...CAM.maya, cx: lerp(leoEnd.cx, CAM.maya.cx, 0.25), scale: lerp(leoEnd.scale, 1, 0.25), ease: exitEase },
    { at: wb2, ...CAM.maya, ease: whipEase },
  ];
  const cam = useWorldCamera(ID, keys);
  const camAt = (frame: number) => worldCamAt(ID, keys, frame);
  // world smear from the camera's own speed: only the two persona whips go above 40 px/f (reframes stay sharp)
  const v = (camBaseAt(keys, f + 0.5).cx - camBaseAt(keys, f - 0.5).cx) * cam.scale;
  const worldSmear = smearSigma(Math.max(0, Math.abs(v) - 40), 0.5, 56);

  // ── Maya's phone: the chat until she's off screen, then her Pot (the s09 hand-off state)
  const chatA = { link: ramp(f, P.linkIn, P.linkIn + 17), sam: ramp(f, P.samIn, P.samIn + 14), leo: ramp(f, P.leoIn, P.leoIn + 14) };
  const mayaScreen =
    f < P.whipB + 20 ? (
      <ScreenWhipLayer g={f <= SCREEN_WHIP.in ? f : null} bleed={day.surfaceSunken}>
        <ChatScreen messages={mayaChat(chatA)} />
      </ScreenWhipLayer>
    ) : (
      <PotScreen balance={450} yourShare={150} putIn={150} feed={FEED_FULL} />
    );

  // the invite card peels off the chat (phone-local), then becomes a screen-space anchor for the whip
  const linkFrom = cardOffset(POS.linkCard);
  const linkTo = { x: linkFrom.x - 90, y: linkFrom.y + 10, z: 160, scale: 1.1 };
  const liftT = (frame: number) => ramp(frame, P.lift, P.lift + 16, land);
  const liftPose = (frame: number) => {
    const t = liftT(frame);
    return { x: lerp(linkFrom.x, linkTo.x, t), y: lerp(linkFrom.y, linkTo.y, t), z: lerp(2, linkTo.z, t), scale: Math.exp(lerp(0, Math.log(linkTo.scale), t)) };
  };
  const h = liftPose(P.handoff);
  const p0 = projectPhoneLocal(camAt(P.handoff), phoneLayerPose("maya"), h.x, h.y, h.z);
  const card0: FlyState = { x: p0.x, y: p0.y, scale: h.scale * p0.k, lift: h.z };
  const scrollAt = (frame: number) => 160 * uiEase.standard(ramp(frame, P.scroll[0], P.scroll[1]));
  const cardAt = (frame: number): FlyState => {
    // a stable target: Leo's banner as framed once the whip has landed (the anchor never chases the whip)
    const at = Math.max(frame, P.whipB);
    const target = projectScreenPoint(camAt(at), "leo", POS.landingBanner.x, POS.landingBanner.y - scrollAt(at));
    const u = ramp(frame, P.handoff, P.land, linear);
    const e = inOut(u);
    const s1 = (358 / LINK_W) * target.k; // the card lands at the banner's width
    const absorb = ramp(frame, P.land, P.land + 9, softInOut);
    return {
      x: lerp(card0.x, target.x, e),
      y: lerp(card0.y, target.y, e) - 36 * Math.sin(Math.PI * u),
      // constant-size anchor through the whip, shrinking only as it lands
      scale: lerp(card0.scale, s1, inOut(ramp(u, 0.45, 1))) * (1 - 0.08 * absorb),
      rot: -3 * Math.sin(Math.PI * u),
      opacity: 1 - absorb,
      lift: lerp(card0.lift ?? 180, 40, e),
    };
  };

  // ── Leo's phone
  const scrollY = scrollAt(f);
  const googlePress = pressAt(f - P.google);
  const joinStep: 0 | 1 | 2 | 3 = f < P.step1 ? 0 : f < P.step2 ? 1 : f < P.step3 ? 2 : 3;
  const youreInP = f < P.youreOut ? ramp(f, P.youreIn, P.youreIn + 20) : 1 - ramp(f, P.youreOut, P.youreOut + 8);
  const addP = f < P.addOut ? ramp(f, P.addIn, P.addIn + 14) : 1 - ramp(f, P.addOut, P.addOut + 10);
  const added = f >= P.added;
  const adding = f >= P.adding && !added;
  // the money: one tick roll (kit "tick" maths) drives the big MoneyRoll, its goal bar and Leo's in-app hero alike
  const money = tickValue(f, P.roll, 300, 450, { duration: 34 });

  const leoScreen =
    f < P.addIn ? (
      <>
        <InviteLanding
          scrollY={scrollY}
          joinStep={joinStep}
          googlePress={googlePress}
          dotsFrame={f - P.step1}
          members={joinStep >= 3 ? [MAYA, SAM, LEO] : [MAYA, SAM]}
          emptySeats={joinStep >= 3 ? 0 : 1}
        />
        {joinStep === 0 ? <TouchDot press={googlePress} x={POS.googleAt160.x} y={POS.googleAt160.y} /> : null}
        <YoureInSheet
          progress={youreInP}
          exiting={f >= P.youreOut}
          seatAppear={[1, 1, ramp(f, P.youreIn + 12, P.youreIn + 24)]}
          ctaPress={pressAt(f - P.addShare)}
        />
        {f >= P.youreIn ? <TouchDot press={pressAt(f - P.addShare)} x={POS.addShare.x} y={POS.addShare.y} /> : null}
      </>
    ) : (
      <PotScreen
        balance={added ? money : 300}
        yourShare={added ? 150 : 0}
        putIn={added ? 150 : 0}
        collected={added ? Math.floor(money) : 300}
        goalProgress={(added ? money : 300) / 450}
        pendingIn={adding ? 150 : 0}
        feed={added ? feedLeoAdding("added") : feedLeoAdding("adding", f >= P.adding ? ramp(f, P.adding, P.adding + 14) : 0)}
      >
        <AddMoneySheet progress={addP} exiting={f >= P.addOut} ctaPress={pressAt(f - P.addCta)} />
        {f < P.addOut ? <TouchDot press={pressAt(f - P.addCta)} x={POS.addCta.x} y={POS.addCta.y} /> : null}
        <Toast text={copy["add.success"](LISBON.name, formatUsd(450))} progress={ramp(f, P.toast, P.toast + 17)} />
      </PotScreen>
    );

  // ── big type in the TypeZone
  const midSize = Math.min(
    useFitText({ text: "Join with Google.", maxWidth: 900, maxFontSize: 112 }),
    useFitText({ text: "Chip in $150.", maxWidth: 900, maxFontSize: 112 }),
  );
  const joinWords: TimedWord[] = [
    { text: "Join", startFrame: voLanding(W.join) },
    { text: "with", startFrame: voLanding(W.withW) },
    { text: "Google.", startFrame: voLanding(W.google) },
  ];
  const chipWords = wordsAt("Chip in $150.", P.chipType, 6);
  const noSize = Math.min(104, useFitText({ text: "No seed phrase.", maxWidth: 900, maxFontSize: 104 }));
  const line = (pairs: [string, number][]): TimedWord[] => pairs.map(([text, spoken]) => ({ text, startFrame: voLanding(spoken) }));
  const l1 = line([["No", W.no1], ["wallet.", W.wallet]]);
  const l2 = line([["No", W.no2], ["seed", W.seed], ["phrase.", W.phrase]]);
  const l3 = line([["No", W.no3], ["gas.", W.gas]]);
  // each marigold block hits with its stamp (stamp = 1 f before the spoken "No"; the 8 f sweep is ~80 % in on it)
  const stamp = (no: number) => no - 1;
  const noBlock = (no: number) => ({ index: 0, at: stamp(no) - 4, duration: 8 });

  // ── the "+ $150.00" chip: from Leo's feed row to Maya's (text-on-text at both ends)
  const chipStart = projectScreenPoint(camAt(P.chipIn), "leo", POS.rowAmount.x, POS.rowAmount.y);
  const chipTargetAt = (frame: number) => projectScreenPoint(camAt(Math.max(frame, 486)), "maya", POS.rowAmount.x, POS.rowAmount.y);
  const chipAt = (frame: number): FlyState => {
    const grow = ramp(frame, P.chipIn, P.chipIn + 14, land);
    const u = ramp(frame, P.chipIn + 8, P.chipLand, linear);
    const e = inOut(u);
    const end = chipTargetAt(frame);
    const s0 = chipStart.k;
    const scale = lerp(lerp(s0, 2.2, grow), end.k, inOut(ramp(u, 0.55, 1)));
    const absorb = ramp(frame, P.chipLand, P.chipLand + 8, softInOut);
    return {
      x: lerp(chipStart.x - CHIP_TEXT_DX * s0 - 30 * grow, end.x - CHIP_TEXT_DX * end.k, e),
      y: lerp(chipStart.y - 70 * grow, end.y, e) - 60 * Math.sin(Math.PI * u),
      scale: scale * (1 - 0.06 * absorb),
      rot: -2.5 * Math.sin(Math.PI * u),
      opacity: ramp(frame, P.chipIn, P.chipIn + 4) * (1 - absorb),
      lift: lerp(30, 160, grow) * (1 - e) + 30 * e,
    };
  };

  const pill = (from: number, to: number) => ramp(f, from, from + 12, land) * (1 - ramp(f, to, to + 12, softInOut));
  const showMaya = f < P.whipB + 2 || f >= wb0 - 2;
  const showLeo = f >= P.whipA - 2 && f < wb2 - 18;

  return (
    <AbsoluteFill style={{ background: day.ground }}>
      <DirectionalBlur x={worldSmear} region={0.08}>
        <WorldStage pose={cam}>
          {showMaya ? (
            <WorldPhone who="maya" screen={mayaScreen}>
              {f >= P.lift && f < P.handoff ? (
                <LiftTwin t={liftT(f)} from={linkFrom} to={linkTo} face={PHONE_HOME} opacity={ramp(f, P.lift, P.lift + 3)} radius={14} shadow>
                  <UiPiece theme="day" width={LINK_W}>
                    <LinkPreviewCard link={{ members: [MAYA, SAM] }} />
                  </UiPiece>
                </LiftTwin>
              ) : null}
            </WorldPhone>
          ) : null}
          {showLeo ? (
            <WorldPhone who="leo" screen={leoScreen}>
              <PersonaPill person="leo" appear={pill(P.pillIn, P.pillOut)} />
            </WorldPhone>
          ) : null}
        </WorldStage>
      </DirectionalBlur>

      {/* the invite card anchoring the whip to Leo */}
      {f >= P.handoff && f < P.land + 10 ? (
        <Flyer at={cardAt(f)} prev={cardAt(f - 1)} next={cardAt(f + 1)} width={LINK_W} height={LINK_H} radius={14} raster={2} k={0.25} maxSmear={18}>
          <UiPiece theme="day" width={LINK_W}>
            <LinkPreviewCard link={{ members: [MAYA, SAM] }} />
          </UiPiece>
        </Flyer>
      ) : null}

      <TypeZone align="start">
        {/* on the voice beside Leo's phone: "Join with Google." (his press), then "Chip in $150." */}
        {f < P.joinExit + 16 ? (
          <div style={{ position: "absolute", left: 0, top: SLOT.mid }}>
            <BigLine words={joinWords} fontSize={midSize} maxWidth={930} exit={{ at: P.joinExit }} />
          </div>
        ) : null}
        {f >= P.chipType && f < P.chipExit + 16 ? (
          <div style={{ position: "absolute", left: 0, top: SLOT.mid }}>
            <BigLine words={chipWords} fontSize={midSize} maxWidth={930} highlight={{ index: 2, at: chipWords[2].startFrame + 14 }} exit={{ at: P.chipExit }} />
          </div>
        ) : null}
        {/* the fully-funded beat: In the Pot $300.00 → $450.00, "$450 of $450 collected" */}
        <div style={{ position: "absolute", left: 0, top: SLOT.money, display: "flex", flexDirection: "column" }}>
          <RiseIn at={P.moneyIn} exitAt={P.moneyExit}>
            <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 40, lineHeight: "52px", color: day.inkMuted, paddingLeft: 6 }}>{copy["pot.hero.label"]}</div>
          </RiseIn>
          <RiseIn at={P.moneyIn + 3} exitAt={P.moneyExit + 2}>
            <MoneyRoll from={300} to={450} at={P.roll} duration={34} fontSize={140} />
          </RiseIn>
          <RiseIn at={P.moneyIn + 6} exitAt={P.moneyExit + 4} style={{ marginTop: 14, paddingLeft: 8 }}>
            <div style={{ zoom: 2.2 }}>
              <UiPiece theme="day" width={290}>
                <GoalBar collected={Math.floor(f >= P.roll ? money : 300)} goal={450} progress={(f >= P.roll ? money : 300) / 450} />
              </UiPiece>
            </div>
          </RiseIn>
        </div>
        {/* "No wallet. No seed phrase. No gas." under the money */}
        <div style={{ position: "absolute", left: 0, top: SLOT.no, display: "flex", flexDirection: "column", gap: 8 }}>
          <BigLine words={l1} fontSize={noSize} maxWidth={930} highlight={noBlock(W.no1)} thesis={[0]} exit={{ at: P.noExit }} />
          <BigLine words={l2} fontSize={noSize} maxWidth={930} highlight={noBlock(W.no2)} thesis={[0]} exit={{ at: P.noExit + 4 }} />
          <BigLine words={l3} fontSize={noSize} maxWidth={930} highlight={noBlock(W.no3)} thesis={[0]} exit={{ at: P.noExit + 8 }} />
        </div>
      </TypeZone>

      {/* the "+ $150.00" chip anchoring the whip back to Maya */}
      {f >= P.chipIn && f < P.chipLand + 9 ? (
        <Flyer at={chipAt(f)} prev={chipAt(f - 1)} next={chipAt(f + 1)} width={CHIP_W} height={CHIP_H} radius={CHIP_H / 2} raster={2} k={0.25} maxSmear={14}>
          <MoneyChip />
        </Flyer>
      ) : null}

      <Sfx name="pop" at={P.linkIn + 8} volume={0.45} />
      <Sfx name="pop-soft" at={P.samIn + 4} volume={0.2} />
      <Sfx name="pop-soft" at={P.leoIn + 4} volume={0.2} />
      <Sfx name="whoosh-fast" at={P.whipA} volume={0.32} />
      <Sfx name="click" at={P.google + 3} volume={0.45} />
      <Sfx name="swoosh-up" at={P.youreIn} volume={0.26} />
      <Sfx name="swoosh-up" at={P.addIn} volume={0.26} />
      <Sfx name="stamp" at={stamp(W.no1)} volume={0.25} />
      <Sfx name="stamp" at={stamp(W.no2)} volume={0.25} />
      <Sfx name="stamp" at={stamp(W.no3)} volume={0.25} />
      <Sfx name="whoosh-fast" at={wb0 + 2} volume={0.32} />
    </AbsoluteFill>
  );
};
