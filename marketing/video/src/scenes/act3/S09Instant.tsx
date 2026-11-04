// s09-instant (builder D, v2 = the app of Nov 3): "Small spends approve themselves. Eighty-four dollars for
// groceries? Pot checks the rules… approved, and paid back in seconds."
// One continuous shot in the Act 3 world on Maya's phone:
//   1. "Small spends / approve themselves." rises in the TypeZone; the round Spend action → "How much?" rises.
//   2. Keys 8, 4 on the voice ("This will be approved instantly"); [Next] → a blur-matched move into step 2:
//      Groceries 🛒 (+ the grocery sticker), Who gets paid: Me, the decision's ⓘ opens ("Anyone can spend up to $100
//      without asking."), press [Get $84 back].
//   3. "Checking Pot rules…" with the brand dots (blips), then a one-frame 0.7 snap toward the dots.
//   4. "approved": "Approved by Pot rules", the film's ONE marigold burst (light sparks), and the card BREAKS OUT
//      toward the lens while the world falls away behind it (the camera pull-back rides the same spring).
//   5. "paid back in seconds": "$84 sent to you" + Sent + Receipt ↗; the big MoneyRoll ticks $450.00 → $366.00 with
//      Maya's hero ("You'd get back $122"); the card drops back, Done, the sheet closes, the groceries row lands and
//      her Pot dollars tick $0.00 → $84.00 in the tab bar.
// Handoffs: frame 0 = s08's end (CAM.maya, PotScreen $450.00, FEED_FULL, no sheet, tab bar $0.00); last frame =
// s10's start (CAM.maya, PotScreen $366.00 · You'd get back $122 · put in $150, feedAfterGroceries(), no sheet,
// tab bar $84.00, empty TypeZone).
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import {
  BreakOut,
  Burst,
  DirectionalBlur,
  MoneyRoll,
  Sfx,
  breakoutLifted,
  clamp01,
  inOut,
  land,
  linear,
  softInOut,
  speedRamp,
  springAt,
  type CameraKey,
} from "../../motion";
import { FEED_FULL, PotScreen, RulesCapsule, SpendSheet, UiPiece, copy, easeStandard, feedAfterGroceries, type FeedGroup, type KeyName } from "../../ui";
import { TouchDot, pressAt } from "../../ui/atoms/Touch";
import { day } from "../../brand/tokens";
import { SANS } from "../../brand/fonts";
import type { SceneId } from "../../data/timeline";
import { CAM, PHONE_HOME, TypeZone, WorldPhone, WorldStage, useWorldCamera } from "../shared/world";
import { BigType, RiseIn, UI, WorldSticker, frameOn, localForScreen, mid, screenToLocal, smearAt, springEase, tickValue, worldOfScreen } from "./s09-shared";
import { S09, S09_BLIPS } from "./s09-timing";

export const S09_SCENES: SceneId[] = ["s09-instant"];

const ID: SceneId = "s09-instant";

// ─── Camera framings (screen point of Maya's phone → frame position, at a scale) ─────────────────────────────
const HOW = frameOn("maya", 195, 476, 1.36, 560, 540); // "How much?": the amount, the decision, [Next], the keypad
const HOW_B = frameOn("maya", 195, 484, 1.4, 560, 540); // + a creep while the keys go in
const DET = frameOn("maya", 195, 590, 1.42, 560, 560); // step 2: $84 · chips · Who gets paid: Me · the footer
const DET_B = frameOn("maya", 195, 596, 1.46, 560, 560);
const DET_OPEN = frameOn("maya", 195, 612, 1.66, 600, 560); // the decision opened + [Get $84 back], readable
const DET_OPEN_B = frameOn("maya", 195, 616, 1.7, 600, 560);
const CHECK_A = frameOn("maya", 195, 762, 1.72, 640, 690); // the result block: $84.00 · Groceries · capsule (caption strip free)
const CHECK_B = frameOn("maya", 195, 758, 1.78, 640, 690); // + a slow creep while the dots pulse (text ≥ 28 px)
const DOTS = mid(UI.checkingDots);
const SNAP_A = frameOn("maya", DOTS.x, DOTS.y, 2.47, 370, 760); // the 0.7 snap: ×1.39 in 1 f about the dots (they stay put)
const SNAP_B = frameOn("maya", DOTS.x, DOTS.y, 2.54, 380, 752);
const HERO_A = frameOn("maya", 195, 422, 1.06, 520, 520); // the world falls back; the card floats in front
const HERO_B = frameOn("maya", 195, 422, 1.085, 520, 520);
/** Where the lifted card floats (screen px, at HERO_A): upper right, clear of the phone and of the money block. */
const CARD_UP = { ...localForScreen("maya", 930, 330, 240, HERO_A), z: 240, scale: 1.9 };

/** The pull-back follows the breakout's own {150, 20} spring, so the card holds its size while the world recedes. */
const pullEase = springEase(S09.pullBack, (f) => springAt(f, 0, "breakout"));

const CAMERA: CameraKey[] = [
  { at: 0, ...CAM.maya },
  // a slow creep from frame 0 (zero velocity at the cut), so the seam holds no more than ~12 f of pure drift
  { at: S09.pushStart, ...CAM.maya, scale: 1.035, cx: 10, ease: softInOut },
  { at: S09.pushEnd, ...HOW, ease: inOut },
  { at: S09.stepMoveStart, ...HOW_B, ease: softInOut },
  // blur-matched step move (monotonic, speedRamp): "How much?" → details switches at peak speed
  { at: S09.stepMoveEnd, ...DET, ease: speedRamp },
  { at: S09.infoTouch, ...DET_B, ease: linear },
  { at: S09.openEnd + 8, ...DET_OPEN, ease: inOut },
  { at: S09.reframeStart, ...DET_OPEN_B, ease: linear },
  // blur-matched move to the result: "Checking Pot rules…" switches in at peak speed
  { at: S09.reframeEnd, ...CHECK_A, ease: speedRamp },
  { at: S09.snap - 1, ...CHECK_B, ease: linear },
  { at: S09.snap, ...SNAP_A, ease: linear },
  { at: S09.approved, ...SNAP_B, ease: land },
  { at: S09.approved + S09.pullBack, ...HERO_A, ease: pullEase },
  { at: S09.cardReturn, ...HERO_B, ease: linear },
  { at: S09.camHome, ...CAM.maya, ease: inOut },
];

// ─── Small helpers ──────────────────────────────────────────────────────────────
/** UI-kit press curve for a finger landing at `at` (in 5 f, hold 2 f, out 11 f). */
const press = (f: number, at: number) => pressAt(f - at);
/** A touch dot that lifts off quickly (5 f), so it never lingers over what the tap opens. */
const dot = (f: number, at: number) => pressAt(f - at, { outFrames: 5 });

/** Breakout slots: the approved capsule (no footer) and, once the Done footer and the receipt are in, the sent one. */
const SLOT_APPROVED = screenToLocal(mid(UI.approvedCapsule).x, mid(UI.approvedCapsule).y);
const SLOT_SENT = screenToLocal(mid(UI.sentCapsule).x, mid(UI.sentCapsule).y);

/** The ⓘ of the details footer's decision line (44 px button at its right end). */
const INFO = { x: UI.detDecision.x + UI.detDecision.w - 24, y: mid(UI.detDecision).y };

// ─── Maya's phone screen ────────────────────────────────────────────────────────
const MayaScreen: React.FC<{ f: number }> = ({ f }) => {
  // Pot screen: $450.00 → (tick on "paid") → $366.00; "You'd get back" follows; the groceries row lands and the tab
  // bar's Pot dollars tick $0.00 → $84.00 as the sheet clears.
  const balance = tickValue(f, 450, 366, S09.tick);
  const share = Math.round(balance / 3);
  const myDollars = tickValue(f, 0, 84, S09.tabTick, 24, 12);
  const a = easeStandard(clamp01((f - S09.feedIn) / 22));
  const feed: FeedGroup[] = f < S09.feedIn ? FEED_FULL : [{ ...feedAfterGroceries(a)[0], appear: a }, ...FEED_FULL];
  const spendP = press(f, S09.spendTouch);

  // Spend sheet, step by step.
  let sheet: React.ReactNode = null;
  const lifted = breakoutLifted(f, S09.approved, S09.cardReturn);
  if (f >= S09.sheetIn && f < S09.details) {
    // step 1: "How much?" — 8, 4 on the voice, then [Next]
    const typed = f < S09.key8 + 2 ? "" : f < S09.key4 + 2 ? "8" : "84";
    const keyAt = f < S09.key4 ? S09.key8 : S09.key4;
    const pressedKey: KeyName | null = f >= S09.key8 && f < S09.key4 + 20 ? (f < S09.key4 ? "8" : "4") : null;
    const pop = f >= keyAt + 2 ? 1 + 0.04 * Math.sin(Math.PI * clamp01((f - keyAt - 2) / 10)) : 1;
    sheet = (
      <SpendSheet
        step="howMuch"
        progress={clamp01((f - S09.sheetIn) / 22)}
        typed={typed}
        pressedKey={pressedKey}
        keyPress={press(f, keyAt)}
        amountPop={pop}
        ctaPress={press(f, S09.nextTouch)}
      />
    );
  } else if (f >= S09.details && f < S09.checking) {
    // step 2: Groceries · Who gets paid: Me · the decision's ⓘ opens · [Get $84 back]
    sheet = (
      <SpendSheet
        step="details"
        typed="84"
        category={f >= S09.chipSelect ? "groceries" : null}
        categorySelect={Math.min(1, springAt(f, S09.chipSelect, "uiPop"))}
        chipsScrollX={0}
        pressedChip="groceries"
        chipPress={press(f, S09.chipTouch)}
        payee="me"
        decisionOpen={easeStandard(clamp01((f - S09.openStart) / (S09.openEnd - S09.openStart)))}
        ctaPress={press(f, S09.ctaTouch)}
      />
    );
  } else if (f >= S09.checking && f < S09.approved) {
    sheet = <SpendSheet step="checking" amount={84} category="groceries" dotsFrame={f - S09.checking} />;
  } else if (f >= S09.approved && f < S09.sheetOut + 18) {
    const step = f < S09.sending ? "approved" : f < S09.sent ? "sending" : "sent";
    const out = clamp01((f - S09.sheetOut) / 17);
    sheet = (
      <SpendSheet
        step={step}
        amount={84}
        category="groceries"
        capsuleTint={easeStandard(clamp01((f - S09.approved) / 12))}
        checkPop={clamp01((f - S09.approved) / 19)}
        hideCapsule={lifted}
        footerAppear={step === "approved" ? 0 : clamp01((f - S09.sending) / 17)}
        statusAppear={step === "sent" ? clamp01((f - S09.sent) / 10) : clamp01((f - S09.sending - 6) / 10)}
        donePress={press(f, S09.doneTouch)}
        progress={f < S09.sheetOut ? 1 : 1 - out}
        exiting={f >= S09.sheetOut}
      />
    );
  }

  const key = (k: string) => mid(UI.key[k]);
  const form = f < S09.checking;
  return (
    <>
      <PotScreen
        balance={balance}
        yourShare={share}
        putIn={150}
        feed={feed}
        tabBar={{ active: "pots", balance: myDollars }}
        press={spendP > 0 ? { target: "spend", amount: spendP } : null}
      />
      {sheet}
      <TouchDot press={dot(f, S09.spendTouch)} x={mid(UI.potActionSpend).x + 3} y={mid(UI.potActionSpend).y + 3} />
      <TouchDot press={form ? press(f, S09.key8) : 0} x={key("8").x + 4} y={key("8").y + 3} />
      <TouchDot press={form ? press(f, S09.key4) : 0} x={key("4").x + 4} y={key("4").y + 3} />
      <TouchDot press={form ? dot(f, S09.nextTouch) : 0} x={mid(UI.howNext).x + 10} y={mid(UI.howNext).y + 2} />
      <TouchDot press={form ? dot(f, S09.chipTouch) : 0} x={mid(UI.detChipGroceries).x} y={mid(UI.detChipGroceries).y + 2} />
      <TouchDot press={form ? dot(f, S09.infoTouch) : 0} x={INFO.x} y={INFO.y} />
      <TouchDot press={form ? dot(f, S09.ctaTouch) : 0} x={mid(UI.detCta).x + 10} y={mid(UI.detCta).y + 2} />
      <TouchDot press={f >= S09.approved ? dot(f, S09.doneTouch) : 0} x={mid(UI.sentDone).x + 8} y={mid(UI.sentDone).y + 2} />
    </>
  );
};

// ─── The approved card (breakout twin) + the hero burst ─────────────────────────
const ApprovedTwin: React.FC<{ f: number }> = ({ f }) => (
  <div style={{ position: "relative" }}>
    <UiPiece theme="day" width={358}>
      <RulesCapsule state="approved" tint={easeStandard(clamp01((f - S09.approved) / 12))} checkPop={clamp01((f - S09.approved) / 19)} />
    </UiPiece>
    {/* the brand's one celebration: 12 light marigold sparks, 12-16 px ON SCREEN at launch (the card sits at
        ≈ 2.4-2.7× on screen → scale 0.40), no rim, no streak (sparks, never coins), 36 f, fading from 40 % */}
    <Burst at={S09.approved} variant="hero" scale={0.4} r0={18} seed="s09-approved" />
  </div>
);

// ─── The scene ──────────────────────────────────────────────────────────────────
export const S09Instant: React.FC = () => {
  const f = useCurrentFrame();
  const cam = useWorldCamera(ID, CAMERA);
  // blur-matched moves (step 1 → 2, and the form → the result): the stage smears along the move
  const smear = smearAt(f, CAMERA, [worldOfScreen("maya", 195, 160), worldOfScreen("maya", 195, 600), worldOfScreen("maya", 195, 820)], [
    [S09.stepMoveStart - 1, S09.stepMoveEnd + 1],
    [S09.reframeStart - 1, S09.reframeEnd + 1],
  ]);
  // The return slot moves up with the Done footer and the receipt while the card is lifted, so it drops back exactly.
  const slotY = SLOT_APPROVED.y + (SLOT_SENT.y - SLOT_APPROVED.y) * easeStandard(clamp01((f - S09.sending) / 17));

  return (
    <AbsoluteFill style={{ background: day.ground }}>
      <DirectionalBlur x={smear.x} y={smear.y}>
        <WorldStage pose={cam}>
          <WorldPhone who="maya" screen={<MayaScreen f={f} />}>
            <BreakOut
              at={S09.approved}
              returnAt={S09.cardReturn}
              from={{ x: SLOT_APPROVED.x, y: slotY, z: 2 }}
              to={CARD_UP}
              face={PHONE_HOME}
              radius={16}
            >
              <ApprovedTwin f={f} />
            </BreakOut>
          </WorldPhone>
          <WorldSticker name="groceries" x={-10} y={-40} z={80} width={250} at={S09.sticker} outAt={S09.stickerOut} rotate={7} />
        </WorldStage>
      </DirectionalBlur>

      <TypeZone style={f >= S09.moneyIn ? { justifyContent: "flex-end", paddingBottom: 130 } : undefined}>
        {f < S09.typeExit + 20 ? (
          <BigType
            fontSize={132}
            exitAt={S09.typeExit}
            words={[
              { text: "Small", at: S09.tSmall },
              { text: "spends", at: S09.tSpends },
              { text: "approve", at: S09.tApprove, br: true, hl: S09.hlApprove },
              { text: "themselves.", at: S09.tThemselves, br: true, hl: S09.hlThemselves },
            ]}
          />
        ) : null}
        {f >= S09.moneyIn && f < S09.moneyExit + 14 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <RiseIn at={S09.moneyIn} exitAt={S09.moneyExit}>
              <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 44, lineHeight: "56px", color: day.inkMuted, paddingLeft: 6 }}>{copy["pot.hero.label"]}</div>
            </RiseIn>
            <RiseIn at={S09.moneyIn + 4} exitAt={S09.moneyExit + 2}>
              <MoneyRoll from={450} to={366} at={S09.tick} fontSize={180} />
            </RiseIn>
          </div>
        ) : null}
      </TypeZone>

      {/* Sound: sparse, on the events (cue volumes 0.3-0.8; the director's SFX master scales them). */}
      <Sfx name="swoosh-up" at={S09.sheetIn - 2} volume={0.5} />
      <Sfx name="keypad" at={S09.key8 + 1} volume={0.3} />
      <Sfx name="keypad" at={S09.key4 + 1} volume={0.3} />
      <Sfx name="pop" at={S09.chipSelect} volume={0.5} />
      <Sfx name="blips" at={S09_BLIPS} volume={0.45} />
      <Sfx name="success" at={S09.approved} volume={0.75} />
      <Sfx name="burst" at={S09.approved} volume={0.6} />
    </AbsoluteFill>
  );
};
