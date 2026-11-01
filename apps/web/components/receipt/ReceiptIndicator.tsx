// "Receipt attached": the quiet icon + word on a row whose spend has receipt details saved with it (the feed, a
// person's activity, Requests, You and the public record). Not a link: the row itself opens the spend's details.
import { ReceiptText } from "lucide-react"
import { t } from "@/i18n/t"
import { cn } from "@/lib/client/cn"

export function ReceiptIndicator({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)} data-receipt-indicator>
      <ReceiptText aria-hidden className="size-4 shrink-0" strokeWidth={2} />
      {t("details.receipt.indicator")}
    </span>
  )
}
