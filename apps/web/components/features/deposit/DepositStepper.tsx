"use client"
// DepositStepper (D-50; ux-spec §4.8; design-direction 01 §4 "Any-chain deposit: DepositStepper"): where the money
// is, how long it usually takes, and that you can leave. Five steps (waiting, spotted, converting, arrived, added);
// "Taking longer than usual" 5 min into converting; result blocks for incomplete / refunded / failed / expired;
// at "Arrived" the one tap that adds it to the Pot. A [Progress | Details] switch keeps the support details.
import { Check, CircleAlert, Clock, Copy, X } from "lucide-react"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { ProgressSteps, type StepState } from "@/components/feedback/States"
import { TypingDots } from "@/components/feedback/TypingDots"
import { TabList } from "@/components/pot/Controls"
import { Button } from "@/components/ui/button"
import { t, tLines } from "@/i18n/t"
import { announce, useOnline } from "@/lib/client/browser"
import { cn } from "@/lib/client/cn"
import type { PotVM } from "@/lib/client/mock/types"
import { formatTime } from "@/lib/client/time"
import { addArrived, arrivedAmount, isSlow, type DepositView } from "@/lib/deposit"
import { NETWORK, safeHref, tokenAmount, usd, usdShort } from "./format"

type Tab = "progress" | "details"

/** A 1 s clock while something can turn slow (the shared useNow ticks every 30 s). */
function useTick(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])
  return now
}

export function statusWord(d: DepositView): string {
  if (d.status === "ADDED") return t("xc.status.added")
  if (d.status === "SUCCESS") return t("xc.status.arrived")
  if (["REFUNDED", "FAILED", "EXPIRED", "STUCK"].includes(d.status)) return t("xc.status.stopped")
  return t("xc.status.on_way")
}

function stepStates(d: DepositView): StepState[] {
  const cur = d.step
  const failed = ["REFUNDED", "FAILED", "EXPIRED", "STUCK"].includes(d.status)
  return [1, 2, 3, 4, 5].map((n) => {
    if (d.status === "ADDED") return "done"
    if (n < cur) return "done"
    if (n === cur) return failed ? "error" : d.status === "SUCCESS" && n === 4 ? "done" : "current"
    if (d.status === "SUCCESS" && n === 5) return "current"
    return "next"
  })
}

export function DepositStepper({
  d,
  pot,
  actor,
  onClose,
  onNewAddress,
  onTopUp,
  busy,
}: {
  d: DepositView
  pot: PotVM
  actor: string
  onClose: () => void
  onNewAddress: () => void
  /** simulator only: send the missing part of a partial deposit */
  onTopUp?: (missing: bigint) => void
  busy?: boolean
}) {
  // Details open by default once a transfer failed (support needs the reference); a tap decides after that
  const [picked, setTab] = useState<Tab | null>(null)
  const tab: Tab = picked ?? (d.status === "FAILED" || d.status === "STUCK" ? "details" : "progress")
  const online = useOnline()
  const now = useTick(d.status === "PROCESSING")
  const network = NETWORK[d.chain]
  const amount = BigInt(d.amountIn)
  const slow = isSlow(d, now)
  const [adding, setAdding] = useState(false)
  const lastStatus = useRef(d.status)

  // one polite announcement per change (WCAG 4.1.3)
  useEffect(() => {
    if (lastStatus.current === d.status) return
    lastStatus.current = d.status
    if (d.status === "SUCCESS") announce(t("xc.arrived.title", { amount: usd(arrivedAmount(d)) }))
    else if (d.status === "ADDED") announce(t("xc.step.added"))
    else announce(statusWord(d))
  }, [d])

  const add = () => {
    if (adding) return
    setAdding(true)
    const h = addArrived(pot, d, actor)
    if (!h) return setAdding(false)
    void h.done.then((r) => {
      if (r !== "ok") setAdding(false)
    })
  }

  const helper = (n: number): string | undefined => {
    if (n === 1) return tLines("xc.step.waiting")[1] ?? undefined
    if (n === 2) return tLines("xc.step.spotted", { network })[1] ?? undefined
    if (n === 3) return d.chain === "eth" ? t("xc.network.slow") : (tLines("xc.step.converting")[1] ?? undefined)
    if (n === 4) return tLines("xc.step.arrived", { potName: pot.name })[1] ?? undefined
    return undefined
  }
  const labels = [
    tLines("xc.step.waiting")[0],
    tLines("xc.step.spotted", { network })[0],
    tLines("xc.step.converting")[0],
    tLines("xc.step.arrived", { potName: pot.name })[0],
    t("xc.step.added"),
  ]
  const states = stepStates(d)
  const doneAt = Date.parse(d.updatedAt)

  let result: ReactNode = null
  if (d.status === "INCOMPLETE_DEPOSIT") {
    const missing = missingOf(d)
    if (missing === 0n) {
      // the rest was sent and is on its way (not spotted yet): no second "send more" (2026-11-02)
      const [title, body] = tLines("xc.incomplete.rest_sent", { network })
      result = <Result icon={<Clock strokeWidth={2} />} tone="waiting" title={title} body={body} data="rest-sent" />
    } else {
      const [title, body] = tLines("xc.incomplete", { missing: `${tokenAmount(missing)} USDC`, deadline: formatTime(Date.parse(d.deadline)) })
      result = (
        <Result icon={<Clock strokeWidth={2} />} tone="waiting" title={title} body={body} data="incomplete">
          {d.mode === "simulated" && onTopUp && (
            <Button variant="primary" className="w-full" disabled={busy || !online} aria-busy={busy || undefined} onClick={() => onTopUp(missing)}>
              {t("xc.sim.top_up", { amount: usdShort(missing) })}
            </Button>
          )}
        </Result>
      )
    }
  } else if (d.status === "REFUNDED") {
    const [title, body] = tLines("xc.refunded")
    result = <Result icon={<X strokeWidth={2.5} />} tone="declined" title={title} body={body} support />
  } else if (d.status === "FAILED" || d.status === "STUCK") {
    const [title, body] = tLines("xc.failed")
    result = <Result icon={<X strokeWidth={2.5} />} tone="declined" title={title} body={body} support />
  } else if (d.status === "EXPIRED") {
    const [title, body] = tLines("xc.expired")
    result = (
      <Result icon={<CircleAlert strokeWidth={2} />} tone="ink" title={title} body={body}>
        <Button variant="primary" className="w-full" onClick={onNewAddress}>
          {t("xc.new_address")}
        </Button>
      </Result>
    )
  }

  return (
    <div className="flex flex-col gap-4" data-deposit-stepper data-status={d.status}>
      <div>
        <p className="font-display text-title text-ink" data-status-word>
          {statusWord(d)}
        </p>
        <p className="mt-1 text-body-sm text-ink-muted">{t("xc.summary", { amount: usdShort(amount), network, potName: pot.name })}</p>
      </div>
      {d.mode === "simulated" && <SimPill />}
      {result}
      <TabList<Tab>
        idBase="xc"
        label={t("xc.tab.progress")}
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "progress", label: t("xc.tab.progress") },
          { value: "details", label: t("xc.tab.details") },
        ]}
      />
      {tab === "progress" ? (
        <div role="tabpanel" id="xc-panel-progress" aria-labelledby="xc-tab-progress" className="flex flex-col gap-4">
          {(
            <ProgressSteps
              label={t("xc.tab.progress")}
              steps={labels.map((label, i) => ({
                label,
                state: states[i]!,
                helper: states[i] === "current" ? helper(i + 1) : states[i] === "done" && i + 1 === d.step - 1 ? formatTime(doneAt) : undefined,
              }))}
            />
          )}
          {slow && (
            <p role="status" className="flex items-start gap-2 rounded-md bg-surface-sunken p-3 text-body-sm text-ink" data-slow>
              <Clock aria-hidden className="mt-0.5 size-4 shrink-0 text-waiting" strokeWidth={2} />
              <span>
                <span className="block text-label">{tLines("xc.slow")[0]}</span>
                {tLines("xc.slow")[1]}
              </span>
            </p>
          )}
          {!online && <p className="text-body-sm text-ink-muted">{t("xc.offline")}</p>}
        </div>
      ) : (
        <div role="tabpanel" id="xc-panel-details" aria-labelledby="xc-tab-details">
          <Details d={d} />
        </div>
      )}

      {d.status === "SUCCESS" && (
        <section className="flex flex-col gap-3 rounded-lg bg-surface-sunken p-4" data-arrived>
          <p className="font-display text-heading text-ink">{t("xc.arrived.title", { amount: usd(arrivedAmount(d)) })}</p>
          <p className="text-body-sm text-ink-muted">{adding ? t("xc.arrived.adding", { potName: pot.name }) : t("xc.arrived.body", { potName: pot.name })}</p>
          <Button variant="primary" className="w-full" disabled={adding || !online} aria-busy={adding || undefined} onClick={add} data-add-arrived>
            {adding ? <TypingDots size="sm" /> : <Check aria-hidden strokeWidth={2.25} />}
            {t("xc.arrived.cta")}
          </Button>
        </section>
      )}
      {d.status === "ADDED" ? (
        <div className="flex flex-col gap-3">
          <p className="flex items-center gap-2 text-body text-ink">
            <span aria-hidden className="grid size-6 place-items-center rounded-pill bg-approved text-surface">
              <Check className="size-4" strokeWidth={3} />
            </span>
            {t("xc.added.body", { potName: pot.name })}
          </p>
          <Button className="w-full" onClick={onClose}>
            {t("xc.done")}
          </Button>
        </div>
      ) : (
        d.status !== "SUCCESS" && (
          <div className="flex flex-col gap-3">
            {!result && <p className="text-body-sm text-ink-muted">{t("xc.notify_ok")}</p>}
            <Button className="w-full" onClick={onClose}>
              {t("a11y.close")}
            </Button>
          </div>
        )
      )}
    </div>
  )
}

export function SimPill() {
  return (
    <p className="self-start rounded-pill bg-surface-sunken px-3 py-1 text-body-sm font-semibold text-ink-muted ring-1 ring-line" data-sim-pill>
      {t("xc.sim.pill")}
    </p>
  )
}

/**
 * What is still missing of an INCOMPLETE deposit: the minimum minus everything sent (the simulator also counts a
 * top-up that is on its way but not spotted yet), never below 0.
 */
export function missingOf(d: Pick<DepositView, "minAmountIn" | "depositedAmount" | "simulated">): bigint {
  const detected = BigInt(d.depositedAmount ?? "0")
  const sent = BigInt(d.simulated?.sentAmount ?? "0")
  const m = BigInt(d.minAmountIn) - (sent > detected ? sent : detected)
  return m > 0n ? m : 0n
}

function Result({
  icon,
  tone,
  title,
  body,
  children,
  support,
  data,
}: {
  icon: ReactNode
  tone: "waiting" | "declined" | "ink"
  title: string
  body: string | null
  children?: ReactNode
  support?: boolean
  /** data-result value (e2e hook) */
  data?: string
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg bg-surface p-4 ring-1 ring-line" data-result={data ?? ""}>
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-pill [&_svg]:size-5",
            tone === "waiting" && "bg-surface-sunken text-waiting",
            tone === "declined" && "bg-surface-sunken text-declined",
            tone === "ink" && "bg-surface-sunken text-ink",
          )}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="font-display text-heading text-ink">{title}</p>
          {body && <p className="mt-1 text-body-sm text-ink">{body}</p>}
        </div>
      </div>
      {children}
      {support && (
        <Button className="w-full" render={<a href="mailto:support@pot.example?subject=Deposit" />}>
          {t("xc.support")}
        </Button>
      )}
    </section>
  )
}

function Details({ d }: { d: DepositView }) {
  const [copied, setCopied] = useState(false)
  const ref = d.correlationId ?? d.id
  const receipt = safeHref(d.explorerUrl)
  const rows: [string, ReactNode][] = [
    [t("xc.details.network"), NETWORK[d.chain]],
    [t("xc.details.amount"), `${tokenAmount(BigInt(d.amountIn))} USDC`],
    [t("xc.details.address"), <span key="a" className="font-mono text-body-sm break-all">{d.depositAddress}</span>],
    [t("xc.details.expires"), formatTime(Date.parse(d.deadline))],
    [t("xc.details.reference"), <span key="r" className="font-mono text-body-sm break-all">{ref}</span>],
  ]
  return (
    <div className="flex flex-col gap-3">
      <dl className="flex flex-col divide-y divide-line rounded-md bg-surface-sunken">
        {rows.map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5 px-3 py-2.5">
            <dt className="text-body-sm text-ink-muted">{k}</dt>
            <dd className="text-body text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(ref)
            } catch {}
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          }}
        >
          {copied ? <Check aria-hidden strokeWidth={2.25} /> : <Copy aria-hidden strokeWidth={2} />}
          {copied ? t("xc.details.copied") : t("xc.details.copy")}
        </Button>
        {receipt && (
          <Button size="sm" variant="ghost" render={<a href={receipt} target="_blank" rel="noopener noreferrer" />}>
            {t("xc.details.receipt")}
          </Button>
        )}
      </div>
    </div>
  )
}
