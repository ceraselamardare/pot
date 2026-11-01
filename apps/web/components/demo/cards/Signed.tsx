// The decoded-signature cards (05 §4.4). Three depths: the plain sentence ("Ask the Pot Hub to pay me $84.00…"),
// the key fields as a <dl> (plain name over the technical one, value over its meaning), then "Show every field"
// and "Raw JSON" behind closed disclosures (still text in the server HTML). Simulated keys, nonces and signatures
// get ONE "Simulated values" chip per card.
import { KeyRound, Link2 } from "lucide-react"
import type { SignedDelegateJson, SimTx } from "@/app/demo/_data/types"
import { Avatar } from "@/components/pot/Avatar"
import { t, type MessageKey } from "@/i18n/t"
import { cn } from "@/lib/client/cn"
import { formatUsd } from "@/lib/client/money"
import { tk } from "../copy"
import { Disclosure, Field, HoodCard, IconTile, PAGE_NIGHT, RawJson, SimChip } from "../Bits"
import { partyName, partyOf, personaOf, personName, personVM, shortHash, tgasOf } from "../data"
import { Rich } from "../Rich"

type Fc = SignedDelegateJson["delegate_action"]["actions"][0]["FunctionCall"]

const SENTENCE: Record<string, MessageKey> = {
  create_pot: "demo.sentence.create_pot",
  join: "demo.sentence.join",
  ft_transfer_call: "demo.sentence.ft_transfer_call",
  request_spend: "demo.sentence.request_spend",
  act_proposal: "demo.sentence.act_proposal",
  propose_close: "demo.sentence.propose_close",
}

function sentence(d: SignedDelegateJson, fc: Fc): string {
  const args = (fc.args ?? {}) as Record<string, unknown>
  const potName = t("demo.party.pot")
  const amount = typeof args.amount === "string" ? formatUsd(BigInt(args.amount)) : ""
  const key = SENTENCE[fc.method_name]
  if (!key) return t("demo.sentence.other", { method: fc.method_name, receiver: partyName(d.delegate_action.receiver_id) })
  const to = args.receiver_id === d.delegate_action.sender_id ? t("demo.sentence.me") : partyName(String(args.receiver_id ?? ""))
  const reason = typeof args.category === "string" ? tk(`spend.reason.word.${args.category}`) : ""
  return (t as (k: MessageKey, v: Record<string, string | number>) => string)(key, { potName, amount, to, reason, id: Number(args.id ?? 0) })
}

function callsMeaning(receiver: string): string {
  const k = partyOf(receiver).kind
  return k === "hub" ? t("demo.f.calls.hub") : k === "usdc" ? t("demo.f.calls.usdc") : k === "pot" ? t("demo.f.calls.pot") : t("demo.f.calls.other")
}

/** A note next to the args a judge asks about. */
function argMeaning(key: string, value: unknown): string | undefined {
  if (key === "request_ref") return t("demo.f.request_ref")
  if (key === "proposal") return t("demo.f.proposal_arg")
  if (key === "rules" && value === null) return t("demo.f.rules_null")
  if (key === "invite_pk") return t("demo.f.invite_pk")
  if (key === "amount" && typeof value === "string" && /^\d+$/.test(value)) return t("demo.f.amount.v", { amount: formatUsd(BigInt(value)) })
  if (typeof value === "string" && partyOf(value).kind !== "other") return partyName(value)
  return undefined
}

const show = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v))

export function SignedCard({ tx, id }: { tx: SimTx; id: string }) {
  const d = tx.delegate!
  const da = d.delegate_action
  const fc = da.actions[0].FunctionCall
  const persona = personaOf(da.sender_id) ?? "maya"
  const name = personName(persona)
  const args = (fc.args ?? {}) as Record<string, unknown>
  const amount = typeof args.amount === "string" && /^\d+$/.test(args.amount) ? BigInt(args.amount) : null
  const yocto = fc.deposit === "1"
  return (
    <HoodCard
      id={id}
      data-card="signed"
      icon={<Avatar person={personVM(persona)} size="sm" />}
      title={t("demo.card.signed", { name })}
      badge={<SimChip label={t("demo.sim.values")} />}
      meta={
        <span
          className={cn("inline-flex h-6 max-w-full items-center gap-1 rounded-pill bg-surface-sunken px-2 text-body-sm text-ink tabular-nums", PAGE_NIGHT.inset)}
          title={da.public_key}
        >
          <KeyRound aria-hidden className="size-3.5 shrink-0" strokeWidth={2} />
          <span className="truncate">
            {t("demo.key.device")} · {shortHash(da.public_key)}
          </span>
        </span>
      }
    >
      <p className="mt-3 text-body text-pretty text-ink tabular-nums" data-signed-sentence>
        <Rich text={sentence(d, fc)} />
      </p>
      <dl className="mt-3">
        <Field name={t("demo.f.signer")} tech="sender_id" value={da.sender_id} meaning={t("demo.f.signer.v", { name })} />
        <Field name={t("demo.f.calls")} tech="receiver_id" value={da.receiver_id} meaning={callsMeaning(da.receiver_id)} />
        <Field name={t("demo.f.method")} tech="actions[0].FunctionCall" value={fc.method_name} meaning={t("demo.f.method.v")} strong />
        {amount !== null ? <Field name={t("demo.f.amount")} tech={`args.amount = "${args.amount as string}"`} value={formatUsd(amount)} meaning={t("demo.f.amount.v", { amount: formatUsd(amount) })} /> : null}
        <Field name={t("demo.f.gas")} tech="gas" value={`${tgasOf(fc.gas)} Tgas`} meaning={t("demo.f.gas.v")} />
        <Field
          name={t("demo.f.deposit")}
          tech="deposit"
          value={yocto ? "1 yoctoNEAR" : fc.deposit}
          meaning={yocto ? t("demo.f.deposit.yocto") : t("demo.f.deposit.zero", { name })}
        />
      </dl>
      <Disclosure summary={t("demo.fields.more")} data-fields-more>
        <dl>
          <Field name={t("demo.f.nonce")} tech="nonce" value={da.nonce} meaning={t("demo.f.nonce.v")} />
          <Field name={t("demo.f.valid")} tech="max_block_height" value={da.max_block_height} meaning={t("demo.f.valid.v")} />
          <Field name={t("demo.f.key")} tech="public_key" value={da.public_key} meaning={t("demo.f.key.v", { name })} />
          <Field name={t("demo.f.signature")} tech="signature" value={d.signature} />
          {Object.entries(args).map(([k, v]) => (
            <Field key={k} name={t("demo.f.args")} tech={k} value={show(v)} meaning={argMeaning(k, v)} />
          ))}
          <Field name={t("demo.f.how")} tech="NEP-366" value={d.signed_hash} meaning={t("demo.f.how.v")} />
        </dl>
      </Disclosure>
      <RawJson
        label={t("demo.card.signed", { name })}
        value={{ delegate_action: { ...da, actions: [{ FunctionCall: { ...fc } }] }, signature: d.signature }}
        extra={{ label: t("demo.f.transport"), text: d.transport_base64 }}
      />
    </HoodCard>
  )
}

/** Chapter 2's first signature: raw ed25519 by the link's key over "pot-join:v1:<pot>:<account>" (D-08). */
export function InviteSigCard({ id, message, publicKey, signature, param }: { id: string; message: string; publicKey: string; signature: string; param: string }) {
  const parts = message.split(":")
  return (
    <HoodCard
      id={id}
      data-card="invite"
      icon={
        <IconTile>
          <Link2 aria-hidden strokeWidth={2} />
        </IconTile>
      }
      title={t("demo.card.invite")}
      badge={<SimChip label={t("demo.sim.values")} />}
    >
      <dl className="mt-3">
        <Field
          name={t("demo.f.message")}
          tech="UTF-8"
          value={
            <span className="flex flex-col" data-invite-message>
              {parts.map((p, i) => (
                <span key={i}>
                  {p}
                  {i < parts.length - 1 ? ":" : ""}
                </span>
              ))}
            </span>
          }
        />
        <Field name={t("demo.f.invite_key")} tech="?i=" value={param} meaning={t("demo.f.invite_pk")} />
        <Field name={t("demo.f.signature")} tech="base64 (88)" value={signature} />
        <Field name={t("demo.f.why")} value={t("demo.invite.why")} meaning={t("demo.invite.how")} />
      </dl>
      <RawJson label={t("demo.card.invite")} value={{ message, public_key: publicKey, signature }} />
    </HoodCard>
  )
}

export function signedTitle(tx: SimTx): string {
  const persona = tx.delegate ? personaOf(tx.delegate.delegate_action.sender_id) : null
  return t("demo.card.signed", { name: persona ? personName(persona) : "" })
}

