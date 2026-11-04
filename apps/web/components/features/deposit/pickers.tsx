"use client"
// The parts of "Add from another app or exchange" that the member's Add flow (DepositSheet) and the pay-in pages
// (GiverDeposit, people outside the Pot) share (any coin, 2026-11-04; Aurora-style deposit rules):
//  - NetworkList: every curated network, its coins, how long it usually takes (slow ones flagged with the time),
//    paused ones and ones whose minimum is above the amount disabled with the reason ("From $100");
//  - CoinList + LiveQuote: "Which coin are you sending?", stablecoins first; for a coin whose price moves, the live
//    dry quote "Send about 0.008625 ETH · About $20.00 arrives", refreshed every 30 s, with what a price move means;
//  - AddressCard: the address and QR are never shown without the network AND the coin: the heading says both, a chip
//    under the QR repeats them, and a "Send only ETH on Base" box sits right under the address (one coin per address).
import { ArrowLeft, Clock, Info, ShieldAlert, TriangleAlert } from "lucide-react"
import dynamic from "next/dynamic"
import { useState, type ReactNode } from "react"
import { Callout } from "@/components/feedback/States"
import { t } from "@/i18n/t"
import { cn } from "@/lib/client/cn"
import { useNow } from "@/lib/client/time"
import { useXcPrice, type ChainInfo, type CoinInfo, type DepositView, type XcChain, type XcCoin } from "@/lib/deposit"
import { simIsSpedUp, XC_CONFIG } from "@/server/features/oneclick/origins"
import { coinAmount, coinText, minutesOf, NETWORK, shortAddress, tokenAmount, usd, usdShort } from "./format"

/** "12:01:30": the live quote's time, to the second (it refreshes every 30 s). */
const clockFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })
const formatClock = (ms: number) => clockFmt.format(ms)

const QR = dynamic(() => import("qrcode.react").then((m) => m.QRCodeSVG), { ssr: false })

/** The network row's speed line: under a minute · 1-2 minutes · "Slow: about 20 minutes" (flagged). */
export function speedText(c: Pick<ChainInfo, "id" | "speed">): string {
  return c.speed === "fast" ? t("xc.network.fast") : c.speed === "slower" ? t("xc.network.slow") : t("xc.network.slowest", { minutes: minutesOf(c.id) })
}

/** Is this network usable for `amount` (USD micro)? */
export const chainOpen = (c: ChainInfo, amount: bigint): boolean => c.status !== "paused" && amount >= BigInt(c.minAmount)
export const coinOpen = (c: CoinInfo, amount: bigint): boolean => c.status === "ok" && amount >= BigInt(c.minAmount)

function RadioDot({ checked }: { checked: boolean }) {
  return (
    <span aria-hidden className={cn("grid size-5 shrink-0 place-items-center rounded-pill border-2", checked ? "border-ink" : "border-line-strong")}>
      {checked && <span className="size-2.5 rounded-pill bg-ink" />}
    </span>
  )
}

function Row({
  checked,
  disabled,
  onSelect,
  children,
  ...data
}: { checked: boolean; disabled: boolean; onSelect: () => void; children: ReactNode } & { [k: `data-${string}`]: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onSelect}
      className={cn(
        "flex min-h-14 items-center gap-3 border-b border-line px-3 py-2 text-left last:border-b-0",
        checked ? "bg-surface-sunken" : "bg-surface hover:bg-surface-sunken",
        disabled && "cursor-not-allowed",
      )}
      {...data}
    >
      <RadioDot checked={checked} />
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  )
}

export function NetworkList({
  chains,
  loading,
  picked,
  amount,
  onPick,
}: {
  chains: ChainInfo[]
  loading: boolean
  picked: XcChain | null
  amount: bigint
  onPick: (c: XcChain) => void
}) {
  return (
    <div role="radiogroup" aria-label={t("xc.network.label")} className="flex flex-col overflow-hidden rounded-md border border-line">
      {loading
        ? [0, 1, 2, 3].map((i) => <div key={i} className="h-14 border-b border-line bg-surface-sunken last:border-b-0" aria-hidden />)
        : chains.map((c) => {
            const paused = c.status === "paused"
            const tooSmall = !paused && amount < BigInt(c.minAmount)
            const coins = c.coins.filter((x) => x.status === "ok").map((x) => x.coin)
            return (
              <Row key={c.id} checked={picked === c.id} disabled={paused || tooSmall} onSelect={() => onPick(c.id)} data-network={c.id}>
                <span className="flex items-baseline justify-between gap-2">
                  <span className={cn("text-label", paused || tooSmall ? "text-ink-muted" : "text-ink")}>{NETWORK[c.id]}</span>
                  {!paused && coins.length > 0 && <span className="truncate text-body-sm text-ink-muted">{t("xc.network.coins", { coins: coins.join(", ") })}</span>}
                </span>
                <span className="flex items-center gap-1 text-body-sm text-ink-muted">
                  {paused ? (
                    <>
                      <Clock aria-hidden className="size-3.5 shrink-0" strokeWidth={2} />
                      {t("xc.network.paused")}
                    </>
                  ) : tooSmall ? (
                    <>
                      <Info aria-hidden className="size-3.5 shrink-0" strokeWidth={2} />
                      {t("xc.network.min", { min: usdShort(c.minAmount) })}
                    </>
                  ) : c.speed === "slow" ? (
                    <>
                      <Clock aria-hidden className="size-3.5 shrink-0 text-waiting" strokeWidth={2} />
                      {speedText(c)}
                    </>
                  ) : (
                    speedText(c)
                  )}
                </span>
              </Row>
            )
          })}
    </div>
  )
}

export function CoinList({ chain, picked, amount, onPick }: { chain: ChainInfo; picked: XcCoin | null; amount: bigint; onPick: (c: XcCoin) => void }) {
  return (
    <div role="radiogroup" aria-label={t("xc.coin.label")} className="flex flex-col overflow-hidden rounded-md border border-line">
      {chain.coins.map((c) => {
        const open = coinOpen(c, amount)
        return (
          <Row key={c.coin} checked={picked === c.coin} disabled={!open} onSelect={() => onPick(c.coin)} data-coin={c.coin}>
            <span className={cn("block text-label", open ? "text-ink" : "text-ink-muted")}>{c.coin}</span>
            <span className="flex items-center gap-1 text-body-sm text-ink-muted">
              {c.status !== "ok" ? (
                <>
                  <Clock aria-hidden className="size-3.5 shrink-0" strokeWidth={2} />
                  {t("xc.coin.unavailable")}
                </>
              ) : !open ? (
                <>
                  <Info aria-hidden className="size-3.5 shrink-0" strokeWidth={2} />
                  {t("xc.network.min", { min: usdShort(c.minAmount) })}
                </>
              ) : c.stable ? (
                t("xc.coin.stable", { name: c.name, amountToken: tokenAmount(amount), coin: c.coin })
              ) : (
                t("xc.coin.priced", { name: c.name })
              )}
            </span>
          </Row>
        )
      })}
    </div>
  )
}

/**
 * The selected coin's live quote. A stablecoin is 1:1 (no quote needed); any other coin gets the dry quote, refreshed
 * every 30 s while it's on screen: "Send about 0.008625 ETH" / "About $20.00 arrives" / what a price move means.
 */
export function LiveQuote({ chain, coin, amount, enabled }: { chain: XcChain; coin: CoinInfo; amount: bigint; enabled: boolean }) {
  const q = useXcPrice(coin.stable ? null : { chain, coin: coin.coin, amount }, enabled && !coin.stable)
  if (coin.stable) return null
  const p = q.data
  const reason = (q.error as { reason?: string } | null)?.reason
  return (
    <section className="flex flex-col gap-2 rounded-lg bg-surface p-4 ring-1 ring-line" aria-live="polite" aria-busy={q.isFetching || undefined} data-live-quote>
      {p ? (
        <>
          <p className="font-display text-heading text-ink tabular-nums" data-quote-send>
            {t("xc.quote.send", { amountToken: coinAmount(BigInt(p.quote.amountIn), p.decimals), coin: p.coin })}
          </p>
          <p className="text-body text-ink tabular-nums" data-quote-arrives>
            {t("xc.quote.arrives", { amount: usd(p.quote.amountOut) })}
          </p>
          <p className="text-body-sm text-ink-muted">{t("xc.quote.note", { pct: `${p.slippageBps / 100}%` })}</p>
          <p className="text-body-sm text-ink-muted tabular-nums" data-quote-time>
            {q.isFetching ? t("xc.quote.updating") : t("xc.quote.updated", { time: formatClock(Date.parse(p.quotedAt)) })}
          </p>
        </>
      ) : q.isError ? (
        <p role="alert" className="flex items-start gap-2 text-body-sm text-ink">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-declined" strokeWidth={2} />
          {reason === "amount_too_low" ? t("xc.error.min", { min: usdShort(coin.minAmount) }) : t("xc.quote.error")}
        </p>
      ) : (
        <p className="text-body-sm text-ink-muted">{t("xc.quote.updating")}</p>
      )}
    </section>
  )
}

/** What an address step needs (a DepositView, or the pay-in page's local simulated one). */
export type AddressInfo = Pick<
  DepositView,
  "mode" | "chain" | "coin" | "decimals" | "stable" | "amountIn" | "minAmountIn" | "usdTarget" | "amountOutQuoted" | "depositAddress" | "depositMemo" | "qrText" | "deadline"
>

/**
 * The address, never without the network and the coin: the heading ("Send 0.008625 ETH on Base"), the minimum, what
 * arrives for a priced coin, the QR (a simulated one reads "Test only · Do not send"), a "Base · ETH" chip that goes back
 * to change them, the address (first and last 4 bold), the "Send only ETH on Base" box right under it, the memo when
 * the network needs one, a slow network's time, and how long the address works.
 */
export function AddressCard({ d, onChange, sim }: { d: AddressInfo; onChange: () => void; sim: boolean }) {
  const [full, setFull] = useState(false)
  const network = NETWORK[d.chain]
  const token = d.coin ?? "USDC"
  const stable = d.stable ?? true
  const units = BigInt(d.amountIn)
  const addr = shortAddress(d.depositAddress)
  const now = useNow()
  const hours = now ? Math.max(1, Math.round((Date.parse(d.deadline) - now) / 3600_000)) : 2
  const slow = XC_CONFIG[d.chain].speed === "slow"
  return (
    <>
      <div>
        <h3 tabIndex={-1} className="font-display text-heading text-ink outline-none tabular-nums" data-step-heading>
          {t("xc.instructions", { amountToken: coinAmount(units, d.decimals ?? 6, stable), token, network })}
        </h3>
        <p className="mt-1 text-body-sm text-ink-muted tabular-nums">
          {t("xc.instructions.min", { minAmount: coinText(d, BigInt(d.minAmountIn), stable ? undefined : 4) })}
        </p>
        {!stable && d.amountOutQuoted && (
          <p className="mt-1 text-body-sm text-ink tabular-nums" data-address-arrives>
            {t("xc.instructions.arrives", { amount: usd(d.amountOutQuoted) })}
          </p>
        )}
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
        <button type="button" onClick={onChange} className="flex min-h-11 items-center gap-1.5 rounded-pill bg-surface-sunken px-3 text-label text-ink" data-network-chip>
          <ArrowLeft aria-hidden className="size-4" strokeWidth={2} />
          {t("xc.chip", { network, token })}
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
        {/* right under the address: what may be sent to it (Aurora's rule: one coin, one network, per address) */}
        <div className="mt-2 flex items-start gap-3 rounded-md p-3 ring-1 ring-line-strong" data-send-only>
          <ShieldAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-ink" strokeWidth={2} />
          <div className="min-w-0 text-body-sm text-ink">
            <p className="text-label">{t("xc.only.title", { token, network })}</p>
            <p className="mt-0.5">{t("xc.only.body", { token })}</p>
          </div>
        </div>
      </div>

      {d.depositMemo && (
        <Callout icon={<TriangleAlert strokeWidth={2} />}>
          <p data-memo>{t("xc.memo", { memo: d.depositMemo })}</p>
        </Callout>
      )}

      <Callout icon={<Clock strokeWidth={2} />}>
        {slow && <p data-slow-network>{t("xc.slow_network", { network, minutes: minutesOf(d.chain) })}</p>}
        {slow && sim && simIsSpedUp(d.chain) && <p className="mt-1 text-ink-muted">{t("xc.sim.sped_up")}</p>}
        <p className={cn(slow && "mt-1")}>{t("xc.deadline.hours", { hours })}</p>
      </Callout>
    </>
  )
}
