// "Gas and deposits are on us": what a tap costs you ticks down to a big $0.00 ("you pay") as "gas" and "deposits"
// are crossed off your side and a "Pot pays" tag (the relayer's send icon) slides in beside them. Crossed-off words,
// never a struck amount (in Pot a struck amount means declined or expired). The figure is a column of amounts, one
// line shown, rolling up a line per tick ($0.03 → $0.00: about a tap's gas and deposits at today's price; the
// scene never says it). End frame: $0.00 · you pay · gas, deposits crossed off · Pot pays. Loop: `relayer`, 4 s.
import { Send } from "lucide-react"
import type { ReactNode } from "react"
import { MoneyText } from "@/components/money/MoneyText"
import { t } from "@/i18n/t"
import { cn } from "@/lib/client/cn"
import { Scene } from "./Scene"

/** a cent, in micro-dollars */
const CENT = 10_000n
const TICKS = [3n, 2n, 1n, 0n]

export function RelayerScene() {
  return (
    <Scene id="relayer" label={t("home.tech.relayer.scene")}>
      <div className="flex h-full flex-col items-center justify-center gap-2 px-3">
        <div className="flex flex-col items-center">
          <span className="block h-12 overflow-hidden">
            <span className="sc sc-relay-roll flex flex-col">
              {TICKS.map((c) => (
                <MoneyText key={String(c)} micro={c * CENT} variant="inline" className="block h-12 font-display text-balance-hero leading-12" />
              ))}
            </span>
          </span>
          <span className="text-body-sm text-ink-muted">{t("home.tech.relayer.s.you")}</span>
        </div>
        <div className="flex items-center gap-3">
          <Crossed line="sc-relay-x1">{t("home.tech.relayer.s.gas")}</Crossed>
          <Crossed line="sc-relay-x2">{t("home.tech.relayer.s.deposits")}</Crossed>
          <span className="sc sc-relay-pot inline-flex h-7 items-center gap-1.5 rounded-pill border border-line bg-surface pr-3 pl-2 text-label whitespace-nowrap text-ink">
            <Send aria-hidden className="size-4 shrink-0" strokeWidth={2} />
            {t("home.tech.relayer.s.pot")}
          </span>
        </div>
      </div>
    </Scene>
  )
}

/** A word crossed off with a line that draws across it. */
function Crossed({ line, children }: { line: string; children: ReactNode }) {
  return (
    <span className="relative text-body-sm whitespace-nowrap text-ink-muted">
      {children}
      <span className={cn("sc absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-pill bg-ink-muted", line)} />
    </span>
  )
}
