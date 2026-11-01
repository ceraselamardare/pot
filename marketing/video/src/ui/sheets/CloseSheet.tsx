// Close the Pot (apps/web/components/sheets/CloseSheet.tsx). Four faces:
//  - "propose" (Maya): "Close Lisbon Trip?", the explainer, "$66.00 left · split by …", the RefundTable, the info
//    note, [Ask the group to close] + [Keep the Pot open];
//  - "waiting" (after asking): "Sent to the group. Your approval is counted. It needs 1 more." + the timeline;
//  - "vote" (Leo / Sam): "Maya wants to close Lisbon Trip", "You'd get back $22.00", [Approve closing] + [Say no];
//  - "closed": a calm moment, no burst: the glyph with an `approved` check badge, "$22.00 is in your Pot account."
import { Check, Clock, Info } from "lucide-react";
import React from "react";
import { PotMark, EGGPLANT, MARIGOLD } from "../../brand/Logo";
import { copy } from "../copy";
import { CREW, LISBON, MAYA, type Person } from "../data";
import { formatUsd, names } from "../format";
import { pop as popAnim } from "../ease";
import { useUi } from "../theme";
import { T } from "../type";
import { ApprovalTimeline, timelineRows, type TimelineRow } from "../atoms/Approvals";
import { Button } from "../atoms/Button";
import { RefundTable, type RefundRow } from "../atoms/RefundTable";
import { Sheet, type SheetProps } from "./Sheet";

/** The closed moment: the pot glyph (eggplant in Day, marigold in Night) + an `approved` check badge, the refund line. */
export const ClosedMoment: React.FC<{
  refund: number;
  /** 0..1 pop of the check badge. */
  badgePop?: number;
  /** Glyph height in px (app: 64). */
  glyphHeight?: number;
  style?: React.CSSProperties;
}> = ({ refund, badgePop = 1, glyphHeight = 64, style }) => {
  const { c, theme } = useUi();
  const pp = popAnim(badgePop);
  const w = (glyphHeight * 392) / 278;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "8px 0", textAlign: "center", ...style }}>
      <span style={{ position: "relative", display: "inline-block" }}>
        <PotMark size={w} variant="glyph" glyphColor={theme === "night" ? MARIGOLD : EGGPLANT} style={{ display: "block" }} />
        <span
          style={{
            position: "absolute",
            right: -8,
            bottom: -4,
            display: "grid",
            width: 28,
            height: 28,
            placeItems: "center",
            borderRadius: 999,
            background: c.approved,
            color: c.surface,
            boxShadow: `0 0 0 2px ${c.surface}`,
            transform: badgePop < 1 ? `scale(${pp.scale})` : undefined,
            opacity: pp.opacity,
          }}
        >
          <Check size={16} strokeWidth={2} style={{ display: "block" }} aria-hidden />
        </span>
      </span>
      <p style={{ margin: 0, ...T.body, color: c.ink }}>{copy["close.done.amount"](formatUsd(refund))}</p>
      <p style={{ margin: 0, maxWidth: 320, ...T.bodySm, color: c.inkMuted }}>{copy["close.done.where"]}</p>
    </div>
  );
};

export type CloseMode = "propose" | "waiting" | "vote" | "closed";

export type CloseSheetProps = Omit<SheetProps, "children" | "footer" | "title"> & {
  mode?: CloseMode;
  potName?: string;
  /** The phone owner (first row, "(you)"). */
  me?: Person;
  proposer?: Person;
  rows?: RefundRow[];
  /** Override the shown "Gets back" per row (count-up), indexed like `rows`. */
  backShown?: number[];
  k?: number;
  timeline?: TimelineRow[];
  expires?: string;
  ctaPress?: number;
  secondaryPress?: number;
  badgePop?: number;
  /** Hide the refund table (keeps its space) while a breakout twin is on screen. */
  hideTable?: boolean;
};

export const defaultRefundRows = (back = 22, putIn = 150): RefundRow[] => CREW.map((p) => ({ person: p, putIn, back }));

export const CloseSheet: React.FC<CloseSheetProps> = ({
  mode = "propose",
  potName = LISBON.name,
  me = MAYA,
  proposer = MAYA,
  rows = defaultRefundRows(),
  backShown,
  k = LISBON.k,
  timeline,
  expires = copy["time.in_days"](LISBON.expiryDays),
  ctaPress = 0,
  secondaryPress = 0,
  badgePop = 1,
  hideTable,
  ...sheet
}) => {
  const { c } = useUi();
  const total = rows.reduce((s, r) => s + r.back, 0);
  const myRefund = rows.find((r) => r.person.id === me.id)?.back ?? 0;
  const title =
    mode === "closed"
      ? copy["close.done.title"]
      : mode === "vote" || (mode === "waiting" && proposer.id !== me.id)
        ? copy["close.approve.title"](proposer.name, potName)
        : copy["close.title"](potName);

  const footer =
    mode === "propose" ? (
      <>
        <Button variant="primary" fullWidth pressed={ctaPress}>
          {copy["close.cta"]}
        </Button>
        <Button variant="ghost" fullWidth pressed={secondaryPress}>
          {copy["close.keep"]}
        </Button>
      </>
    ) : mode === "vote" ? (
      <>
        <Button variant="primary" fullWidth pressed={ctaPress}>
          {copy["close.approve.cta"]}
        </Button>
        <Button fullWidth pressed={secondaryPress}>
          {copy["close.decline.cta"]}
        </Button>
      </>
    ) : (
      <Button variant="primary" fullWidth pressed={ctaPress}>
        {copy["spend.done"]}
      </Button>
    );

  const rowsTimeline =
    timeline ??
    timelineRows({ asker: proposer, approved: [proposer], waiting: CREW.filter((p) => p.id !== proposer.id), me: me.id });
  const approvedRows = rowsTimeline.filter((r) => r.state === "yes");

  return (
    <Sheet {...sheet} title={title} footer={footer} footerGap={8}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 4 }}>
        {mode === "closed" ? (
          <ClosedMoment refund={myRefund} badgePop={badgePop} />
        ) : (
          <>
            {mode === "propose" ? <p style={{ margin: 0, ...T.body, color: c.ink }}>{copy["close.body"]}</p> : null}
            {mode === "vote" ? <p style={{ margin: 0, ...T.body, color: c.ink }}>{copy["close.approve.refund"](formatUsd(myRefund))}</p> : null}
            <p style={{ margin: 0, ...T.bodySm, color: c.inkMuted }}>{copy["close.math"](formatUsd(total))}</p>
          </>
        )}
        <RefundTable
          rows={rows}
          me={me.id}
          backShown={backShown}
          caption={mode === "closed" ? copy["close.table.caption.done"] : copy["close.table.caption"]}
          style={hideTable ? { visibility: "hidden" } : undefined}
        />
        {mode === "propose" || mode === "vote" ? (
          <p style={{ margin: 0, display: "flex", alignItems: "flex-start", gap: 8, borderRadius: 16, background: c.surfaceSunken, padding: 12, ...T.bodySm, color: c.ink }}>
            <Info size={16} strokeWidth={2} color={c.ink} style={{ display: "block", flexShrink: 0, marginTop: 2 }} aria-hidden />
            {copy["close.next"]}
          </p>
        ) : null}
        {mode === "waiting" ? (
          // Director: once the timeline reaches k approvals the note switches from "It needs n more." to the app's
          // "Approved by …" (feed.approved.sub), so the sheet never contradicts its own 2-of-2 timeline.
          <p style={{ margin: 0, display: "flex", alignItems: "flex-start", gap: 8, borderRadius: 16, background: c.surfaceSunken, padding: 12, ...T.body, color: c.ink }}>
            {approvedRows.length >= k ? (
              <>
                <Check size={20} strokeWidth={2} color={c.approved} style={{ display: "block", flexShrink: 0, marginTop: 2 }} aria-hidden />
                {copy["feed.approved.sub"](names(approvedRows.map((r) => r.person.name)))}
              </>
            ) : (
              <>
                <Clock size={20} strokeWidth={2} color={c.waiting} style={{ display: "block", flexShrink: 0, marginTop: 2 }} aria-hidden />
                {copy["close.sent"](Math.max(1, k - approvedRows.length))}
              </>
            )}
          </p>
        ) : null}
        {mode === "vote" || mode === "waiting" ? (
          <>
            <ApprovalTimeline rows={rowsTimeline} k={k} />
            <p style={{ margin: 0, ...T.bodySm, color: c.inkMuted }}>{copy["approve.expires"](expires)}</p>
          </>
        ) : null}
      </div>
    </Sheet>
  );
};

