// /shared-account-with-friends' comparison (page-plan: joint bank account vs one friend holding the money vs a Pot;
// no brand names; joint-account facts kept general, the one specific claim cited under it). The questions run down
// and the three ways across, the transpose of <CompareTable>, because here the reader compares answers question by
// question. ONE semantic <table>: from md a plain table on a `surface` card with Pot's column on `surface-sunken`;
// below md each question becomes its own card listing the three answers, each with its way above it (a visual label,
// aria-hidden, since the cell keeps its column header), so it never scrolls sideways at 320 px. No checks or
// crosses: the answers are words.
import { cn } from "@/lib/client/cn"

export interface AccountWay {
  id: string
  name: string
  /** Pot's own column */
  ours?: boolean
}

export interface AccountQuestion {
  id: string
  question: string
  /** one answer per way, in ways order */
  answers: readonly string[]
}

export function AccountCompare({
  caption,
  questionLabel,
  ways,
  questions,
  className,
}: {
  caption: string
  /** the first column's header ("The question") */
  questionLabel: string
  ways: readonly AccountWay[]
  questions: readonly AccountQuestion[]
  className?: string
}) {
  return (
    <div className={cn("md:overflow-clip md:rounded-lg md:bg-surface md:shadow-card md:dark:ring-1 md:dark:ring-line", className)}>
      <table className="w-full border-collapse max-md:block" data-compare>
        <caption className="pb-3 text-left font-display text-heading text-ink max-md:block md:px-6 md:pt-6 md:pb-2">{caption}</caption>
        <thead className="max-md:sr-only">
          <tr className="border-b border-line">
            <th scope="col" className="w-[22%] px-4 py-2 text-left text-body-sm font-semibold text-ink-muted md:pl-6">
              {questionLabel}
            </th>
            {ways.map((w) => (
              <th
                key={w.id}
                scope="col"
                className={cn("px-4 py-2 text-left text-body-sm font-semibold last:pr-6", w.ours ? "bg-surface-sunken text-ink dark:bg-ground" : "text-ink-muted")}
              >
                {w.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="max-md:flex max-md:flex-col max-md:gap-3">
          {questions.map((q) => (
            <tr
              key={q.id}
              data-question={q.id}
              className="max-md:block max-md:rounded-lg max-md:bg-surface max-md:p-4 max-md:shadow-card md:border-b md:border-line md:last:border-b-0 max-md:dark:ring-1 max-md:dark:ring-line"
            >
              <th scope="row" className="text-left align-top font-display text-heading text-ink max-md:block md:px-4 md:py-4 md:pl-6 md:font-sans md:text-label">
                {q.question}
              </th>
              {q.answers.map((a, i) => {
                const w = ways[i]!
                return (
                  <td
                    key={w.id}
                    data-way={w.id}
                    className={cn(
                      "align-top text-body-sm max-md:mt-3 max-md:block md:px-4 md:py-4 md:last:pr-6",
                      w.ours
                        ? "font-semibold text-ink max-md:rounded-md max-md:bg-surface-sunken max-md:p-3 md:bg-surface-sunken max-md:dark:bg-ground md:dark:bg-ground"
                        : "text-ink-muted",
                    )}
                  >
                    <span aria-hidden className="block text-label text-ink md:hidden">
                      {w.name}
                    </span>
                    {a}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
