"use client"
// Money-in details (?sheet=deposit&d=<key>, 2026-11-04), the money-in twin of the spend details (ApproveSheet): opened
// from a money-in row (the feed's "Maya · Added money", a pay-in "Alex · Paid in · by link" / a gift, a person's
// activity, You → Your activity, the record's money from outside) by the Pot's members only (it lives in PotLoaded,
// and the API answers members only). `?sheet=gift&gift=<ref>` (the pay-in push, older links) opens it too.
// Anatomy, no marigold (nothing to decide): the title "Maya added $150"; the person, the amount and a status chip
// (icon + word); a compact source card (demo dollars · Pot dollars · from outside, with the link or page · from another
// app: "ETH on Base", sent, arrived, the rate, how long it took, the testnet demo pill); for another app a small
// timeline (address shown → sent → converted → arrived → added); facts (when, the top-up ask it answered); the payer's
// note; quiet receipts ("Receipt ↗" on NEAR; on Base and NEAR Intents for a real transfer, never for the simulated
// one); [Done]. The data: lib/client/deposits (mock world or GET /api/pots/[pot]/deposits/[key]).
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Check, CircleDollarSign, FlaskConical, Gift, HandCoins, Quote, ShieldCheck, type LucideIcon } from "lucide-react"
import { useState, type ReactNode } from "react"
import { Bone } from "@/components/feedback/States"
import { MoneyText } from "@/components/money/MoneyText"
import { Avatar } from "@/components/pot/Avatar"
import { StatusChip } from "@/components/pot/StatusChip"
import { QUIET_LINK, ReceiptLink } from "@/components/receipt/ReceiptLink"
import { Sheet } from "@/components/sheets/Sheet"
import { Button } from "@/components/ui/button"
import { coinAmount } from "@/components/features/deposit/format"
import { t } from "@/i18n/t"
import { cn } from "@/lib/client/cn"
import { useDepositDetails, type DepositDetailsVM, type DepositSourceVM } from "@/lib/client/deposits/data"
import { explorerTxUrl } from "@/lib/client/explorer"
import type { PotVM } from "@/lib/client/mock/types"
import { formatUsd } from "@/lib/client/money"
import { formatDate, formatTime } from "@/lib/client/time"
import { perCoinUsd } from "@/lib/deposits"

const whenText = (at: number) => [formatDate(at), formatTime(at)].join(", ")
const secFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })

/** The sheet's title: "Maya added $150" / "You added $150" / "Alex paid in $25" / "Ana sent a $10 gift". */
export function depositTitle(d: DepositDetailsVM, meId: string | null): string {
  const amount = formatUsd(d.amount, "whole")
  if (d.kind === "payin") return t(d.source.kind === "payin" && d.source.tone === "gift" ? "moneyin.title.gift" : "moneyin.title.payin", { name: d.who.name, amount })
  return d.who.id === meId ? t("moneyin.title.added.you", { amount }) : t("moneyin.title.added", { name: d.who.name, amount })
}

/** "Took 58 seconds" / "Took about 4 min" / "Took about 2 h". */
/** "30 s" / "about 4 min" / "about 2 h": the compact form for the source card's meta line. */
export function tookShort(ms: number): string {
  const sec = Math.max(1, Math.round(ms / 1000))
  if (sec < 90) return t("xc.dd.took.short.s", { n: sec })
  const m = Math.round(sec / 60)
  if (m < 90) return t("xc.dd.took.short.m", { n: m })
  return t("xc.dd.took.short.h", { n: Math.round(m / 60) })
}

export function tookWords(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000))
  if (s < 90) return t("xc.dd.took.s", { n: s })
  const m = Math.round(s / 60)
  if (m < 90) return t("xc.dd.took.m", { n: m })
  return t("xc.dd.took.h", { n: Math.round(m / 60) })
}

/** What the source card says (title, lines, icon), also the words the tests read. */
export function sourceWords(d: DepositDetailsVM, meId: string | null): { icon: LucideIcon; title: string; lines: string[] } {
  const s = d.source
  const you = d.who.id === meId
  switch (s.kind) {
    case "demo":
      return { icon: FlaskConical, title: t("moneyin.source.demo"), lines: [t("moneyin.source.demo.sub")] }
    case "pot_dollars":
      return { icon: CircleDollarSign, title: t("moneyin.source.pot_dollars"), lines: [you ? t("moneyin.source.pot_dollars.sub.you") : t("moneyin.source.pot_dollars.sub", { name: d.who.name })] }
    case "balance":
      return { icon: CircleDollarSign, title: t("moneyin.source.balance"), lines: [t("moneyin.source.balance.sub", { name: you ? t("feed.you") : d.who.name })] }
    case "payin": {
      const how = !s.link
        ? t("moneyin.source.payin.page")
        : s.link.by
          ? t("moneyin.source.payin.link.by", { name: s.link.by.id === meId ? t("feed.you") : s.link.by.name })
          : t("moneyin.source.payin.link")
      return {
        icon: s.tone === "gift" ? Gift : ArrowDownLeft,
        title: t(s.tone === "gift" ? "moneyin.source.gift" : "moneyin.source.payin"),
        lines: [how, ...(s.link?.amount ? [t("moneyin.source.payin.link.fixed", { amount: formatUsd(s.link.amount, "whole") })] : [])],
      }
    }
    case "xc": {
      // compact: "4.456 SUI → $4.00" then "About $0.89 per SUI · 30 s" (the refund, if any, on its own line)
      const lines: string[] = []
      const sent = s.sent !== null ? `${coinAmount(s.sent, s.decimals, s.stable)} ${s.coin}` : null
      const arrived = s.arrived !== null ? formatUsd(s.arrived) : null
      if (sent && arrived) lines.push(t("xc.dd.flow", { sent, arrived }))
      else if (sent) lines.push(t("xc.dd.sent", { amount: sent }))
      else if (arrived) lines.push(t("xc.dd.arrived", { amount: arrived }))
      const per = perCoinUsd(s)
      const meta = [
        per !== null ? t("xc.dd.rate", { amount: formatUsd(per), coin: s.coin }) : s.stable ? t("xc.dd.rate.stable", { coin: s.coin }) : null,
        s.took !== null ? tookShort(s.took) : null,
      ].filter((x): x is string => !!x)
      if (meta.length) lines.push(meta.join(" · "))
      if (s.refunded !== null) lines.push(t("xc.dd.refund", { amount: `${coinAmount(s.refunded, s.decimals, s.stable)} ${s.coin}` }))
      return { icon: ArrowLeftRight, title: t("xc.dd.title"), lines }
    }
  }
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 px-3 py-2">
      <dt className="text-body-sm text-ink-muted">{label}</dt>
      <dd className="text-right text-body text-ink">{children}</dd>
    </div>
  )
}

function SourceCard({ d, meId }: { d: DepositDetailsVM; meId: string | null }) {
  const w = sourceWords(d, meId)
  const s = d.source
  const Icon = w.icon
  return (
    <section aria-label={t("moneyin.source.label")} className="flex gap-3 rounded-md bg-surface-sunken p-3" data-deposit-source={s.kind}>
      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-pill bg-surface text-ink">
        <Icon className="size-5" strokeWidth={2} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-label text-ink">
          <span>{w.title}</span>
          {s.kind === "xc" && (
            <span className="inline-flex h-6 items-center rounded-pill bg-surface px-2 text-body-sm font-semibold text-ink" data-deposit-pair>
              {t("xc.dd.pair", { coin: s.coin, network: s.network })}
            </span>
          )}
        </h3>
        <ul className="flex flex-col gap-0.5 text-body-sm text-ink-muted tabular-nums">
          {w.lines.map((l, i) => (
            <li key={l} className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {l}
              {i === w.lines.length - 1 && s.kind === "xc" && s.simulated && (
                <span
                  className="inline-flex h-6 items-center gap-1 rounded-pill bg-surface px-2 text-body-sm text-ink-muted"
                  title={t("xc.dd.sim")}
                  data-deposit-sim
                >
                  <FlaskConical aria-hidden className="size-3.5 shrink-0" strokeWidth={2} />
                  <span aria-hidden>{t("xc.dd.sim.short")}</span>
                  <span className="sr-only">{t("xc.dd.sim")}</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/** The five moments, one compact line each: a check (or an open ring when not known), the moment, its time. */
function XcTimeline({ s }: { s: Extract<DepositSourceVM, { kind: "xc" }> }) {
  const label = (step: string) =>
    step === "sent" ? t("xc.dd.step.sent", { network: s.network }) : t(`xc.dd.step.${step}` as "xc.dd.step.address")
  return (
    <section aria-labelledby="moneyin-timeline-h" className="flex flex-col gap-2" data-deposit-timeline>
      <h3 id="moneyin-timeline-h" className="text-label text-ink">
        {t("xc.dd.timeline")}
      </h3>
      <ol className="flex flex-col">
        {s.timeline.map((x, i) => (
          <li key={x.step} className="relative flex min-h-8 items-center gap-3 text-body-sm" data-deposit-moment={x.step}>
            {i < s.timeline.length - 1 && (
              <span aria-hidden className={cn("absolute top-6 bottom-[-0.5rem] left-[9px] w-0.5 rounded-pill", x.at !== null ? "bg-approved" : "bg-line")} />
            )}
            {x.at !== null ? (
              <span aria-hidden className="relative grid size-5 shrink-0 place-items-center rounded-pill bg-approved text-surface">
                <Check className="size-3.5" strokeWidth={3} />
              </span>
            ) : (
              <span aria-hidden className="relative size-5 shrink-0 rounded-pill border-2 border-line-strong bg-surface" />
            )}
            <span className="min-w-0 flex-1 text-ink">{label(x.step)}</span>
            <span className="shrink-0 text-ink-muted tabular-nums">{x.at !== null ? secFmt.format(x.at) : t("xc.dd.step.unknown")}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function OutLink({ href, text, label, ...data }: { href: string; text: string; label: string } & { [k: `data-${string}`]: string }) {
  return (
    <a href={href} target="_blank" rel="noopener" aria-label={label} className={QUIET_LINK} {...data}>
      {text}
      <ArrowUpRight aria-hidden className="size-3.5" strokeWidth={2} />
    </a>
  )
}

function Receipts({ d, what }: { d: DepositDetailsVM; what: string }) {
  const s = d.source
  if (s.kind !== "xc") {
    if (!explorerTxUrl(d.txHash)) return null
    return <ReceiptLink txHash={d.txHash} what={what} className="self-start" />
  }
  const near = explorerTxUrl(d.txHash)
  const links: { href: string; text: string; where: string; data: string }[] = [
    ...(near ? [{ href: near, text: `${t("receipt.link")} · ${t("xc.dd.receipt.near")}`, where: t("xc.dd.receipt.near"), data: "near" }] : []),
    ...(s.originTx?.url ? [{ href: s.originTx.url, text: `${t("receipt.link")} · ${t("xc.dd.receipt.origin", { network: s.network })}`, where: t("xc.dd.receipt.origin", { network: s.network }), data: "origin" }] : []),
    ...(s.intentsUrl ? [{ href: s.intentsUrl, text: t("xc.dd.receipt.intents"), where: t("xc.dd.receipt.intents"), data: "intents" }] : []),
  ]
  if (!links.length) return null
  return (
    <section aria-labelledby="moneyin-receipts-h" className="flex flex-col gap-1" data-deposit-receipts>
      <h3 id="moneyin-receipts-h" className="text-label text-ink">
        {t("moneyin.receipts")}
      </h3>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {links.map((l) => (
          <li key={l.data}>
            <OutLink href={l.href} text={l.text} label={t("xc.dd.receipt.label", { where: l.where, what })} data-deposit-receipt={l.data} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function Body({ d, meId }: { d: DepositDetailsVM; meId: string | null }) {
  const s = d.source
  const title = depositTitle(d, meId)
  const status =
    d.status === "added" ? (
      <StatusChip status="approved">{t("moneyin.status.added")}</StatusChip>
    ) : d.status === "pending" ? (
      <StatusChip status="sending">{t("moneyin.status.pending")}</StatusChip>
    ) : (
      <StatusChip status="failed">{t("moneyin.status.failed")}</StatusChip>
    )
  return (
    <div className="flex flex-col gap-4 pt-1" data-deposit-details={d.key} data-deposit-kind={d.kind}>
      <div className="flex items-center gap-3">
        <Avatar person={d.who} size="md" />
        <MoneyText micro={d.amount} sign="in" variant="title" className="text-approved" />
        <span className="ml-auto" data-deposit-status={d.status}>
          {status}
        </span>
      </div>
      <SourceCard d={d} meId={meId} />
      {s.kind === "xc" && <XcTimeline s={s} />}
      <dl className="flex flex-col divide-y divide-line rounded-md border border-line">
        <Fact label={t("moneyin.when")}>
          <span className="tabular-nums">{whenText(d.at)}</span>
        </Fact>
        {d.topup && (
          <Fact label={t("moneyin.for")}>
            <span className="inline-flex items-center gap-1.5" data-deposit-topup={d.topup.id}>
              <HandCoins aria-hidden className="size-4 shrink-0 text-ink-muted" strokeWidth={2} />
              {d.topup.mine
                ? t("moneyin.topup.mine", { amount: formatUsd(d.topup.perPerson, "whole") })
                : t("moneyin.topup", { name: d.topup.by.name, amount: formatUsd(d.topup.perPerson, "whole") })}
            </span>
          </Fact>
        )}
      </dl>
      {s.kind === "payin" && s.note && (
        <section aria-labelledby="moneyin-note-h" className="flex flex-col gap-1 rounded-md bg-surface-sunken p-3" data-gift-note>
          <h3 id="moneyin-note-h" className="flex items-center gap-2 text-label text-ink">
            <Quote aria-hidden className="size-4" strokeWidth={2} />
            {t("gift.details.note")}
          </h3>
          <p className="text-body whitespace-pre-wrap text-ink [overflow-wrap:anywhere]">{s.note}</p>
          {s.showPublic && <p className="text-body-sm text-ink-muted">{t("gift.details.public")}</p>}
        </section>
      )}
      {s.kind === "payin" && (
        <p className="flex items-start gap-3 text-body-sm text-ink-muted">
          <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0" strokeWidth={2} />
          {t("gift.details.shared")}
        </p>
      )}
      <Receipts d={d} what={title} />
    </div>
  )
}

export function DepositDetailsSheet({ pot, depositKey, meId, open, onClose }: { pot: PotVM; depositKey: string | null; meId: string | null; open: boolean; onClose: () => void }) {
  // keep showing the last one while the sheet animates out
  const [lastKey, setLastKey] = useState(depositKey)
  if (depositKey !== null && depositKey !== lastKey) setLastKey(depositKey)
  const d = useDepositDetails(pot, depositKey ?? lastKey)
  const title = d ? depositTitle(d, meId) : t("moneyin.title.loading")
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <Button className="w-full" onClick={onClose} data-deposit-done>
          {t("moneyin.done")}
        </Button>
      }
    >
      {d === undefined ? (
        <div className="flex flex-col gap-3 pt-1" aria-busy="true" data-deposit-details="loading">
          <span className="sr-only">{t("moneyin.loading")}</span>
          <Bone className="h-12 w-full" />
          <Bone className="h-24 w-full" />
          <Bone className="h-12 w-full" />
        </div>
      ) : d === null ? (
        <p className={cn("pt-1 text-body text-ink-muted")} data-deposit-details="missing">
          {t("moneyin.missing")}
        </p>
      ) : (
        <Body d={d} meId={meId} />
      )}
    </Sheet>
  )
}
