// Beside /group-gift's steps: the pay-in link Ana sends Nora's family, as the app's "Ask anyone to pay in" sheet shows
// it (the app's own payin.* words): anyone with the link pays in without joining, they choose the amount, a note for
// them, and how long it works. One image (role="img" + uc.gift.payin.label); everything inside is aria-hidden + inert.
// The sheet's buttons are drawn as secondary (no marigold: the hero's [Start a Pot] is the page's one).
import { Link } from "lucide-react"
import { CoverTile } from "@/components/pot/CoverTile"
import { t } from "@/i18n/t"
import { GIFT_EMOJI } from "./cast"

export function PayInCard() {
  const potName = t("uc.gift.pot")
  return (
    <div role="img" aria-label={t("uc.gift.payin.label")} className="rounded-lg bg-surface-sunken p-3 md:p-4 dark:bg-ground dark:ring-1 dark:ring-line">
      <div aria-hidden inert className="rounded-lg bg-surface p-4 shadow-card">
        <div className="flex items-center gap-3">
          <CoverTile emoji={GIFT_EMOJI} cover={5} size="md" />
          <div className="min-w-0">
            <p className="font-display text-heading text-ink">{t("payin.title")}</p>
            <p className="text-body-sm text-ink-muted">{potName}</p>
          </div>
        </div>
        <p className="mt-3 text-body text-ink">{t("payin.intro", { potName })}</p>

        <p className="mt-4 text-label text-ink">{t("payin.tone.label")}</p>
        <div className="mt-2 grid grid-cols-2 gap-1 rounded-md bg-surface-sunken p-1 dark:bg-ground">
          <span className="rounded-sm bg-surface px-3 py-2 text-center text-body-sm font-semibold text-ink shadow-card">{t("payin.tone.payment")}</span>
          <span className="px-3 py-2 text-center text-body-sm text-ink-muted">{t("payin.tone.gift")}</span>
        </div>

        <dl className="mt-4 divide-y divide-line border-y border-line text-body-sm">
          <div className="flex justify-between gap-3 py-2.5">
            <dt className="text-ink-muted">{t("payin.amount")}</dt>
            <dd className="text-right font-semibold text-ink">{t("payin.amount.open")}</dd>
          </div>
          <div className="flex justify-between gap-3 py-2.5">
            <dt className="shrink-0 text-ink-muted">{t("payin.note")}</dt>
            <dd className="min-w-0 text-right text-ink">{t("uc.gift.payin.note")}</dd>
          </div>
        </dl>
        <p className="mt-3 text-body-sm text-ink-muted">{t("payin.expiry", { date: t("uc.gift.payin.until") })}</p>

        <span className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-md border border-line-strong bg-surface px-5 text-label text-ink">
          <Link className="size-5" strokeWidth={2} />
          {t("payin.share")}
        </span>
      </div>
    </div>
  )
}
