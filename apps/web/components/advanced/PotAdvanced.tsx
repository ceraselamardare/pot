"use client"
// Per-Pot rows of the Advanced room (ux-spec §10 row 2; D-52): the Pot contract (its DAO) and the Rules
// contract (the hub), explorer links, and the "On-chain rules" panel read live from get_policy + get_rules.
// Testnet shows the explorer, never Trezu (Trezu is mainnet-only, D-52). Lint-exempt room: ids and "testnet".
import { ChevronDown, ExternalLink } from "lucide-react"
import { useState } from "react"
import { t } from "@/i18n/t"
import { explorerAccount, useOnChainRules } from "@/lib/client/advanced"
import { daoOf } from "@/lib/client/config"
import { formatUsd } from "@/lib/client/money"
import type { PotCardVM } from "@/lib/client/mock/types"

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className="flex min-h-11 items-center gap-1.5 text-body-sm text-ink underline underline-offset-4">
      {children}
      <ExternalLink aria-hidden className="size-4 shrink-0" strokeWidth={2} />
    </a>
  )
}

export function PotAdvanced({ pot }: { pot: PotCardVM }) {
  const [open, setOpen] = useState(false)
  const dao = daoOf(pot.slug)
  const panelId = `onchain-${pot.slug}`
  return (
    <li className="rounded-lg bg-surface-sunken p-4" data-advanced-pot={pot.slug}>
      <p className="text-label text-ink">
        <span aria-hidden>{pot.emoji} </span>
        {pot.name}
      </p>
      <p className="mt-1 text-body-sm text-ink-muted">{t("advanced.pot.ids")}</p>
      <code className="mt-1 block truncate text-body-sm text-ink-muted">{dao}</code>
      <Ext href={explorerAccount(dao)}>{t("advanced.explorer.pot", { potName: pot.name })}</Ext>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="mt-1 flex min-h-11 w-full items-center justify-between gap-2 rounded-sm text-left text-label text-ink"
        data-onchain-toggle
      >
        {open ? t("advanced.onchain.hide") : t("advanced.onchain.show")}
        <ChevronDown aria-hidden className={`size-5 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`} strokeWidth={2} />
      </button>
      <div id={panelId} hidden={!open}>
        {open && <OnChainPanel slug={pot.slug} />}
      </div>
    </li>
  )
}

function OnChainPanel({ slug }: { slug: string }) {
  const r = useOnChainRules(slug, true)
  if (r.state === "loading") return <p className="py-2 text-body-sm text-ink-muted">{t("advanced.onchain.loading")}</p>
  if (r.state === "error") return <p className="py-2 text-body-sm text-ink">{t("advanced.onchain.error")}</p>
  const d = r.data
  const rows: [string, string][] = [
    [t("advanced.onchain.members"), d.members.join(", ")],
    [t("advanced.onchain.rulebot"), d.rulebot.join(", ")],
    [t("advanced.onchain.threshold"), `${t("advanced.onchain.threshold.value", { num: d.threshold[0], den: d.threshold[1] })} → ${d.k}/${d.members.length}`],
    [t("advanced.onchain.quorum"), String(d.quorum)],
    [t("advanced.onchain.period"), t("advanced.onchain.period.value", { days: d.periodDays })],
    [t("advanced.onchain.instant_cap"), `${formatUsd(d.instantCap)} (${d.instantCap.toString()})`],
    [t("advanced.onchain.member_budget"), `${formatUsd(d.memberBudget)} (${d.memberBudget.toString()})`],
    [t("advanced.onchain.payees"), d.payees],
    [t("advanced.onchain.version"), String(d.version)],
    [t("advanced.onchain.open_rules"), d.openRules === null ? t("advanced.onchain.none") : `#${d.openRules}`],
  ]
  return (
    <section aria-labelledby={`${slug}-onchain-h`} className="mt-2 rounded-md border border-line bg-surface p-3" data-onchain-panel>
      <h3 id={`${slug}-onchain-h`} className="text-label text-ink">
        {t("advanced.onchain.title")}
      </h3>
      <p className="mt-1 text-body-sm text-ink-muted">{d.mock ? t("advanced.onchain.mock") : t("advanced.onchain.intro")}</p>
      <dl className="mt-2 flex flex-col divide-y divide-line">
        {rows.map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5 py-2 min-[420px]:flex-row min-[420px]:justify-between min-[420px]:gap-3">
            <dt className="text-body-sm text-ink-muted">{k}</dt>
            <dd className="text-body-sm break-all text-ink min-[420px]:text-right">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-2 flex flex-col">
        <Ext href={explorerAccount(d.hub)}>{d.hub}</Ext>
      </div>
    </section>
  )
}
