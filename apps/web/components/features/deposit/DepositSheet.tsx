"use client"
// Any-chain deposit sheet (D-50; ux-spec §4.8; design-direction 01 §4; any coin 2026-11-04): `?sheet=add&src=xc` →
// network picker → `&net=<chain>` "Which coin are you sending?" (+ the live quote for a coin whose price moves) →
// `&d=<id>` address + QR → DepositStepper. On testnet the address is simulated: a "Testnet demo" pill, a QR that
// reads "DO NOT SEND" under a "Test only · Do not send" band, and [Simulate sending $150] (or "0.008625 ETH") as the
// one marigold button (Copy is hidden, design-direction open question 7). Real mode (mainnet clip) shows [Copy Base address].
// Steps 2-4 of the Add money flow (components/sheets/AddFlow.tsx): each is its own history entry, with a [Back]
// under the primary (network → the Add sheet, coin → the network, address → the coin, the picks kept). No Back once
// the money is on its way (the stepper): ✕ and "You can close this screen" apply.
// The parts shared with the pay-in pages (people outside the Pot) live in ./pickers.tsx.
import { Check, ChevronDown } from "lucide-react"
import { useEffect, useState } from "react"
import { ProgressSteps } from "@/components/feedback/States"
import { TypingDots } from "@/components/feedback/TypingDots"
import { Sheet, SheetBack } from "@/components/sheets/Sheet"
import { Button } from "@/components/ui/button"
import { t, tLines } from "@/i18n/t"
import { useOnline } from "@/lib/client/browser"
import { cn } from "@/lib/client/cn"
import type { PotVM } from "@/lib/client/mock/types"
import type { AddStep } from "@/lib/client/machines/add-flow"
import { closeSheet, pushSheetStep } from "@/lib/client/sheet"
import {
  deposits,
  invalidateDeposits,
  newDepositKey,
  potKey,
  useDeposit,
  useXcChains,
  xcKeys,
  type ChainInfo,
  type DepositView,
  type SimScenario,
  type XcChain,
  type XcCoin,
} from "@/lib/deposit"
import { queryClient } from "@/lib/client/query"
import { DepositStepper, SimPill } from "./DepositStepper"
import { NETWORK, sendText, usdShort } from "./format"
import { AddressCard, chainOpen, CoinList, coinOpen, LiveQuote, NetworkList } from "./pickers"

const reasonOf = (e: unknown): string => (e as { reason?: string })?.reason ?? "failed"
const minimumOf = (e: unknown): string | null => {
  const m = (e as { detail?: { minimum?: string } })?.detail?.minimum
  return typeof m === "string" && /^\d+$/.test(m) ? m : null
}

/** The words for a quote that didn't go through (shared with the pay-in pages). */
export function quoteErrorText(e: unknown, network: string): string {
  const r = reasonOf(e)
  const min = minimumOf(e)
  return r === "amount_too_low"
    ? t("xc.error.min", { min: min ? usdShort(min) : "$1" })
    : r === "amount_too_high"
      ? t("xc.error.max", { max: "$500" })
      : r === "chain_paused"
        ? t("xc.error.paused", { network })
        : r === "quota_exceeded"
          ? t("relayer.cap")
          : t("xc.error.quote")
}

export function DepositSheet({
  pot,
  open,
  depositId,
  net,
  amount,
  actor,
  step,
  chain,
  coin,
  onChain,
  onCoin,
  onTracking,
  onBack,
  onNewAddress,
}: {
  pot: PotVM
  open: boolean
  depositId: string | null
  /** ?net=: the network the coin step is for */
  net: XcChain | null
  /** what to add, from the Add sheet (?amount=) */
  amount: bigint
  actor: string
  /** the flow's step: "tracking" = money on its way (no Back) */
  step: AddStep | null
  /** the picked network, kept by the flow across Back */
  chain: XcChain | null
  /** the picked coin, kept by the flow across Back */
  coin: XcCoin | null
  onChain: (c: XcChain) => void
  onCoin: (c: XcCoin) => void
  /** the deposit left "waiting for you to send" */
  onTracking: () => void
  onBack: (from: AddStep) => void
  onNewAddress: () => void
}) {
  // closing never cancels a deposit; it leaves the Pot screen without the sheet (every step's entry unwinds)
  const close = closeSheet
  const stepKey = depositId ? "address" : net ? "coin" : "network"
  return (
    <Sheet open={open} onClose={close} title={t("xc.title")} description={t("xc.subtitle", { amount: usdShort(amount), potName: pot.name })} stepKey={stepKey}>
      <div className="pb-2" data-deposit-sheet data-step={step ?? undefined}>
        {depositId ? (
          <DepositPanel
            key={depositId}
            id={depositId}
            pot={pot}
            actor={actor}
            onClose={close}
            onTracking={onTracking}
            onBack={() => onBack("address")}
            onNewAddress={onNewAddress}
          />
        ) : net ? (
          <CoinStep pot={pot} amount={amount} open={open} chain={net} coin={coin} onCoin={onCoin} onBack={() => onBack("coin")} />
        ) : (
          <NetworkStep amount={amount} open={open} chain={chain} onChain={onChain} onBack={() => onBack("network")} />
        )}
      </div>
    </Sheet>
  )
}

/** The kept network unless it can't be used now, else the first open one. */
export function pickChain(list: ChainInfo[], kept: XcChain | null, amount: bigint): XcChain | null {
  if (kept && list.some((c) => c.id === kept && chainOpen(c, amount))) return kept
  return list.find((c) => chainOpen(c, amount))?.id ?? null
}

/** The kept coin unless it can't be used now, else the network's first open one (stablecoins come first). */
export function pickCoin(c: ChainInfo | undefined, kept: XcCoin | null, amount: bigint): XcCoin | null {
  if (!c) return null
  if (kept && c.coins.some((x) => x.coin === kept && coinOpen(x, amount))) return kept
  return c.coins.find((x) => coinOpen(x, amount))?.coin ?? null
}

function NetworkStep({ amount, open, chain, onChain: setChain, onBack }: { amount: bigint; open: boolean; chain: XcChain | null; onChain: (c: XcChain) => void; onBack: () => void }) {
  const chains = useXcChains(open)
  const online = useOnline()
  const list = chains.data?.chains ?? []
  const picked = pickChain(list, chain, amount)

  const go = () => {
    if (!picked) return
    setChain(picked)
    // the coin is its own step (a history entry): Back returns to this network, still picked
    pushSheetStep((p) => p.set("net", picked))
  }

  return (
    <div className="flex flex-col gap-4" data-network-step>
      <fieldset>
        <legend tabIndex={-1} className="mb-2 text-label text-ink outline-none" data-step-heading>
          {t("xc.network.label")}
        </legend>
        <NetworkList chains={list} loading={chains.isPending} picked={picked} amount={amount} onPick={setChain} />
      </fieldset>
      {chains.data?.mode === "simulated" && <SimPill />}
      <Button variant="primary" className="w-full" disabled={!picked || !online} onClick={go} data-network-continue>
        {t("xc.cta.continue")}
      </Button>
      <SheetBack onClick={onBack} />
    </div>
  )
}

function CoinStep({
  pot,
  amount,
  open,
  chain,
  coin,
  onCoin: setCoin,
  onBack,
}: {
  pot: PotVM
  amount: bigint
  open: boolean
  chain: XcChain
  coin: XcCoin | null
  onCoin: (c: XcCoin) => void
  onBack: () => void
}) {
  const chains = useXcChains(open)
  const online = useOnline()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const info = chains.data?.chains.find((c) => c.id === chain)
  const picked = pickCoin(info, coin, amount)
  const pickedInfo = info?.coins.find((c) => c.coin === picked)
  const network = NETWORK[chain]

  const go = async () => {
    if (!picked || busy) return
    setBusy(true)
    setError(null)
    try {
      const q = await deposits.quote({ pot: potKey(pot.slug), chain, coin: picked, amount: amount.toString(), idempotencyKey: newDepositKey() })
      if (!q.depositIntentId) throw new Error("no_intent")
      setCoin(picked)
      // the address is its own step (a history entry): Back returns to this coin, still picked
      pushSheetStep((p) => p.set("d", q.depositIntentId!))
    } catch (e) {
      setError(quoteErrorText(e, network))
      if (reasonOf(e) === "chain_paused" || reasonOf(e) === "amount_too_low") void queryClient().invalidateQueries({ queryKey: xcKeys.chains })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4" data-coin-step data-chain={chain}>
      <fieldset>
        <legend tabIndex={-1} className="mb-0.5 text-label text-ink outline-none" data-step-heading>
          {t("xc.coin.label")}
        </legend>
        <p className="mb-2 text-body-sm text-ink-muted">{t("xc.coin.hint", { network })}</p>
        {info ? (
          <CoinList chain={info} picked={picked} amount={amount} onPick={setCoin} />
        ) : (
          <div aria-hidden className="h-28 rounded-md bg-surface-sunken" />
        )}
      </fieldset>
      {pickedInfo && <LiveQuote chain={chain} coin={pickedInfo} amount={amount} enabled={open} />}
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
      <SheetBack onClick={onBack} disabled={busy} />
    </div>
  )
}

function DepositPanel({
  id,
  pot,
  actor,
  onClose,
  onTracking,
  onBack,
  onNewAddress,
}: {
  id: string
  pot: PotVM
  actor: string
  onClose: () => void
  onTracking: () => void
  onBack: () => void
  onNewAddress: () => void
}) {
  const q = useDeposit(id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const d = q.data
  const untouched = !!d && d.status === "PENDING_DEPOSIT" && !(d.simulated?.sent ?? false)
  // money on its way (or already here): from now on no Back, only ✕ / Done
  const tracking = !!d && !untouched
  useEffect(() => {
    if (tracking) onTracking()
  }, [tracking, onTracking])

  const simulate = async (scenario?: SimScenario, amount?: bigint) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await deposits.simulate({ depositIntentId: id, scenario, amount: amount?.toString(), idempotencyKey: newDepositKey() })
      await queryClient().invalidateQueries({ queryKey: xcKeys.one(id) })
      invalidateDeposits(pot.slug, id)
    } catch (e) {
      const r = reasonOf(e)
      // a top-up refused because the time ran out: say so (the stepper turns "Stopped" on its own)
      setError(r === "quota_exceeded" ? t("xc.sim.limit") : r === "bad_request" && amount !== undefined ? t("xc.sim.too_late") : t("generic.error"))
      // whatever happened, show where the transfer really is
      await queryClient().invalidateQueries({ queryKey: xcKeys.one(id) })
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
  if (untouched)
    return (
      <AddressStep
        d={d}
        busy={busy}
        error={error}
        onSimulate={simulate}
        onChange={onBack}
      />
    )
  return (
    <>
      {error && (
        <p role="alert" className="mb-3 text-body-sm text-ink">
          {error}
        </p>
      )}
      <DepositStepper d={d} pot={pot} actor={actor} onClose={onClose} onNewAddress={onNewAddress} onTopUp={(m) => void simulate(undefined, m)} busy={busy} />
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
  const [copied, setCopied] = useState(false)
  const [more, setMore] = useState(false)
  const network = NETWORK[d.chain]
  const sim = d.mode === "simulated"
  const scenarios: SimScenario[] = ["partial", "slow", "failed", "no_liquidity", "expired"]

  return (
    <div className="flex flex-col gap-4" data-address-step data-coin={d.coin ?? "USDC"}>
      {sim && <SimPill />}
      <AddressCard d={d} onChange={onChange} sim={sim} />

      {error && (
        <p role="alert" className="text-body-sm text-ink">
          {error}
        </p>
      )}

      {sim ? (
        <div className="flex flex-col gap-2">
          <Button variant="primary" className="w-full" disabled={busy || !online} aria-busy={busy || undefined} onClick={() => onSimulate("ok")} data-simulate>
            {busy ? <TypingDots size="sm" /> : null}
            {t("xc.sim.cta", { amount: sendText(d, BigInt(d.amountIn)) })}
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
      {/* Back to the coin picker (the picks kept); gone once "Simulate sending" is pressed */}
      <SheetBack onClick={onChange} disabled={busy} />

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
