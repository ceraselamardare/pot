// /demo/live: the live persona demo (F-15 UI; ux-spec §4.19; frontend-architecture §2.6; D-63), moved here from /demo
// when /demo became the simulated explainer (plan/design-direction/05 §3.6). OFF by default and linked from nowhere:
// it renders only with FLAG_DEMO_LIVE=true at build time (it signs real testnet transactions through the relayer);
// otherwise it is a 404. Server-rendered and
// prerendered: the HTML itself carries the explanation, the three persona forms (they work without JS), "What to
// try" and a snapshot of the reference Pot (balance, members, the last 5 feed lines as plain text), so AI judges
// that fetch HTML see the product. Night applies without JS through the tokens' prefers-color-scheme fallback.
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { Lockup } from "@/components/brand/Lockup"
import { AutoPersona, DemoPersonaForm, ReadonlyNotice } from "@/components/landing/DemoForms"
import { CoverTile } from "@/components/pot/CoverTile"
import { GoalBar } from "@/components/pot/GoalBar"
import { MoneyText } from "@/components/money/MoneyText"
import { t } from "@/i18n/t"
import { formatUsd } from "@/lib/client/money"
import { getDemoSnapshot } from "./demo-snapshot"

export const metadata: Metadata = {
  title: { absolute: `${t("app.name")} · ${t("demo.banner")}` },
  description: t("demo.intro"),
}

/** FLAG_DEMO_LIVE (default off): the live, signing persona demo exists only when a deploy opts in. */
function demoLiveEnabled(): boolean {
  return process.env.FLAG_DEMO_LIVE === "true"
}

export default async function DemoLivePage() {
  if (!demoLiveEnabled()) notFound()
  const pot = await getDemoSnapshot()
  const balance = pot ? BigInt(pot.balance) : 0n
  const totalIn = pot ? BigInt(pot.totalIn) : 0n
  return (
    <main id="main" className="mx-auto w-full max-w-flow px-4 pt-10 pb-[calc(24px+env(safe-area-inset-bottom))] md:px-6">
      <Suspense fallback={null}>
        <AutoPersona />
      </Suspense>
      <Suspense fallback={null}>
        <ReadonlyNotice />
      </Suspense>
      <div className="flex justify-center">
        <Lockup className="h-10 w-auto" />
      </div>
      <p className="mx-auto mt-6 w-fit rounded-pill bg-surface-sunken px-3 py-1 text-body-sm font-semibold text-ink">{t("demo.banner")}</p>
      <h1 className="mt-4 text-center font-display text-title text-ink">{t("demo.choose")}</h1>
      <p className="mt-2 text-center text-body text-ink-muted">{t("demo.intro")}</p>

      <div className="mt-6 flex flex-col gap-3">
        <DemoPersonaForm persona="maya" primary />
        <DemoPersonaForm persona="sam" />
        <DemoPersonaForm persona="leo" />
      </div>

      <section aria-labelledby="try-h" className="mt-10">
        <h2 id="try-h" className="font-display text-heading text-ink">
          {t("demo.try.title")}
        </h2>
        <ol className="mt-3 flex flex-col gap-3">
          {(["demo.try.1", "demo.try.2", "demo.try.3"] as const).map((k, i) => (
            <li key={k} className="flex gap-3 rounded-md bg-surface p-3">
              <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-pill bg-surface-sunken font-display text-body font-bold text-ink">
                {i + 1}
              </span>
              <span className="text-body text-ink">{t(k)}</span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="snap-h" className="mt-10" data-demo-snapshot>
        <h2 id="snap-h" className="font-display text-heading text-ink">
          {t("demo.snapshot.title")}
        </h2>
        {pot ? (
          <div className="mt-3 rounded-lg bg-surface p-4 shadow-card">
            <div className="flex items-center gap-3">
              <CoverTile emoji={pot.emoji} cover={0} size="md" />
              <p className="font-display text-heading text-ink">{pot.name}</p>
            </div>
            <p className="mt-4 text-body-sm text-ink-muted">{t("demo.snapshot.balance", { potName: pot.name, balance: formatUsd(balance) })}</p>
            <p>
              <MoneyText micro={balance} variant="hero" className="text-ink" />
            </p>
            <GoalBar collected={totalIn} goal={totalIn} className="mt-3" />
            <p className="mt-3 text-body-sm text-ink">
              {t("demo.snapshot.members", { names: pot.members.map((m) => m.name).join(", ") })}
            </p>
            <h3 className="mt-4 text-label text-ink">{t("demo.snapshot.feed")}</h3>
            <ul className="mt-2 flex flex-col gap-1 text-body-sm text-ink-muted">
              {pot.members.slice(0, 5).map((m) => (
                <li key={m.name}>{t("feed.contribution", { name: m.name, amount: formatUsd(BigInt(m.contributed), "whole") })}</li>
              ))}
            </ul>
            <a href={`/api/pots/${pot.dao}/feed`} className="mt-4 inline-flex min-h-11 items-center text-label text-link underline underline-offset-4">
              {t("demo.snapshot.json")}
            </a>
          </div>
        ) : (
          <p className="mt-3 text-body text-ink-muted">{t("demo.snapshot.unavailable")}</p>
        )}
      </section>
    </main>
  )
}
