// s11-close (builder E, v2): "When the trip's over, close the Pot. Everyone gets their fair share back."
// Act 3 world (CAM.maya, Maya's phone). Frame 0 = the s10b handoff: PotScreen $66.00 ("You'd get back $22"),
// feedAfterBoat() (one OK), no sheet, Maya's Pot dollars $384.00 in the tab bar.
//   the round More action → the MoreSheet → "Close Pot" → the CloseSheet ("Close Lisbon Trip?") → on "close the Pot"
//   "Ask the group to close" → "Approvals · 1 of 2" → Sam approves → "2 of 2" (held, with the readable twin) → on
//   "gets … fair share back" the RefundTable BREAKS OUT holding $22.00 each (the sheet's own values: no re-roll);
//   each "Gets back" gets a brief brand-soft emphasis 3-4 f apart → "$22.00 each." in the TypeZone → Pot closed
//   ("$22.00 is in your Pot account.", Maya's dollars $406.00)
//   → accent 3 on the music's bar line: the screen goes Night in 1 f, a Night rect grows from the screen to the full
//     frame, and the phone (now x-ray line-art) starts turning to isometric. S12Tech continues the same rig.
import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from "remotion";
import {
  BreakOut,
  BREAKOUT_RETURN_FRAMES,
  breakoutLifted,
  clamp01,
  exit as exitEase,
  Grain,
  HighlightBar,
  inOut,
  land,
  lerp,
  ramp,
  Sfx,
  springAt,
  StickerPop,
  uiEase,
  Vignette,
  voLanding,
  WordRise,
  type TimedWord,
} from "../../motion";
import { CloseSheet, copy, defaultRefundRows, feedAfterBoat, feedClosed, MAYA, MoreSheet, PotScreen, SCREEN_RADIUS, UiPiece, useUi } from "../../ui";
import { pressAt, TouchDot } from "../../ui/atoms/Touch";
import { day, night } from "../../brand/tokens";
import { STICKERS } from "../../data/stickers";
import type { SceneId } from "../../data/timeline";
import { cardOffset, PHONE_HOME, PHONE_SCALE, useWorldCamera, WorldPhone, WorldStage } from "../shared";
import { S11, S11_CAMERA_KEYS } from "./s11-timing";
import { S11RefundTable, type RowState } from "./s11-refund";
import { closeTimeline, S11ApprovalsCard, S11ClosedLine } from "./s11-approvals";
import { gFromS11, screenRectAt, XR, XrayScene } from "../act4/xray";

export const S11_SCENES: SceneId[] = ["s11-close"];

const ROWS = defaultRefundRows(22, 150); // Maya, Sam, Leo: put in $150.00, get back $22.00
/** The refund table's rect in the CloseSheet (screen px, measured with act4/preview/Measure.tsx): the "waiting"
 *  sheet at 2 of 2 (the lift; its one-line "Approved by Maya and Sam" note makes the sheet 24 px shorter than at
 *  1 of 2) and the "closed" sheet (= LAYOUT.closedTable, the return). */
const WAITING_TABLE = { x: 16, y: 223.69, w: 358, h: 249.31 };
const CLOSED_TABLE = { x: 16, y: 467.69, w: 358, h: 249.31 };
const WAITING_SLOT = cardOffset(WAITING_TABLE);
const CLOSED_SLOT = cardOffset(CLOSED_TABLE);
/** Lifted pose of the refund twin (phone px from the phone's centre): centred on the phone, a touch left, so the
 *  TypeZone (x ≥ 900) stays clear. */
const TWIN_TO = { x: -34, y: 4, z: 240, scale: 1.48 };
/** Padding the twin's card grows as it lifts (it reads as a card off the sheet). The twin starts 1.5 px in front
 *  of the screen plane (the phone face sits at z 0.5), so it wins the depth test on the swap frame. */
const TWIN_PAD = 18;
/** "Ask the group to close" (the propose sheet's primary button) in screen px. */
const CTA_AT = { x: 195, y: 716 };
/** Maya's Pot dollars (the tab bar): $384.00 after the boat → $406.00 once her $22.00 comes back. */
const DOLLARS = { before: 384, after: 406 };

/** Type side (TypeZone column, screen px). */
const TYPE_X = 900;
/** Phase 1 (the VO line) sits centred, then rises to make room for the approvals twin. */
const LINE_TOP_CENTRED = 444;
const LINE_TOP_RAISED = 150;
const TWIN_TOP = 392;
/** The answer rises centred, then settles up for the closed line under it. */
const ANSWER_TOP_CENTRED = 465;
const ANSWER_TOP_FINAL = 396;
const CLOSED_LINE_TOP = 590;

const PHASE1: TimedWord[] = [
  { text: "When", startFrame: voLanding(S11.wWhen) },
  { text: "the", startFrame: voLanding(S11.wThe) },
  { text: "trip's", startFrame: voLanding(S11.wTrips) },
  { text: "over,", startFrame: voLanding(S11.wOver) },
  { text: "close", startFrame: voLanding(S11.wClose), breakBefore: true },
  { text: "the", startFrame: voLanding(S11.wThe2) },
  { text: "Pot.", startFrame: voLanding(S11.wPot) },
];

const PHASE2: TimedWord[] = [
  { text: "$22.00", startFrame: S11.bigType },
  { text: "each.", startFrame: S11.bigTypeEach },
];

/** Lift progress of the BreakOut (same curve as the kit's BreakOut: breakout spring up, `exit` down). */
const liftAt = (f: number) =>
  springAt(f, S11.breakout, "breakout") * (1 - exitEase(clamp01((f - S11.breakoutReturn) / BREAKOUT_RETURN_FRAMES)));

/** The twin's rows lift holding the sheet's values ($22.00 each: no re-roll); 3-4 f apart, each "Gets back" gets a
 *  brief brand-soft emphasis (10 f wipe), which clears while the twin settles back into the sheet. */
const rowStates = (f: number): RowState[] =>
  S11.rowLand.map((at, i) => ({
    land: 1,
    back: ROWS[i].back,
    emph: ramp(f, at, at + 10, land) * (1 - ramp(f, S11.breakoutReturn, S11.breakoutReturn + 12, inOut)),
  }));

/** One scrim for the two sheets (More, then Close), so the hand-over never double-darkens: the kit's scrim colour
 *  at the larger of the two sheets' scrim curves (ease-standard in, ease-exit out, as the Sheet draws them). */
const SheetScrim: React.FC<{ amount: number }> = ({ amount }) => {
  const { scrim } = useUi();
  if (amount <= 0.001) return null;
  return <div style={{ position: "absolute", inset: 0, zIndex: 39, background: scrim, opacity: amount }} />;
};

export const S11Close: React.FC = () => {
  const f = useCurrentFrame();
  const g = gFromS11(f);
  const cam = useWorldCamera("s11-close", S11_CAMERA_KEYS);

  const screenOff = f >= S11.screenOff;
  const rectT = inOut(clamp01((f - (S11.screenOff + 1)) / XR.rectFrames));
  const nightFull = f >= S11.screenOff + 1 + XR.rectFrames;

  // ── app state ────────────────────────────────────────────────────────────────
  const closed = f >= S11.closedAt;
  const waiting = !closed && f >= S11.waitingAt;
  const samApproved = f >= S11.samApproves;
  const samPop = clamp01((f - S11.samApproves) / 19); // the kit's pot-pop (320 ms)
  const morePress = pressAt(f - S11.morePress);
  const closeItemPress = pressAt(f - S11.closeItemPress);
  const ctaPress = pressAt(f - S11.ctaPress);
  // the MoreSheet: in over 22 f (ease-enter), out over 17 f (ease-exit) as the CloseSheet takes over
  const moreIn = clamp01((f - S11.moreIn) / 22);
  const moreOut = clamp01((f - S11.moreOut) / 17);
  const moreProgress = f < S11.moreOut ? moreIn : 1 - moreOut;
  const moreScrim = f < S11.moreOut ? uiEase.standard(moreIn) : 1 - uiEase.exit(moreOut);
  const sheetP = clamp01((f - S11.sheetIn) / 22);
  const closeScrim = uiEase.standard(sheetP);
  const lifted = breakoutLifted(f, S11.breakout, S11.breakoutReturn);
  const lift = liftAt(f);
  const dollars = lerp(DOLLARS.before, DOLLARS.after, ramp(f, S11.closedAt + 4, S11.closedAt + 34, inOut));

  const screen = screenOff ? null : (
    <PotScreen
      balance={closed ? 0 : 66}
      yourShare={closed ? 0 : 22}
      putIn={150}
      feed={closed ? feedClosed() : feedAfterBoat()}
      closing={waiting}
      closed={closed ? { date: "Nov 3", refund: 22 } : null}
      press={f >= S11.morePress && f < S11.morePress + 20 ? { target: "more", amount: morePress } : null}
      touchDot
      tabBar={{ active: "pots", balance: dollars }}
    >
      <SheetScrim amount={Math.max(f < S11.moreOut + 17 ? moreScrim : 0, closeScrim)} />
      {moreProgress > 0 ? (
        <MoreSheet
          progress={moreProgress}
          exiting={f >= S11.moreOut}
          scrim={false}
          pressed={f >= S11.closeItemPress ? { target: "close", amount: closeItemPress } : null}
          touchDot
        />
      ) : null}
      <CloseSheet
        progress={sheetP}
        scrim={false}
        mode={closed ? "closed" : waiting ? "waiting" : "propose"}
        rows={ROWS}
        timeline={closeTimeline(samApproved, samPop)}
        ctaPress={closed || waiting ? 0 : ctaPress}
        badgePop={closed ? clamp01((f - S11.closedAt) / 19) : 1}
        hideTable={lifted}
      />
      {!waiting && !closed ? <TouchDot press={ctaPress} x={CTA_AT.x} y={CTA_AT.y} /> : null}
    </PotScreen>
  );

  // ── the refund twin (sibling of the phone, BreakOut + UiPiece) ───────────────
  const slot = closed ? CLOSED_SLOT : WAITING_SLOT;
  const twin = lifted ? (
    <BreakOut
      at={S11.breakout}
      returnAt={S11.breakoutReturn}
      from={{ x: slot.x, y: slot.y, z: 1.5 }}
      to={TWIN_TO}
      face={PHONE_HOME}
      radius={24}
      style={{ background: day.surface, padding: TWIN_PAD * clamp01(lift) }}
    >
      <UiPiece theme="day" width={358}>
        <S11RefundTable
          rows={ROWS}
          me={MAYA.id}
          caption={closed ? copy["close.table.caption.done"] : copy["close.table.caption"]}
          state={rowStates(f)}
        />
      </UiPiece>
    </BreakOut>
  ) : null;

  // ── the Night rect (screen → full frame) and the x-ray phone inside it ───────
  let nightClip: string | undefined;
  if (f >= S11.screenOff + 1) {
    const r0 = screenRectAt(S11.screenOff);
    const rad = SCREEN_RADIUS * PHONE_SCALE * r0.k;
    // insets under 2 px snap to 0 so the last growing frame leaves no cream hairline at the frame edge
    const snap = (v: number) => (v < 2 ? 0 : v);
    const top = snap(lerp(r0.top, 0, rectT));
    const left = snap(lerp(r0.left, 0, rectT));
    const right = snap(lerp(1920 - r0.right, 0, rectT));
    const bottom = snap(lerp(1080 - r0.bottom, 0, rectT));
    nightClip = `inset(${top}px ${right}px ${bottom}px ${left}px round ${lerp(rad, 0, rectT)}px)`;
  }

  // type side: the VO line rises centred, then makes room for the approvals twin; the answer comes later
  const lineRaise = ramp(f, S11.waitingAt - 2, S11.waitingAt + 18, land);
  const twinIn = ramp(f, S11.waitingAt + 2, S11.waitingAt + 18, land);
  const twinGone = ramp(f, S11.twinOut, S11.twinOut + 8, exitEase);
  const answerSettle = ramp(f, S11.closedAt + 2, S11.closedAt + 24, land);
  const linePop = springAt(f, S11.closedLine, "uiPop");

  return (
    <AbsoluteFill style={{ background: day.ground }}>
      {nightFull ? null : (
        <>
          <WorldStage pose={cam}>
            <WorldPhone
              who="maya"
              screen={screen}
              phoneProps={screenOff ? { showStatusBar: false, homeIndicator: false, screenBackground: night.ground } : undefined}
            >
              {twin}
            </WorldPhone>
          </WorldStage>

          {/* Phase 1: the VO line, word by word (centred, then raised above the approvals twin) */}
          {f < S11.typeOut + 24 ? (
            <AbsoluteFill style={{ pointerEvents: "none" }}>
              <div style={{ position: "absolute", left: TYPE_X, top: lerp(LINE_TOP_CENTRED, LINE_TOP_RAISED, lineRaise), width: 940 }}>
                <WordRise
                  words={PHASE1}
                  fontSize={92}
                  align="left"
                  lineHeight={1.04}
                  letterSpacing="-0.02em"
                  exit={{ at: S11.typeOut, stagger: 2, duration: 7 }}
                />
              </div>
            </AbsoluteFill>
          ) : null}

          {/* The group's approvals, readable: the twin of the sheet's waiting block (1 of 2 → Sam → 2 of 2) */}
          {twinIn > 0.001 && twinGone < 0.999 ? (
            <AbsoluteFill style={{ pointerEvents: "none" }}>
              <div
                style={{
                  position: "absolute",
                  left: TYPE_X,
                  top: TWIN_TOP,
                  transform: `translateY(${(1 - twinIn) * 36 + twinGone * 28}px)`,
                  opacity: Math.min(ramp(f, S11.waitingAt + 2, S11.waitingAt + 12), 1 - twinGone),
                  filter: twinIn < 0.98 ? `blur(${(8 * (1 - twinIn)).toFixed(2)}px)` : undefined,
                }}
              >
                <S11ApprovalsCard samApproved={samApproved} samPop={samPop} />
              </div>
            </AbsoluteFill>
          ) : null}

          {/* Phase 2: the answer, then the closed line (fixed slots: nothing reflows) */}
          {f >= S11.bigType - 2 ? (
            <AbsoluteFill style={{ pointerEvents: "none" }}>
              <div style={{ position: "absolute", left: TYPE_X, top: lerp(ANSWER_TOP_CENTRED, ANSWER_TOP_FINAL, answerSettle) }}>
                <WordRise
                  words={PHASE2}
                  fontSize={150}
                  align="left"
                  letterSpacing="-0.025em"
                  style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}
                  renderWord={(text, i) => (i === 0 ? <HighlightBar at={S11.barAt}>{text}</HighlightBar> : text)}
                />
              </div>
              {f >= S11.closedLine ? (
                <div
                  style={{
                    position: "absolute",
                    left: TYPE_X,
                    top: CLOSED_LINE_TOP,
                    transform: `scale(${Math.max(0, linePop)})`,
                    transformOrigin: "0% 50%",
                    opacity: ramp(f, S11.closedLine, S11.closedLine + 6),
                  }}
                >
                  <S11ClosedLine refund={22} />
                </div>
              ) : null}
            </AbsoluteFill>
          ) : null}

          {/* One sticker: the trip's over (sunglasses), off the phone's edge, gone when the approvals arrive */}
          <AbsoluteFill style={{ pointerEvents: "none" }}>
            <div style={{ position: "absolute", left: 1490, top: 262, width: 280 }}>
              <StickerPop at={S11.wOver - 10} outAt={S11.waitingAt - 4} rotate={-8} inline={false}>
                <Img src={staticFile(STICKERS.sunglasses.src)} style={{ width: 280, display: "block" }} />
              </StickerPop>
            </div>
          </AbsoluteFill>
        </>
      )}

      {/* Accent 3: the Night rect + the x-ray phone (continues in S12Tech) */}
      {nightClip ? (
        <AbsoluteFill style={{ clipPath: nightClip, background: night.ground }}>
          <XrayScene g={g} />
          <Grain opacity={0.35} />
          <Vignette strength={0.08} theme="night" />
        </AbsoluteFill>
      ) : null}

      {/* Sound (sparse): a tap on More, the sheet's swoosh, the CTA click, a soft pop when Sam approves (a group
          approval: no burst), a soft pop per landing row and for "Pot closed", the screen-off whoosh */}
      <Sfx name="tap" at={S11.morePress} volume={0.3} />
      <Sfx name="swoosh-up" at={S11.sheetIn - 2} volume={0.28} />
      <Sfx name="click" at={S11.ctaPress} volume={0.4} />
      <Sfx name="pop-soft" at={S11.samApproves} volume={0.2} />
      {S11.rowLand.map((at) => (
        <Sfx key={at} name="pop-soft" at={at} volume={0.16} />
      ))}
      <Sfx name="pop-soft" at={S11.closedLine} volume={0.16} />
      <Sfx name="whoosh-fast" at={S11.screenOff + 2} volume={0.25} />
    </AbsoluteFill>
  );
};
