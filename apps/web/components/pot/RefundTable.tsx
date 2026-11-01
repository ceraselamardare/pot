// RefundTable (ux-spec §4.14, design-direction 02 §7): a real <table> (WCAG 1.3.1) with row and column headers.
// Person · Put in · Gets back; "You" first on surface-sunken with the name in `label`; a total row closes it.
// Every person is listed, never only a total: that is what makes "everyone gets their share back" visible.
// At 320 px three columns fit; long names truncate visually but stay whole for screen readers.
import { Avatar } from "@/components/pot/Avatar"
import { MoneyText } from "@/components/money/MoneyText"
import { t } from "@/i18n/t"
import type { PersonVM } from "@/lib/client/mock/types"
import type { Micro } from "@/lib/client/money"
import { cn } from "@/lib/client/cn"

export interface RefundRow {
  person: PersonVM
  /** null when unknown (a payout decoded from the proposal for someone no longer listed) */
  putIn: Micro | null
  back: Micro
}

/** You first, then join order (the colours match the feed and the timeline). */
export function sortRefundRows(rows: RefundRow[], me: string | null): RefundRow[] {
  return [...rows].sort((a, b) => {
    const am = a.person.id === me
    const bm = b.person.id === me
    if (am !== bm) return am ? -1 : 1
    return (a.person.joinIndex ?? 99) - (b.person.joinIndex ?? 99)
  })
}

export function RefundTable({ rows, me, caption, className }: { rows: RefundRow[]; me: string | null; caption: string; className?: string }) {
  const sorted = sortRefundRows(rows, me)
  const totalIn = sorted.reduce((s, r) => s + (r.putIn ?? 0n), 0n)
  const totalBack = sorted.reduce((s, r) => s + r.back, 0n)
  const knownIn = sorted.every((r) => r.putIn !== null)
  return (
    <table className={cn("w-full table-fixed border-collapse text-left", className)} data-refund-table>
      <caption className="pb-1 pl-2 text-left text-label text-ink">{caption}</caption>
      <colgroup>
        <col />
        <col className="w-[5.75rem]" />
        <col className="w-[5.75rem]" />
      </colgroup>
      <thead>
        <tr className="text-body-sm text-ink-muted">
          <th scope="col" className="py-2 pl-2 font-normal">
            {t("close.table.person")}
          </th>
          <th scope="col" className="py-2 text-right font-normal">
            {t("close.table.put_in")}
          </th>
          <th scope="col" className="py-2 pr-2 text-right font-normal">
            {t("close.table.gets_back")}
          </th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => {
          const mine = r.person.id === me
          return (
            <tr key={r.person.id} data-refund-row={r.person.name} className={cn("border-t border-line", mine && "bg-surface-sunken")}>
              <th scope="row" className="py-2.5 pl-2 font-normal">
                <span className="flex min-w-0 items-center gap-2">
                  <Avatar person={r.person} size="xs" className="max-[359px]:hidden" />
                  <span className={cn("min-w-0 truncate text-ink", mine ? "text-label" : "text-body")}>
                    {mine ? t("close.table.you", { name: r.person.name }) : r.person.name}
                  </span>
                </span>
              </th>
              <td className="py-2.5 text-right">{r.putIn !== null && <MoneyText micro={r.putIn} className="text-ink-muted" />}</td>
              <td className="py-2.5 pr-2 text-right">
                <MoneyText micro={r.back} className="text-ink" />
              </td>
            </tr>
          )
        })}
      </tbody>
      <tfoot>
        <tr className="border-t-2 border-line-strong">
          <th scope="row" className="py-2.5 pl-2 text-label font-semibold text-ink">
            {t("close.table.total")}
          </th>
          <td className="py-2.5 text-right">{knownIn && <MoneyText micro={totalIn} className="text-ink-muted" />}</td>
          <td className="py-2.5 pr-2 text-right" data-refund-total>
            <MoneyText micro={totalBack} className="text-ink" />
          </td>
        </tr>
      </tfoot>
    </table>
  )
}
