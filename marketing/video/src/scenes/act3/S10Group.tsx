// s10-group (builder D): "Bigger spends go to the group. The three-hundred-dollar boat trip needs two of three… so
// Leo approves, right from a notification."
// One world, two phones:
//   1. "Bigger spends / go to the group." rises in the TypeZone (one marigold block under the phrase); Spend → the
//      SpendSheet; keys 3-0-0 on the voice; the preview flips to "This needs 2 of 3 approvals" (ringed); Tickets 🎟️;
//      the form scrolls, "+ Add a note" → "the boat trip" (+ the boat sticker); press "Ask the group".
//   2. "needs two of three": a blur-matched move to "Sent to the group" + Approvals · 1 of 2; the timeline BREAKS
//      OUT; "needs / 2 of 3" holds through the split.
//   3. The split: a 1.6× pull-back to CAM.split reveals Leo's lock screen; Maya's request flies across in an arc and
//      lands as the push "Maya needs your OK · $300 for the boat trip · Lisbon Trip".
//   4. "so Leo approves, right from a notification": push to Leo, tap the push on "so", the lock slides away, the
//      ApproveSheet rises, "Approve $300" lands on "approves" → "Approving…" (2 of 2) → "Approved! $300 is on its
//      way to Maya." NO burst (group approvals get the check and the message only).
//   5. A whip home (a scale dip keeps a phone in frame), anchored by the "✓ Approved" chip that leaves beside Leo's
//      row and lands on Maya's feed row; her hero and the big roll tick $366.00 → $66.00, then clear.
// Handoffs: frame 0 = s09's end (CAM.maya, $366.00 · share $122, feedAfterGroceries(), no sheet); last frame =
// CAM.maya, PotScreen $66.00 · share $22 · put in $150, feedAfterBoat(), no sheet, empty TypeZone; Leo's phone at
// rest (his Pot screen, $66.00, feedAfterBoat(), no sheet) out of frame.
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import {
  BreakOut,
  DirectionalBlur,
  MoneyRoll,
  Sfx,
  addPose,
  breakoutLifted,
  cameraAt,
  clamp01,
  driftAt,
  exit as exitEase,
  inOut,
  linear,
  softInOut,
  springAt,
  typedCount,
  whip,
  type CameraKey,
} from "../../motion";
import {
  ApprovalTimeline,
  ApproveSheet,
  LockScreen,
  PotScreen,
  SpendSheet,
  UiPiece,
  copy,
  easeEnter,
  easeStandard,
  feedAfterBoat,
  feedAfterGroceries,
  feedBoatPending,
  timelineRows,
  CREW,
  LISBON,
  MAYA,
  type KeyName,
} from "../../ui";
import { TouchDot, pressAt } from "../../ui/atoms/Touch";
import { day } from "../../brand/tokens";
import { SANS } from "../../brand/fonts";
import { scene, type SceneId } from "../../data/timeline";
import { CAM, PersonaPill, TypeZone, WORLD, WorldPhone, WorldStage, PHONE_HOME, useWorldCamera } from "../shared/world";
import {
  BigType,
  HighlightLine,
  RiseIn,
  UI,
  WidePill,
  WorldSticker,
  frameOn,
  localForScreen,
  mid,
  screenToLocal,
  smearAt,
  tickValue,
  worldOfScreen,
} from "./s09-shared";
import { ApprovedChip, RequestFlight } from "./s10-flight";
import { S10 } from "./s10-timing";

export const S10_SCENES: SceneId[] = ["s10-group"];

const ID: SceneId = "s10-group";

// ─── Framings ───────────────────────────────────────────────────────────────────
const FORM_A = frameOn("maya", 195, 420, 1.38, 540, 540); // phone kept left of the TypeZone
const FORM_B = frameOn("maya", 195, 392, 1.46, 540, 540);
const DIP = frameOn("maya", 195, 640, 1.3, 540, 540); // mid-key of the blur-matched move (content switch)
const VOTE_A = frameOn("maya", 195, 422, 1.06, 520, 520); // phone left; the timeline floats upper right
const VOTE_B = frameOn("maya", 195, 422, 1.08, 520, 520);
const SPLIT_B = { ...CAM.split, scale: CAM.split.scale * 1.012 };
const NOTIF_A = frameOn("leo", 195, 371, 1.45, 700, 470); // Leo's lock screen: 9:41 + the push
const NOTIF_B = frameOn("leo", 195, 371, 1.48, 700, 470);
const APPROVE_A = frameOn("leo", 195, 560, 1.48, 640, 540); // the ApproveSheet: timeline + Approve $300
const APPROVE_B = frameOn("leo", 195, 566, 1.54, 640, 540);
const MAYA_LAND = { ...CAM.maya, cx: 70 }; // the whip lands a touch left and settles home by camHome
/** The whip's midpoint dips to 0.8× so a phone is always in frame (no empty frame between the phones). */
const WHIP_MID = { scale: 0.8, cx: (APPROVE_B.cx + MAYA_LAND.cx) / 2, cy: (APPROVE_B.cy + MAYA_LAND.cy) / 2 };

const CAMERA: CameraKey[] = [
  { at: 0, ...CAM.maya },
  // a slow creep from frame 0 (zero velocity at the cut): the seam holds no more than ~12 f of pure drift
  { at: S10.pushStart, ...CAM.maya, scale: 1.03, cx: 12, ease: softInOut },
  { at: S10.pushEnd, ...FORM_A, ease: inOut },
  { at: S10.reframeStart, ...FORM_B, ease: softInOut },
  // blur-matched move: accelerate down the sheet, switch content at peak speed, decelerate into the vote framing
  { at: S10.voteSent, ...DIP, ease: exitEase },
  { at: S10.reframeEnd, ...VOTE_A, ease: whip },
  { at: S10.splitStart, ...VOTE_B, ease: linear },
  { at: S10.splitEnd, ...CAM.split, ease: inOut },
  { at: S10.leoPushStart, ...SPLIT_B, ease: linear },
  { at: S10.leoPushEnd, ...NOTIF_A, ease: inOut },
  { at: S10.reframe2Start, ...NOTIF_B, ease: linear },
  { at: S10.reframe2End, ...APPROVE_A, ease: inOut },
  { at: S10.whipStart, ...APPROVE_B, ease: linear },
  { at: S10.whipMid, ...WHIP_MID, ease: exitEase },
  { at: S10.whipEnd, ...MAYA_LAND, ease: whip },
  { at: S10.camHome, ...CAM.maya, ease: inOut },
];
/** The whip's overall progress (same halves as the camera keys), for the anchor chip's screen path. */
const whipProgress = (t: number) => (t < 0.5 ? 0.5 * exitEase(2 * t) : 0.5 + 0.5 * whip(2 * t - 1));

/** The lifted timeline (BreakOut `to`) and the flight's launch point: Leo's row on the lifted card. */
const TIMELINE_UP = { ...localForScreen("maya", 930, 320, 240, VOTE_A), z: 240, scale: 1.6 };
const FLIGHT_FROM = { x: TIMELINE_UP.x - 40, y: TIMELINE_UP.y + 52 * 1.6, z: 240 };
const TIMELINE_SLOT = screenToLocal(mid(UI.voteSentTimeline).x, mid(UI.voteSentTimeline).y);

const press = (f: number, at: number) => pressAt(f - at);
/** A touch dot that lifts off quickly (5 f), so it never lingers over what the tap opens. */
const dot = (f: number, at: number) => pressAt(f - at, { outFrames: 5 });
const NOTE = "the boat trip";
/** The $366 → $66 roll: 36 f (research 30-54), shared by the big roll and Maya's hero. */
const MONEY_ROLL = 36;
const SCROLL = 56; // body scroll that brings "+ Add a note" above the footer
const VOTE_ROWS = timelineRows({ asker: MAYA, approved: [MAYA], waiting: CREW.filter((p) => p.id !== MAYA.id), me: MAYA.id });

// ─── Maya's phone ───────────────────────────────────────────────────────────────
const MayaScreen: React.FC<{ f: number }> = ({ f }) => {
  const balance = tickValue(f, 366, 66, S10.tick, MONEY_ROLL);
  const feed = f >= S10.chipLand ? feedAfterBoat() : f >= S10.mayaSheetGone ? feedBoatPending() : feedAfterGroceries();
  const spendP = press(f, S10.spendTouch);

  let sheet: React.ReactNode = null;
  let overlay: React.ReactNode = null;
  if (f >= S10.sheetIn && f < S10.voteSent) {
    // the vote form: 3 · 0 · 0 on the voice, the chip row flick, Tickets, scroll, the note
    const typed = f < S10.key3 + 2 ? "" : f < S10.key0a + 2 ? "3" : f < S10.key0b + 2 ? "30" : "300";
    const keys: [number, KeyName][] = [
      [S10.key3, "3"],
      [S10.key0a, "0"],
      [S10.key0b, "0"],
    ];
    const cur = [...keys].reverse().find(([at]) => f >= at) ?? keys[0];
    const keyP = f >= S10.key3 ? press(f, cur[0]) : 0;
    const pop = f >= cur[0] + 2 ? 1 + 0.04 * Math.sin(Math.PI * clamp01((f - cur[0] - 2) / 10)) : 1;
    const flick = easeStandard(clamp01((f - S10.chipsScroll) / 12));
    const scrollT = easeStandard(clamp01((f - S10.bodyScroll) / 10));
    const scroll = SCROLL * scrollT;
    const n = typedCount(f, NOTE, { start: S10.noteType, framesPerChar: 2 });
    sheet = (
      <SpendSheet
        step="vote"
        progress={clamp01((f - S10.sheetIn) / 22)}
        typed={typed}
        category={f >= S10.ticketsSelect ? "tickets" : null}
        categorySelect={Math.min(1, springAt(f, S10.ticketsSelect, "uiPop"))}
        chipsScrollX={236 * flick}
        pressedChip="tickets"
        chipPress={press(f, S10.ticketsTouch)}
        note={NOTE.slice(0, n)}
        bodyScroll={scroll}
        pressedKey={f >= S10.key3 && f < S10.key0b + 20 ? cur[1] : null}
        keyPress={keyP}
        amountPop={pop}
        ctaPress={press(f, S10.askTouch)}
      />
    );
    // "This needs 2 of 3 approvals" lands on the third key: a waiting-blue focus ring holds on the preview
    const flip = S10.key0b + 2;
    const ringIn = clamp01((f - flip) / 8);
    const ringOut = clamp01((f - (S10.askTouch - 8)) / 8);
    const ringA = easeStandard(ringIn) * (1 - ringOut);
    const pv = UI.formPreview;
    // finger drags: the chip row (right → left), then the form (up, with the content)
    const chipDrag = f >= S10.chipsScroll - 3 && f < S10.chipsScroll + 15;
    const chipDragP = clamp01((f - (S10.chipsScroll - 3)) / 4) * (1 - clamp01((f - (S10.chipsScroll + 11)) / 4));
    const formDrag = f >= S10.bodyScroll - 3 && f < S10.bodyScroll + 13;
    const formDragP = clamp01((f - (S10.bodyScroll - 3)) / 4) * (1 - clamp01((f - (S10.bodyScroll + 9)) / 4));
    overlay = (
      <>
        {f >= flip && ringA > 0 ? (
          <div
            style={{
              position: "absolute",
              left: pv.x - 5,
              top: pv.y - scroll - 5,
              width: pv.w + 10,
              height: pv.h + 10,
              boxSizing: "border-box",
              borderRadius: 21,
              border: `2.5px solid ${day.waiting}`,
              opacity: ringA,
              transform: `scale(${1.06 - 0.06 * easeEnter(ringIn)})`,
              zIndex: 55,
            }}
          />
        ) : null}
        {chipDrag ? <TouchDot press={chipDragP} x={330 - 190 * flick} y={mid(UI.formChipTickets).y + 2} /> : null}
        {formDrag ? <TouchDot press={formDragP} x={300} y={440 - SCROLL * scrollT} /> : null}
        <TouchDot press={f < S10.voteSent ? keyP : 0} x={mid(UI.key[cur[1]]).x + 4} y={mid(UI.key[cur[1]]).y + 3} />
        <TouchDot press={dot(f, S10.ticketsTouch)} x={mid(UI.formChipTickets).x + 6} y={mid(UI.formChipTickets).y + 2} />
        <TouchDot press={dot(f, S10.noteTouch)} x={64} y={mid(UI.formNote).y - SCROLL + 2} />
        <TouchDot press={dot(f, S10.askTouch)} x={mid(UI.formCta).x + 12} y={mid(UI.formCta).y + 2} />
      </>
    );
  } else if (f >= S10.voteSent && f < S10.mayaSheetGone) {
    sheet = <SpendSheet step="voteSent" amount={300} category="tickets" />;
    // keep the layout, hide the in-screen timeline while its twin is lifted
    if (breakoutLifted(f, S10.lift, S10.timelineReturn)) {
      const t = UI.voteSentTimeline;
      overlay = <div style={{ position: "absolute", left: t.x - 4, top: t.y - 4, width: t.w + 8, height: t.h + 10, background: day.surface, zIndex: 45 }} />;
    }
  }

  return (
    <>
      <PotScreen
        balance={balance}
        yourShare={Math.round(balance / 3)}
        putIn={150}
        feed={feed}
        press={spendP > 0 ? { target: "spend", amount: spendP } : null}
      />
      {sheet}
      {overlay}
      <TouchDot press={dot(f, S10.spendTouch)} x={mid(UI.potSpendBtn).x + 6} y={mid(UI.potSpendBtn).y + 4} />
    </>
  );
};

// ─── Leo's phone ────────────────────────────────────────────────────────────────
const LEO_WAITING = [{ who: MAYA, amount: 300, reason: "the boat trip", approvals: 1, k: LISBON.k, expires: copy["time.in_days"](LISBON.expiryDays) }];

const LeoScreen: React.FC<{ f: number }> = ({ f }) => {
  if (f >= S10.leoRest) return <PotScreen balance={66} yourShare={22} putIn={150} feed={feedAfterBoat()} />;
  const notifP = press(f, S10.notifTouch);
  const landed = f >= S10.flightEnd;
  const unlockT = easeEnter(clamp01((f - S10.unlock) / 14));
  const state = f < S10.approving ? "ready" : f < S10.approved ? "approving" : "approved";
  return (
    <>
      {f >= S10.approveIn ? (
        <>
          <PotScreen balance={366} yourShare={122} putIn={150} feed={feedBoatPending()} waiting={LEO_WAITING} />
          <ApproveSheet
            state={state}
            progress={clamp01((f - S10.approveIn) / 22)}
            approvePress={press(f, S10.approveTouch)}
            tickPop={clamp01((f - S10.approving) / 19)}
            statusAppear={clamp01((f - S10.approved) / 17)}
          />
        </>
      ) : null}
      {unlockT < 1 ? (
        <div style={{ position: "absolute", inset: 0, transform: `translateY(${-unlockT * 100}%)`, zIndex: 50 }}>
          <LockScreen
            notifications={landed ? [{ id: "boat", progress: 0.9 + 0.1 * clamp01((f - S10.flightEnd) / 4), pressed: notifP }] : []}
          />
        </div>
      ) : null}
      <TouchDot press={dot(f, S10.notifTouch)} x={mid(UI.lockNotif).x + 30} y={mid(UI.lockNotif).y + 4} />
      <TouchDot press={dot(f, S10.approveTouch)} x={mid(UI.approveBtn).x + 10} y={mid(UI.approveBtn).y + 2} />
    </>
  );
};

// ─── The scene ──────────────────────────────────────────────────────────────────
export const S10Group: React.FC = () => {
  const f = useCurrentFrame();
  const cam = useWorldCamera(ID, CAMERA);
  // smears: the blur-matched move into the vote framing, and the whip home (axis smear)
  const sForm = smearAt(f, CAMERA, worldOfScreen("maya", 195, 560), [[S10.reframeStart - 1, S10.reframeEnd + 1]]);
  const sWhip = smearAt(f, CAMERA, { x: (WORLD.maya.x + WORLD.leo.x) / 2, y: 0, z: 0 }, [[S10.whipStart, S10.whipEnd + 1]], {
    max: 60,
    floor: 24,
  });
  const smearX = Math.max(sForm.x, sWhip.x);
  const smearY = Math.max(sForm.y, sWhip.y);

  // the whip's first/last camera poses (with the act's global drift), for the anchor chip's screen path
  const camAt = (k: number) => addPose(cameraAt(k, CAMERA, { rest: CAM.maya, drift: false }), driftAt(k + scene(ID).from, { seed: "act3" }));
  // the split names both phones (enlarged pills: the wide shot is 0.63×); they leave with the push to Leo
  const pillSplit = clamp01((f - S10.splitPills) / 12) * (1 - clamp01((f - (S10.leoPushStart + 10)) / 10));
  const pillMaya = clamp01((f - S10.mayaPillIn) / 14) * (1 - clamp01((f - S10.mayaPillOut) / 12));

  const tzStyle: React.CSSProperties | undefined =
    f >= S10.moneyIn
      ? undefined
      : f >= S10.tLeo - 2
        ? { paddingLeft: 210 }
        : f >= S10.tNeeds
          ? { justifyContent: "flex-end", paddingBottom: 90, paddingLeft: 20 }
          : undefined;

  return (
    <AbsoluteFill style={{ background: day.ground }}>
      <DirectionalBlur x={smearX} y={smearY}>
        <WorldStage pose={cam}>
          <WorldPhone who="maya" screen={<MayaScreen f={f} />}>
            <BreakOut
              at={S10.lift}
              returnAt={S10.timelineReturn}
              from={{ x: TIMELINE_SLOT.x, y: TIMELINE_SLOT.y, z: 2 }}
              to={TIMELINE_UP}
              face={PHONE_HOME}
              radius={24}
            >
              <UiPiece theme="day" width={358} card="surface" padding={16} radius={24}>
                <ApprovalTimeline rows={VOTE_ROWS} k={LISBON.k} />
              </UiPiece>
            </BreakOut>
            {pillMaya > 0 ? <PersonaPill person="maya" appear={pillMaya} /> : null}
            <WidePill person="maya" appear={pillSplit} />
          </WorldPhone>
          <WorldPhone who="leo" screen={<LeoScreen f={f} />}>
            <WidePill person="leo" appear={pillSplit} />
          </WorldPhone>
          <WorldSticker name="boat" x={10} y={-240} z={80} width={240} at={S10.sticker} outAt={S10.stickerOut} rotate={-7} />
          <RequestFlight start={S10.flightStart} end={S10.flightEnd} from={FLIGHT_FROM} camScale={cam.scale} />
        </WorldStage>
      </DirectionalBlur>

      <ApprovedChip
        cam={cam}
        camStart={camAt(S10.whipStart)}
        camEnd={camAt(S10.whipEnd)}
        popAt={S10.chipPop}
        moveStart={S10.whipStart}
        moveEnd={S10.whipEnd}
        ease={whipProgress}
        fromLeo={{ x: -50, y: mid(UI.approveFinal).y }}
        toMaya={mid(UI.feedTopChipApproved)}
      />

      <TypeZone style={tzStyle}>
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
            <HighlightLine
              fontSize={128}
              hlAt={S10.hl}
              exitAt={S10.typeExit + 4}
              tail="."
              words={[
                { text: "go", at: S10.tGo },
                { text: "to", at: S10.tTo },
                { text: "the", at: S10.tThe },
                { text: "group", at: S10.tGroup },
              ]}
            />
          </div>
        ) : null}
        {f >= S10.tNeeds && f < S10.type2Exit + 16 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <BigType fontSize={104} exitAt={S10.type2Exit} words={[{ text: "needs", at: S10.tNeeds }]} />
            <BigType
              fontSize={210}
              exitAt={S10.type2Exit + 2}
              thesis={[0]}
              words={[{ text: "2 of 3", at: S10.tTwoOfThree, hl: S10.hlTwoOfThree }]}
            />
          </div>
        ) : null}
        {f >= S10.tLeo && f < S10.leoTypeExit + 20 ? (
          <BigType
            fontSize={112}
            exitAt={S10.leoTypeExit}
            words={[
              { text: "Leo", at: S10.tLeo },
              { text: "approves,", at: S10.tApproves },
              { text: "right", at: S10.tRight, br: true },
              { text: "from", at: S10.tFrom },
              { text: "a", at: S10.tA },
              { text: "notification.", at: S10.tNotification, br: true },
            ]}
          />
        ) : null}
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
      <Sfx name="whoosh-long" at={S10.flightStart + 5} volume={0.55} />
      <Sfx name="notif" at={S10.flightEnd} volume={0.6} />
      <Sfx name="swoosh-up" at={S10.approveIn - 2} volume={0.45} />
      <Sfx name="click" at={S10.approveTouch + 2} volume={0.6} />
      <Sfx name="whoosh-fast" at={S10.whipStart + 4} volume={0.35} />
    </AbsoluteFill>
  );
};
