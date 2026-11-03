// "Majority rules. Literally.": "Close the Pot" with three seats. Maya's check pops (she asked, so hers counts), then
// Sam's; the 2-of-3 meter fills a segment for each and the "Approved" chip lands. Leo's seat stays dashed (not yet).
// The seat is the demo VoteMeter's look (a landing copy, like HowItWorks' CloseTable). End frame: Close the Pot ·
// Approved · M✓ S✓ L · 2 of 3, two of three segments filled. Loop: `majority`, 4 s.
import { Check } from "lucide-react"
import { Avatar } from "@/components/pot/Avatar"
import { StatusChip } from "@/components/pot/StatusChip"
import { t } from "@/i18n/t"
import { cn } from "@/lib/client/cn"
import { CHAT_CAST } from "../ChatThread"
import { Scene } from "./Scene"

const { maya: MAYA, sam: SAM, leo: LEO } = CHAT_CAST

export function MajorityScene() {
  return (
    <Scene id="majority" label={t("home.tech.majority.scene")}>
      <div className="flex h-full flex-col justify-center gap-3 px-3">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex h-7 items-center rounded-pill border border-line-strong bg-surface px-3 text-label whitespace-nowrap text-ink">
            {t("home.tech.majority.s.ask")}
          </span>
          <span className="sc sc-maj-ok flex">
            <StatusChip status="approved" />
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2.5">
            <Seat person={MAYA} badge="sc-maj-m" />
            <Seat person={SAM} badge="sc-maj-s" />
            <Seat person={LEO} />
          </span>
          {/* the count, one layer per step */}
          <span className="grid justify-items-end text-label whitespace-nowrap text-ink tabular-nums">
            <span className="sc sc-maj-c1 col-start-1 row-start-1">{t("home.tech.majority.s.count", { k: 1, n: 3 })}</span>
            <span className="sc sc-maj-c2 col-start-1 row-start-1">{t("home.tech.majority.s.count", { k: 2, n: 3 })}</span>
          </span>
        </div>
        {/* the meter: a segment per member, filled for each approval */}
        <span className="grid grid-cols-3 gap-1">
          <Segment fill="sc-maj-f1" />
          <Segment fill="sc-maj-f2" />
          <Segment />
        </span>
      </div>
    </Scene>
  )
}

/** A member's seat: approved (a check badge) or not yet (a dashed ring). */
function Seat({ person, badge }: { person: (typeof CHAT_CAST)[keyof typeof CHAT_CAST]; badge?: string }) {
  return (
    <span className="relative inline-grid">
      <Avatar person={person} size="sm" className={cn(!badge && "outline-2 outline-offset-2 outline-line-strong outline-dashed")} />
      {badge ? (
        <span
          className={cn(
            "sc absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-pill bg-approved text-ground ring-2 ring-ground",
            badge,
          )}
        >
          <Check aria-hidden className="size-3" strokeWidth={2} />
        </span>
      ) : null}
    </span>
  )
}

function Segment({ fill }: { fill?: string }) {
  return (
    <span className="relative h-2 overflow-hidden rounded-pill bg-surface-sunken">
      {fill ? <span className={cn("sc absolute inset-0 rounded-pill bg-approved", fill)} /> : null}
    </span>
  )
}
