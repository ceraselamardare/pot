"use client"
// Pots home (ux-spec §4.3, design-direction 02 §1): every Pot I'm in, how much each holds and where someone
// needs my OK. Once Pots exist there is no marigold here: "+" in the header and a dashed ghost card create.
// Empty: the glyph, the copy and the one marigold [Start a Pot] in the bottom 40%.
import { ChevronRight, Clock, Plus } from "lucide-react"
import Link from "next/link"
import { CardsSkeleton, EmptyState } from "@/components/feedback/States"
import { PotCard } from "@/components/pot/PotParts"
import { Button } from "@/components/ui/button"
import { CreatePotSheet } from "@/components/sheets/CreatePotSheet"
import { pageTitle, t } from "@/i18n/t"
import { usePots, useWaitingCount } from "@/lib/client/data"
import { closeSheet, openSheet, useSheetParams } from "@/lib/client/sheet"

export function PotsScreen() {
  const pots = usePots()
  const waiting = useWaitingCount()
  const { sheet } = useSheetParams()
  const start = () => openSheet("create")
  return (
    <>
      <title>{pageTitle(t("pots.title"))}</title>
      <main id="main" className="mx-auto w-full max-w-flow px-4 pb-8 md:max-w-app md:px-6">
        <header className="flex items-center justify-between pt-5 pb-4">
          <h1 className="font-display text-title text-ink">{t("pots.title")}</h1>
          {pots && pots.length > 0 && (
            <button
              type="button"
              onClick={start}
              aria-label={t("pots.empty.cta")}
              className="-mr-2 grid size-11 place-items-center rounded-pill text-ink hover:bg-surface-sunken"
            >
              <Plus aria-hidden className="size-6" strokeWidth={2.25} />
            </button>
          )}
        </header>

        {waiting > 0 && (
          <Link
            href="/requests"
            className="mb-4 flex min-h-14 items-center gap-3 rounded-md bg-surface px-4 shadow-card hover:bg-surface-sunken"
            data-waiting-strip
          >
            <Clock aria-hidden className="size-5 text-waiting" strokeWidth={2.25} />
            <span className="flex-1 text-label text-ink">{t("pots.waiting_strip", { n: waiting })}</span>
            <ChevronRight aria-hidden className="size-5 text-ink-muted" strokeWidth={2} />
          </Link>
        )}

        {pots === null ? (
          <CardsSkeleton />
        ) : pots.length === 0 ? (
          <div className="flex min-h-[60dvh] flex-col">
            <EmptyState title={t("pots.empty.title")} body={t("pots.empty.body")} className="flex-1 justify-center" />
            <div className="flex flex-col gap-3 pb-4">
              <Button variant="primary" className="w-full" onClick={start}>
                {t("pots.empty.cta")}
              </Button>
              <p className="text-center text-body-sm text-ink-muted">{t("pots.empty.join_hint")}</p>
            </div>
          </div>
        ) : (
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2 [&>li]:min-w-0">
            {pots.map((p) => (
              <li key={p.slug}>
                <PotCard pot={p} />
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={start}
                className="flex h-18 w-full items-center justify-center gap-2 rounded-lg border-[1.5px] border-dashed border-line-strong text-label text-ink hover:bg-surface-sunken md:h-full md:min-h-18"
              >
                <Plus aria-hidden className="size-5" strokeWidth={2.25} />
                {t("pots.empty.cta")}
              </button>
            </li>
          </ul>
        )}
      </main>
      <CreatePotSheet open={sheet === "create"} onClose={closeSheet} />
    </>
  )
}
