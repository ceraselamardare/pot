// s10-group (builder D, v2 = one OK, hub 1.1.0): "Bigger spends need one OK. Leo taps it, right from a notification."
// One world, two phones:
//   1. "Bigger spends / need one OK." rises in the TypeZone (a marigold block under "one OK"). Maya: the round Spend
//      action → "How much?" 3-0-0 ("This needs one OK from anyone else", ringed) → [Next] → a blur-matched move into
//      step 2: Tickets 🎟️ (+ the boat sticker), "the boat trip", the decision line (ringed) → [Ask for one OK] →
//      a move onto the result: "Sent · One OK from anyone else in the group and it's paid." (readable).
//   2. The request card lifts out of that box and whips to Leo (the world smears past it) and lands as the push
//      "Maya needs one OK / $300 for the boat trip · Lisbon Trip · Anyone can OK it".
//   3. "Leo taps it": he opens the push, the lock slides away, the one-OK sheet rises ("One OK needed · Anyone in Lisbon
//      Trip except Maya can give it."), [OK $300] is pressed ON "taps" → "Sending your OK…" → "Done. Your OK sent $300
//      to Maya." NO burst (an OK is not a rules-only approval).
//   4. "… notification": the whip home (a scale dip keeps a phone in frame), anchored by the "✓ One OK" chip that leaves
//      beside Leo's line and lands on Maya's feed row; her hero, the big roll and her Pot dollars tick
//      $366.00 → $66.00 (You'd get back $22) and $84.00 → $384.00; the type zone clears.
// Handoffs: frame 0 = s09's end (CAM.maya, $366.00, feedAfterGroceries(), no sheet, tab bar $84.00); last frame =
// s10b's start (CAM.maya, PotScreen $66.00 · You'd get back $22 · put in $150, feedAfterBoat(), no sheet, tab bar
// $384.00, empty TypeZone; Leo's phone at rest out of frame: his Pot screen, $66.00, feedAfterBoat()).
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import {
  Camera,
  DirectionalBlur,
  MoneyRoll,
  Sfx,
  Stage3D,
  addPose,
  cameraAt,
  clamp01,
  driftAt,
  exit as exitEase,
  inOut,
  linear,
  softInOut,
  speedRamp,
  springAt,
  typedCount,
  whip,
  type CameraKey,
  type CameraPose,
} from "../../motion";
import {
  ApproveSheet,
  LockScreen,
  PotScreen,
  SpendSheet,
  copy,
  easeEnter,
  easeStandard,
  feedAfterBoat,
  feedAfterGroceries,
  feedBoatPending,
  LISBON,
  MAYA,
  type KeyName,
} from "../../ui";
import { TouchDot, pressAt } from "../../ui/atoms/Touch";
import { day } from "../../brand/tokens";
import { SANS } from "../../brand/fonts";
import { scene, type SceneId } from "../../data/timeline";
import { CAM, PersonaPill, TypeZone, WORLD, WorldPhone, WorldStage, useWorldCamera } from "../shared/world";
import { BigType, HighlightLine, RiseIn, UI, WorldSticker, frameOn, mid, screenToLocal, smearAt, tickValue, worldOfScreen } from "./s09-shared";
import { ApprovedChip, RequestFlight } from "./s10-flight";
import { S10 } from "./s10-timing";

export const S10_SCENES: SceneId[] = ["s10-group"];

const ID: SceneId = "s10-group";

// ─── Framings ───────────────────────────────────────────────────────────────────
const HOW = frameOn("maya", 195, 476, 1.36, 560, 540); // "How much?": $300, the decision line, [Next], the keypad
const HOW_B = frameOn("maya", 195, 482, 1.4, 560, 540);
const DET = frameOn("maya", 195, 590, 1.44, 560, 560); // step 2: $300 · Tickets · Me · the note · the footer
const DET_B = frameOn("maya", 195, 600, 1.5, 560, 560);
const SENT = frameOn("maya", 195, 629, 1.75, 480, 560); // "Sent · One OK from anyone else in the group and it's paid." (phone clear of the type)
const SENT_B = frameOn("maya", 195, 629, 1.78, 480, 560);
const NOTIF_A = frameOn("leo", 195, 381, 1.75, 500, 470); // Leo's lock screen: the one-OK push, readable (≈ 28 px)
const NOTIF_B = frameOn("leo", 195, 381, 1.78, 500, 470);
const APPROVE_A = frameOn("leo", 195, 520, 1.55, 540, 520); // the why · One OK needed · the details · [OK $300]
const APPROVE_B = frameOn("leo", 195, 526, 1.58, 540, 520);
const DONE_A = frameOn("leo", 195, 640, 1.7, 495, 560); // "Done. Your OK sent $300 to Maya." (≈ 28 px), clear of the type
const DONE_B = frameOn("leo", 195, 644, 1.73, 495, 560);
/** Mid-keys of the two whips: a dip to 0.8× between the phones, so a phone is always in frame (no empty frame). */
const WHIP_OUT_MID = { scale: 0.8, cx: (SENT_B.cx + NOTIF_A.cx) / 2, cy: (SENT_B.cy + NOTIF_A.cy) / 2 };
const MAYA_LAND = { ...CAM.maya, cx: 70 }; // the whip home lands a touch left and settles home by camHome
const WHIP_HOME_MID = { scale: 0.8, cx: (DONE_B.cx + MAYA_LAND.cx) / 2, cy: (DONE_B.cy + MAYA_LAND.cy) / 2 };

const CAMERA: CameraKey[] = [
  { at: 0, ...CAM.maya },
  { at: S10.pushStart, ...CAM.maya, scale: 1.006, ease: linear },
  { at: S10.pushEnd, ...HOW, ease: inOut },
  { at: S10.stepMoveStart, ...HOW_B, ease: softInOut },
  // blur-matched step move (monotonic, speedRamp): "How much?" → details switches at peak speed
  { at: S10.stepMoveEnd, ...DET, ease: speedRamp },
  { at: S10.submitting, ...DET_B, ease: softInOut },
  // blur-matched move onto the result: "Sent · One OK …" switches in at peak speed
  { at: S10.sentMoveEnd, ...SENT, ease: speedRamp },
  { at: S10.whipStart, ...SENT_B, ease: linear },
  // the whip to Leo (the request card rides it)
  { at: S10.whipMid, ...WHIP_OUT_MID, ease: exitEase },
  { at: S10.whipEnd, ...NOTIF_A, ease: whip },
  { at: S10.pushTouch, ...NOTIF_B, ease: linear },
  { at: S10.approveMoveEnd, ...APPROVE_A, ease: inOut },
  { at: S10.approvedMoveStart, ...APPROVE_B, ease: linear },
  // blur-matched move: the sheet's layout changes ("approving" → "approved") at peak speed
  { at: S10.approvedMoveEnd, ...DONE_A, ease: speedRamp },
  { at: S10.returnStart, ...DONE_B, ease: linear },
  // the whip home, anchored by the "✓ One OK" chip
  { at: S10.returnMid, ...WHIP_HOME_MID, ease: exitEase },
  { at: S10.returnEnd, ...MAYA_LAND, ease: whip },
  { at: S10.camHome, ...CAM.maya, ease: inOut },
];
/** The home whip's overall progress (same halves as the camera keys), for the anchor chip's screen path. */
const whipProgress = (t: number) => (t < 0.5 ? 0.5 * exitEase(2 * t) : 0.5 + 0.5 * whip(2 * t - 1));

/** The request card's launch point: the "$300.00" of Maya's result, so the "Sent · One OK …" box under it stays readable
 *  until the whip. */
const FLIGHT_FROM = { ...screenToLocal(195, 518), z: 2 };

const press = (f: number, at: number) => pressAt(f - at);
/** A touch dot that lifts off quickly (5 f), so it never lingers over what the tap opens. */
const dot = (f: number, at: number) => pressAt(f - at, { outFrames: 5 });
const NOTE = "the boat trip";
/** The $366 → $66 roll: 30 f (research 30-54), shared by the big roll, Maya's hero and her Pot dollars. */
const MONEY_ROLL = 30;

/** A waiting-blue focus ring around a decision line (a video annotation over the app's own ✋ line). */
const Ring: React.FC<{ rect: { x: number; y: number; w: number; h: number }; at: number; outAt: number; f: number }> = ({ rect, at, outAt, f }) => {
  const inP = clamp01((f - at) / 8);
  const outP = clamp01((f - outAt) / 8);
  const a = easeStandard(inP) * (1 - outP);
  if (a <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: rect.x - 5,
        top: rect.y - 5,
        width: rect.w + 10,
        height: rect.h + 10,
        boxSizing: "border-box",
        borderRadius: 21,
        border: `2.5px solid ${day.waiting}`,
        opacity: a,
        transform: `scale(${1.06 - 0.06 * easeEnter(inP)})`,
        zIndex: 55,
      }}
    />
  );
};

// ─── Maya's phone ───────────────────────────────────────────────────────────────
const MayaScreen: React.FC<{ f: number }> = ({ f }) => {
  const balance = tickValue(f, 366, 66, S10.tick, MONEY_ROLL);
  const myDollars = tickValue(f, 84, 384, S10.tick, MONEY_ROLL);
  const feed = f >= S10.chipLand ? feedAfterBoat() : f >= S10.mayaSheetGone ? feedBoatPending() : feedAfterGroceries();
  const spendP = press(f, S10.spendTouch);

  let sheet: React.ReactNode = null;
  let overlay: React.ReactNode = null;
  if (f >= S10.sheetIn && f < S10.details) {
    // step 1: "How much?" 3 · 0 · 0 → the decision line flips to "This needs one OK from anyone else"
    const typed = f < S10.key3 + 2 ? "" : f < S10.key0a + 2 ? "3" : f < S10.key0b + 2 ? "30" : "300";
    const keys: [number, KeyName][] = [
      [S10.key3, "3"],
      [S10.key0a, "0"],
      [S10.key0b, "0"],
    ];
    const cur = [...keys].reverse().find(([at]) => f >= at) ?? keys[0];
    const keyP = f >= S10.key3 ? press(f, cur[0]) : 0;
    const pop = f >= cur[0] + 2 ? 1 + 0.04 * Math.sin(Math.PI * clamp01((f - cur[0] - 2) / 10)) : 1;
    sheet = (
      <SpendSheet
        step="howMuch"
        progress={clamp01((f - S10.sheetIn) / 22)}
        typed={typed}
        pressedKey={f >= S10.key3 && f < S10.key0b + 20 ? cur[1] : null}
        keyPress={keyP}
        amountPop={pop}
        ctaPress={press(f, S10.nextTouch)}
      />
    );
    overlay = (
      <>
        <Ring rect={UI.howDecision} at={S10.key0b + 2} outAt={S10.nextTouch - 2} f={f} />
        <TouchDot press={f >= S10.key3 ? keyP : 0} x={mid(UI.key[cur[1]]).x + 4} y={mid(UI.key[cur[1]]).y + 3} />
        <TouchDot press={dot(f, S10.nextTouch)} x={mid(UI.howNext).x + 10} y={mid(UI.howNext).y + 2} />
      </>
    );
  } else if (f >= S10.details && f < S10.oneOkSent) {
    // step 2: flick to Tickets, select, the note, the decision (ringed), [Ask for one OK] → submitting
    const flick = easeStandard(clamp01((f - S10.chipsScroll) / 10));
    const n = typedCount(f, NOTE, { start: S10.noteType, framesPerChar: 1.5 });
    const chipDragP = clamp01((f - (S10.chipsScroll - 3)) / 4) * (1 - clamp01((f - (S10.chipsScroll + 8)) / 4));
    const submitting = f >= S10.submitting;
    sheet = (
      <SpendSheet
        step="details"
        typed="300"
        category={f >= S10.ticketsSelect ? "tickets" : null}
        categorySelect={Math.min(1, springAt(f, S10.ticketsSelect, "uiPop"))}
        chipsScrollX={245 * flick}
        pressedChip="tickets"
        chipPress={press(f, S10.ticketsTouch)}
        payee="me"
        note={NOTE.slice(0, n)}
        submitting={submitting}
        dotsFrame={f - S10.submitting}
        ctaPress={submitting ? 0 : press(f, S10.askTouch)}
      />
    );
    overlay = (
      <>
        <Ring rect={UI.detDecision} at={S10.noteType + 8} outAt={S10.askTouch} f={f} />
        {f < S10.chipsScroll + 12 ? <TouchDot press={chipDragP} x={330 - 190 * flick} y={mid(UI.detChipTickets).y + 2} /> : null}
        <TouchDot press={dot(f, S10.ticketsTouch)} x={mid(UI.detChipTickets).x + 6} y={mid(UI.detChipTickets).y + 2} />
        <TouchDot press={dot(f, S10.noteTouch)} x={64} y={mid(UI.detNote).y + 2} />
        <TouchDot press={dot(f, S10.askTouch)} x={mid(UI.detCta).x + 12} y={mid(UI.detCta).y + 2} />
      </>
    );
  } else if (f >= S10.oneOkSent && f < S10.mayaSheetGone + 18) {
    // the one-OK result; it closes off screen while the camera is on Leo
    const out = clamp01((f - S10.mayaSheetGone) / 17);
    sheet = (
      <SpendSheet
        step="oneOkSent"
        amount={300}
        category="tickets"
        progress={f < S10.mayaSheetGone ? 1 : 1 - out}
        exiting={f >= S10.mayaSheetGone}
      />
    );
  }

  return (
    <>
      <PotScreen
        balance={balance}
        yourShare={Math.round(balance / 3)}
        putIn={150}
        feed={feed}
        tabBar={{ active: "pots", balance: myDollars }}
        press={spendP > 0 ? { target: "spend", amount: spendP } : null}
      />
      {sheet}
      {overlay}
      <TouchDot press={dot(f, S10.spendTouch)} x={mid(UI.potActionSpend).x + 3} y={mid(UI.potActionSpend).y + 3} />
    </>
  );
};

// ─── Leo's phone ────────────────────────────────────────────────────────────────
const LEO_WAITING = [{ who: MAYA, amount: 300, reason: "the boat trip", approvals: 1, k: LISBON.k, expires: copy["time.in_days"](LISBON.expiryDays) }];

const LeoScreen: React.FC<{ f: number }> = ({ f }) => {
  if (f >= S10.leoRest) return <PotScreen balance={66} yourShare={22} putIn={150} feed={feedAfterBoat()} tabBar={{ active: "pots", balance: 0 }} />;
  const notifP = press(f, S10.pushTouch);
  const landed = f >= S10.flightEnd;
  const unlockT = easeEnter(clamp01((f - S10.unlock) / 14));
  const state = f < S10.approving ? "ready" : f < S10.approved ? "approving" : "approved";
  return (
    <>
      {f >= S10.approveIn ? (
        <>
          <PotScreen balance={366} yourShare={122} putIn={150} feed={feedBoatPending()} waiting={LEO_WAITING} tabBar={{ active: "pots", balance: 0 }} />
          <ApproveSheet
            state={state}
            time={copy["time.just_now"]}
            progress={clamp01((f - S10.approveIn) / 22)}
            approvePress={press(f, S10.okTouch)}
            tickPop={clamp01((f - S10.approved) / 19)}
            statusAppear={clamp01((f - S10.approved) / 17)}
          />
        </>
      ) : null}
      {unlockT < 1 ? (
        <div style={{ position: "absolute", inset: 0, transform: `translateY(${-unlockT * 100}%)`, zIndex: 50 }}>
          <LockScreen notifications={landed ? [{ id: "boat", progress: 0.9 + 0.1 * clamp01((f - S10.flightEnd) / 4), pressed: notifP }] : []} />
        </div>
      ) : null}
      <TouchDot press={dot(f, S10.pushTouch)} x={mid(UI.lockPush).x + 30} y={mid(UI.lockPush).y + 4} />
      <TouchDot press={dot(f, S10.okTouch)} x={mid(UI.approveCta).x + 10} y={mid(UI.approveCta).y + 2} />
    </>
  );
};

/** A transparent second stage with the same camera, for world objects that must stay sharp while the main stage
 *  smears (the request card rides the whip). */
const SharpStage: React.FC<{ pose: CameraPose; children: React.ReactNode }> = ({ pose, children }) => (
  <Stage3D perspective={2600}>
    <Camera pose={pose}>{children}</Camera>
  </Stage3D>
);

// ─── The scene ──────────────────────────────────────────────────────────────────
export const S10Group: React.FC = () => {
  const f = useCurrentFrame();
  const cam = useWorldCamera(ID, CAMERA);
  // smears: the blur-matched moves on each phone, and the two whips between the phones (axis smear)
  const sMaya = smearAt(f, CAMERA, [worldOfScreen("maya", 195, 160), worldOfScreen("maya", 195, 600), worldOfScreen("maya", 195, 820)], [
    [S10.stepMoveStart, S10.stepMoveEnd + 1],
    [S10.submitting, S10.sentMoveEnd + 1],
  ]);
  const sLeo = smearAt(f, CAMERA, [worldOfScreen("leo", 195, 160), worldOfScreen("leo", 195, 600), worldOfScreen("leo", 195, 820)], [[S10.approvedMoveStart - 1, S10.approvedMoveEnd + 1]]);
  const sWhip = smearAt(
    f,
    CAMERA,
    { x: (WORLD.maya.x + WORLD.leo.x) / 2, y: 0, z: 0 },
    [
      [S10.whipStart, S10.whipEnd + 1],
      [S10.returnStart, S10.returnEnd + 1],
    ],
    { max: 60, floor: 24 },
  );
  const smearX = Math.max(sMaya.x, sLeo.x, sWhip.x);
  const smearY = Math.max(sMaya.y, sLeo.y, sWhip.y);

  // the home whip's first/last camera poses (with the act's global drift), for the anchor chip's screen path
  const camAt = (k: number) => addPose(cameraAt(k, CAMERA, { rest: CAM.maya, drift: false }), driftAt(k + scene(ID).from, { seed: "act3" }));
  const pillMaya = clamp01((f - S10.mayaPillIn) / 14) * (1 - clamp01((f - S10.mayaPillOut) / 12));

  return (
    <AbsoluteFill style={{ background: day.ground }}>
      <DirectionalBlur x={smearX} y={smearY}>
        <WorldStage pose={cam}>
          <WorldPhone who="maya" screen={<MayaScreen f={f} />}>
            {pillMaya > 0 ? <PersonaPill person="maya" appear={pillMaya} /> : null}
          </WorldPhone>
          <WorldPhone who="leo" screen={<LeoScreen f={f} />} />
          <WorldSticker name="boat" x={290} y={-90} z={80} width={220} at={S10.sticker} outAt={S10.stickerOut} rotate={-7} />
        </WorldStage>
      </DirectionalBlur>
      <SharpStage pose={cam}>
        <RequestFlight start={S10.flightStart} end={S10.flightEnd} from={FLIGHT_FROM} camScale={cam.scale} emerge={6} />
      </SharpStage>

      <ApprovedChip
        cam={cam}
        camStart={camAt(S10.returnStart)}
        camEnd={camAt(S10.returnEnd)}
        popAt={S10.chipPop}
        moveStart={S10.returnStart}
        moveEnd={S10.returnEnd}
        ease={whipProgress}
        fromLeo={{ x: -46, y: mid(UI.approveDoneStatus).y }}
        toMaya={mid(UI.feedFirstChipOneOk)}
      />

      {/* "Bigger spends / need one OK." (centred), then Leo's line (top) and the money (bottom) share the column */}
      <TypeZone>
        {f < S10.typeExit + 24 ? (
          <div>
            <BigType
              fontSize={128}
              exitAt={S10.typeExit}
              words={[
                { text: "Bigger", at: S10.tBigger },
                { text: "spends", at: S10.tSpends },
              ]}
            />
            <div style={{ display: "flex", alignItems: "flex-start", gap: "0.26em", fontSize: 128 }}>
              <BigType fontSize={128} exitAt={S10.typeExit + 4} words={[{ text: "need", at: S10.tNeed }]} />
              <HighlightLine
                fontSize={128}
                hlAt={S10.hlOneOk}
                exitAt={S10.typeExit + 6}
                tail="."
                words={[
                  { text: "one", at: S10.tOne },
                  { text: "OK", at: S10.tOK },
                ]}
              />
            </div>
          </div>
        ) : null}
      </TypeZone>
      <TypeZone style={{ justifyContent: "flex-start", paddingTop: 70 }}>
        {f >= S10.tLeo && f < S10.leoTypeExit + 20 ? (
          <BigType
            fontSize={112}
            exitAt={S10.leoTypeExit}
            words={[
              { text: "Leo", at: S10.tLeo },
              { text: "taps", at: S10.tTaps },
              { text: "it,", at: S10.tIt },
              { text: "right", at: S10.tRight, br: true },
              { text: "from", at: S10.tFrom },
              { text: "a", at: S10.tA },
              { text: "notification.", at: S10.tNotification, br: true },
            ]}
          />
        ) : null}
      </TypeZone>
      <TypeZone style={{ justifyContent: "flex-end", paddingBottom: 130 }}>
        {f >= S10.moneyIn && f < S10.moneyExit + 14 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <RiseIn at={S10.moneyIn} exitAt={S10.moneyExit}>
              <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 44, lineHeight: "56px", color: day.inkMuted, paddingLeft: 6 }}>{copy["pot.hero.label"]}</div>
            </RiseIn>
            <RiseIn at={S10.moneyIn + 4} exitAt={S10.moneyExit + 2}>
              <MoneyRoll from={366} to={66} at={S10.tick} duration={MONEY_ROLL} fontSize={180} />
            </RiseIn>
          </div>
        ) : null}
      </TypeZone>

      <Sfx name="swoosh-up" at={S10.sheetIn - 2} volume={0.5} />
      <Sfx name="keypad" at={S10.key3 + 1} volume={0.3} />
      <Sfx name="keypad" at={S10.key0a + 1} volume={0.3} />
      <Sfx name="keypad" at={S10.key0b + 1} volume={0.3} />
      <Sfx name="pop" at={S10.ticketsSelect} volume={0.5} />
      <Sfx name="whoosh-long" at={S10.flightStart} volume={0.55} />
      <Sfx name="notif" at={S10.flightEnd} volume={0.6} />
      <Sfx name="swoosh-up" at={S10.approveIn - 2} volume={0.45} />
      <Sfx name="click" at={S10.okTouch + 2} volume={0.6} />
      <Sfx name="whoosh-fast" at={S10.returnStart + 4} volume={0.35} />
    </AbsoluteFill>
  );
};
