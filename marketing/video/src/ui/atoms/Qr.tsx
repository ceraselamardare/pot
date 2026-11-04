// QrPlate (apps/web/components/share/QrPlate.tsx): the QR on a white plate (radius-lg, 16 px padding, shadow-card),
// dark in Night too (scanners fail on inverted codes: surface #fff / ink #2b1b3a), with the scan hint under it
// (body, ink, centred, 12 px below). The matrices are static (qr-data.ts): no runtime generation.
import React from "react";
import { day } from "../../brand/tokens";
import { useUi } from "../theme";
import { T } from "../type";
import { QR_PAY_IN, QR_SEND_LINK } from "./qr-data";

export type QrKind = "payIn" | "sendLink";

/** The QR as one crisp SVG path (each dark module a unit square). `reveal` 0..1 draws it in row by row. */
export const QrCode: React.FC<{ kind?: QrKind; size?: number; reveal?: number; style?: React.CSSProperties }> = ({ kind = "payIn", size = 216, reveal = 1, style }) => {
  const m = kind === "payIn" ? QR_PAY_IN : QR_SEND_LINK;
  const n = m.length;
  const rows = Math.ceil(n * Math.max(0, Math.min(1, reveal)));
  let d = "";
  for (let y = 0; y < rows; y++) {
    const row = m[y];
    let x = 0;
    while (x < n) {
      if (row[x] === "1") {
        let len = 1;
        while (x + len < n && row[x + len] === "1") len++;
        d += `M${x} ${y}h${len}v1h-${len}z`;
        x += len;
      } else x++;
    }
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges" style={{ display: "block", ...style }}>
      <rect width={n} height={n} fill={day.surface} />
      <path d={d} fill={day.ink} />
    </svg>
  );
};

export const QrPlate: React.FC<{
  kind?: QrKind;
  /** QR side in px (app: 216 for pay-in, 200 for a payment link). */
  size?: number;
  hint?: string;
  reveal?: number;
  style?: React.CSSProperties;
}> = ({ kind = "payIn", size = 216, hint, reveal = 1, style }) => {
  const { c, shadowCard } = useUi();
  return (
    <div data-ui="qr-plate" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, ...style }}>
      <div style={{ borderRadius: 24, background: day.surface, padding: 16, boxShadow: shadowCard }}>
        <QrCode kind={kind} size={size} reveal={reveal} />
      </div>
      {hint ? <p style={{ margin: 0, textAlign: "center", ...T.body, color: c.ink }}>{hint}</p> : null}
    </div>
  );
};
