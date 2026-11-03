// "Dollars in, fair shares out" (D-61's numbers): Maya's, Sam's and Leo's $150 bars rise and join into one $450 bar
// (their colours stay its thirds); spends shrink it, thirds and all, to $66; it splits and each third drops back into
// its owner's slot (the footprint their $150 left) as $22. The pro-rata rule as a picture: every share shrinks by the
// same factor (66 / 450 = 14.67 %). People are their colours (member tints, eggplant figures). Geometry in bento.css:
// the bar's thirds start on the members' slots, and each $22 travels from its third of the shrunken bar (`cqw`).
// End frame: $66.00 over three slots, each holding its $22; Maya · Sam · Leo $22.00. Loop: `money`, 5 s.
import { MoneyText } from "@/components/money/MoneyText"
import { Avatar, avatarTint } from "@/components/pot/Avatar"
import { t } from "@/i18n/t"
import { cn } from "@/lib/client/cn"
import { dollars, type Micro } from "@/lib/client/money"
import { CHAT_CAST } from "../ChatThread"
import { Scene } from "./Scene"

const CAST = [CHAT_CAST.maya, CHAT_CAST.sam, CHAT_CAST.leo] as const
/** per member, in CAST's order: their third of the Pot's bar, and their $22 (the travel) */
const THIRD = ["sc-money-t1", "sc-money-t2", "sc-money-t3"] as const
const BACK = ["sc-money-b1", "sc-money-b2", "sc-money-b3"] as const

export function MoneyScene() {
  return (
    <Scene id="money" label={t("home.tech.money.scene")}>
      <div className="absolute inset-3 @container/money">
        {/* the Pot's figure */}
        <span className="absolute inset-x-0 top-0 grid justify-items-center text-label text-ink">
          <span className="sc sc-money-450 col-start-1 row-start-1">
            <MoneyText micro={dollars(450)} variant="inline" />
          </span>
          <span className="sc sc-money-66 col-start-1 row-start-1">
            <MoneyText micro={dollars(66)} variant="inline" />
          </span>
        </span>
        {/* the Pot's bar: the three $150s, joined (each starts as its owner's bar, in the row below) */}
        <span className="sc sc-money-bar absolute inset-x-0 top-6 grid h-4 grid-cols-3 gap-0.5">
          {CAST.map((p, i) => (
            <span key={p.id} className={cn("sc rounded-sm", avatarTint(p.joinIndex), THIRD[i])} />
          ))}
        </span>
        {/* the members: their slot with what comes back in it, then who and how much */}
        <span className="absolute inset-x-0 top-12.5 grid grid-cols-3 gap-2">
          {CAST.map((p, i) => (
            <span key={p.id} className="flex min-w-0 flex-col gap-1">
              <span className="relative h-4">
                <span className="sc sc-money-slot absolute inset-0 rounded-sm bg-surface-sunken" />
                <span className={cn("sc relative block h-full w-[14.67%] rounded-sm", avatarTint(p.joinIndex), BACK[i])} />
              </span>
              <span className="flex items-center gap-1">
                <Avatar person={p} size="xs" />
                <span className="grid text-body-sm font-semibold text-ink">
                  <Amount className="sc sc-money-in" micro={dollars(150)} />
                  <Amount className="sc sc-money-back" micro={dollars(22)} />
                </span>
              </span>
            </span>
          ))}
        </span>
      </div>
    </Scene>
  )
}

/** Two decimals where a column has room; whole dollars on the narrowest stages (a third of 230 px). */
function Amount({ micro, className }: { micro: Micro; className: string }) {
  return (
    <span className={cn("col-start-1 row-start-1", className)}>
      <MoneyText micro={micro} variant="inline" className="@max-2xs/money:hidden" />
      <MoneyText micro={micro} style="whole" variant="inline" className="hidden @max-2xs/money:inline" />
    </span>
  )
}
