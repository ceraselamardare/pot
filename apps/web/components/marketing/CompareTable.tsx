// An honest comparison (page-plan: no brand names; keep facts about other ways general and true) as ONE semantic
// <table>: a row per way, a column per question. From md it's a plain table on a `surface` card; below md each row
// becomes its own card, every value with its question above it (a visual label, aria-hidden, since the cell keeps its
// column header), so it never needs horizontal scrolling at 320 px. The `ours` row (Pot) is set in `ink` with a
// `line-strong` rim; the others stay muted. No checks or crosses: the values are words.
import { cn } from "@/lib/client/cn"

export interface CompareWay {
  id: string
  name: string
  /** one value per criterion, in criteria order */
  values: readonly string[]
  /** Pot's own row */
  ours?: boolean
}

export function CompareTable({
  caption,
  wayLabel,
  criteria,
  ways,
  className,
}: {
  caption: string
  /** the first column's header ("The way") */
  wayLabel: string
  criteria: readonly string[]
  ways: readonly CompareWay[]
  className?: string
}) {
  return (
    <div className={cn("md:rounded-lg md:bg-surface md:shadow-card", className)}>
      <table className="w-full border-collapse max-md:block" data-compare>
        <caption className="pb-3 text-left font-display text-heading text-ink max-md:block md:px-6 md:pt-6 md:pb-2">{caption}</caption>
        <thead className="max-md:sr-only">
          <tr className="border-b border-line">
            <th scope="col" className="w-[22%] px-4 py-2 text-left text-body-sm font-semibold text-ink-muted md:pl-6">
              {wayLabel}
            </th>
            {criteria.map((c) => (
              <th key={c} scope="col" className="px-4 py-2 text-left text-body-sm font-semibold text-ink-muted last:pr-6">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="max-md:flex max-md:flex-col max-md:gap-3">
          {ways.map((w) => (
            <tr
              key={w.id}
              data-way={w.id}
              className={cn(
                "max-md:block max-md:rounded-lg max-md:bg-surface max-md:p-4 max-md:shadow-card md:border-b md:border-line md:last:border-b-0",
                w.ours && "max-md:ring-2 max-md:ring-line-strong md:bg-surface-sunken dark:md:bg-ground",
              )}
            >
              <th
                scope="row"
                className="text-left align-top font-display text-heading text-ink max-md:block md:px-4 md:py-4 md:pl-6 md:font-sans md:text-label"
              >
                {w.name}
              </th>
              {w.values.map((v, i) => (
                <td
                  key={criteria[i]}
                  className={cn(
                    "align-top text-body-sm max-md:mt-3 max-md:block md:px-4 md:py-4 md:last:pr-6",
                    w.ours ? "font-semibold text-ink" : "text-ink-muted",
                  )}
                >
                  <span aria-hidden className="block text-label text-ink md:hidden">
                    {criteria[i]}
                  </span>
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
