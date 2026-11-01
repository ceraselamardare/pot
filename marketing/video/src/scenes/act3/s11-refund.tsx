// The breakout twin of the CloseSheet's RefundTable (builder E, local to s11). Same markup and styles as the
// UI kit's RefundTable (src/ui/atoms/RefundTable.tsx), so the 1-frame swap is invisible, plus what a breakout
// needs: each body row can "land" (dip + settle) on its own, and each "Gets back" shows a counting value.
import React from "react";
import { punch, type Ease } from "../../motion";
import { Avatar, MoneyText, copy, T, useUi, type RefundRow } from "../../ui";

/** Per-row state: `land` 1 = at rest; < 1 = settling (y offset + opacity); `back` = the value shown. */
export type RowState = { land: number; back: number };

/**
 * Research §3.5 ticker as a value: ~20 distinct values with decaying steps over `duration` frames (ease punch),
 * held between ticks, landing exactly on `to`, never overshooting.
 */
export const tickValue = (t: number, from: number, to: number, duration = 42, ticks = 20, ease: Ease = punch): number => {
  if (t <= 0) return from;
  if (t >= duration) return to;
  let k = 0;
  while (k < ticks && Math.round(((k + 1) * duration) / ticks) <= t) k++;
  if (k >= ticks) return to;
  return Number((from + (to - from) * ease(k / ticks)).toFixed(2));
};

export const S11RefundTable: React.FC<{
  rows: RefundRow[];
  me: string;
  caption: string;
  /** Indexed like the SORTED rows (you first, then join order). */
  state: RowState[];
}> = ({ rows, me, caption, state }) => {
  const { c } = useUi();
  const sorted = [...rows].sort((a, b) => {
    const am = a.person.id === me;
    const bm = b.person.id === me;
    if (am !== bm) return am ? -1 : 1;
    return (a.person.joinIndex ?? 99) - (b.person.joinIndex ?? 99);
  });
  const totalIn = sorted.reduce((s, r) => s + (r.putIn ?? 0), 0);
  const totalShown = sorted.reduce((s, _r, i) => s + (state[i]?.back ?? 0), 0);
  const cell: React.CSSProperties = { padding: "10.5px 0", verticalAlign: "middle" };
  const foot: React.CSSProperties = { padding: "10.33px 0", verticalAlign: "middle" };
  // A row's content (not the row box, so borders and the "you" tint stay put) dips and settles.
  const lift = (i: number): React.CSSProperties => {
    const l = state[i]?.land ?? 1;
    if (l >= 0.999) return {};
    return { transform: `translateY(${(1 - l) * 12}px)`, opacity: 0.25 + 0.75 * l };
  };
  // At rest the amount sits directly in its cell, exactly like the kit's table (no wrapper, same line box).
  const settle = (i: number, node: React.ReactNode) => {
    const st = lift(i);
    return st.transform ? <span style={{ display: "inline-block", ...st }}>{node}</span> : node;
  };
  return (
    <table data-ui="refund-table-twin" style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", textAlign: "left" }}>
      <caption style={{ captionSide: "top", paddingBottom: 4, paddingLeft: 8, textAlign: "left", ...T.label, color: c.ink }}>{caption}</caption>
      <colgroup>
        <col />
        <col style={{ width: 92 }} />
        <col style={{ width: 92 }} />
      </colgroup>
      <thead>
        <tr style={{ ...T.bodySm, color: c.inkMuted }}>
          <th style={{ padding: "8.33px 0 8.33px 8px", fontWeight: 400, textAlign: "left" }}>{copy["close.table.person"]}</th>
          <th style={{ padding: "8.33px 0", fontWeight: 400, textAlign: "right" }}>{copy["close.table.put_in"]}</th>
          <th style={{ padding: "8.33px 8px 8.33px 0", fontWeight: 400, textAlign: "right" }}>{copy["close.table.gets_back"]}</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((r, i) => {
          const mine = r.person.id === me;
          const st = lift(i);
          return (
            <tr key={r.person.id} style={{ borderTop: `1px solid ${c.line}`, background: mine ? c.surfaceSunken : undefined }}>
              <th style={{ ...cell, paddingLeft: 8, fontWeight: 400 }}>
                <span style={{ display: "flex", minWidth: 0, alignItems: "center", gap: 8, ...st }}>
                  <Avatar person={r.person} size="xs" />
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: c.ink, ...(mine ? T.label : T.body) }}>
                    {mine ? copy["close.table.you"](r.person.name) : r.person.name}
                  </span>
                </span>
              </th>
              <td style={{ ...cell, textAlign: "right" }}>{settle(i, r.putIn !== null ? <MoneyText amount={r.putIn} color={c.inkMuted} /> : null)}</td>
              <td style={{ ...cell, paddingRight: 8, textAlign: "right" }}>{settle(i, <MoneyText amount={state[i]?.back ?? r.back} color={c.ink} />)}</td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr style={{ borderTop: `2px solid ${c.lineStrong}` }}>
          <th style={{ ...foot, paddingLeft: 8, ...T.label, fontWeight: 600, color: c.ink, textAlign: "left" }}>{copy["close.table.total"]}</th>
          <td style={{ ...foot, textAlign: "right" }}>
            <MoneyText amount={totalIn} color={c.inkMuted} />
          </td>
          <td style={{ ...foot, paddingRight: 8, textAlign: "right" }}>
            <MoneyText amount={totalShown} color={c.ink} />
          </td>
        </tr>
      </tfoot>
    </table>
  );
};
