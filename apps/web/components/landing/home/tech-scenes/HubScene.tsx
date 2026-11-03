// "A rulebot on a short leash": two spends ride lane 1 to the rule gate, the rulebot's ("Up to $100", with the bot
// that the DAO scene seats). The $84 for groceries passes it and is Approved; the $300 for a boat stops at it (a
// small recoil), drops to the lane below and Needs one OK "from anyone": one member, not the majority of the cell
// beside it (a Pot made today: one OK up to $300). Status = icon + word + colour (StatusChip). Everything is placed
// from the gate (`--gate`, set in bento.css from the stage's own width, so the right lane always fits beside it); the
// pills travel in `cqw`. End frame: the gate, $84 · Approved past it, $300 · Needs one OK below it. Loop: `hub`, 5 s.
import { Bot } from "lucide-react"
import { MoneyText } from "@/components/money/MoneyText"
import { StatusChip } from "@/components/pot/StatusChip"
import { t } from "@/i18n/t"
import { cn } from "@/lib/client/cn"
import { dollars, type Micro } from "@/lib/client/money"
import { Scene } from "./Scene"

const GROCERIES = "🛒"
const BOAT = "⛵"

export function HubScene() {
  return (
    <Scene id="hub" label={t("home.tech.hub.scene")}>
      <div className="sc-hub absolute inset-3 @container/hub">
        {/* the two lanes (decorative `line`): the rules' lane, through the gate, and the group's lane under it */}
        <span className="absolute -inset-x-3 top-11 h-px bg-line" />
        <span className="absolute -inset-x-3 top-20.5 h-px bg-line" />
        {/* the rule gate: the rulebot and its limit over lane 1, its bar across it */}
        <span className="sc-hub-at absolute top-0 inline-flex h-6 -translate-x-1/2 items-center gap-1 rounded-pill border border-line-strong pr-2.5 pl-2 text-body-sm whitespace-nowrap text-ink">
          <Bot aria-hidden className="size-3.5 shrink-0" strokeWidth={2} />
          {t("home.tech.hub.s.gate")}
        </span>
        <span className="sc-hub-at absolute top-6.5 h-9 w-0.5 -translate-x-1/2 rounded-pill bg-line-strong" />

        {/* lane 1, past the gate: the $84, then its chip */}
        <span className="sc-hub-pass absolute top-8 flex items-center gap-1.5">
          <Pill className="sc sc-hub-84" emoji={GROCERIES} micro={dollars(84)} />
          <span className="sc sc-hub-ok flex">
            <StatusChip status="approved" size="sm" />
          </span>
        </span>

        {/* lane 2, under the gate: the $300 (it rides lane 1 to the gate first), then its chip and where it went */}
        <Pill className="sc sc-hub-300 sc-hub-boat absolute top-17.5" emoji={BOAT} micro={dollars(300)} />
        <span className="sc-hub-stop absolute top-17.5 flex items-center gap-1.5">
          <span className="sc sc-hub-wait flex">
            <StatusChip status="needs" size="sm">
              {t("feed.pending.one_ok")}
            </StatusChip>
          </span>
          {/* the stage's own colour behind it, from the chip's edge, so lane 2 never reads as a line struck through
              the words (crossed-off words mean "not this" in the relayer's scene) */}
          <span className="sc sc-hub-anyone -ml-1.5 bg-ground px-1.5 text-body-sm whitespace-nowrap text-ink-muted @max-sm/hub:hidden">
            {t("home.tech.hub.s.anyone")}
          </span>
        </span>
      </div>
    </Scene>
  )
}

/** A spend on its way: what it's for (dropped on the narrowest stage) and how much, in whole dollars like the
 *  playground's amount chips. */
function Pill({ emoji, micro, className }: { emoji: string; micro: Micro; className?: string }) {
  return (
    <span
      className={cn(
        "z-10 inline-flex h-6 items-center gap-1 rounded-pill border border-line-strong bg-surface px-2 text-body-sm font-semibold whitespace-nowrap text-ink",
        className,
      )}
    >
      <span className="@max-3xs/hub:hidden">{emoji}</span>
      <MoneyText micro={micro} style="whole" variant="inline" />
    </span>
  )
}
