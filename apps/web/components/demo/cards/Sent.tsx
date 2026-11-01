// The relayer card (05 §4.5): the NEP-366 envelope as a box inside a box (the person's signed request rides inside
// the relayer's own transaction), the D-24 checks it ran first, and "Who paid". The person's "0 NEAR" line is the
// chapter's honesty anchor and never collapses. ≈ figures are copied from the real testnet run linked below.
import { Check, ListChecks, Send, Users } from "lucide-react"
import type { SimTx, WhoPaid as WhoPaidRow } from "@/app/demo/_data/types"
import { Avatar } from "@/components/pot/Avatar"
import { t, type MessageKey } from "@/i18n/t"
import { cn } from "@/lib/client/cn"
import { tk } from "../copy"
import { Breaks, Field, HoodCard, IconTile, PAGE_NIGHT, RawJson, SimChip } from "../Bits"
import { nearOf, partyName, partyOf, personaOf, personName, personVM, shortHash, tgasOf } from "../data"

function PartyIcon({ account }: { account: string }) {
  const p = partyOf(account)
  if (p.kind === "person") return <Avatar person={personVM(p.persona)} size="sm" />
  const Icon = p.kind === "hub" ? ListChecks : p.kind === "pot" ? Users : Send
  return (
    <IconTile>
      <Icon aria-hidden strokeWidth={2} />
    </IconTile>
  )
}

const PAID: Record<Exclude<WhoPaidRow["what"], "nothing">, MessageKey> = {
  gas: "demo.paid.gas",
  deposit: "demo.paid.deposit",
  storage_prepay: "demo.paid.storage_prepay",
  float: "demo.paid.float",
  registration: "demo.paid.registration",
}

function paidLine(w: WhoPaidRow): string {
  if (w.what === "nothing") return ""
  const near = w.what === "deposit" && BigInt(w.yocto) < 10n ** 15n ? `${w.yocto} yoctoNEAR` : w.what === "deposit" ? `${nearOf(w.yocto)} NEAR` : w.near
  return (t as (k: MessageKey, v: Record<string, string>) => string)(PAID[w.what], { near })
}

/** "Who paid": one row per account, the person last and never collapsed. */
export function WhoPaid({ rows, className }: { rows: WhoPaidRow[]; className?: string }) {
  const by = new Map<string, WhoPaidRow[]>()
  for (const r of rows) by.set(r.account, [...(by.get(r.account) ?? []), r])
  const order = [...by.keys()].sort((a, b) => Number(partyOf(a).kind === "person") - Number(partyOf(b).kind === "person"))
  return (
    <div className={cn("mt-4 rounded-md border border-line p-3", className)} data-who-paid>
      <h4 className="text-label text-ink">{t("demo.who_paid")}</h4>
      <ul className="mt-2 flex flex-col gap-2.5">
        {order.map((account) => {
          const list = by.get(account)!
          const persona = personaOf(account)
          return (
            <li key={account} className="flex items-start gap-3" data-who-paid-row={partyOf(account).kind}>
              <PartyIcon account={account} />
              <div className="min-w-0 flex-1">
                <p className="text-body-sm text-ink">
                  <span className="font-semibold">{partyName(account)}</span>
                  <span className="text-ink-muted tabular-nums"> · <Breaks value={account} /></span>
                </p>
                {persona ? (
                  <p className="text-body text-ink tabular-nums" data-zero-near>
                    <strong className="font-semibold">{t("demo.who_paid.user", { name: personName(persona) })}</strong>
                  </p>
                ) : (
                  list.map((w, i) => (
                    <p key={i} className="text-body-sm text-ink tabular-nums">
                      {paidLine(w)}
                    </p>
                  ))
                )}
              </div>
            </li>
          )
        })}
      </ul>
      {rows.some((r) => r.approx) ? <p className="mt-3 text-body-sm text-ink-muted">{t("demo.approx")}</p> : null}
    </div>
  )
}

export function SentCard({ tx, id, signedAnchor }: { tx: SimTx; id: string; signedAnchor: string | null }) {
  const env = tx.envelope
  const inner = env.actions.find((a): a is { Delegate: { tx: string } } => "Delegate" in a)
  const own = env.actions.find((a): a is Extract<(typeof env.actions)[number], { FunctionCall: unknown }> => "FunctionCall" in a)
  const da = tx.delegate?.delegate_action
  const persona = da ? personaOf(da.sender_id) : null
  return (
    <HoodCard
      id={id}
      data-card="sent"
      icon={
        <IconTile>
          <Send aria-hidden strokeWidth={2} />
        </IconTile>
      }
      title={t("demo.card.sent")}
      badge={<SimChip label={t("demo.sim.values")} />}
    >
      {/* the envelope: the relayer's transaction, with the person's signed request inside */}
      <div className="mt-3 rounded-md border border-line-strong p-3" data-envelope>
        <p className="text-label text-ink">{t("demo.sent.outer")}</p>
        <dl className="mt-1">
          <Field name={t("demo.f.relayer_signer")} tech="signer_id" value={env.signer_id} meaning={partyName(env.signer_id)} />
          <Field name={t("demo.f.receiver")} tech="receiver_id" value={env.receiver_id} meaning={partyName(env.receiver_id)} />
          <Field name={t("demo.f.nonce")} tech="nonce" value={env.nonce} />
          <Field name={t("demo.f.block_hash")} tech="block_hash" value={<span title={env.block_hash}>{shortHash(env.block_hash)}</span>} />
          <Field name={t("demo.f.hash")} tech="hash" value={<span title={tx.hash}>{shortHash(tx.hash)}</span>} />
        </dl>
        {inner && da ? (
          <div className={cn("mt-2 rounded-sm bg-surface-sunken p-3", PAGE_NIGHT.inset)} data-envelope-inner>
            <p className="text-body-sm text-ink">{t("demo.sent.inner", { name: persona ? personName(persona) : "" })}</p>
            <p className="mt-1 text-body text-ink tabular-nums">
              <span className="font-semibold">{da.actions[0].FunctionCall.method_name}</span>
              <span className="text-ink-muted"> {t("demo.to", { name: partyName(da.receiver_id) })}</span>
            </p>
            {signedAnchor ? (
              <a href={`#${signedAnchor}`} className="mt-1 inline-flex min-h-11 items-center text-body-sm text-ink underline decoration-line-strong underline-offset-4">
                {t("demo.card.signed", { name: persona ? personName(persona) : "" })}
              </a>
            ) : null}
          </div>
        ) : own ? (
          <div className={cn("mt-2 rounded-sm bg-surface-sunken p-3", PAGE_NIGHT.inset)}>
            <p className="text-body-sm text-ink">{t("demo.sent.self")}</p>
            <p className="mt-1 text-body text-ink tabular-nums">
              <span className="font-semibold">{own.FunctionCall.method_name}</span>
              <span className="text-ink-muted"> {t("demo.to.gas", { name: partyName(env.receiver_id), n: tgasOf(own.FunctionCall.gas) })}</span>
            </p>
          </div>
        ) : null}
      </div>

      {env.checks.length ? (
        <div className="mt-4">
          <h4 className="text-label text-ink">{t("demo.sent.checks")}</h4>
          <ul className="mt-2 grid gap-x-4 gap-y-2 @[28rem]/card:grid-cols-2" data-checks>
            {env.checks.map((c) => (
              <li key={c.check} className="flex items-start gap-2">
                <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-ink" strokeWidth={2} />
                <span className="min-w-0">
                  <span className="block text-body-sm text-ink">{tk(`demo.check.${c.check}`)}</span>
                  <span className="block text-body-sm text-ink-muted tabular-nums [overflow-wrap:anywhere]">{c.value}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <WhoPaid rows={tx.whoPaid} />
      <RawJson label={t("demo.card.sent")} value={{ hash: tx.hash, ...env }} />
    </HoodCard>
  )
}
