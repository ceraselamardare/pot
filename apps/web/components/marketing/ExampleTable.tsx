// A worked example as a real <table> on a `surface` card (page-plan "Structure" 4). The numbers are computed by
// the page's lib/marketing/<page>.ts with the app's own math and passed in as cells: render amounts with
// <MoneyText> (tabular figures, two decimals, U+2212). Keep it to three or four narrow columns so it fits 320 px
// without scrolling; put the explanation in a row's `sub` line rather than another column.
import { cn } from "@/lib/client/cn"

export interface ExampleColumn {
  id: string
  label: string
  /** right-aligned (amounts) */
  numeric?: boolean
}

export interface ExampleRow {
  id: string
  /** the first cell, a row header */
  head: React.ReactNode
  /** a quieter full-width line under the row (who approved it, why) */
  sub?: React.ReactNode
  /** the other cells, in column order (after the first) */
  cells: React.ReactNode[]
}

export function ExampleTable({
  caption,
  columns,
  rows,
  foot,
  note,
  className,
  children,
}: {
  caption: string
  columns: readonly ExampleColumn[]
  rows: readonly ExampleRow[]
  /** a <tfoot> row: [head, ...cells] (a total) */
  foot?: { head: React.ReactNode; cells: React.ReactNode[] }
  /** a line under the table (rounding, a check) */
  note?: React.ReactNode
  className?: string
  /** decoration positioned against the card (a sticker) */
  children?: React.ReactNode
}) {
  const align = (i: number) => (columns[i]?.numeric ? "text-right" : "text-left")
  const cell = "px-2 py-3 align-top first:pl-4 last:pr-4 xs:px-3 md:px-4 md:first:pl-6 md:last:pr-6"
  return (
    <div className={cn("relative rounded-lg bg-surface shadow-card", className)}>
      <table className="w-full border-collapse">
        <caption className="px-4 pt-4 pb-2 text-left font-display text-heading text-ink md:px-6 md:pt-6">{caption}</caption>
        <thead>
          <tr className="border-b border-line">
            {columns.map((c, i) => (
              <th key={c.id} scope="col" className={cn(cell, "py-2 text-body-sm font-semibold text-ink-muted", align(i))}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        {rows.map((r) => (
          // one <tbody> per row, so its explanation line (a full-width second row: the first column alone would be
          // too narrow for it on a phone) stays grouped with it and the rule goes under the pair
          <tbody key={r.id} data-row={r.id} className="border-b border-line last:border-b-0">
            <tr>
              <th scope="row" className={cn(cell, "text-left text-body font-normal text-ink", r.sub && "pb-1")}>
                {r.head}
              </th>
              {r.cells.map((c, i) => (
                <td key={i} className={cn(cell, "text-body-sm text-ink xs:text-body", r.sub && "pb-1", align(i + 1))}>
                  {c}
                </td>
              ))}
            </tr>
            {r.sub ? (
              <tr>
                <td colSpan={columns.length} className={cn(cell, "pt-0 text-left text-body-sm text-ink-muted")}>
                  {r.sub}
                </td>
              </tr>
            ) : null}
          </tbody>
        ))}
        {foot ? (
          <tfoot>
            <tr className="border-t border-line-strong">
              <th scope="row" className={cn(cell, "text-left text-label text-ink")}>
                {foot.head}
              </th>
              {foot.cells.map((c, i) => (
                <td key={i} className={cn(cell, "text-label text-ink", align(i + 1))}>
                  {c}
                </td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>
      {note ? <div className="border-t border-line px-4 py-3 text-body-sm text-ink-muted md:px-6">{note}</div> : null}
      {children}
    </div>
  )
}
