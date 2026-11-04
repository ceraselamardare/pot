"use client"
// The Pot screen's deposit cards (design-direction 01 §4: "Once the sheet is closed, a compact card sits on the
// Pot above the feed"; "Arrived but not added: a persistent Pot card … That card takes the screen's marigold").
//  - in progress: "Adding $150 from Base" + the step, five small dots; tap reopens the stepper
//  - arrived: "Your $149.99 arrived" + [Add it to the Pot], the one tap (the hero's Add money turns secondary)
//  - stopped (refunded / failed / expired, within the last hour): a quiet card that opens the details
import { Check, ChevronRight, X } from "lucide-react"
import { useState } from "react"
import { TypingDots } from "@/components/feedback/TypingDots"
import { Button } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { useOnline } from "@/lib/client/browser"
import { cn } from "@/lib/client/cn"
import type { PotVM } from "@/lib/client/mock/types"
import { openSheet } from "@/lib/client/sheet"
import { addArrived, arrivedAmount, usePotDeposits, usdTargetOf, type DepositView } from "@/lib/deposit"
import { NETWORK, usd, usdShort } from "./format"

/** The arrived deposit waiting for its one tap (PotScreen gives it the marigold). */
export function useArrivedDeposit(slug: string): DepositView | null {
  const q = usePotDeposits(slug)
  return q.data?.deposits.find((d) => d.status === "SUCCESS") ?? null
}

export function DepositCards({ pot, actor }: { pot: PotVM; actor: string }) {
  const q = usePotDeposits(pot.slug)
  const list = (q.data?.deposits ?? []).filter((d) => d.status !== "ADDED")
  if (list.length === 0) return null
  return (
    <section className="flex flex-col gap-2" aria-label={t("xc.status.on_way")} data-deposit-cards>
      {list.map((d) => (d.status === "SUCCESS" ? <ArrivedCard key={d.id} d={d} pot={pot} actor={actor} /> : <ProgressCard key={d.id} d={d} />))}
    </section>
  )
}

function ProgressCard({ d }: { d: DepositView }) {
  const stopped = ["REFUNDED", "FAILED", "EXPIRED", "STUCK"].includes(d.status)
  return (
    <button
      type="button"
      onClick={() => openSheet("add", { src: "xc", d: d.id, amount: (Number(usdTargetOf(d) / 10_000n) / 100).toString() })}
      className="flex min-h-16 items-center gap-3 rounded-lg bg-surface p-4 text-left shadow-card"
      data-deposit-card={d.status}
    >
      <span aria-hidden className={cn("grid size-9 shrink-0 place-items-center rounded-pill bg-surface-sunken", stopped ? "text-declined" : "text-ink")}>
        {stopped ? <X className="size-5" strokeWidth={2.5} /> : <TypingDots size="sm" still />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-label text-ink">
          {stopped ? t("xc.card.stopped", { network: NETWORK[d.chain] }) : t("xc.card.progress", { amount: usdShort(usdTargetOf(d)), network: NETWORK[d.chain] })}
        </span>
        {!stopped && (
          <span className="mt-1 flex items-center gap-2 text-body-sm text-ink-muted">
            <span aria-hidden className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <span key={n} className={cn("size-1.5 rounded-pill", n <= d.step ? "bg-ink" : "bg-line-strong")} />
              ))}
            </span>
            {t("xc.card.step", { step: d.step })}
          </span>
        )}
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-ink-muted" strokeWidth={2} />
    </button>
  )
}

function ArrivedCard({ d, pot, actor }: { d: DepositView; pot: PotVM; actor: string }) {
  const online = useOnline()
  const [adding, setAdding] = useState(false)
  const amount = arrivedAmount(d)
  const add = () => {
    if (adding) return
    setAdding(true)
    const h = addArrived(pot, d, actor)
    if (!h) return setAdding(false)
    void h.done.then((r) => {
      if (r !== "ok") setAdding(false)
    })
  }
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-surface p-4 shadow-card" data-deposit-card="SUCCESS">
      <div>
        <p className="font-display text-heading text-ink">{t("xc.arrived.title", { amount: usd(amount) })}</p>
        <p className="mt-1 text-body-sm text-ink-muted">{adding ? t("xc.arrived.adding", { potName: pot.name }) : t("xc.arrived.body", { potName: pot.name })}</p>
      </div>
      <Button variant="primary" className="w-full" disabled={adding || !online} aria-busy={adding || undefined} onClick={add} data-add-arrived>
        {adding ? <TypingDots size="sm" /> : <Check aria-hidden strokeWidth={2.25} />}
        {t("xc.arrived.cta")}
      </Button>
    </div>
  )
}
