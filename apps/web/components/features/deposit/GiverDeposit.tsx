"use client"
// "Another app or exchange" on the pay-in pages (/g/<slug>/<id>, /give/<slug>; any coin, 2026-11-04): people outside
// the Pot get the same network → coin (+ live quote) → address steps as a member's Add flow (./pickers.tsx), then a
// simulated transfer timed like that network (capped at 30 s) and the page goes on to send the payment. Testnet only:
// the address is a labelled fake ("Test only · Do not send"), the numbers are the real dry quote's (POST
// /api/oneclick/price), and what the Pot receives is the dollar amount the person picked, which is what the page
// promised ("About $25.00 arrives"). There is no real mode for people outside the Pot: GiveFlow doesn't offer this
// way to pay when the server is in real mode, and if one gets here anyway it says so and goes back.
import { useEffect, useRef, useState } from "react"
import { ProgressSteps, type StepState } from "@/components/feedback/States"
import { TypingDots } from "@/components/feedback/TypingDots"
import { Button } from "@/components/ui/button"
import { t, tLines } from "@/i18n/t"
import { useOnline } from "@/lib/client/browser"
import { deposits, useXcChains, type XcChain, type XcCoin } from "@/lib/deposit"
import { SIM_QR_TEXT } from "@/server/features/oneclick/assets"
import { assetOf, slippageFor, stableUnits } from "@/server/features/oneclick/origins"
import { simProfile } from "@/server/features/oneclick/sim"
import { pickChain, pickCoin, quoteErrorText } from "./DepositSheet"
import { SimPill } from "./DepositStepper"
import { NETWORK, sendText, usdShort } from "./format"
import { AddressCard, CoinList, LiveQuote, NetworkList, type AddressInfo } from "./pickers"

type Step = { at: "network" } | { at: "coin"; chain: XcChain } | { at: "address"; d: AddressInfo } | { at: "moving"; d: AddressInfo; since: number }

/** A simulated address works for 2 h, like a quote's (D-50). */
const inTwoHours = () => new Date(Date.now() + 2 * 3600_000).toISOString()
const hex = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, "0")).join("")

export function GiverDeposit({ potName, amount, onArrived, onCancel }: { potName: string; amount: bigint; onArrived: () => void; onCancel: () => void }) {
  const chains = useXcChains(true)
  const online = useOnline()
  const [step, setStep] = useState<Step>({ at: "network" })
  const [chain, setChain] = useState<XcChain | null>(null)
  const [coin, setCoin] = useState<XcCoin | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const heading = useRef<HTMLDivElement>(null)
  const list = chains.data?.chains ?? []
  const real = chains.data?.mode === "real"

  // each step's heading takes focus (like the member's sheet steps)
  useEffect(() => {
    heading.current?.querySelector<HTMLElement>("[data-step-heading]")?.focus()
  }, [step.at])

  // the simulated transfer: waiting → spotted → converting → arrived, timed like the network (≤ 30 s)
  const moving = step.at === "moving" ? step : null
  useEffect(() => {
    if (!moving) return
    const { pendingSec, processingSec } = simProfile(moving.d.chain, 1)
    const id = setInterval(() => {
      const n = Date.now()
      setNow(n)
      if (n - moving.since >= (pendingSec + processingSec) * 1000) {
        clearInterval(id)
        onArrived()
      }
    }, 500)
    return () => clearInterval(id)
  }, [moving, onArrived])

  if (real)
    return (
      <section className="flex flex-col gap-3 rounded-lg bg-surface p-4 shadow-card" data-give-xc="real">
        <p className="text-body text-ink">{t("xc.giver.unavailable")}</p>
        <Button className="w-full" onClick={onCancel}>
          {t("gift.signin.back")}
        </Button>
      </section>
    )

  const picked = pickChain(list, chain, amount)
  const getAddress = async (c: XcChain, k: XcCoin) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const asset = assetOf(c, k)!
      // the same numbers the member's flow uses: the live dry quote for a coin whose price moves, 1:1 for a stablecoin
      const n = asset.stable
        ? { amountIn: stableUnits(amount, asset.decimals).toString(), minAmountIn: ((stableUnits(amount, asset.decimals) * 99n) / 100n).toString(), amountOut: amount.toString() }
        : (await deposits.price({ chain: c, coin: k, amount: amount.toString() })).quote
      const keep = BigInt(10_000 - slippageFor(asset))
      setStep({
        at: "address",
        d: {
          mode: "simulated",
          chain: c,
          coin: k,
          decimals: asset.decimals,
          stable: asset.stable,
          amountIn: n.amountIn,
          minAmountIn: asset.stable ? n.minAmountIn : ((BigInt(n.amountIn) * keep) / 10_000n).toString(),
          usdTarget: amount.toString(),
          amountOutQuoted: n.amountOut,
          depositAddress: `SIMULATED-${c}-${hex(4)}`,
          qrText: SIM_QR_TEXT,
          deadline: inTwoHours(),
        },
      })
    } catch (e) {
      setError(quoteErrorText(e, NETWORK[c]))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section ref={heading} aria-labelledby="give-xc-h" className="flex flex-col gap-4 rounded-lg bg-surface p-4 shadow-card" data-give-xc={step.at}>
      <div>
        <h2 id="give-xc-h" className="font-display text-heading text-ink">
          {t("xc.giver.title")}
        </h2>
        <p className="text-body-sm text-ink-muted">{t("xc.giver.subtitle", { amount: usdShort(amount), potName })}</p>
      </div>
      <SimPill />

      {step.at === "network" && (
        <>
          <fieldset>
            <legend tabIndex={-1} className="mb-2 text-label text-ink outline-none" data-step-heading>
              {t("xc.network.label")}
            </legend>
            <NetworkList chains={list} loading={chains.isPending} picked={picked} amount={amount} onPick={setChain} />
          </fieldset>
          <Button
            variant="primary"
            className="w-full"
            disabled={!picked || !online}
            onClick={() => {
              if (!picked) return
              setChain(picked)
              setStep({ at: "coin", chain: picked })
            }}
            data-network-continue
          >
            {t("xc.cta.continue")}
          </Button>
          <Button variant="ghost" className="w-full" onClick={onCancel}>
            {t("a11y.back")}
          </Button>
        </>
      )}

      {step.at === "coin" &&
        (() => {
          const info = list.find((c) => c.id === step.chain)
          const k = pickCoin(info, coin, amount)
          const kInfo = info?.coins.find((x) => x.coin === k)
          return (
            <>
              <fieldset>
                <legend tabIndex={-1} className="mb-0.5 text-label text-ink outline-none" data-step-heading>
                  {t("xc.coin.label")}
                </legend>
                <p className="mb-2 text-body-sm text-ink-muted">{t("xc.coin.hint", { network: NETWORK[step.chain] })}</p>
                {info && <CoinList chain={info} picked={k} amount={amount} onPick={setCoin} />}
              </fieldset>
              {kInfo && <LiveQuote chain={step.chain} coin={kInfo} amount={amount} enabled />}
              {error && (
                <p role="alert" className="text-body-sm text-ink">
                  {error}
                </p>
              )}
              <Button
                variant="primary"
                className="w-full"
                disabled={!k || busy || !online}
                aria-busy={busy || undefined}
                onClick={() => k && void getAddress(step.chain, k)}
                data-get-address
              >
                {busy ? (
                  <>
                    <TypingDots size="sm" />
                    {t("xc.quoting")}
                  </>
                ) : (
                  t("xc.cta.quote")
                )}
              </Button>
              <Button variant="ghost" className="w-full" disabled={busy} onClick={() => setStep({ at: "network" })}>
                {t("a11y.back")}
              </Button>
            </>
          )
        })()}

      {step.at === "address" && (
        <div className="flex flex-col gap-4" data-address-step data-coin={step.d.coin}>
          <AddressCard d={step.d} onChange={() => setStep({ at: "coin", chain: step.d.chain })} sim />
          <Button
            variant="primary"
            className="w-full"
            disabled={!online}
            onClick={() => {
              const at = Date.now()
              setNow(at)
              setStep({ at: "moving", d: step.d, since: at })
            }}
            data-simulate
          >
            {t("xc.sim.cta", { amount: sendText(step.d, BigInt(step.d.amountIn)) })}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => setStep({ at: "coin", chain: step.d.chain })}>
            {t("a11y.back")}
          </Button>
        </div>
      )}

      {moving && <Moving d={moving.d} since={moving.since} now={now} />}
    </section>
  )
}

function Moving({ d, since, now }: { d: AddressInfo; since: number; now: number }) {
  const { pendingSec } = simProfile(d.chain, 1)
  const elapsed = (now - since) / 1000
  const at = elapsed < pendingSec * 0.6 ? 1 : elapsed < pendingSec ? 2 : 3
  const state = (n: number): StepState => (n < at ? "done" : n === at ? "current" : "next")
  const network = NETWORK[d.chain]
  return (
    <div className="flex flex-col gap-3" role="status" data-give-xc-moving={at}>
      <p tabIndex={-1} className="flex items-center gap-2 text-label text-ink outline-none" data-step-heading>
        <TypingDots size="sm" />
        {at === 3 ? t("xc.giver.converting") : t("xc.giver.waiting", { token: d.coin ?? "USDC", network })}
      </p>
      <ProgressSteps
        label={t("xc.tab.progress")}
        steps={[
          { label: tLines("xc.step.waiting")[0], state: state(1) },
          { label: tLines("xc.step.spotted", { network })[0], state: state(2) },
          { label: tLines("xc.step.converting")[0], state: state(3) },
        ]}
      />
    </div>
  )
}

