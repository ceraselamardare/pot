// RefundTable (apps/web/components/pot/RefundTable.tsx): Person · Put in · Gets back, "you" first on
// surface-sunken with the name in `label`, `line` row borders, a 2 px `line-strong` rule above the Total row.
// Columns: auto · 92 px · 92 px. Amounts in Figtree 17/700 tabular (Put in ink-muted, Gets back ink).
import React from "react";
import { copy } from "../copy";
import type { Person } from "../data";
import { useUi } from "../theme";
import { T } from "../type";
import { Avatar } from "./Avatar";
import { MoneyText } from "./MoneyText";

export type RefundRow = { person: Person; putIn: number | null; back: number };

export const RefundTable: React.FC<{
  rows: RefundRow[];
  /** The phone owner's id: sorted first, highlighted, "(you)". */
  me?: string | null;
  caption?: string;
  /** Override what the "Gets back" column shows per row (e.g. a counting-up value). */
  backShown?: number[];
  style?: React.CSSProperties;
}> = ({ rows, me = null, caption = copy["close.table.caption"], backShown, style }) => {
  const { c } = useUi();
  const sorted = [...rows].sort((a, b) => {
    const am = a.person.id === me;
    const bm = b.person.id === me;
    if (am !== bm) return am ? -1 : 1;
    return (a.person.joinIndex ?? 99) - (b.person.joinIndex ?? 99);
  });
  const totalIn = sorted.reduce((s, r) => s + (r.putIn ?? 0), 0);
  const totalBack = sorted.reduce((s, r) => s + r.back, 0);
  const shownBack = (r: RefundRow) => {
    const i = rows.indexOf(r);
    return backShown?.[i] ?? r.back;
  };
  const totalShown = backShown ? sorted.reduce((s, r) => s + shownBack(r), 0) : totalBack;
  // The app's rows measure 45 px + border (a 17 px amount on a 16/24 strut makes a ~24.4 px line box, which the
  // app's Chromium rounds up); the header and total rows measure ~0.7 px over their nominal size.
  const cell: React.CSSProperties = { padding: "10.5px 0", verticalAlign: "middle" };
  const foot: React.CSSProperties = { padding: "10.33px 0", verticalAlign: "middle" };
  return (
    <table data-ui="refund-table" style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", textAlign: "left", ...style }}>
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
        {sorted.map((r) => {
          const mine = r.person.id === me;
          return (
            <tr key={r.person.id} style={{ borderTop: `1px solid ${c.line}`, background: mine ? c.surfaceSunken : undefined }}>
              <th style={{ ...cell, paddingLeft: 8, fontWeight: 400 }}>
                <span style={{ display: "flex", minWidth: 0, alignItems: "center", gap: 8 }}>
                  <Avatar person={r.person} size="xs" />
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: c.ink, ...(mine ? T.label : T.body) }}>
                    {mine ? copy["close.table.you"](r.person.name) : r.person.name}
                  </span>
                </span>
              </th>
              <td style={{ ...cell, textAlign: "right" }}>{r.putIn !== null ? <MoneyText amount={r.putIn} color={c.inkMuted} /> : null}</td>
              <td style={{ ...cell, paddingRight: 8, textAlign: "right" }}>
                <MoneyText amount={shownBack(r)} color={c.ink} />
              </td>
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
