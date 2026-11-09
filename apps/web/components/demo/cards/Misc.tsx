// The rest of the hood's cards (05 §4.7-§4.9, §2.1, §2.7): the rules check, notes, the state and balance diffs,
// "Where we start", "See a real one on testnet", the glossary <dl>, the Meanwhile interlude and the recap.
// Server components; amounts through MoneyText (tabular), state words with an icon, changes marked in words.
import { ArrowDownLeft, ArrowUpRight, Check, ChevronDown, Clock, ExternalLink, Globe, Info, ListChecks, Sparkles } from "lucide-react"
import Link from "next/link"
import type { Chapter, Recap, RulesRow, Snapshot } from "@/app/demo/_data/types"
import { MoneyText } from "@/components/money/MoneyText"
import { Avatar } from "@/components/pot/Avatar"
import { buttonVariants } from "@/components/ui/button"
import { t, type MessageKey } from "@/i18n/t"
import { cn } from "@/lib/client/cn"
import { MINUS } from "@/lib/client/money"
import { HoodCard, IconTile, PAGE_NIGHT, RawJson } from "../Bits"
import { tk } from "../copy"
import { GlossaryHashOpen } from "../Glossary"
import { kindFamily, partyName, partyOf, personaOf, personVM, SCRIPT, usdcOf } from "../data"
import { Rich } from "../Rich"

// ---------------------------------------------------------------------------------------------------------
// Rules

export function RulesCard({ id, rows, path, reason }: { id: string; rows: RulesRow[]; path: "instant" | "vote"; reason: string }) {
  return (
    <HoodCard
      id={id}
      data-card="rules"
      icon={
        <IconTile>
          <ListChecks aria-hidden strokeWidth={2} />
        </IconTile>
      }
      title={t("demo.card.rules")}
    >
      <table className="mt-3 w-full border-collapse text-left">
        <thead>
          <tr className="text-body-sm text-ink-muted">
            <th scope="col" className="py-2 pr-2 font-normal">
              {t("demo.rules.check")}
            </th>
            <th scope="col" className="py-2 pr-2 font-normal">
              {t("demo.rules.value")}
            </th>
            <th scope="col" className="py-2 font-normal">
              {t("demo.rules.result")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.check} className={cn("border-t border-line align-top", r.decides && "bg-brand-soft")} data-rule={r.check} data-decides={r.decides ? "" : undefined}>
              <th scope="row" className="py-2.5 pr-2 pl-1 font-normal">
                <span className="block text-body-sm text-ink">{tk(`demo.rules.${r.check}`)}</span>
                <span className="block text-body-sm text-ink-muted">{r.check}</span>
                {r.decides ? <span className="sr-only">{t("demo.rules.decides")}</span> : null}
              </th>
              <td className="py-2.5 pr-2 text-body-sm text-ink tabular-nums [overflow-wrap:anywhere]">{r.value}</td>
              <td className="py-2.5 pr-1 text-body-sm text-ink">
                <span className="inline-flex items-start gap-1.5 @[22rem]/card:items-center @[22rem]/card:whitespace-nowrap">
                  {r.ok ? <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-ink @[22rem]/card:mt-0" strokeWidth={2} /> : <Clock aria-hidden className="mt-0.5 size-4 shrink-0 text-ink @[22rem]/card:mt-0" strokeWidth={2} />}
                  {r.ok ? t("demo.rules.ok") : t("demo.rules.group")}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-line-strong">
            <td colSpan={3} className="py-2.5 text-label text-ink" data-rules-path={path}>
              {path === "instant" ? t("demo.rules.path.instant", { reason }) : t("demo.rules.path.vote", { reason })}
            </td>
          </tr>
        </tfoot>
      </table>
    </HoodCard>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Notes, the interlude

export function NoteCard({ id, k, anchorPrefix }: { id: string; k: string; anchorPrefix?: string }) {
  const interlude = k === "demo.interlude"
  return (
    <HoodCard
      id={id}
      data-card="note"
      data-note={k}
      icon={<IconTile>{interlude ? <Sparkles aria-hidden strokeWidth={2} /> : <Info aria-hidden strokeWidth={2} />}</IconTile>}
      title={interlude ? t("demo.interlude.title") : t("demo.card.note")}
    >
      <p className="mt-2 text-body text-pretty text-ink tabular-nums">
        <Rich text={tk(k)} anchorPrefix={anchorPrefix} />
      </p>
    </HoodCard>
  )
}

// ---------------------------------------------------------------------------------------------------------
// State and balances

const names = (accounts: string[]) => accounts.map((a) => partyName(a)).join(", ")
const statusWord = (s: string) => tk(`demo.state.status.${s}`)
const usd = (micro: string | bigint) => `$${(Number(BigInt(micro)) / 1e6).toFixed(2)}`

interface StateRow {
  key: string
  field: string
  before: string
  after: string
}

function stateRows(before: Snapshot, after: Snapshot): StateRow[] {
  const proposals = (s: Snapshot) =>
    s.dao?.proposals.length
      ? s.dao.proposals.map((p) => `#${p.id} ${tk(`demo.state.kind.${kindFamily(p.kind)}`)} · ${tk(`demo.status.${p.status === "InProgress" ? "in_progress" : p.status.toLowerCase()}`)}`).join("\n")
      : t("demo.state.proposals.none")
  const ledger = (s: Snapshot, field: "contributed" | "instantUsed") =>
    s.pot?.members.length ? s.pot.members.map((m) => `${partyName(m.account)} ${usd(m[field])}`).join(" · ") : "—"
  const rows: StateRow[] = [
    {
      key: "dao",
      field: t("demo.state.dao"),
      before: before.dao ? t("demo.state.dao.v", { float: before.dao.floatNear }) : t("demo.state.dao.none"),
      after: after.dao ? t("demo.state.dao.v", { float: after.dao.floatNear }) : t("demo.state.dao.none"),
    },
    { key: "members", field: t("demo.state.members"), before: before.dao ? names(before.dao.members) : "—", after: after.dao ? names(after.dao.members) : "—" },
    {
      key: "threshold",
      field: t("demo.state.threshold"),
      before: before.dao ? t("demo.state.threshold.v", before.dao.threshold) : "—",
      after: after.dao ? t("demo.state.threshold.v", after.dao.threshold) : "—",
    },
    { key: "proposals", field: t("demo.state.proposals"), before: before.dao ? proposals(before) : "—", after: after.dao ? proposals(after) : "—" },
    { key: "status", field: t("demo.state.pot_status"), before: statusWord(before.pot?.status ?? "none"), after: statusWord(after.pot?.status ?? "none") },
    { key: "ledger", field: t("demo.state.ledger"), before: ledger(before, "contributed"), after: ledger(after, "contributed") },
    { key: "instant", field: t("demo.state.instant"), before: ledger(before, "instantUsed"), after: ledger(after, "instantUsed") },
  ]
  return rows
}

export function StateCard({ id, before, after }: { id: string; before: Snapshot; after: Snapshot }) {
  const rows = stateRows(before, after)
  return (
    <HoodCard
      id={id}
      data-card="state"
      icon={
        <IconTile>
          <ListChecks aria-hidden strokeWidth={2} />
        </IconTile>
      }
      title={t("demo.card.state")}
    >
      {/* a scrollable table on narrow cards: a named, focusable region (axe scrollable-region-focusable) */}
      <div role="region" tabIndex={0} aria-label={t("demo.card.state")} className="mt-3 overflow-x-auto rounded-sm">
        <table className="w-full min-w-[30rem] border-collapse text-left @[36rem]/card:min-w-0">
          <caption className="sr-only">{t("demo.state.caption")}</caption>
          <thead>
            <tr className="text-body-sm text-ink-muted">
              <th scope="col" className="w-[28%] py-2 pr-2 font-normal">
                {t("demo.state.field")}
              </th>
              <th scope="col" className="py-2 pr-2 font-normal">
                {t("demo.before")}
              </th>
              <th scope="col" className="py-2 font-normal">
                {t("demo.after")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const changed = r.before !== r.after
              return (
                <tr key={r.key} className="border-t border-line align-top" data-state-row={r.key} data-changed={changed ? "" : undefined}>
                  <th scope="row" className={cn("py-2.5 pr-2 pl-2 text-body-sm font-normal text-ink", changed && "shadow-[inset_2px_0_0_var(--pot-ink)]")}>
                    {r.field}
                    {changed ? <span className="sr-only"> {t("demo.state.changed.sr")}</span> : null}
                  </th>
                  <td className="py-2.5 pr-2 text-body-sm whitespace-pre-line text-ink-muted tabular-nums">{r.before}</td>
                  <td className={cn("py-2.5 text-body-sm whitespace-pre-line tabular-nums", changed ? "text-ink" : "text-ink-muted")}>{r.after}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <RawJson label={t("demo.card.state")} value={{ before: { pot: before.pot, dao: before.dao && { ...before.dao, policy: undefined } }, after: { pot: after.pot, dao: after.dao } }} />
    </HoodCard>
  )
}

function Change({ delta }: { delta: bigint }) {
  if (delta === 0n) return <span className="text-body-sm text-ink-muted">{t("demo.balances.same")}</span>
  const into = delta > 0n
  return (
    <span className="inline-flex items-start gap-1.5 @[22rem]/card:items-center @[22rem]/card:whitespace-nowrap">
      {into ? <ArrowDownLeft aria-hidden className="size-4 text-ink" strokeWidth={2} /> : <ArrowUpRight aria-hidden className="size-4 text-ink" strokeWidth={2} />}
      <MoneyText micro={into ? delta : -delta} sign={into ? "in" : "out"} variant="inline" className="text-body-sm font-semibold text-ink" />
      <span className="text-body-sm text-ink-muted">{into ? t("demo.balances.in") : t("demo.balances.out")}</span>
    </span>
  )
}

/** Dollars for every account in the story, then NEAR (fees and storage), from the chapter's whoPaid rows. */
export function BalancesCard({ id, chapter }: { id: string; chapter: Chapter }) {
  const { before, after } = chapter
  const accounts = [...new Set([...Object.keys(before.balances), ...Object.keys(after.balances)])].sort((a, b) => order(a) - order(b))
  const near = new Map<string, { yocto: bigint; approx: boolean }>()
  for (const x of chapter.txs)
    for (const w of x.whoPaid) {
      const cur = near.get(w.account) ?? { yocto: 0n, approx: false }
      near.set(w.account, { yocto: cur.yocto + BigInt(w.yocto), approx: cur.approx || w.approx })
    }
  const nearRows = [...near.entries()].sort(([a], [b]) => order(a) - order(b))
  return (
    <HoodCard
      id={id}
      data-card="balances"
      icon={
        <IconTile>
          <ListChecks aria-hidden strokeWidth={2} />
        </IconTile>
      }
      title={t("demo.card.balances")}
    >
      <div role="region" tabIndex={0} aria-label={t("demo.card.balances")} className="mt-3 overflow-x-auto rounded-sm">
        <table className="w-full min-w-[26rem] border-collapse text-left">
          <caption className="pb-1 text-left text-label text-ink">{t("demo.balances.dollars")}</caption>
          <thead>
            <tr className="text-body-sm text-ink-muted">
              <th scope="col" className="py-2 pr-2 font-normal">
                {t("demo.balances.account")}
              </th>
              <th scope="col" className="py-2 pr-2 text-right font-normal">
                {t("demo.before")}
              </th>
              <th scope="col" className="py-2 pr-2 text-right font-normal">
                {t("demo.after")}
              </th>
              <th scope="col" className="py-2 font-normal">
                {t("demo.balances.change")}
              </th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => {
              const b = usdcOf(before.balances, a)
              const f = usdcOf(after.balances, a)
              return (
                <tr key={a} className="border-t border-line" data-balance={partyOf(a).kind}>
                  <th scope="row" className="py-2.5 pr-2 font-normal">
                    <AccountName account={a} />
                  </th>
                  <td className="py-2.5 pr-2 text-right">
                    <MoneyText micro={b} variant="inline" className="text-body-sm text-ink-muted" />
                  </td>
                  <td className="py-2.5 pr-2 text-right">
                    <MoneyText micro={f} variant="inline" className="text-body-sm font-semibold text-ink" />
                  </td>
                  <td className="py-2.5">
                    <Change delta={f - b} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <h4 className="mt-4 text-label text-ink">{t("demo.balances.near")}</h4>
      <ul className="mt-2 flex flex-col gap-1.5" data-near-rows>
        {nearRows.map(([a, v]) => (
          <li key={a} className="flex items-center justify-between gap-3 border-t border-line pt-1.5 text-body-sm">
            <AccountName account={a} />
            <span className={cn("text-ink tabular-nums", personaOf(a) && "font-semibold")}>
              {v.yocto === 0n ? "0 NEAR" : `${MINUS} ${v.approx ? "≈ " : ""}${fmtNear(v.yocto)}`}
            </span>
          </li>
        ))}
      </ul>
      {nearRows.some(([, v]) => v.approx) ? <p className="mt-2 text-body-sm text-ink-muted">{t("demo.approx")}</p> : null}
      <RawJson label={t("demo.card.balances")} value={{ before: before.balances, after: after.balances }} />
    </HoodCard>
  )
}

function fmtNear(yocto: bigint): string {
  if (yocto < 10n ** 15n) return `${yocto} yoctoNEAR`
  return `${(Number(yocto) / 1e24).toFixed(5).replace(/0+$/, "").replace(/\.$/, "")} NEAR`
}

function order(account: string): number {
  const p = partyOf(account)
  return p.kind === "person" ? ["maya", "sam", "leo"].indexOf(p.persona) : p.kind === "pot" ? 10 : p.kind === "hub" ? 11 : p.kind === "relayer" ? 12 : 13
}

function AccountName({ account }: { account: string }) {
  const persona = personaOf(account)
  return (
    <span className="flex min-w-0 items-center gap-2">
      {persona ? <Avatar person={personVM(persona)} size="xs" /> : null}
      <span className="min-w-0">
        <span className="block text-body-sm text-ink">{partyName(account)}</span>
      </span>
    </span>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Before

export function BeforeCard({ id, chapter }: { id: string; chapter: Chapter }) {
  const b = chapter.before
  const pot = b.dao ? usdcOf(b.balances, SCRIPT.ids.pot) : null
  return (
    <HoodCard id={id} data-card="before" title={t("demo.card.before")} icon={<IconTile><Info aria-hidden strokeWidth={2} /></IconTile>}>
      <p className="mt-2 text-body text-pretty text-ink tabular-nums">{tk(`demo.c${chapter.n}.before`)}</p>
      {b.dao ? (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body-sm">
          <dt className="text-ink-muted">{t("pot.hero.label")}</dt>
          <dd className="text-ink">{pot !== null ? <MoneyText micro={pot} variant="inline" className="font-semibold" /> : null}</dd>
          <dt className="text-ink-muted">{t("demo.state.members")}</dt>
          <dd className="text-ink">{names(b.dao.members)}</dd>
          <dt className="text-ink-muted">{t("demo.state.threshold")}</dt>
          <dd className="text-ink tabular-nums">{t("demo.state.threshold.v", b.dao.threshold)}</dd>
        </dl>
      ) : null}
    </HoodCard>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Real ones

const nearblocks = (hash: string) => `https://testnet.nearblocks.io/txns/${hash}`

export function RealLinks({ links }: { links: { hash: string; labelKey: string }[] }) {
  if (!links.length) return null
  return (
    <ul className="mt-3 flex flex-col gap-4">
      {links.map((l) => (
        <li key={l.hash} className="flex flex-col gap-2 border-t border-line pt-3 first:border-t-0 first:pt-0" data-real={l.hash}>
          <p className="text-body-sm text-pretty text-ink">{tk(l.labelKey)}</p>
          <div className="flex flex-col items-start gap-1">
            <a
              href={nearblocks(l.hash)}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "secondary", size: "sm" }), PAGE_NIGHT.inset)}
            >
              <ExternalLink aria-hidden strokeWidth={2} />
              {t("demo.real.cta")}
              <span className="sr-only"> {t("demo.real.newtab")}</span>
            </a>
            <span className="text-body-sm break-all text-ink-muted tabular-nums">{l.hash}</span>
          </div>
        </li>
      ))}
    </ul>
  )
}

export function RealOne({ id, links }: { id: string; links: { hash: string; labelKey: string }[] }) {
  return (
    <HoodCard
      id={id}
      data-card="real"
      icon={
        <IconTile>
          <Globe aria-hidden strokeWidth={2} />
        </IconTile>
      }
      title={t("demo.real.title")}
    >
      <RealLinks links={links} />
    </HoodCard>
  )
}

export function InterludeCard({ id, chapter }: { id: string; chapter: Chapter }) {
  if (!chapter.interlude) return null
  return (
    <HoodCard
      id={id}
      data-card="interlude"
      icon={
        <IconTile>
          <Sparkles aria-hidden strokeWidth={2} />
        </IconTile>
      }
      title={t("demo.interlude.title")}
    >
      <p className="mt-2 text-body text-pretty text-ink tabular-nums">
        <Rich text={tk(chapter.interlude.key)} />
      </p>
      <RealLinks links={chapter.interlude.real} />
    </HoodCard>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Glossary

// Collapsed by default (a native <details>): the terms are a reference, and the inline terms already open their own
// popovers. The <dl> stays in the server HTML (AI judges, J-6) and the H3 stays the section's name inside the summary.
// A #g-<id> link (the terms' no-JS fallback, or a deep link) opens it: GlossaryHashOpen.
export function GlossaryList({ ids, prefix = "", title }: { ids: string[]; prefix?: string; title?: string }) {
  const headingId = `${prefix}glossary-title`
  return (
    <section aria-labelledby={headingId} className={cn("rounded-md border border-line bg-surface", PAGE_NIGHT.card)} data-glossary>
      <details className="group/g" data-glossary-details>
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md px-4 py-3 hover:bg-surface-sunken group-open/g:rounded-b-none md:px-5 [&::-webkit-details-marker]:hidden">
          <ChevronDown aria-hidden className="size-5 shrink-0 -rotate-90 text-ink-muted transition-transform duration-200 ease-standard group-open/g:rotate-0 motion-reduce:transition-none" strokeWidth={2} />
          <h3 id={headingId} className="min-w-0 flex-1 font-display text-heading text-ink">
            {title ?? t("demo.glossary.title")}
          </h3>
          <span className="shrink-0 text-body-sm text-ink-muted tabular-nums">{t("demo.glossary.count", { n: ids.length })}</span>
        </summary>
        <dl className="grid gap-x-6 gap-y-3 px-4 pt-1 pb-4 md:px-5 md:pb-5 @min-[35rem]/hood:grid-cols-2">
          {ids.map((g) => (
            <div key={g} className="min-w-0 scroll-mt-24" id={`${prefix}g-${g}`}>
              <dt className="text-label text-ink">{tk(`demo.g.${g}.term`)}</dt>
              <dd className="mt-0.5 text-body-sm text-ink-muted">{tk(`demo.g.${g}`)}</dd>
            </div>
          ))}
        </dl>
      </details>
      <GlossaryHashOpen />
    </section>
  )
}

// ---------------------------------------------------------------------------------------------------------
// The recap (§2.7): computed from the dataset, never typed

const DECIDED: Record<Recap["rows"][number]["decidedBy"], MessageKey> = {
  nobody: "demo.recap.decided.none",
  rulebot: "demo.recap.decided.rules",
  members: "demo.recap.decided.group",
}

/** README J-7: read-only near-cli-rs calls on the real reference Pot (a unit test keeps them verbatim). */
export const CLI_COMMANDS = [
  "near() { npx -y near-cli-rs@0.30.1 \"$@\"; }",
  "ROOT=potprev.testnet; HUB=pots.$ROOT; POT=reference-trip-2gzw.$HUB",
  "near contract call-function as-read-only $POT get_policy json-args '{}' network-config testnet now",
  "near contract call-function as-read-only $HUB get_pot json-args \"{\\\"pot\\\":\\\"$POT\\\"}\" network-config testnet now",
  "near contract call-function as-read-only usdc.$ROOT ft_balance_of json-args \"{\\\"account_id\\\":\\\"$POT\\\"}\" network-config testnet now",
  "near account view-account-summary $POT network-config testnet now",
  "near account list-keys $POT network-config testnet now",
] as const

export function Recap({ className }: { className?: string }) {
  const recap = SCRIPT.recap
  const title = (n: number) => tk(`demo.c${n}.rail`)
  return (
    <section id="recap" aria-labelledby="recap-title" className={cn("scroll-mt-24", className)} data-recap>
      <h2 id="recap-title" className="font-display text-title text-ink" tabIndex={-1}>
        {t("demo.recap.title")}
      </h2>
      <div role="region" tabIndex={0} aria-label={t("demo.recap.title")} className="mt-4 overflow-x-auto rounded-lg bg-surface p-4 shadow-card md:p-6">
        <table className="w-full min-w-[40rem] border-collapse text-left">
          <caption className="pb-2 text-left text-body-sm text-ink-muted">{t("demo.recap.caption")}</caption>
          <thead>
            <tr className="text-body-sm text-ink-muted">
              <th scope="col" className="py-2 pr-3 font-normal">
                {t("demo.recap.chapter")}
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-normal">
                {t("demo.recap.signatures")}
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-normal">
                {t("demo.recap.transactions")}
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-normal">
                {t("demo.recap.receipts")}
              </th>
              <th scope="col" className="py-2 pr-3 font-normal">
                {t("demo.recap.decided")}
              </th>
              <th scope="col" className="py-2 text-right font-normal">
                {t("demo.recap.near")}
              </th>
            </tr>
          </thead>
          <tbody>
            {recap.rows.map((r) => (
              <tr key={r.n} className="border-t border-line text-body-sm text-ink tabular-nums" data-recap-row={r.n}>
                <th scope="row" className="py-2.5 pr-3 font-normal">
                  <Link href={`/demo/${r.n}`} className="underline decoration-line-strong underline-offset-4">
                    {r.n} · {title(r.n)}
                  </Link>
                </th>
                <td className="py-2.5 pr-3 text-right">{r.signatures}</td>
                <td className="py-2.5 pr-3 text-right">{r.transactions}</td>
                <td className="py-2.5 pr-3 text-right">{r.receipts}</td>
                <td className="py-2.5 pr-3">{tk(DECIDED[r.decidedBy])}</td>
                <td className="py-2.5 text-right font-semibold">{r.nearPaidByPeople}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-line-strong text-body-sm text-ink tabular-nums">
              <th scope="row" className="py-2.5 pr-3 text-label">
                {t("demo.recap.total")}
              </th>
              <td className="py-2.5 pr-3 text-right font-semibold" data-recap-total="signatures">
                {recap.totals.signatures}
              </td>
              <td className="py-2.5 pr-3 text-right font-semibold" data-recap-total="transactions">
                {recap.totals.transactions}
              </td>
              <td className="py-2.5 pr-3 text-right font-semibold">{recap.totals.receipts}</td>
              <td className="py-2.5 pr-3" />
              <td className="py-2.5 text-right font-semibold">{recap.totals.nearPaidByPeople}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="mt-6" data-theme="night">
        <div className={cn("rounded-lg border border-line bg-ground p-4 text-ink md:p-6", PAGE_NIGHT.panel)}>
          <h3 className="font-display text-heading text-ink">{t("demo.recap.cli")}</h3>
          <p className="mt-1 text-body-sm text-ink-muted">{t("demo.recap.cli.body")}</p>
          <div data-raw className="mt-3">
            <div role="region" tabIndex={0} aria-label={t("demo.recap.cli")} className="overflow-x-auto rounded-sm bg-surface-sunken p-3">
              <pre className="font-mono text-[0.8125rem] leading-5 text-ink">{CLI_COMMANDS.join("\n")}</pre>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

