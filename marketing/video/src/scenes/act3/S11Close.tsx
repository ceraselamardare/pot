// s11-close (builder E): "When the trip's over, close the Pot. Everyone gets their fair share back."
// Act 3 world (CAM.maya, Maya's phone). Frame 0 = the s10 handoff: PotScreen $66.00, feedAfterBoat(), no sheet.
//   ⋮ → the app's menu → "Close Pot" → the CloseSheet ("Close Lisbon Trip?", "$66.00 left · split by …")
//   → on "gets … fair share back" the RefundTable BREAKS OUT; its rows land 3-4 f apart and each "Gets back"
//     counts up to $22.00 → "$22.00 each." in the TypeZone → "Ask the group to close" → Pot closed
//   → accent 3: the screen goes Night in 1 f, a Night rect grows from the screen to the full frame, and the
//     phone (now x-ray line-art) starts turning to isometric. S12Tech continues the same rig (act4/xray.tsx).
import { Check } from "lucide-react";
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
import { CloseSheet, copy, defaultRefundRows, feedAfterBoat, feedClosed, LAYOUT, MAYA, PotScreen, SCREEN_RADIUS, UiPiece } from "../../ui";
import { pressAt, TouchDot } from "../../ui/atoms/Touch";
import { day, night } from "../../brand/tokens";
import { SANS } from "../../brand/fonts";
import { STICKERS } from "../../data/stickers";
import type { SceneId } from "../../data/timeline";
import { cardOffset, PHONE_HOME, PHONE_SCALE, TypeZone, useWorldCamera, WorldPhone, WorldStage } from "../shared";
import { S11, S11_CAMERA_KEYS } from "./s11-timing";
import { S11_DOTS, S11_MENU_CLOSE_ITEM, S11DotsPressed, S11OverflowMenu } from "./s11-menu";
import { S11RefundTable, tickValue, type RowState } from "./s11-refund";
import { closeTimeline, S11ApprovalsCard, S11ClosedLine } from "./s11-approvals";
import { gFromS11, screenRectAt, XR, XrayScene } from "../act4/xray";

export const S11_SCENES: SceneId[] = ["s11-close"];

const ROWS = defaultRefundRows(22, 150); // Maya, Sam, Leo: put in $150.00, get back $22.00
const PROPOSE_SLOT = cardOffset(LAYOUT.closeProposeTable);
/** Lifted pose of the refund twin (phone px from the phone's centre): up a touch and toward the left, so the
 *  TypeZone (x ≥ 900) stays clear and the sheet's CTA stays visible underneath. */
const TWIN_TO = { x: -34, y: 4, z: 240, scale: 1.48 };
/** Padding the twin's card grows as it lifts (it reads as a card off the sheet). The twin starts 1.5 px in front
 *  of the screen plane (the phone face sits at z 0.5), so it wins the depth test on the swap frame. */
const TWIN_PAD = 18;
/** "Ask the group to close" in screen px (the sheet's primary footer button). */
const CTA_AT = { x: 195, y: 712 };
/** Type side (TypeZone column, screen px): the answer sits centred, then rises to make room for the slot below. */
const TYPE_X = 900;
const ANSWER_TOP_CENTRED = 465;
const ANSWER_TOP_RAISED = 196;
const LOWER_TOP = 392;
/** The "Pot closed" hold: the answer settles back down and the closed line sits under it (block centred). */
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

/** The twin's rows: they dip and land 3-4 f apart as the table lifts; each "Gets back" counts up to $22.00. */
const rowStates = (f: number): RowState[] =>
  S11.rowLand.map((at, i) => {
    const target = ROWS[i].back;
    if (f < at - 2) return { land: 1, back: target };
    // a 2 f dip (fade + drop) masks the reset; the row then lands over 14 f while its value counts up
    if (f < at) return { land: 1 - (f - (at - 2) + 1) / 2, back: target };
    return { land: ramp(f, at, at + 14, land), back: tickValue(f - at, 0, target, S11.countDur) };
  });

export const S11Close: React.FC = () => {
  const f = useCurrentFrame();
  const g = gFromS11(f);
  const cam = useWorldCamera("s11-close", S11_CAMERA_KEYS);

  const screenOff = f >= S11.screenOff;
  const rectT = inOut(clamp01((f - (S11.screenOff + 1)) / XR.rectFrames));
  const nightFull = f >= S11.screenOff + 1 + XR.rectFrames;

  // ── app state: propose → (press) → waiting (1 of 2) → Sam approves (2 of 2) → closed ──
  const closed = f >= S11.closedAt;
  const waiting = !closed && f >= S11.waitingAt;
  const samApproved = f >= S11.samApproves;
  const samPop = clamp01((f - S11.samApproves) / 19); // the kit's pot-pop (320 ms)
  const menuOpenP = uiEase.standard(clamp01((f - S11.menuOpen) / 7));
  const menuCloseP = uiEase.exit(clamp01((f - S11.menuClose) / 7));
  const menuOpen = f < S11.menuClose ? menuOpenP : 1 - menuCloseP;
  const dotsPress = pressAt(f - S11.dotsPress);
  const itemPress = pressAt(f - S11.itemPress);
  const ctaPress = pressAt(f - S11.ctaPress);
  const sheetP = clamp01((f - S11.sheetIn) / 22);
  const lifted = breakoutLifted(f, S11.breakout, S11.breakoutReturn);
  const lift = liftAt(f);

  const screen = screenOff ? null : (
    <PotScreen
      balance={closed ? 0 : 66}
      yourShare={closed ? 0 : 22}
      putIn={150}
      feed={closed ? feedClosed() : feedAfterBoat()}
      closed={closed ? { date: "Oct 22", refund: 22 } : null}
    >
      <S11DotsPressed amount={Math.max(dotsPress, menuOpen)} />
      <TouchDot press={dotsPress} x={S11_DOTS.x} y={S11_DOTS.y} />
      <S11OverflowMenu open={menuOpen} highlight={f >= S11.itemPress - 1 ? ramp(f, S11.itemPress - 1, S11.itemPress + 3) : 0} />
      <TouchDot press={itemPress} x={S11_MENU_CLOSE_ITEM.x} y={S11_MENU_CLOSE_ITEM.y} />
      <CloseSheet
        progress={sheetP}
        mode={closed ? "closed" : waiting ? "waiting" : "propose"}
        rows={ROWS}
        timeline={closeTimeline(samApproved, samPop)}
        ctaPress={closed || waiting ? 0 : ctaPress}
        badgePop={closed ? clamp01((f - S11.closedAt) / 19) : 1}
        hideTable={lifted}
      />
      <TouchDot press={ctaPress} x={CTA_AT.x} y={CTA_AT.y} />
    </PotScreen>
  );

  // ── the refund twin (sibling of the phone, BreakOut + UiPiece) ───────────────
  const twin = lifted ? (
    <BreakOut
      at={S11.breakout}
      returnAt={S11.breakoutReturn}
      from={{ x: PROPOSE_SLOT.x, y: PROPOSE_SLOT.y, z: 1.5 }}
      to={TWIN_TO}
      face={PHONE_HOME}
      radius={24}
      style={{ background: day.surface, padding: TWIN_PAD * clamp01(lift) }}
    >
      <UiPiece theme="day" width={358}>
        <S11RefundTable
          rows={ROWS}
          me={MAYA.id}
          caption={copy["close.table.caption"]}
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

  // type side: "$22.00 each." rises centred, then moves up to make room for the approvals twin
  const raiseT = ramp(f, S11.waitingAt - 2, S11.waitingAt + 18, land);
  const cardIn = ramp(f, S11.waitingAt + 2, S11.waitingAt + 18, land);
  const cardOut = ramp(f, S11.closedAt - 4, S11.closedAt + 4, exitEase);
  // "Pot closed": the answer settles back to the centre and the closed line pops in under it
  const settleT = ramp(f, S11.closedAt + 2, S11.closedAt + 24, land);
  const linePop = springAt(f, S11.closedAt + 4, "uiPop");

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

          {/* Phase 1: the VO line, word by word */}
          {f < S11.typeOut + 24 ? (
            <TypeZone>
              <WordRise
                words={PHASE1}
                fontSize={92}
                align="left"
                lineHeight={1.04}
                letterSpacing="-0.02em"
                exit={{ at: S11.typeOut, stagger: 2, duration: 7 }}
              />
            </TypeZone>
          ) : null}

          {/* Phase 2: the answer, then the group's approvals and the closed line (fixed slots: nothing reflows) */}
          {f >= S11.bigType - 2 ? (
            <AbsoluteFill style={{ pointerEvents: "none" }}>
              <div style={{ position: "absolute", left: TYPE_X, top: lerp(lerp(ANSWER_TOP_CENTRED, ANSWER_TOP_RAISED, raiseT), ANSWER_TOP_FINAL, settleT) }}>
                <WordRise
                  words={PHASE2}
                  fontSize={150}
                  align="left"
                  letterSpacing="-0.025em"
                  style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}
                  renderWord={(text, i) => (i === 0 ? <HighlightBar at={S11.barAt}>{text}</HighlightBar> : text)}
                />
              </div>
              {cardIn > 0.001 && cardOut < 0.999 ? (
                <div
                  style={{
                    position: "absolute",
                    left: TYPE_X,
                    top: LOWER_TOP,
                    transform: `translateY(${(1 - cardIn) * 36 + cardOut * 24}px)`,
                    opacity: Math.min(ramp(f, S11.waitingAt, S11.waitingAt + 10), 1 - cardOut),
                    filter: cardIn < 0.98 ? `blur(${(8 * (1 - cardIn)).toFixed(2)}px)` : undefined,
                  }}
                >
                  <S11ApprovalsCard samApproved={samApproved} samPop={samPop} />
                </div>
              ) : null}
              {f >= S11.closedAt + 4 ? (
                <div
                  style={{
                    position: "absolute",
                    left: TYPE_X,
                    top: CLOSED_LINE_TOP,
                    transform: `scale(${Math.max(0, linePop)})`,
                    transformOrigin: "0% 50%",
                    opacity: ramp(f, S11.closedAt + 4, S11.closedAt + 10),
                  }}
                >
                  <S11ClosedLine refund={22} />
                </div>
              ) : null}
            </AbsoluteFill>
          ) : null}

          {/* One sticker: the trip's over (sunglasses), off the phone's edge, gone when the type clears */}
          <AbsoluteFill style={{ pointerEvents: "none" }}>
            <div style={{ position: "absolute", left: 1490, top: 262, width: 280 }}>
              <StickerPop at={S11.wOver - 10} outAt={S11.typeOut} rotate={-8} inline={false}>
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
          <Grain opacity={0.28} />
          <Vignette strength={0.08} theme="night" />
        </AbsoluteFill>
      ) : null}

      {/* Sound (sparse): sheet swoosh, a soft pop per landing row, the CTA click, a soft pop when Sam approves and
          when the Pot closes (a group approval: no burst), the screen-off whoosh */}
      <Sfx name="swoosh-up" at={S11.sheetIn - 2} volume={0.28} />
      {S11.rowLand.map((at) => (
        <Sfx key={at} name="pop-soft" at={at} volume={0.16} />
      ))}
      <Sfx name="click" at={S11.ctaPress} volume={0.4} />
      <Sfx name="pop-soft" at={S11.samApproves} volume={0.2} />
      <Sfx name="pop-soft" at={S11.closedAt + 4} volume={0.16} />
      <Sfx name="whoosh-fast" at={S11.screenOff + 2} volume={0.25} />
    </AbsoluteFill>
  );
};
