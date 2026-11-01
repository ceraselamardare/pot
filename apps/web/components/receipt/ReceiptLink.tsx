// A quiet "Receipt ↗" text link to the explorer (never a button, never marigold): ink-muted, small, opens a new
// tab. Rendered only for a real transaction hash (lib/client/explorer.ts), so optimistic and pending items have
// none. The hash itself is never shown; the accessible name says what the receipt is for and where it goes.
import { ArrowUpRight } from "lucide-react"
import { t } from "@/i18n/t"
import { cn } from "@/lib/client/cn"
import { explorerAccountUrl, explorerTxUrl } from "@/lib/client/explorer"

const LINK = "inline-flex min-h-6 items-center gap-0.5 rounded-sm text-body-sm whitespace-nowrap text-ink-muted underline-offset-4 hover:underline"

export function ReceiptLink({ txHash, what, className }: { txHash: string | null | undefined; what: string; className?: string }) {
  const href = explorerTxUrl(txHash)
  if (!href) return null
  return (
    <a href={href} target="_blank" rel="noopener" aria-label={t("receipt.link.label", { what })} data-receipt className={cn(LINK, className)}>
      {t("receipt.link")}
      <ArrowUpRight aria-hidden className="size-3.5" strokeWidth={2} />
    </a>
  )
}

/** "View on explorer ↗" for an account (the Pot itself), same quiet style. */
export function ExplorerAccountLink({ account, label, className }: { account: string; label: string; className?: string }) {
  return (
    <a href={explorerAccountUrl(account)} target="_blank" rel="noopener" aria-label={label} data-explorer-account className={cn(LINK, className)}>
      {t("pot.explorer")}
      <ArrowUpRight aria-hidden className="size-3.5" strokeWidth={2} />
    </a>
  )
}

/** Keeps room for a receipt link positioned over a row's corner (so text never runs under it). */
export function ReceiptSpace() {
  return (
    <span aria-hidden className="invisible inline-flex min-h-6 items-center gap-0.5 text-body-sm whitespace-nowrap">
      {t("receipt.link")}
      <span className="size-3.5" />
    </span>
  )
}
