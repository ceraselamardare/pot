// ApprovalTimeline + RequestCard (apps/web/components/pot/RequestCard.tsx).
// Timeline: "Approvals · 1 of 2", then one row per person: a 24 px `approved` disc with a check (yes), a `declined`
// disc with an x (no) or an empty `line-strong` circle (waiting), the xs avatar and the words.
import { Check, Circle, X } from "lucide-react";
import React from "react";
import { copy } from "../copy";
import { LISBON, type Person } from "../data";
import { formatUsd } from "../format";
import { clamp01, pop as popAnim } from "../ease";
import { useUi } from "../theme";
import { T } from "../type";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { MoneyText } from "./MoneyText";
import { StatusChip } from "./StatusChip";

export type TimelineRow = { person: Person; state: "yes" | "no" | "wait"; text: string; /** 0..1 pop of the yes/no disc */ pop?: number };

/**
 * Rows the way the app builds them: approvals first ("{asker} · asked, approval counted", "You · approved"),
 * then declines, then the people still waiting ("You · waiting for you", "{name} · hasn't decided").
 */
export function timelineRows(opts: {
  asker: Person;
  /** everyone who approved, including the asker (whose approval counts automatically) */
  approved: Person[];
  declined?: Person[];
  waiting: Person[];
  /** the phone owner's id (shown as "You") */
  me?: string | null;
}): TimelineRow[] {
  const { asker, approved, declined = [], waiting, me } = opts;
  const you = (p: Person) => (p.id === me ? copy["feed.you"] : p.name);
  return [
    ...approved.map((p) => ({
      person: p,
      state: "yes" as const,
      text: p.id === asker.id ? copy["approve.timeline.asked"](p.name) : copy["approve.timeline.approved"](you(p)),
    })),
    ...declined.map((p) => ({ person: p, state: "no" as const, text: copy["approve.timeline.declined"](you(p)) })),
    ...waiting.map((p) => ({
      person: p,
      state: "wait" as const,
      text: p.id === me ? copy["approve.timeline.you_waiting"] : copy["approve.timeline.waiting"](p.name),
    })),
  ];
}

export const ApprovalTimeline: React.FC<{ rows: TimelineRow[]; k: number; style?: React.CSSProperties }> = ({ rows, k, style }) => {
  const { c } = useUi();
  const count = rows.filter((r) => r.state === "yes").length;
  return (
    <section data-ui="timeline" style={style}>
      <h3 style={{ margin: 0, ...T.label, color: c.ink }}>{copy["approve.timeline.header"](count, k)}</h3>
      <ol style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.map((r) => {
          const p = clamp01(r.pop ?? 1);
          const pp = popAnim(p);
          return (
            <li key={r.person.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ position: "relative", display: "grid", placeItems: "center", width: 24, height: 24, flexShrink: 0 }}>
                {r.state === "wait" || p < 1 ? (
                  <Circle size={20} strokeWidth={2} color={c.lineStrong} style={{ display: "block", position: "absolute", opacity: r.state === "wait" ? 1 : 1 - pp.opacity }} aria-hidden />
                ) : null}
                {r.state !== "wait" ? (
                  <span
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "grid",
                      placeItems: "center",
                      borderRadius: 999,
                      background: r.state === "yes" ? c.approved : c.declined,
                      color: c.surface,
                      transform: p < 1 ? `scale(${pp.scale})` : undefined,
                      opacity: pp.opacity,
                    }}
                  >
                    {r.state === "yes" ? (
                      <Check size={16} strokeWidth={2} style={{ display: "block" }} aria-hidden />
                    ) : (
                      <X size={16} strokeWidth={2} style={{ display: "block" }} aria-hidden />
                    )}
                  </span>
                ) : null}
              </span>
              <Avatar person={r.person} size="xs" />
              <span style={{ ...T.bodySm, color: r.state === "wait" ? c.inkMuted : c.ink }}>{r.text}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
};

/**
 * The "Waiting on you" card: who asks how much for what, the chip and expiry, and the inline buttons (both SECONDARY:
 * the Pot screen's one marigold is Add money). One-OK tier (hub 1.1.0, $100 < amount ≤ $300): "Needs one OK" and
 * [✓ OK $300]; the group tier: "1 of 2 approvals" and [✓ Approve $300]. `undo` shows the 4 s "✓ Approved · Undo" strip
 * that replaces the buttons right after a tap (`undoDrain` 0..1 runs the bottom drain line).
 */
export const RequestCard: React.FC<{
  who: Person;
  amount: number;
  reason: string;
  approvals: number;
  k: number;
  expires: string;
  /** Default: one OK when the amount is within the one-OK ceiling ($300). */
  tier?: "one_ok" | "group";
  pressed?: "approve" | "decline" | null;
  press?: number;
  /** After the tap: "✓ Approved · Undo" (queued) → "Sending…" → "Sent". */
  undo?: "queued" | "sending" | "sent" | null;
  undoDrain?: number;
  style?: React.CSSProperties;
}> = ({ who, amount, reason, approvals, k, expires, tier, pressed = null, press = 1, undo = null, undoDrain = 0, style }) => {
  const { c, shadowCard } = useUi();
  const whole = formatUsd(amount, "whole");
  const oneOk = (tier ?? (amount <= LISBON.oneOkCap ? "one_ok" : "group")) === "one_ok";
  return (
    <article data-ui="request-card" style={{ borderRadius: 16, border: `1px solid ${c.line}`, background: c.surface, padding: 12, boxShadow: shadowCard, ...style }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <Avatar person={who} size="sm" ring="surface" style={{ marginTop: 2 }} />
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: "block", ...T.body, color: c.ink }}>{copy["feed.pending"](who.name, whole, reason)}</span>
          <span style={{ marginTop: 8, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            <StatusChip status="needs">{oneOk ? copy["feed.pending.one_ok"] : copy["approve.progress"](approvals, k)}</StatusChip>
            <span style={{ ...T.bodySm, color: c.inkMuted }}>{copy["approve.expires"](expires)}</span>
          </span>
        </span>
        <MoneyText amount={amount} style={{ paddingTop: 2 }} />
      </div>
      {undo ? (
        <div style={{ position: "relative", marginTop: 12, overflow: "hidden", borderRadius: 10, background: c.surfaceSunken }}>
          <div style={{ display: "flex", minHeight: 48, alignItems: "center", gap: 8, padding: "0 4px 0 12px" }}>
            {undo === "queued" ? (
              <>
                <Check size={20} strokeWidth={2} color={c.approved} style={{ display: "block", flexShrink: 0 }} aria-hidden />
                <span style={{ flex: 1, ...T.label, color: c.ink }}>{copy["approve.undo.label"]}</span>
                <span style={{ display: "inline-flex", minHeight: 44, alignItems: "center", padding: "0 16px", ...T.label, color: c.link }}>{copy["approve.undo.cta"]}</span>
              </>
            ) : (
              <StatusChip status={undo === "sent" ? "sent" : "sending"} bare />
            )}
          </div>
          {undo === "queued" ? (
            <span style={{ position: "absolute", bottom: 0, left: 0, height: 2, width: `${(1 - clamp01(undoDrain)) * 100}%`, background: c.approved }} />
          ) : null}
        </div>
      ) : (
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Button icon={Check} pressed={pressed === "approve" ? press : 0}>
            {oneOk ? copy["approve.cta.ok"](whole) : copy["approve.cta.approve"](whole)}
          </Button>
          <Button pressed={pressed === "decline" ? press : 0}>{copy["approve.cta.decline"]}</Button>
        </div>
      )}
    </article>
  );
};
