"use client"
// You → "Your Pot dollars": the person's own money outside every Pot (refunds after a close, spends paid to them,
// unused test dollars), read from the token's ft_balance_of(me) on the chain heartbeat (10 s while visible).
// No cash-out button: the MVP has none, and the card doesn't announce one.
import { Bone, Delayed } from "@/components/feedback/States"
import { MoneyText } from "@/components/money/MoneyText"
import { t } from "@/i18n/t"
import { useOwnDollars } from "@/lib/client/data"

export function YourBalance({ account }: { account: string }) {
  const balance = useOwnDollars(account, true)
  return (
    <section aria-labelledby="you-balance-h" className="mb-4 rounded-lg bg-surface p-4 shadow-card" data-you-balance>
      <h2 id="you-balance-h" className="text-label text-ink-muted">
        {t("you.balance.title")}
      </h2>
      <p className="mt-1 min-h-10">
        {balance === undefined ? (
          <Delayed>
            <Bone className="h-9 w-32" />
          </Delayed>
        ) : (
          <MoneyText micro={balance} variant="title" className="text-ink" />
        )}
      </p>
      <p className="mt-1 text-body-sm text-ink-muted">{t("you.balance.helper")}</p>
    </section>
  )
}
