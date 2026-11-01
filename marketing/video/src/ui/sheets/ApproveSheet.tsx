// Approve sheet (apps/web/components/sheets/ApproveSheet.tsx), from the approver's side (Leo by default):
// "Maya asks for $300" · the asker + "Lisbon Trip · 2 min ago" · $300.00 + "For the boat trip" · why it needs you ·
// Approvals · 1 of 2 · Pot after this $66.00 / Expires in 7 days · [Approve $300] (the sheet's one marigold) + [Decline].
// States: "ready" → "approving" (the button says "Approving…", your row ticks optimistically) → "approved"
// ("Approved! $300 is on its way to Maya.", [Done]). A group approval gets a calm check, never the burst.
import { Check } from "lucide-react";
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
import { Sheet, type SheetProps } from "./Sheet";

export type ApproveState = "ready" | "approving" | "approved";

export type ApproveSheetProps = Omit<SheetProps, "children" | "footer" | "title"> & {
  state?: ApproveState;
  asker?: Person;
  /** The phone owner (approver). */
  me?: Person;
  /** Everyone else still waiting besides `me`. */
  others?: Person[];
  amount?: number;
  /** "the boat trip" → "For the boat trip". */
  reason?: string;
  potName?: string;
  time?: string;
  instantLimit?: number;
  balanceAfter?: number;
  k?: number;
  expires?: string;
  approvePress?: number;
  declinePress?: number;
  donePress?: number;
  /** 0..1 pop of your approval tick in the timeline (approving/approved). */
  tickPop?: number;
  /** 0..1 entrance of the "Approved!" status box (approved). */
  statusAppear?: number;
  /** Hide the timeline (keeps its space) while a breakout twin is on screen. */
  hideTimeline?: boolean;
};

export const ApproveSheet: React.FC<ApproveSheetProps> = ({
  state = "ready",
  asker = MAYA,
  me = LEO,
  others = [SAM],
  amount = 300,
  reason = "the boat trip",
  potName = LISBON.name,
  time = "2 min ago",
  instantLimit = LISBON.instantLimit,
  balanceAfter = 66,
  k = LISBON.k,
  expires = copy["time.in_days"](LISBON.expiryDays),
  approvePress = 0,
  declinePress = 0,
  donePress = 0,
  tickPop,
  statusAppear = 1,
  hideTimeline,
  ...sheet
}) => {
  const { c } = useUi();
  const whole = formatUsd(amount, "whole");
  const needs = state !== "approved";
  const mineIn = state !== "ready";
  // join order for the waiting list, as the app keeps r.pending
  const waiting = [...others, ...(mineIn ? [] : [me])].sort((a, b) => (a.joinIndex ?? 0) - (b.joinIndex ?? 0));
  const rows = timelineRows({ asker, approved: mineIn ? [asker, me] : [asker], waiting, me: me.id }).map((r) =>
    r.person.id === me.id && r.state === "yes" ? { ...r, pop: tickPop ?? 1 } : r,
  );
  const pp = popAnim(statusAppear);
  const footer =
    state === "approved" ? (
      <Button variant="primary" fullWidth pressed={donePress}>
        {copy["spend.done"]}
      </Button>
    ) : (
      <>
        <Button variant="primary" fullWidth pressed={approvePress}>
          {state === "approving" ? copy["approve.cta.approving"] : copy["approve.cta.approve"](whole)}
        </Button>
        <Button fullWidth pressed={declinePress} dim={state === "approving"}>
          {copy["approve.cta.decline"]}
        </Button>
      </>
    );
  return (
    <Sheet
      {...sheet}
      title={copy["approve.title"](asker.name, whole)}
      footer={footer}
      footerPadBottom={20}
      footerGap={8}
      bodyStyle={{ paddingBottom: 20, ...sheet.bodyStyle }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingTop: 4 }}>
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
            {copy["approve.why.cap"](formatUsd(instantLimit, "whole"))}
          </p>
        ) : null}
        <ApprovalTimeline rows={rows} k={k} style={hideTimeline ? { visibility: "hidden" } : undefined} />
        <div style={{ display: "flex", flexDirection: "column", borderRadius: 16, border: `1px solid ${c.line}` }}>
          <div style={{ display: "flex", minHeight: 48, alignItems: "center", justifyContent: "space-between", gap: 12, padding: "0 12px" }}>
            <span style={{ ...T.bodySm, color: c.inkMuted }}>{copy["approve.after.label"]}</span>
            <MoneyText amount={balanceAfter} />
          </div>
          {needs ? (
            <div style={{ display: "flex", minHeight: 48, alignItems: "center", justifyContent: "space-between", gap: 12, padding: "0 12px", borderTop: `1px solid ${c.line}` }}>
              <span style={{ ...T.bodySm, color: c.inkMuted }}>{copy["approve.expires.label"]}</span>
              <span style={{ ...T.label, color: c.ink }}>{expires}</span>
            </div>
          ) : null}
        </div>
        {state === "approved" ? (
          <Appear appear={clamp01(statusAppear)} from="fade">
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, borderRadius: 16, background: c.surfaceSunken, padding: 12 }}>
              <span style={{ marginTop: 2, flexShrink: 0, transform: statusAppear < 1 ? `scale(${pp.scale})` : undefined }}>
                <Check size={20} strokeWidth={2} color={c.approved} style={{ display: "block" }} aria-hidden />
              </span>
              <p style={{ margin: 0, ...T.label, color: c.ink }}>{copy["approve.final"](whole, asker.name)}</p>
            </div>
          </Appear>
        ) : null}
      </div>
    </Sheet>
  );
};
