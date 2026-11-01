// Spend (apps/web/components/sheets/SpendSheet.tsx). The rule is visible before, during and after the tap:
//  - "amount" / "vote": the form: Reimburse me | Pay a member, "How much?" + the typed amount, the RulePreview
//    sentence (empty → instant → vote, derived from the amount), the reason chips, "+ Add a note", and the footer
//    CTA ("Enter an amount" / "Get $84 back" / "Ask the group") over the keypad;
//  - "checking": the typing dots + "Checking Pot rules…" on surface-sunken (≥ 1.2 s in the app);
//  - "approved": the capsule tints brand-soft, the check pops, the one marigold burst plays (burstProgress);
//  - "sending": "Sending $84 to you…" + Sending… chip; "sent": "$84 sent to you" + Sent chip, [Done];
//  - "voteSent": "Sent to the group · Needs 2 of 3 approvals…" + Approvals · 1 of 2 (Maya's own counts), [Done].
import { Check, Clock } from "lucide-react";
import React from "react";
import { copy, reasonChip, CATEGORIES, type Category } from "../copy";
import { CREW, LISBON, MAYA, type Person } from "../data";
import { formatUsd } from "../format";
import { useUi } from "../theme";
import { T } from "../type";
import { AmountDisplay, Keypad, type KeyName } from "../atoms/Keypad";
import { Button } from "../atoms/Button";
import { Chip, Segmented } from "../atoms/Controls";
import { MoneyText } from "../atoms/MoneyText";
import { ApprovalTimeline, timelineRows, type TimelineRow } from "../atoms/Approvals";
import { SpendResult } from "../atoms/ResultCards";
import { Sheet, type SheetProps } from "./Sheet";

export type SpendStep = "amount" | "vote" | "checking" | "approved" | "sending" | "sent" | "voteSent";
export type PreviewPath = "empty" | "instant" | "vote";

export const previewPath = (amount: number, instantLimit: number): PreviewPath => (amount <= 0 ? "empty" : amount <= instantLimit ? "instant" : "vote");

/** The neutral rule sentence under the amount (never brand-soft: that's for the real approval). */
export const RulePreview: React.FC<{ path: PreviewPath; instantLimit?: number; k?: number; n?: number; style?: React.CSSProperties }> = ({
  path,
  instantLimit = LISBON.instantLimit,
  k = LISBON.k,
  n = LISBON.n,
  style,
}) => {
  const { c } = useUi();
  const limit = formatUsd(instantLimit, "whole");
  const [title, body] =
    path === "empty" ? [copy["preview.empty"](limit), null] : path === "instant" ? copy["preview.instant"](limit) : copy["preview.vote.over_cap"](k, n, limit);
  return (
    <div style={{ display: "flex", minHeight: 64, alignItems: "flex-start", gap: 12, borderRadius: 16, background: c.surfaceSunken, padding: 12, boxSizing: "border-box", ...style }}>
      {path === "instant" ? (
        <Check size={20} strokeWidth={2} color={c.approved} style={{ display: "block", flexShrink: 0, marginTop: 2 }} aria-hidden />
      ) : path === "vote" ? (
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
  /** Keypad string ("", "8", "84"). Defaults: "84" (amount) / "300" (vote). */
  typed?: string;
  /** Amount for the result steps (dollars). Defaults to the typed amount. Interpolate for the 500 ms roll. */
  amount?: number;
  /** Selected reason chip (null = none). Defaults: groceries (amount) / tickets (vote). */
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
  k?: number;
  n?: number;
  pressedKey?: KeyName | null;
  keyPress?: number;
  /** 0..1 press on the footer CTA. */
  ctaPress?: number;
  /** Optional pop of the amount display per key press (1 = none). */
  amountPop?: number;
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
  /** The asker (voteSent timeline). */
  me?: Person;
  /** Hide the capsule (keeps its space) while a breakout twin is on screen. */
  hideCapsule?: boolean;
  /** 0..1 entrance of the "Sending…/sent" row. */
  statusAppear?: number;
  /** 0..1 press on [Done]. */
  donePress?: number;
};

export const SpendSheet: React.FC<SpendSheetProps> = (props) => {
  const {
    step,
    potName = LISBON.name,
    instantLimit = LISBON.instantLimit,
    k = LISBON.k,
    n = LISBON.n,
    pressedKey = null,
    keyPress = 1,
    ctaPress = 0,
    amountPop = 1,
    burstProgress = 0,
    checkPop = 1,
    dotsFrame,
    me = MAYA,
    donePress = 0,
    footerAppear,
    ...sheet
  } = props;
  const { c } = useUi();
  const isVote = step === "vote" || step === "voteSent";
  const typed = props.typed ?? (isVote ? "300" : "84");
  const amount = props.amount ?? (Number(typed) || 0);
  // default chip: none until an amount is typed, then groceries ($84) / tickets ($300)
  const category = props.category === undefined ? (typed === "" ? null : isVote ? "tickets" : "groceries") : props.category;
  const editing = step === "amount" || step === "vote";
  const path = previewPath(Number(typed) || 0, instantLimit);

  if (editing) {
    const cta = path === "empty" ? copy["spend.cta.empty"] : path === "vote" ? copy["spend.cta.vote"] : copy["spend.cta.instant"](formatUsd(Number(typed) || 0, "whole"));
    const selIdx = category ? CATEGORIES.indexOf(category) : -1;
    const scrollX = props.chipsScrollX ?? (selIdx >= 4 ? 236 : selIdx >= 3 ? 120 : 0);
    return (
      <Sheet
        {...sheet}
        title={copy["spend.title"](potName)}
        footerAppear={footerAppear}
        footer={
          <>
            <Button variant="primary" fullWidth disabled={path === "empty"} pressed={ctaPress}>
              {cta}
            </Button>
            <Keypad pressedKey={pressedKey} press={keyPress} />
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 4 }}>
          <Segmented options={[copy["spend.type.reimburse"], copy["spend.type.pay_member"]]} index={0} />
          <AmountDisplay typed={typed} label={copy["spend.amount.label"]} pop={amountPop} />
          <RulePreview path={path} instantLimit={instantLimit} k={k} n={n} />
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

  if (step === "voteSent") {
    const [title, body] = copy["spend.vote_sent"](k, n);
    const rows =
      props.timeline ??
      timelineRows({ asker: me, approved: [me], waiting: CREW.filter((p) => p.id !== me.id), me: me.id });
    return (
      <Sheet {...sheet} title={copy["spend.title"](potName)} footer={done} footerAppear={footerAppear}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingTop: 8 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, textAlign: "center" }}>
            <MoneyText amount={amount} variant="hero" />
            <span style={{ ...T.bodySm, color: c.inkMuted }}>{reasonText}</span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, borderRadius: 16, background: c.surfaceSunken, padding: 12 }}>
            <Clock size={20} strokeWidth={2} color={c.waiting} style={{ display: "block", flexShrink: 0, marginTop: 2 }} aria-hidden />
            <div>
              <p style={{ margin: 0, ...T.label, color: c.ink }}>{title}</p>
              <p style={{ margin: "2px 0 0", ...T.bodySm, color: c.inkMuted }}>{body}</p>
            </div>
          </div>
          <ApprovalTimeline rows={rows} k={k} />
        </div>
      </Sheet>
    );
  }

  // checking / approved / sending / sent
  const showFooter = step === "sending" || step === "sent";
  return (
    <Sheet {...sheet} title={copy["spend.title"](potName)} footer={showFooter ? done : undefined} footerAppear={footerAppear}>
      <SpendResult
        state={step}
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
        style={{ paddingTop: 8 }}
      />
    </Sheet>
  );
};
