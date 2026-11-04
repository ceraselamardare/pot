// Approve sheet (apps/web/components/sheets/ApproveSheet.tsx, 2026-11-03), from the approver's side (Leo by default):
// "Maya asks for $300" · the asker + "Lisbon Trip · 2 min ago" · $300.00 + "For the boat trip" · why it needs you ·
// who decides · the details (Status · Approved · Pot after this · Expires) · Receipt ↗ · the footer.
//  - variant "oneOk" (hub 1.1.0, $100 < amount ≤ $300; the default for those amounts): "Needs one OK from anyone in
//    the group. It's over Maya's instant limit." · "One OK needed": "✓ Maya · asked, approval counted" and "✋ Anyone in
//    Lisbon Trip except Maya can give it." · [OK $300] (the sheet's one marigold) + [Decline].
//    States: "ready" → "approving" ("Sending your OK…", both buttons disabled) → "approved" ("✓ You · gave the OK",
//    Status ✓ Paid · Approved One OK by Leo, "Done. Your OK sent $300 to Maya.", [Done]).
//  - variant "group" (over $300, or `variant="group"`): "Needs approval because it's over the $100 instant limit." ·
//    Approvals · 1 of 2 · [Approve $300] + [Decline]. "approving" ("Approving…", your row ticks optimistically) →
//    "approved" ("Approved! $300 is on its way to Maya.").
// A group approval or an OK gets a calm check, never the burst (one celebration only).
import { Check, Hand } from "lucide-react";
import React from "react";
import { copy } from "../copy";
import { LEO, LISBON, MAYA, SAM, type Person } from "../data";
import { formatUsd } from "../format";
import { clamp01, pop as popAnim } from "../ease";
import { useUi } from "../theme";
import { T } from "../type";
import { ApprovalTimeline, timelineRows } from "../atoms/Approvals";
import { Avatar } from "../atoms/Avatar";
import { Button } from "../atoms/Button";
import { MoneyText } from "../atoms/MoneyText";
import { Appear } from "../atoms/Appear";
import { ReceiptLink } from "../atoms/CompactRow";
import { StatusChip } from "../atoms/StatusChip";
import { Sheet, type SheetProps } from "./Sheet";

export type ApproveState = "ready" | "approving" | "approved";
export type ApproveVariant = "oneOk" | "group";

export type ApproveSheetProps = Omit<SheetProps, "children" | "footer" | "title"> & {
  state?: ApproveState;
  /** "oneOk" (one OK from anyone but the asker) or "group" (k of n). Default: by the amount and the one-OK ceiling. */
  variant?: ApproveVariant;
  asker?: Person;
  /** The phone owner (approver). */
  me?: Person;
  /** Everyone else still waiting besides `me` (group variant). */
  others?: Person[];
  amount?: number;
  /** "the boat trip" → "For the boat trip". */
  reason?: string;
  potName?: string;
  time?: string;
  instantLimit?: number;
  oneOkCap?: number;
  balanceAfter?: number;
  k?: number;
  /** "in 7 days" */
  expires?: string;
  approvePress?: number;
  declinePress?: number;
  donePress?: number;
  /** 0..1 pop of your tick: the group timeline (approving/approved) or "You · gave the OK" (oneOk, approved). */
  tickPop?: number;
  /** 0..1 entrance of the status box (approved). */
  statusAppear?: number;
  /** Hide the timeline / the One OK block (keeps its space) while a breakout twin is on screen. */
  hideTimeline?: boolean;
  /** Hide the details table (keeps its space). */
  hideDetails?: boolean;
  /** The quiet "Receipt ↗" under the details (default true). */
  receipt?: boolean;
};

/** The one-OK block: who asked (counted), then who can give the OK, or who gave it. */
export const OneOkLine: React.FC<{
  asker?: Person;
  potName?: string;
  /** Who gave the OK (null = still waiting for one). */
  okBy?: Person | null;
  /** The phone owner (okBy === me → "You · gave the OK"). */
  me?: Person;
  /** 0..1 pop of the OK tick. */
  okPop?: number;
  header?: boolean;
  style?: React.CSSProperties;
}> = ({ asker = MAYA, potName = LISBON.name, okBy = null, me = LEO, okPop = 1, header = true, style }) => {
  const { c } = useUi();
  const pp = popAnim(okPop);
  const disc = (p?: { scale: number; opacity: number }) => (
    <span
      style={{
        display: "grid",
        width: 24,
        height: 24,
        flexShrink: 0,
        placeItems: "center",
        borderRadius: 999,
        background: c.approved,
        color: c.surface,
        transform: p && okPop < 1 ? `scale(${p.scale})` : undefined,
        opacity: p ? p.opacity : 1,
      }}
    >
      <Check size={16} strokeWidth={2} style={{ display: "block" }} aria-hidden />
    </span>
  );
  return (
    <section data-ui="one-ok" style={{ display: "flex", flexDirection: "column", gap: 8, ...style }}>
      {header ? <h3 style={{ margin: 0, ...T.label, color: c.ink }}>{copy["approve.one_ok.header"]}</h3> : null}
      <p style={{ margin: 0, display: "flex", alignItems: "center", gap: 12, ...T.bodySm, color: c.ink }}>
        {disc()}
        <Avatar person={asker} size="xs" />
        {copy["approve.timeline.asked"](asker.name)}
      </p>
      {okBy ? (
        <p style={{ margin: 0, display: "flex", alignItems: "center", gap: 12, ...T.bodySm, color: c.ink }}>
          {disc(pp)}
          <Avatar person={okBy} size="xs" />
          {copy["approve.timeline.ok"](okBy.id === me.id ? copy["feed.you"] : okBy.name)}
        </p>
      ) : (
        <p style={{ margin: 0, display: "flex", alignItems: "center", gap: 12, ...T.bodySm, color: c.inkMuted }}>
          <span style={{ display: "grid", width: 24, height: 24, flexShrink: 0, placeItems: "center" }}>
            <Hand size={20} strokeWidth={2} color={c.waiting} style={{ display: "block" }} aria-hidden />
          </span>
          {copy["approve.one_ok.who"](potName, asker.name)}
        </p>
      )}
    </section>
  );
};

/** The details table (Status · Approved · Pot after this · Expires), as the app's spend details. */
export const SpendFacts: React.FC<{
  status: "waiting" | "paid";
  approved: string;
  balanceAfter?: number | null;
  expires?: string | null;
  style?: React.CSSProperties;
}> = ({ status, approved, balanceAfter = null, expires = null, style }) => {
  const { c } = useUi();
  // Tailwind 4's divide-y: a border-bottom on every row but the last, inside the row's 48 px
  const rows = 2 + (balanceAfter !== null ? 1 : 0) + (expires !== null ? 1 : 0);
  const row = (i: number): React.CSSProperties => ({
    display: "flex",
    minHeight: 48,
    boxSizing: "border-box",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "6px 12px",
    borderBottom: i < rows - 1 ? `1px solid ${c.line}` : undefined,
  });
  return (
    <div data-ui="spend-facts" style={{ display: "flex", flexDirection: "column", borderRadius: 16, border: `1px solid ${c.line}`, ...style }}>
      <div style={row(0)}>
        <span style={{ ...T.bodySm, color: c.inkMuted }}>{copy["details.status.label"]}</span>
        {status === "paid" ? (
          <StatusChip status="approved">{copy["record.status.paid"]}</StatusChip>
        ) : (
          <StatusChip status="needs">{copy["record.status.pending"]}</StatusChip>
        )}
      </div>
      <div style={row(1)}>
        <span style={{ ...T.bodySm, color: c.inkMuted }}>{copy["details.approved.label"]}</span>
        <span style={{ textAlign: "right", ...T.label, color: c.ink }}>{approved}</span>
      </div>
      {balanceAfter !== null ? (
        <div style={{ ...row(2), padding: "0 12px" }}>
          <span style={{ ...T.bodySm, color: c.inkMuted }}>{copy["approve.after.label"]}</span>
          <MoneyText amount={balanceAfter} />
        </div>
      ) : null}
      {expires !== null ? (
        <div style={{ ...row(balanceAfter !== null ? 3 : 2), padding: "0 12px" }}>
          <span style={{ ...T.bodySm, color: c.inkMuted }}>{copy["approve.expires.label"]}</span>
          <span style={{ ...T.label, color: c.ink }}>{expires}</span>
        </div>
      ) : null}
    </div>
  );
};

export const ApproveSheet: React.FC<ApproveSheetProps> = ({
  state = "ready",
  variant,
  asker = MAYA,
  me = LEO,
  others = [SAM],
  amount = 300,
  reason = "the boat trip",
  potName = LISBON.name,
  time = "2 min ago",
  instantLimit = LISBON.instantLimit,
  oneOkCap = LISBON.oneOkCap,
  balanceAfter = 66,
  k = LISBON.k,
  expires = copy["time.in_days"](LISBON.expiryDays),
  approvePress = 0,
  declinePress = 0,
  donePress = 0,
  tickPop,
  statusAppear = 1,
  hideTimeline,
  hideDetails,
  receipt = true,
  ...sheet
}) => {
  const { c } = useUi();
  const whole = formatUsd(amount, "whole");
  const oneOk = (variant ?? (amount > instantLimit && oneOkCap > 0 && amount <= oneOkCap ? "oneOk" : "group")) === "oneOk";
  const needs = state !== "approved";
  const busy = state === "approving";
  const pp = popAnim(statusAppear);

  // the group: join order for the waiting list, as the app keeps r.pending; my row ticks optimistically once I tap
  const mineIn = state !== "ready";
  const waiting = [...others, ...(mineIn ? [] : [me])].sort((a, b) => (a.joinIndex ?? 0) - (b.joinIndex ?? 0));
  const rows = timelineRows({ asker, approved: mineIn ? [asker, me] : [asker], waiting, me: me.id }).map((r) =>
    r.person.id === me.id && r.state === "yes" ? { ...r, pop: tickPop ?? 1 } : r,
  );

  const footer =
    state === "approved" ? (
      <Button variant="primary" fullWidth pressed={donePress}>
        {copy["spend.done"]}
      </Button>
    ) : (
      <>
        <Button variant="primary" fullWidth pressed={approvePress} dim={busy} dataUi="cta">
          {oneOk ? (busy ? copy["approve.cta.oking"] : copy["approve.cta.ok"](whole)) : busy ? copy["approve.cta.approving"] : copy["approve.cta.approve"](whole)}
        </Button>
        <Button fullWidth pressed={declinePress} dim={busy}>
          {copy["approve.cta.decline"]}
        </Button>
      </>
    );
  const doneLine = oneOk ? copy["approve.ok.done"](whole, asker.name) : copy["approve.final"](whole, asker.name);
  return (
    <Sheet
      {...sheet}
      title={copy["approve.title"](asker.name, whole)}
      footer={footer}
      footerGap={8}
    >
      <div data-ui="approve" style={{ display: "flex", flexDirection: "column", gap: 20, paddingTop: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Avatar person={asker} size="md" />
          <p style={{ margin: 0, ...T.bodySm, color: c.inkMuted }}>{copy["approve.meta"](potName, time)}</p>
        </div>
        <div>
          <p style={{ margin: 0, ...T.body }}>
            <MoneyText amount={amount} variant="hero" />
          </p>
          <p style={{ margin: "4px 0 0", ...T.body, color: c.ink }}>{copy["approve.reason"](reason)}</p>
        </div>
        {needs ? (
          <p style={{ margin: 0, borderRadius: 16, background: c.surfaceSunken, padding: 12, ...T.body, color: c.ink }}>
            {oneOk ? copy["approve.why.one_ok"](asker.name) : copy["approve.why.cap"](formatUsd(instantLimit, "whole"))}
          </p>
        ) : null}
        {oneOk ? (
          <OneOkLine
            asker={asker}
            potName={potName}
            okBy={state === "approved" ? me : null}
            me={me}
            okPop={tickPop ?? 1}
            style={hideTimeline ? { visibility: "hidden" } : undefined}
          />
        ) : (
          <ApprovalTimeline rows={rows} k={k} style={hideTimeline ? { visibility: "hidden" } : undefined} />
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <SpendFacts
            status={needs ? "waiting" : "paid"}
            approved={needs ? copy["record.approved.none"] : oneOk ? copy["record.approved.one_ok"](me.name) : copy["record.approved.group"]}
            balanceAfter={needs ? balanceAfter : null}
            expires={needs ? expires : null}
            style={hideDetails ? { visibility: "hidden" } : undefined}
          />
          {receipt ? <ReceiptLink style={{ alignSelf: "flex-start" }} /> : null}
        </div>
        {state === "approved" ? (
          <Appear appear={clamp01(statusAppear)} from="fade">
            <div data-ui="approve-status" style={{ display: "flex", alignItems: "flex-start", gap: 12, borderRadius: 16, background: c.surfaceSunken, padding: 12 }}>
              <span style={{ marginTop: 2, flexShrink: 0, transform: statusAppear < 1 ? `scale(${pp.scale})` : undefined }}>
                <Check size={20} strokeWidth={2} color={c.approved} style={{ display: "block" }} aria-hidden />
              </span>
              <p style={{ margin: 0, ...T.label, color: c.ink, fontVariantNumeric: "tabular-nums" }}>{doneLine}</p>
            </div>
          </Appear>
        ) : null}
      </div>
    </Sheet>
  );
};
