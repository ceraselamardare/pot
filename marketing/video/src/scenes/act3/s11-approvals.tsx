// The group approves the close (builder E, s11): the readable, type-side twin of the CloseSheet's "waiting" block,
// and the closed line. UI-kit pieces and the app's real copy only:
//   close.sent "Sent to the group. Your approval is counted. It needs 1 more." · approve.timeline.* rows
//   ("Approvals · 1 of 2", "Maya · asked, approval counted", "Sam · hasn't decided" → "Sam · approved") ·
//   feed.approved.sub "Approved by Maya and Sam" · close.done.self "Pot closed. $22.00 is in your Pot account."
// A group approval gets no burst: only the kit's check pop on Sam's row.
import { Check, Clock } from "lucide-react";
import React from "react";
import { ApprovalTimeline, copy, formatUsd, LEO, MAYA, names, SAM, T, timelineRows, UiPiece, useUi, type TimelineRow } from "../../ui";
import { day } from "../../brand/tokens";
import { SANS } from "../../brand/fonts";

/** close.done.self (apps/web/i18n/en.json; not in the kit's copy.ts): "Pot closed. {refund} is in your Pot account." */
export const closeDoneSelf = (refund: number) => `Pot closed. ${formatUsd(refund)} is in your Pot account.`;

/** The close's approval rows for Maya's phone: before Sam = 1 of 2; after = 2 of 2, Sam's check popping in. */
export const closeTimeline = (samApproved: boolean, samPop = 1): TimelineRow[] =>
  timelineRows({
    asker: MAYA,
    approved: samApproved ? [MAYA, SAM] : [MAYA],
    waiting: samApproved ? [LEO] : [SAM, LEO],
    me: MAYA.id,
  }).map((r) => (samApproved && r.person.id === SAM.id ? { ...r, pop: samPop } : r));

/** The kit's waiting note (CloseSheet "waiting": surface-sunken box, a status icon + words), fixed to two lines
 *  so the timeline under it never moves when the words change. */
const Note: React.FC<{ approved: boolean; iconPop: number }> = ({ approved, iconPop }) => {
  const { c } = useUi();
  const Icon = approved ? Check : Clock;
  return (
    <p
      style={{
        margin: 0,
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        minHeight: 40,
        borderRadius: 16,
        background: c.surfaceSunken,
        padding: 12,
        ...T.bodySm,
        color: c.ink,
      }}
    >
      <Icon
        size={20}
        strokeWidth={2}
        color={approved ? c.approved : c.waiting}
        style={{ display: "block", flexShrink: 0, transform: iconPop < 1 ? `scale(${0.6 + 0.4 * iconPop})` : undefined }}
        aria-hidden
      />
      {approved ? copy["feed.approved.sub"](names([MAYA.name, SAM.name])) : copy["close.sent"](1)}
    </p>
  );
};

/** The readable twin of the sheet's approvals, on the type side (zoom 2: row text ≈ 28 px on screen). */
export const S11ApprovalsCard: React.FC<{ samApproved: boolean; samPop: number }> = ({ samApproved, samPop }) => (
  <div style={{ zoom: 2 }}>
    <UiPiece theme="day" width={358} card="surface" padding={16} shadow>
      <Note approved={samApproved} iconPop={samApproved ? samPop : 1} />
      <ApprovalTimeline rows={closeTimeline(samApproved, samPop)} k={2} style={{ marginTop: 14, paddingLeft: 4 }} />
    </UiPiece>
  </div>
);

/** "✓ Pot closed. $22.00 is in your Pot account." (close.done.self) as a status pill: the approved colour sits on
 *  the check icon; "Pot closed." in ink, the rest ink-muted. */
export const S11ClosedLine: React.FC<{ refund: number }> = ({ refund }) => {
  const text = closeDoneSelf(refund);
  const head = "Pot closed.";
  const rest = text.slice(head.length).trim();
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 14,
        height: 76,
        padding: "0 30px 0 22px",
        borderRadius: 999,
        background: day.surfaceSunken,
        fontFamily: SANS,
        fontSize: 36,
        lineHeight: "44px",
        whiteSpace: "nowrap",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <span style={{ display: "grid", placeItems: "center", width: 44, height: 44, borderRadius: 999, background: day.approved, color: day.surface }}>
        <Check size={28} strokeWidth={2} style={{ display: "block" }} aria-hidden />
      </span>
      <span style={{ fontWeight: 700, color: day.ink }}>{head}</span>
      <span style={{ fontWeight: 500, color: day.inkMuted }}>{rest}</span>
    </div>
  );
};
