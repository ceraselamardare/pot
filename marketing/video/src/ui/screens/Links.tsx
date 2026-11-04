// Money by link (hub 1.1.0 / 1.2.0, 2026-11-03), the pieces builder B's "And more" scene lifts out:
//  - PayInCard: "✓ Your pay-in link is ready", the QR on its white plate (216), "Scan to pay into Lisbon Trip", and
//    "Payment · They choose · Until Nov 17" (or tone "gift": "Gift ☕ · …"). apps/web/components/payin/PayInSheet.tsx.
//  - PayInSheet: the same inside "Ask anyone to pay in" · "Lisbon Trip", footer [Share link] (the one marigold),
//    [Copy link] + [Make another link].
//  - SendLinkCard: the Spend sheet's result for "Someone else": "Your link to send $40 is ready" (display heading),
//    "Send it to {who}. Whoever opens it gets $40.", the QR (200) + "They point their phone camera at it.", the amount
//    card ("$40.00" + "For {who}"), and the key line "Anyone who has this link can take the money, so send it only to
//    them." apps/web/components/paylink/PayLinkFields.tsx LinkReady + LinkShare.tsx LinkShareBody.
// The QRs are static, deterministic matrices (atoms/qr-data.ts) of demo strings, not real links.
import { Check, Copy, KeyRound, Share2 } from "lucide-react";
import React from "react";
import { copy } from "../copy";
import { LISBON } from "../data";
import { formatUsd } from "../format";
import { clamp01, pop as popAnim } from "../ease";
import { useUi } from "../theme";
import { T } from "../type";
import { Button } from "../atoms/Button";
import { MoneyText } from "../atoms/MoneyText";
import { QrPlate } from "../atoms/Qr";
import { StatusChip } from "../atoms/StatusChip";
import { Sheet, type SheetProps } from "../sheets/Sheet";

export type PayInTone = "payment" | "gift";

/** "Payment · They choose · Until Nov 17" / "Gift ☕ · $10 · Until Nov 17". */
export const payInWhat = (tone: PayInTone, amount: number | null, until: string) =>
  `${tone === "gift" ? copy["payin.kind.gift"] : copy["payin.kind.payment"]} · ${amount === null ? copy["payin.what.open"] : formatUsd(amount, "whole")} · ${copy["payin.row.until"](until)}`;

export const PayInCard: React.FC<{
  potName?: string;
  tone?: PayInTone;
  /** A fixed amount (null = "They choose"). */
  amount?: number | null;
  until?: string;
  /** 0..1 draws the QR in, row by row. */
  qrReveal?: number;
  /** 0..1 pop of the ready check. */
  readyPop?: number;
  /** Put the card on its own surface (a breakout twin); default true. Inside the sheet it sits on the sheet. */
  card?: boolean;
  style?: React.CSSProperties;
}> = ({ potName = LISBON.name, tone = "payment", amount = 25, until = "Nov 17", qrReveal = 1, readyPop = 1, card = true, style }) => {
  const { c, shadowCard } = useUi();
  const pp = popAnim(readyPop);
  return (
    <div
      data-ui="payin-card"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        textAlign: "center",
        ...(card ? { borderRadius: 24, background: c.surface, padding: 16, boxShadow: shadowCard } : null),
        ...style,
      }}
    >
      <p style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, ...T.label, color: c.ink }}>
        <span style={{ display: "block", transform: readyPop < 1 ? `scale(${pp.scale})` : undefined, opacity: pp.opacity }}>
          <Check size={20} strokeWidth={2} color={c.approved} style={{ display: "block" }} aria-hidden />
        </span>
        {copy["payin.ready"]}
      </p>
      <QrPlate kind="payIn" size={216} hint={copy["payin.qr.hint"](potName)} reveal={qrReveal} />
      <p style={{ margin: 0, ...T.bodySm, color: c.inkMuted, fontVariantNumeric: "tabular-nums" }}>{payInWhat(tone, amount, until)}</p>
    </div>
  );
};

export const PayInSheet: React.FC<
  Omit<SheetProps, "children" | "title" | "description" | "footer"> & {
    potName?: string;
    tone?: PayInTone;
    amount?: number | null;
    until?: string;
    qrReveal?: number;
    readyPop?: number;
    sharePress?: number;
    copyPress?: number;
  }
> = ({ potName = LISBON.name, tone, amount, until, qrReveal, readyPop, sharePress = 0, copyPress = 0, ...sheet }) => (
  <Sheet
    {...sheet}
    title={copy["payin.title"]}
    description={potName}
    footerGap={8}
    footer={
      <>
        <Button variant="primary" fullWidth icon={Share2} pressed={sharePress}>
          {copy["payin.share"]}
        </Button>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Button icon={Copy} pressed={copyPress}>
            {copy["payin.copy"]}
          </Button>
          <Button variant="ghost">{copy["payin.another"]}</Button>
        </div>
      </>
    }
  >
    <PayInCard potName={potName} tone={tone} amount={amount} until={until} qrReveal={qrReveal} readyPop={readyPop} card={false} style={{ paddingTop: 4 }} />
  </Sheet>
);

export const SendLinkCard: React.FC<{
  amount?: number;
  /** Who it's for ("Casa Lisboa host"); null = "the person you're paying" and no "For …" line. */
  who?: string | null;
  qrReveal?: number;
  /** Show the "✓ Claimed" chip on the amount card (the link was opened and the money taken). */
  claimed?: boolean;
  /** 0..1 pop of the Claimed chip. */
  claimedPop?: number;
  /** Put the card on its own surface (a breakout twin); default true. */
  card?: boolean;
  /** Show the heading + body (false: just the QR, the amount and the key line, like LinkShareBody). */
  heading?: boolean;
  style?: React.CSSProperties;
}> = ({ amount = 40, who = null, qrReveal = 1, claimed = false, claimedPop = 1, card = true, heading = true, style }) => {
  const { c, shadowCard } = useUi();
  const whole = formatUsd(amount, "whole");
  const pp = popAnim(clamp01(claimedPop));
  return (
    <div
      data-ui="send-link-card"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        ...(card ? { borderRadius: 24, background: c.surface, padding: 16, boxShadow: shadowCard } : null),
        ...style,
      }}
    >
      {heading ? (
        <>
          <p style={{ margin: 0, ...T.heading, color: c.ink, fontVariantNumeric: "tabular-nums" }}>{copy["paylink.ready.title"](whole)}</p>
          <p style={{ margin: "-4px 0 0", ...T.bodySm, color: c.inkMuted, fontVariantNumeric: "tabular-nums" }}>{copy["paylink.ready.body"](who ?? copy["paylink.ready.who"], whole)}</p>
        </>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <QrPlate kind="sendLink" size={200} hint={copy["paylink.share.qr.hint"]} reveal={qrReveal} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderRadius: 16, background: c.surfaceSunken, padding: 12 }}>
          <div style={{ minWidth: 0 }}>
            <MoneyText amount={amount} variant="title" />
            {who ? <p style={{ margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", ...T.bodySm, color: c.inkMuted }}>{copy["paylink.share.for"](who)}</p> : null}
          </div>
          {claimed ? (
            <span style={{ display: "block", transform: claimedPop < 1 ? `scale(${pp.scale})` : undefined, opacity: pp.opacity }}>
              <StatusChip status="sent" ground="surface">
                {copy["paylink.chip.claimed"]}
              </StatusChip>
            </span>
          ) : null}
        </div>
        <p style={{ margin: 0, display: "flex", alignItems: "flex-start", gap: 8, ...T.bodySm, color: c.ink }}>
          <KeyRound size={16} strokeWidth={2} style={{ display: "block", flexShrink: 0, marginTop: 2 }} aria-hidden />
          {copy["paylink.share.keep"]}
        </p>
      </div>
    </div>
  );
};
