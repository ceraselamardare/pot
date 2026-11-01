"use client"
// Any-chain deposit sheet (D-50; ux-spec §4.8; design-direction 01 §4): `?sheet=add&src=xc` → network picker →
// `&d=<id>` address + QR → DepositStepper. On testnet the address is simulated: a "Testnet demo" pill, a QR that
// reads "DO NOT SEND" under a "Test only · Do not send" band, and [Simulate sending $150] as the one marigold
// button (Copy is hidden, design-direction open question 7). Real mode (mainnet clip) shows [Copy Base address].
import { ArrowLeft, Check, ChevronDown, Clock, TriangleAlert } from "lucide-react"
import dynamic from "next/dynamic"
import { useState } from "react"
import { Callout, ProgressSteps } from "@/components/feedback/States"
import { TypingDots } from "@/components/feedback/TypingDots"
import { Sheet } from "@/components/sheets/Sheet"
import { Button } from "@/components/ui/button"
import { t, tLines } from "@/i18n/t"
import { useOnline } from "@/lib/client/browser"
import { cn } from "@/lib/client/cn"
import type { PotVM } from "@/lib/client/mock/types"
import { replaceSheet } from "@/lib/client/sheet"
import { deposits, invalidateDeposits, newDepositKey, potKey, useDeposit, useXcChains, xcKeys, type DepositView, type SimScenario, type XcChain } from "@/lib/deposit"
import { queryClient } from "@/lib/client/query"
import { useNow } from "@/lib/client/time"
import { DepositStepper, SimPill } from "./DepositStepper"
import { NETWORK, shortAddress, tokenAmount, usdShort } from "./format"

const QR = dynamic(() => import("qrcode.react").then((m) => m.QRCodeSVG), { ssr: false })

const reasonOf = (e: unknown): string => (e as { reason?: string })?.reason ?? "failed"

/** ?d=<id> in place (replaceState: the sheet's history entry stays one entry). */
function setDepositParam(id: string | null) {
  const u = new URL(window.location.href)
  if (id) u.searchParams.set("d", id)
  else u.searchParams.delete("d")
  window.history.replaceState(null, "", `${u.pathname}${u.search}`)
}

export function DepositSheet({
  pot,
  open,
  depositId,
  amount,
  actor,
}: {
  pot: PotVM
  open: boolean
  depositId: string | null
  /** what to add, from the Add sheet (?amount=) */
  amount: bigint
  actor: string
}) {
  // closing never cancels a deposit; it leaves the Pot screen without the sheet (and its src/d params)
  const close = () => replaceSheet(null)
  return (
    <Sheet open={open} onClose={close} title={t("xc.title")} description={t("xc.subtitle", { amount: usdShort(amount), potName: pot.name })}>
      <div className="pb-2" data-deposit-sheet>
        {depositId ? (
          <DepositPanel key={depositId} id={depositId} pot={pot} actor={actor} onClose={close} />
        ) : (
          <NetworkStep pot={pot} amount={amount} open={open} />
        )}
      </div>
    </Sheet>
  )
}

function NetworkStep({ pot, amount, open }: { pot: PotVM; amount: bigint; open: boolean }) {
  const chains = useXcChains(open)
  const online = useOnline()
  const [chain, setChain] = useState<XcChain | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const list = chains.data?.chains ?? []
  const picked = chain ?? list.find((c) => c.status !== "paused")?.id ?? null

  const go = async () => {
    if (!picked || busy) return
    setBusy(true)
    setError(null)
    try {
      const q = await deposits.quote({ pot: potKey(pot.slug), chain: picked, amount: amount.toString(), idempotencyKey: newDepositKey() })
      if (!q.depositIntentId) throw new Error("no_intent")
      setDepositParam(q.depositIntentId)
    } catch (e) {
      const r = reasonOf(e)
      setError(
        r === "amount_too_low"
          ? t("xc.error.min", { min: "$1" })
          : r === "amount_too_high"
            ? t("xc.error.max", { max: "$500" })
            : r === "chain_paused"
              ? t("xc.error.paused", { network: NETWORK[picked] })
              : r === "quota_exceeded"
                ? t("relayer.cap")
                : t("xc.error.quote"),
      )
      if (r === "chain_paused") void queryClient().invalidateQueries({ queryKey: xcKeys.chains })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4" data-network-step>
      <fieldset>
        <legend className="mb-2 text-label text-ink">{t("xc.network.label")}</legend>
        <div role="radiogroup" aria-label={t("xc.network.label")} className="flex flex-col overflow-hidden rounded-md border border-line">
          {chains.isPending
            ? [0, 1, 2, 3].map((i) => <div key={i} className="h-14 border-b border-line bg-surface-sunken last:border-b-0" aria-hidden />)
            : list.map((c) => {
                const paused = c.status === "paused"
                const checked = picked === c.id
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    aria-disabled={paused || undefined}
                    data-network={c.id}
                    onClick={paused ? undefined : () => setChain(c.id)}
                    className={cn(
                      "flex min-h-14 items-center gap-3 border-b border-line px-3 text-left last:border-b-0",
                      checked ? "bg-surface-sunken" : "bg-surface hover:bg-surface-sunken",
                      paused && "cursor-not-allowed",
                    )}
                  >
                    <span aria-hidden className={cn("grid size-5 shrink-0 place-items-center rounded-pill border-2", checked ? "border-ink" : "border-line-strong")}>
                      {checked && <span className="size-2.5 rounded-pill bg-ink" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-label", paused ? "text-ink-muted" : "text-ink")}>{NETWORK[c.id]}</span>
                      <span className="flex items-center gap-1 text-body-sm text-ink-muted">
                        {paused ? (
                          <>
                            <Clock aria-hidden className="size-3.5" strokeWidth={2} />
                            {t("xc.network.paused")}
                          </>
                        ) : c.status === "slower" ? (
                          t("xc.network.slow")
                        ) : (
                          t("xc.network.fast")
                        )}
                      </span>
                    </span>
                  </button>
                )
              })}
        </div>
      </fieldset>
      {chains.data?.mode === "simulated" && <SimPill />}
      {error && (
        <p role="alert" className="text-body-sm text-ink">
          {error}
        </p>
      )}
      <Button variant="primary" className="w-full" disabled={!picked || busy || !online} aria-busy={busy || undefined} onClick={go} data-get-address>
        {busy ? (
          <>
            <TypingDots size="sm" />
            {t("xc.quoting")}
          </>
        ) : (
          t("xc.cta.quote")
        )}
      </Button>
    </div>
  )
}

function DepositPanel({ id, pot, actor, onClose }: { id: string; pot: PotVM; actor: string; onClose: () => void }) {
  const q = useDeposit(id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const d = q.data

  const simulate = async (scenario?: SimScenario, amount?: bigint) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await deposits.simulate({ depositIntentId: id, scenario, amount: amount?.toString(), idempotencyKey: newDepositKey() })
      await queryClient().invalidateQueries({ queryKey: xcKeys.one(id) })
      invalidateDeposits(pot.slug, id)
    } catch (e) {
      setError(reasonOf(e) === "quota_exceeded" ? t("xc.sim.limit") : t("generic.error"))
    } finally {
      setBusy(false)
    }
  }

  if (!d)
    return (
      <div className="flex flex-col gap-3" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className="block h-8 rounded-sm bg-surface-sunken" />
        ))}
      </div>
    )
  const untouched = d.status === "PENDING_DEPOSIT" && !(d.simulated?.sent ?? false)
  if (untouched)
    return (
      <AddressStep
        d={d}
        busy={busy}
        error={error}
        onSimulate={simulate}
        onChange={() => setDepositParam(null)}
      />
    )
  return (
    <>
      {error && (
        <p role="alert" className="mb-3 text-body-sm text-ink">
          {error}
        </p>
      )}
      <DepositStepper d={d} pot={pot} actor={actor} onClose={onClose} onNewAddress={() => setDepositParam(null)} onTopUp={(m) => void simulate(undefined, m)} busy={busy} />
    </>
  )
}

function AddressStep({
  d,
  busy,
  error,
  onSimulate,
  onChange,
}: {
  d: DepositView
  busy: boolean
  error: string | null
  onSimulate: (scenario?: SimScenario) => void
  onChange: () => void
}) {
  const online = useOnline()
  const [full, setFull] = useState(false)
  const [copied, setCopied] = useState(false)
  const [more, setMore] = useState(false)
  const network = NETWORK[d.chain]
  const amount = BigInt(d.amountIn)
  const sim = d.mode === "simulated"
  const addr = shortAddress(d.depositAddress)
  const now = useNow()
  const hours = now ? Math.max(1, Math.round((Date.parse(d.deadline) - now) / 3600_000)) : 2
  const scenarios: SimScenario[] = ["partial", "slow", "failed", "no_liquidity", "expired"]

  return (
    <div className="flex flex-col gap-4" data-address-step>
      {sim && <SimPill />}
      <div>
        <p className="font-display text-heading text-ink">{t("xc.instructions", { amountToken: tokenAmount(amount), token: "USDC", network })}</p>
        <p className="mt-1 text-body-sm text-ink-muted">{t("xc.instructions.min", { minAmount: `${tokenAmount(BigInt(d.minAmountIn))} USDC` })}</p>
      </div>

      <div className="flex flex-col items-center gap-2">
        {/* dark on a white plate in Night too: scanners fail on inverted codes (surface #fff / ink #2b1b3a) */}
        <div role="img" aria-label={sim ? t("xc.sim.qr_band") : t("xc.address.label")} className="relative rounded-lg bg-white p-3 shadow-card" data-qr data-qr-text={d.qrText}>
          <QR value={d.qrText} size={196} level="M" bgColor="#ffffff" fgColor="#2b1b3a" aria-hidden />
          {sim && (
            <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 bg-ink px-2 py-1.5 text-center text-label text-surface" data-qr-band>
              {t("xc.sim.qr_band")}
            </span>
          )}
        </div>
        <button type="button" onClick={onChange} className="flex min-h-11 items-center gap-1.5 rounded-pill bg-surface-sunken px-3 text-label text-ink">
          <ArrowLeft aria-hidden className="size-4" strokeWidth={2} />
          {network}
          <span className="text-ink-muted">{t("xc.change")}</span>
        </button>
      </div>

      <div>
        <p className="mb-1.5 text-label text-ink">{t("xc.address.label")}</p>
        <div className="flex items-center gap-2 rounded-md bg-surface-sunken px-3 py-2.5">
          <span className="min-w-0 flex-1 font-mono text-body-sm break-all text-ink-muted tabular-nums" data-address>
            {full ? (
              d.depositAddress
            ) : (
              <>
                <b className="text-ink">{addr.head}</b>
                {addr.mid}
                <b className="text-ink">{addr.tail}</b>
              </>
            )}
          </span>
          <button type="button" className="min-h-11 shrink-0 rounded-sm px-2 text-label text-ink underline-offset-4 hover:underline" onClick={() => setFull((v) => !v)}>
            {full ? t("xc.show_less") : t("xc.show_all")}
          </button>
        </div>
        {!sim && <p className="mt-1.5 text-body-sm text-ink-muted">{t("xc.check_hint")}</p>}
      </div>

      <Callout icon={<TriangleAlert strokeWidth={2} />}>
        <p>{t("xc.warning", { token: "USDC", network })}</p>
        <p className="mt-1 flex items-center gap-1.5">
          <Clock aria-hidden className="size-4" strokeWidth={2} />
          {t("xc.deadline.hours", { hours })}
        </p>
      </Callout>

      {error && (
        <p role="alert" className="text-body-sm text-ink">
          {error}
        </p>
      )}

      {sim ? (
        <div className="flex flex-col gap-2">
          <Button variant="primary" className="w-full" disabled={busy || !online} aria-busy={busy || undefined} onClick={() => onSimulate("ok")} data-simulate>
            {busy ? <TypingDots size="sm" /> : null}
            {t("xc.sim.cta", { amount: usdShort(amount) })}
          </Button>
          <Button variant="ghost" className="w-full" aria-expanded={more} onClick={() => setMore((v) => !v)}>
            {t("xc.sim.problem")}
            <ChevronDown aria-hidden className={cn("transition-transform duration-200", more && "rotate-180")} strokeWidth={2} />
          </Button>
          {more && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" data-sim-scenarios>
              {scenarios.map((s) => (
                <Button key={s} size="sm" disabled={busy || !online} onClick={() => onSimulate(s)} data-scenario={s}>
                  {t(`xc.sim.scenario.${s}` as "xc.sim.scenario.slow")}
                </Button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <Button
          variant="primary"
          className="w-full"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(d.depositAddress)
            } catch {}
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          }}
        >
          {copied ? <Check aria-hidden strokeWidth={2.25} /> : null}
          {copied ? t("xc.copied") : t("xc.copy_network", { network })}
        </Button>
      )}

      <ProgressSteps
        label={t("xc.tab.progress")}
        steps={[
          { label: tLines("xc.step.waiting")[0], state: "current", helper: tLines("xc.step.waiting")[1] ?? undefined },
          { label: tLines("xc.step.spotted", { network })[0], state: "next" },
          { label: tLines("xc.step.converting")[0], state: "next" },
        ]}
      />
    </div>
  )
}

/** The deposit amount: ?amount= from the Add sheet, else what's left of the person's share, else $150. */
export function depositAmount(pot: PotVM, amountParam: string | null): bigint {
  if (amountParam && /^\d+(\.\d{1,2})?$/.test(amountParam)) {
    const [w = "0", f = ""] = amountParam.split(".")
    const m = BigInt(w) * 1_000_000n + BigInt((f + "00").slice(0, 2)) * 10_000n
    if (m > 0n) return m
  }
  const left = pot.goalEach && pot.me ? pot.goalEach - pot.me.contributed : 0n
  return left > 0n ? left : 150_000_000n
}
