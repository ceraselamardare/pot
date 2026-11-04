// Spend (apps/web/components/sheets/SpendSheet.tsx, two steps since 2026-11-01; one OK since hub 1.1.0). The rule is
// visible before, during and after the tap:
//  - "howMuch" (step 1): "How much?" + the typed amount, [📷 Scan receipt] · Choose a photo, the decision line
//    ("✓ This will be approved instantly ⓘ"), and the footer [Next] over the keypad;
//  - "details" (step 2): the amount ("$84"), "What's it for?" chips, "Who gets paid?" Me | A member | Someone else,
//    "+ Add a note (optional)", and the footer: the decision line, the ask ("Get $84 back" / "Ask for one OK" / "Ask
//    the group"), [‹ Back];
//  - "checking" → "approved" (brand-soft, the check pops, the one marigold burst) → "sending" → "sent" (+ Receipt ↗);
//  - "oneOkSent": "Sent · One OK from anyone else in the group and it's paid." (no timeline) + Receipt ↗;
//  - "voteSent": the group tier: "Sent to the group · Needs 2 of 3 approvals…" + Approvals · 1 of 2 + Receipt ↗.
//    A one-OK amount (≤ $300) shows the one-OK result here too, unless `tier="group"`.
// The tier follows the amount: instant ≤ $100 < one OK ≤ $300 < the group (override with `tier`).
// LEGACY steps "amount" / "vote" (the old single form) render the two-step form: step 1 while no reason is chosen and
// no chip is being pressed, step 2 from then on. Prefer "howMuch" / "details".
import { Camera, Check, Clock, Copy, Link2, Share2 } from "lucide-react";
import React from "react";
import { copy, reasonChip, CATEGORIES, type Category } from "../copy";
import { CREW, LISBON, MAYA, type Person } from "../data";
import { formatUsd, keypadDisplay } from "../format";
import { useUi } from "../theme";
import { T } from "../type";
import { AmountDisplay, Keypad, type KeyName } from "../atoms/Keypad";
import { Avatar } from "../atoms/Avatar";
import { Button } from "../atoms/Button";
import { Chip, Segmented } from "../atoms/Controls";
import { DecisionLine, decisionPath, type DecisionPath } from "../atoms/Decision";
import { MoneyText } from "../atoms/MoneyText";
import { ApprovalTimeline, timelineRows, type TimelineRow } from "../atoms/Approvals";
import { ReceiptLink } from "../atoms/CompactRow";
import { RulesCapsule, SpendResult } from "../atoms/ResultCards";
import { StatusChip } from "../atoms/StatusChip";
import { SendLinkCard } from "../screens/Links";
import { TypingDots } from "../atoms/TypingDots";
import type { SpendTier } from "../atoms/Feed";
import { Sheet, SheetBack, type SheetProps } from "./Sheet";

export type SpendStep = "howMuch" | "details" | "amount" | "vote" | "checking" | "approved" | "sending" | "sent" | "oneOkSent" | "voteSent";
/** LEGACY preview paths (the old RulePreview): "vote" = anything over the instant limit. */
export type PreviewPath = "empty" | "instant" | "vote";
export type Payee = "me" | "member" | "link";

export const previewPath = (amount: number, instantLimit: number): PreviewPath => (amount <= 0 ? "empty" : amount <= instantLimit ? "instant" : "vote");

/** LEGACY: the old full rule sentence card (the app's RulePreview, still used by the /demo explainer). */
export const RulePreview: React.FC<{ path: PreviewPath | DecisionPath; instantLimit?: number; k?: number; n?: number; style?: React.CSSProperties }> = ({
  path,
  instantLimit = LISBON.instantLimit,
  k = LISBON.k,
  n = LISBON.n,
  style,
}) => {
  const { c } = useUi();
  const limit = formatUsd(instantLimit, "whole");
  const p: DecisionPath = path === "vote" ? "group" : path;
  const [title, body] =
    p === "empty"
      ? [copy["preview.empty"](limit), null]
      : p === "instant"
        ? copy["preview.instant"](limit)
        : p === "one_ok"
          ? copy["preview.one_ok.over_cap"](limit)
          : copy["preview.vote.over_cap"](k, n, limit);
  return (
    <div style={{ display: "flex", minHeight: 64, alignItems: "flex-start", gap: 12, borderRadius: 16, background: c.surfaceSunken, padding: 12, boxSizing: "border-box", ...style }}>
      {p === "instant" ? (
        <Check size={20} strokeWidth={2} color={c.approved} style={{ display: "block", flexShrink: 0, marginTop: 2 }} aria-hidden />
      ) : p === "one_ok" || p === "group" ? (
        <Clock size={20} strokeWidth={2} color={c.waiting} style={{ display: "block", flexShrink: 0, marginTop: 2 }} aria-hidden />
      ) : null}
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, ...(body ? T.label : T.bodySm), color: body ? c.ink : c.inkMuted }}>{title}</p>
        {body ? <p style={{ margin: "2px 0 0", ...T.bodySm, color: c.inkMuted }}>{body}</p> : null}
      </div>
    </div>
  );
};

export type SpendSheetProps = Omit<SheetProps, "children" | "footer" | "title"> & {
  step: SpendStep;
  potName?: string;
  /** Keypad string ("", "8", "84"). Defaults: "84" (amount, howMuch, details) / "300" (vote). */
  typed?: string;
  /** Amount for the result steps (dollars). Defaults to the typed amount. Interpolate for the 500 ms roll. */
  amount?: number;
  /** Selected reason chip (null = none). Defaults: groceries ($84) / tickets ($300) once an amount is typed. */
  category?: Category | null;
  /** 0..1 selection animation of the chip. */
  categorySelect?: number;
  /** The chip under the finger and its 0..1 press (scale 0.97 + surface-sunken while unselected). */
  pressedChip?: Category | null;
  chipPress?: number;
  /** Horizontal scroll of the chip row (px). Default reveals the selected chip. */
  chipsScrollX?: number;
  /** Note text replacing "+ Add a note (optional)" (e.g. "the boat trip"). */
  note?: string;
  instantLimit?: number;
  /** The one-OK ceiling ($300; 0 = this Pot has no one-OK tier). */
  oneOkCap?: number;
  /** Force the tier of an ask (default: from the amount). */
  tier?: SpendTier;
  k?: number;
  n?: number;
  pressedKey?: KeyName | null;
  keyPress?: number;
  /** 0..1 press on the footer's primary: [Next] on step 1, the ask on step 2. */
  ctaPress?: number;
  /** 0..1 press on [‹ Back] (step 2). */
  backPress?: number;
  /** Optional pop of the amount display per key press (1 = none). */
  amountPop?: number;
  /** Step 1's [📷 Scan receipt] · Choose a photo row (receipts are on in the app). */
  receipts?: boolean;
  /** 0..1 press on [Scan receipt]. */
  receiptPress?: number;
  /** 0..1 opens the decision line's ⓘ panel (the why + "Once it's paid, you'd get back $122 …"). */
  decisionOpen?: number;
  /** Keep the decision line's space but hide it (a breakout twin is on screen). */
  hideDecision?: boolean;
  /** The Pot's balance before this spend (for "you'd get back" in the ⓘ panel). Default: the story's ($450 / $366). */
  potBalance?: number;
  /** Who gets paid (step 2): Me | A member | Someone else. */
  payee?: Payee;
  /** Fractional segment index (0..2) to slide the highlight; overrides `payee` for the highlight. */
  payeeIndex?: number;
  /** "A member": who's picked (default Sam). */
  payTo?: Person;
  /** "Someone else": the "Who's it for?" label as typed. */
  linkLabel?: string;
  /** Step 2: the ask is being sent (one OK / the group): grey CTA with the typing dots. */
  submitting?: boolean;
  /** 0..1 through the 600 ms marigold burst (approved), from the capsule's centre like the app. */
  burstProgress?: number;
  /** "app" (exact, subtle) or "cinematic" (holds bright, then fades), with size/distance multipliers. */
  burstVariant?: "app" | "cinematic";
  burstDistance?: number;
  burstSize?: number;
  /** 0..1 pop of the check (approved); default 1. */
  checkPop?: number;
  /** 0..1 surface-sunken → brand-soft (default 1 once approved). */
  capsuleTint?: number;
  /** Frame for the typing dots (defaults to the current frame). */
  dotsFrame?: number;
  /** voteSent timeline rows (default: Maya asked, Sam + Leo haven't decided). */
  timeline?: TimelineRow[];
  /** Keep the voteSent timeline's space but hide it (a breakout twin is on screen). */
  hideTimeline?: boolean;
  /** The asker (voteSent timeline). */
  me?: Person;
  /** Hide the capsule (keeps its space) while a breakout twin is on screen. */
  hideCapsule?: boolean;
  /** 0..1 entrance of the "Sending…/sent" row. */
  statusAppear?: number;
  /** Results: the quiet "Receipt ↗" (sent, oneOkSent, voteSent). */
  receipt?: boolean;
  /** 0..1 press on [Done]. */
  donePress?: number;
  /** Pay by link, sent: 0..1 press on [Share link]. */
  sharePress?: number;
  /** Pay by link, sent: 0..1 draws the QR in. */
  qrReveal?: number;
};

const PAYEES: Payee[] = ["me", "member", "link"];

export const SpendSheet: React.FC<SpendSheetProps> = (props) => {
  const {
    step,
    potName = LISBON.name,
    instantLimit = LISBON.instantLimit,
    oneOkCap = LISBON.oneOkCap,
    k = LISBON.k,
    n = LISBON.n,
    pressedKey = null,
    keyPress = 1,
    ctaPress = 0,
    backPress = 0,
    amountPop = 1,
    receipts = true,
    receiptPress = 0,
    decisionOpen = 0,
    hideDecision,
    payee = "me",
    payTo,
    submitting = false,
    burstProgress = 0,
    checkPop = 1,
    dotsFrame,
    me = MAYA,
    receipt = true,
    donePress = 0,
    footerAppear,
    ...sheet
  } = props;
  const { c } = useUi();
  const legacyVote = step === "vote";
  const typed = props.typed ?? (legacyVote || step === "voteSent" || step === "oneOkSent" ? "300" : "84");
  const typedAmount = Number(typed) || 0;
  const amount = props.amount ?? typedAmount;
  const big = typedAmount > instantLimit || amount > instantLimit;
  // default chip: none until an amount is typed, then groceries ($84) / tickets ($300)
  const category = props.category === undefined ? (typed === "" ? null : big ? "tickets" : "groceries") : props.category;
  const path = decisionPath(typedAmount, { instantLimit, oneOkCap });
  const tier: SpendTier = props.tier ?? (amount > instantLimit && oneOkCap > 0 && amount <= oneOkCap ? "one_ok" : "group");
  const shownPath: DecisionPath = props.tier && (path === "one_ok" || path === "group") ? props.tier : path;

  // which form step: explicit, or the legacy single form split by whether a reason is in play yet
  const legacyForm = step === "amount" || step === "vote";
  const formStep: 1 | 2 | null =
    step === "howMuch" ? 1 : step === "details" ? 2 : legacyForm ? (category === null && !((props.chipPress ?? 0) > 0 && props.pressedChip) ? 1 : 2) : null;

  const balanceBefore = props.potBalance ?? (typedAmount <= instantLimit ? LISBON.goal : LISBON.goal - 84);
  const refundAfter = typedAmount > 0 ? Math.max(0, Math.floor((balanceBefore - typedAmount) / n)) : null;
  const decision = (
    <DecisionLine
      path={shownPath}
      instantLimit={instantLimit}
      k={k}
      n={n}
      details={refundAfter !== null ? [copy["spend.refund_after"](formatUsd(refundAfter, "whole"))] : []}
      open={decisionOpen}
      style={hideDecision ? { visibility: "hidden" } : undefined}
    />
  );

  if (formStep === 1) {
    return (
      <Sheet
        {...sheet}
        title={copy["spend.title"](potName)}
        footerAppear={footerAppear}
        footer={
          <>
            <Button variant="primary" fullWidth disabled={path === "empty"} pressed={ctaPress} dataUi="cta">
              {copy["spend.next"]}
            </Button>
            <Keypad pressedKey={pressedKey} press={keyPress} />
          </>
        }
      >
        <div data-ui="spend-step1" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, paddingTop: 4 }}>
          <AmountDisplay typed={typed} label={copy["spend.amount.label"]} pop={amountPop} />
          {receipts ? (
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", columnGap: 8, rowGap: 4 }}>
              <Button icon={Camera} height={44} pressed={receiptPress} style={{ padding: "6px 16px", borderRadius: 999 }}>
                {copy["spend.receipt.snap"]}
              </Button>
              <span style={{ display: "inline-flex", minHeight: 44, alignItems: "center", padding: "0 4px", ...T.bodySm, color: c.link }}>{copy["spend.receipt.pick"]}</span>
            </div>
          ) : null}
          <div style={{ width: "100%" }}>{decision}</div>
        </div>
      </Sheet>
    );
  }

  if (formStep === 2) {
    const whole = formatUsd(typedAmount, "whole");
    const to = payTo ?? CREW.find((p) => p.id !== me.id) ?? me;
    const cta =
      path === "empty"
        ? copy["spend.cta.empty"]
        : shownPath === "one_ok"
          ? copy["spend.cta.one_ok"]
          : shownPath === "group"
            ? copy["spend.cta.vote"]
            : payee === "link"
              ? copy["paylink.cta"](whole)
              : payee === "member"
                ? copy["spend.cta.pay_member"](whole, to.name)
                : copy["spend.cta.instant"](whole);
    const selIdx = category ? CATEGORIES.indexOf(category) : -1;
    const scrollX = props.chipsScrollX ?? (selIdx >= 4 ? 245 : selIdx >= 3 ? 120 : 0);
    const segIndex = props.payeeIndex ?? PAYEES.indexOf(payee);
    return (
      <Sheet
        {...sheet}
        title={copy["spend.title"](potName)}
        footerAppear={footerAppear}
        footerGap={8}
        footer={
          <>
            {decision}
            <Button
              variant="primary"
              fullWidth
              disabled={path === "empty" || submitting}
              pressed={ctaPress}
              leading={submitting ? <TypingDots frame={dotsFrame} color={c.inkMuted} size="sm" /> : undefined}
              style={{ marginTop: 4 }}
              dataUi="cta"
            >
              {cta}
            </Button>
            <SheetBack pressed={backPress} style={submitting ? { opacity: 0.5 } : undefined} />
          </>
        }
      >
        <div data-ui="spend-step2" style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 4 }}>
          <p style={{ margin: 0, ...T.title, color: c.ink, fontVariantNumeric: "tabular-nums", transform: amountPop !== 1 ? `scale(${amountPop})` : undefined, transformOrigin: "left center" }}>
            {keypadDisplay(typed)}
          </p>
          <div>
            <p style={{ margin: "0 0 8px", ...T.bodySm, color: c.inkMuted }}>{copy["spend.reason.label"]}</p>
            <div style={{ margin: "0 -16px", padding: "0 16px 4px", overflow: "hidden" }}>
              <div style={{ display: "flex", gap: 8, transform: scrollX ? `translateX(${-scrollX}px)` : undefined }}>
                {CATEGORIES.map((cat) => (
                  <Chip key={cat} selected={cat === category ? (props.categorySelect ?? 1) : 0} pressed={cat === props.pressedChip ? (props.chipPress ?? 1) : 0}>
                    {reasonChip(cat)}
                  </Chip>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={{ margin: 0, ...T.bodySm, color: c.inkMuted }}>{copy["paylink.who.label"]}</p>
            <Segmented options={[copy["paylink.who.me"], copy["paylink.who.member"], copy["paylink.who.link"]]} index={segIndex} />
          </div>
          {payee === "member" ? (
            <div style={{ marginTop: -4, display: "flex", gap: 12, paddingBottom: 4 }}>
              {CREW.filter((p) => p.id !== me.id).map((p) => {
                const on = p.id === to.id;
                return (
                  <span key={p.id} style={{ display: "flex", minWidth: 64, flexDirection: "column", alignItems: "center", gap: 4, padding: 4 }}>
                    <span style={{ position: "relative", borderRadius: 999, padding: 2, boxShadow: `0 0 0 2px ${on ? c.ink : "transparent"}` }}>
                      <Avatar person={p} size="lg" />
                      {on ? (
                        <span
                          style={{
                            position: "absolute",
                            right: -4,
                            bottom: -4,
                            display: "grid",
                            width: 20,
                            height: 20,
                            placeItems: "center",
                            borderRadius: 999,
                            background: c.ink,
                            color: c.surface,
                          }}
                        >
                          <Check size={12} strokeWidth={2} style={{ display: "block" }} aria-hidden />
                        </span>
                      ) : null}
                    </span>
                    <span style={{ ...T.bodySm, color: c.ink }}>{p.name}</span>
                  </span>
                );
              })}
            </div>
          ) : null}
          {payee === "link" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <p style={{ margin: 0, display: "flex", alignItems: "flex-start", gap: 8, ...T.bodySm, color: c.inkMuted }}>
                <Link2 size={16} strokeWidth={2} color={c.ink} style={{ display: "block", flexShrink: 0, marginTop: 2 }} aria-hidden />
                {copy["paylink.how"]}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ ...T.bodySm, color: c.inkMuted }}>{copy["paylink.label.label"]}</span>
                <span
                  style={{
                    display: "flex",
                    height: 52,
                    boxSizing: "border-box",
                    alignItems: "center",
                    borderRadius: 10,
                    border: `1px solid ${c.lineStrong}`,
                    background: c.surfaceSunken,
                    padding: "0 12px",
                    ...T.body,
                    color: props.linkLabel ? c.ink : c.inkMuted,
                  }}
                >
                  {props.linkLabel || copy["paylink.label.placeholder"]}
                </span>
                <span style={{ ...T.bodySm, color: c.inkMuted }}>{copy["paylink.label.hint"](potName)}</span>
              </div>
            </div>
          ) : null}
          <span style={{ alignSelf: "flex-start", marginLeft: -4, minHeight: 44, display: "flex", alignItems: "center", padding: "0 4px", ...T.label, color: c.link }}>
            {props.note?.trim() ? props.note : `+ ${copy["spend.note.add"]}`}
          </span>
        </div>
      </Sheet>
    );
  }

  const reasonText = category ? reasonChip(category) : reasonChip("other");
  const done = (
    <Button variant="primary" fullWidth pressed={donePress}>
      {copy["spend.done"]}
    </Button>
  );

  if (step === "voteSent" || step === "oneOkSent") {
    const oneOk = step === "oneOkSent" || tier === "one_ok";
    const [title, body] = oneOk ? copy["spend.one_ok_sent"]() : copy["spend.vote_sent"](k, n);
    const rows = props.timeline ?? timelineRows({ asker: me, approved: [me], waiting: CREW.filter((p) => p.id !== me.id), me: me.id });
    return (
      <Sheet {...sheet} title={copy["spend.title"](potName)} footer={done} footerAppear={footerAppear}>
        <div data-ui={oneOk ? "spend-one-ok-sent" : "spend-vote-sent"} style={{ display: "flex", flexDirection: "column", gap: 20, paddingTop: 8 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, textAlign: "center" }}>
            <MoneyText amount={amount} variant="hero" />
            <span style={{ ...T.bodySm, color: c.inkMuted }}>{reasonText}</span>
          </div>
          <div data-ui="spend-sent-status" style={{ display: "flex", alignItems: "flex-start", gap: 12, borderRadius: 16, background: c.surfaceSunken, padding: 12 }}>
            <Clock size={20} strokeWidth={2} color={c.waiting} style={{ display: "block", flexShrink: 0, marginTop: 2 }} aria-hidden />
            <div>
              <p style={{ margin: 0, ...T.label, color: c.ink }}>{title}</p>
              <p style={{ margin: "2px 0 0", ...T.bodySm, color: c.inkMuted }}>{body}</p>
            </div>
          </div>
          {oneOk ? null : <ApprovalTimeline rows={rows} k={k} style={props.hideTimeline ? { visibility: "hidden" } : undefined} />}
          {receipt ? <ReceiptLink style={{ alignSelf: "center" }} /> : null}
        </div>
      </Sheet>
    );
  }

  // pay by link ("Someone else"): "Making your link…", then "Your link to send $40 is ready" + the share card
  if (payee === "link" && (step === "sending" || step === "sent")) {
    return (
      <Sheet
        {...sheet}
        title={copy["spend.title"](potName)}
        footerAppear={footerAppear}
        footerGap={8}
        footer={
          step === "sent" ? (
            <>
              <Button variant="primary" fullWidth icon={Share2} pressed={props.sharePress ?? 0}>
                {copy["paylink.share.cta"]}
              </Button>
              <Button fullWidth icon={Copy}>
                {copy["paylink.share.copy"]}
              </Button>
              <Button variant="ghost" fullWidth pressed={donePress}>
                {copy["spend.done"]}
              </Button>
            </>
          ) : (
            done
          )
        }
      >
        <div data-ui="spend-link-result" style={{ display: "flex", flexDirection: "column", gap: 20, paddingTop: 8 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, textAlign: "center" }}>
            <MoneyText amount={amount} variant="hero" />
            <span style={{ ...T.bodySm, color: c.inkMuted }}>{reasonText}</span>
          </div>
          <RulesCapsule state="approved" instantLimit={instantLimit} style={props.hideCapsule ? { visibility: "hidden" } : undefined} />
          {step === "sent" ? (
            <SendLinkCard amount={amount} who={props.linkLabel?.trim() || null} card={false} qrReveal={props.qrReveal} />
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "0 4px" }}>
              <p style={{ margin: 0, ...T.body, color: c.ink }}>{copy["paylink.checking"]}</p>
              <StatusChip status="sending" />
            </div>
          )}
          {step === "sent" && receipt ? <ReceiptLink style={{ alignSelf: "center" }} /> : null}
        </div>
      </Sheet>
    );
  }

  // checking / approved / sending / sent
  const showFooter = step === "sending" || step === "sent";
  return (
    <Sheet {...sheet} title={copy["spend.title"](potName)} footer={showFooter ? done : undefined} footerAppear={footerAppear}>
      <SpendResult
        state={step === "checking" || step === "approved" || step === "sending" || step === "sent" ? step : "sent"}
        amount={amount}
        reasonText={reasonText}
        instantLimit={instantLimit}
        capsuleTint={props.capsuleTint}
        checkPop={checkPop}
        burstProgress={burstProgress}
        burstVariant={props.burstVariant}
        burstDistance={props.burstDistance}
        burstSize={props.burstSize}
        dotsFrame={dotsFrame}
        hideCapsule={props.hideCapsule}
        statusAppear={props.statusAppear}
        receipt={receipt}
        to={payee === "member" ? (payTo ?? CREW.find((p) => p.id !== me.id) ?? me).name : null}
        style={{ paddingTop: 8 }}
      />
    </Sheet>
  );
};
