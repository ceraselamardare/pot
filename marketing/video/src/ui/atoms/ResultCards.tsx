// The Spend sheet's result card (apps/web/components/sheets/SpendSheet.tsx ResultCard), split so a scene can lift
// pieces out of the phone as standalone twins at the same size (358 px wide inside a phone):
//  - RulesCapsule: "Checking Pot rules…" with the typing dots (surface-sunken) → "Approved by Pot rules ·
//    Under the $100 instant limit" (brand-soft, the check pops, the one marigold burst from its centre);
//  - SpendResult: the amount + reason, the capsule, "Sending $84 to you…" / "$84 sent to you" + chip, and (sent) the
//    quiet centred "Receipt ↗" (2026-11-02).
import { Check } from "lucide-react";
import React from "react";
import { interpolateColors } from "remotion";
import { copy } from "../copy";
import { formatUsd } from "../format";
import { clamp01, pop as popAnim } from "../ease";
import { useUi } from "../theme";
import { T } from "../type";
import { Celebration } from "./Celebration";
import { MoneyText } from "./MoneyText";
import { StatusChip } from "./StatusChip";
import { TypingDots } from "./TypingDots";
import { ReceiptLink } from "./CompactRow";

export type CapsuleState = "checking" | "approved";

export const RulesCapsule: React.FC<{
  state: CapsuleState;
  instantLimit?: number;
  /** 0..1 surface-sunken → brand-soft (default: 0 checking, 1 approved). */
  tint?: number;
  /** 0..1 pop of the check disc. */
  checkPop?: number;
  /** 0..1 through the 600 ms burst. */
  burstProgress?: number;
  /** Burst look: "app" (exact) or "cinematic" (holds, then fades), and multipliers (1 = the app). */
  burstVariant?: "app" | "cinematic";
  burstDistance?: number;
  burstSize?: number;
  dotsFrame?: number;
  /** "Still checking…" with static dots. */
  still?: boolean;
  style?: React.CSSProperties;
}> = ({ state, instantLimit = 100, tint, checkPop = 1, burstProgress = 0, burstVariant, burstDistance, burstSize, dotsFrame, still, style }) => {
  const { c } = useUi();
  const checking = state === "checking";
  const t = clamp01(tint ?? (checking ? 0 : 1));
  const pp = popAnim(checkPop);
  return (
    <div
      data-ui="capsule"
      style={{
        position: "relative",
        display: "flex",
        minHeight: 64,
        boxSizing: "border-box",
        alignItems: "center",
        gap: 12,
        borderRadius: 16,
        padding: "12px 16px",
        background: interpolateColors(t, [0, 1], [c.surfaceSunken, c.brandSoft]),
        ...style,
      }}
    >
      <Celebration progress={burstProgress} variant={burstVariant} distance={burstDistance} size={burstSize} />
      {checking ? (
        <>
          <TypingDots frame={dotsFrame} color={c.inkMuted} still={still} />
          <p style={{ margin: 0, ...T.label, color: c.ink }}>{still ? copy["spend.still_checking"] : copy["spend.checking"]}</p>
        </>
      ) : (
        <>
          <span
            style={{
              display: "grid",
              width: 28,
              height: 28,
              flexShrink: 0,
              placeItems: "center",
              borderRadius: 999,
              background: c.surface,
              transform: checkPop < 1 ? `scale(${pp.scale})` : undefined,
              opacity: pp.opacity,
            }}
          >
            <Check size={20} strokeWidth={2} color={c.approved} style={{ display: "block" }} aria-hidden />
          </span>
          <div>
            <p style={{ margin: 0, ...T.label, color: c.ink }}>{copy["spend.approved"]}</p>
            <p style={{ margin: 0, ...T.bodySm, color: c.inkMuted }}>{copy["feed.instant.rule"](formatUsd(instantLimit, "whole"))}</p>
          </div>
        </>
      )}
    </div>
  );
};

export type SpendResultState = "checking" | "approved" | "sending" | "sent";

export const SpendResult: React.FC<{
  state: SpendResultState;
  /** Dollars (interpolate for the 500 ms roll). */
  amount: number;
  /** The reason chip text under the amount, e.g. "Groceries 🛒". */
  reasonText: string;
  instantLimit?: number;
  capsuleTint?: number;
  checkPop?: number;
  burstProgress?: number;
  burstVariant?: "app" | "cinematic";
  burstDistance?: number;
  burstSize?: number;
  dotsFrame?: number;
  /** Keep the capsule's space but hide it (a breakout twin is on screen). */
  hideCapsule?: boolean;
  /** 0..1 entrance of the sending/sent row. */
  statusAppear?: number;
  /** "sent": the quiet "Receipt ↗" under the sent row (default true). */
  receipt?: boolean;
  /** Paying a member: "Sending $84 to Sam…" / "$84 sent to Sam" (null = to you). */
  to?: string | null;
  style?: React.CSSProperties;
}> = ({
  state,
  amount,
  reasonText,
  instantLimit = 100,
  capsuleTint,
  checkPop,
  burstProgress,
  burstVariant,
  burstDistance,
  burstSize,
  dotsFrame,
  hideCapsule,
  statusAppear = 1,
  receipt = true,
  to = null,
  style,
}) => {
  const { c } = useUi();
  const whole = formatUsd(amount, "whole");
  return (
    <div data-ui="spend-result" style={{ display: "flex", flexDirection: "column", gap: 20, ...style }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, textAlign: "center" }}>
        <MoneyText amount={amount} variant="hero" />
        <span style={{ ...T.bodySm, color: c.inkMuted }}>{reasonText}</span>
      </div>
      <RulesCapsule
        state={state === "checking" ? "checking" : "approved"}
        instantLimit={instantLimit}
        tint={capsuleTint}
        checkPop={checkPop}
        burstProgress={burstProgress}
        burstVariant={burstVariant}
        burstDistance={burstDistance}
        burstSize={burstSize}
        dotsFrame={dotsFrame}
        style={hideCapsule ? { visibility: "hidden" } : undefined}
      />
      {state === "sending" || state === "sent" ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "0 4px", opacity: clamp01(statusAppear) }}>
          <p style={{ margin: 0, ...T.body, color: c.ink }}>
            {state === "sent"
              ? to
                ? copy["spend.sent.member"](whole, to)
                : copy["spend.sent"](whole)
              : to
                ? copy["spend.sending.member"](whole, to)
                : copy["spend.sending"](whole)}
          </p>
          <StatusChip status={state === "sent" ? "sent" : "sending"} />
        </div>
      ) : null}
      {state === "sent" && receipt ? <ReceiptLink style={{ alignSelf: "center", opacity: clamp01(statusAppear) }} /> : null}
    </div>
  );
};
