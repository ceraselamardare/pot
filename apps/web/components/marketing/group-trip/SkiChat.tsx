// Beside /group-trip's steps: the moment it starts, in the group chat. Maya found the cabin and asks everyone to put
// their $300 in before she books, shares the Pot (its invite card, in the invite page's own words), and Priya's in.
// One image (role="img" + uc.trip.chat.label); the bubbles are aria-hidden + inert. A sunken stage like the landing's
// problem chat (`ground` in Night, so the `surface` bubbles read as raised). No marigold: the invite card is `surface`.
import { MoneyText } from "@/components/money/MoneyText"
import { Avatar, AvatarStack } from "@/components/pot/Avatar"
import { CoverTile } from "@/components/pot/CoverTile"
import { t } from "@/i18n/t"
import { formatUsd } from "@/lib/client/money"
import { SKI_CAST, SKI_EACH, SKI_WEEKEND } from "@/lib/marketing/group-trip"
import { SKI_PEOPLE, type SkiMember } from "./cast"
import { SKI_EMOJI } from "./SkiWeekendVisual"

const whole = (m: bigint) => formatUsd(m, "whole")
const CABIN = SKI_WEEKEND.spends.find((s) => s.id === "cabin")!
/** who has put in by the time Priya answers: the first four */
const IN_SO_FAR = SKI_CAST.slice(0, 4).map((id) => SKI_PEOPLE[id])

export function SkiChat() {
  const each = whole(SKI_EACH)
  const potName = t("uc.trip.pot")
  return (
    <div role="img" aria-label={t("uc.trip.chat.label", { each })} className="rounded-lg bg-surface-sunken p-3 md:p-4 dark:bg-ground dark:ring-1 dark:ring-line">
      <div aria-hidden inert className="flex flex-col gap-2">
        <Bubble from={SKI_PEOPLE.maya} at={t("uc.trip.chat.at.cabin")}>
          {t("uc.trip.chat.msg.cabin", { cabin: whole(CABIN.amount), each })}
        </Bubble>
        <div className="flex items-end gap-2">
          <span className="size-8 shrink-0" />
          <div className="w-full max-w-[17rem] min-w-0 rounded-[1.125rem] rounded-bl-md bg-surface p-1">
            <div className="flex items-center gap-3 rounded-[0.875rem] bg-surface-sunken p-2.5 dark:bg-ground">
              <CoverTile emoji={SKI_EMOJI} cover={1} size="md" />
              <div className="min-w-0">
                <p className="text-body-sm leading-5 font-bold text-ink">{t("landing.title", { inviter: SKI_PEOPLE.maya.name, potName })}</p>
                <p className="mt-0.5 text-[0.8125rem] leading-[1.125rem] text-ink-muted">{t("goal_each.value", { each })}</p>
              </div>
            </div>
            <p className="px-2 pt-1.5 pb-1 text-body text-ink">{t("uc.trip.chat.msg.share")}</p>
          </div>
        </div>
        <Bubble from={SKI_PEOPLE.priya} at={t("uc.trip.chat.at.priya")} className="mt-2">
          {t("uc.trip.chat.msg.priya")}
        </Bubble>
        <div className="mt-2 flex items-center justify-between gap-3 rounded-md bg-surface px-3 py-2.5">
          <span className="flex min-w-0 items-center gap-2">
            <AvatarStack people={IN_SO_FAR} max={4} size="xs" ring="surface" />
            <span className="text-body-sm text-ink tabular-nums">
              {t("pot.each.done", { done: IN_SO_FAR.length, n: SKI_CAST.length, each })}
            </span>
          </span>
          <MoneyText micro={SKI_EACH * BigInt(IN_SO_FAR.length)} variant="row" className="text-ink" />
        </div>
      </div>
    </div>
  )
}

function Bubble({ from, at, className, children }: { from: SkiMember; at: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`flex items-end gap-2 ${className ?? ""}`}>
      <Avatar person={from} size="sm" />
      <div className="max-w-[17rem] min-w-0 rounded-[1.125rem] rounded-bl-md bg-surface px-3 pt-1.5 pb-2">
        <p className="text-body-sm font-semibold text-ink">{from.name}</p>
        <p className="text-body text-ink">
          {children}
          <span className="relative top-[0.4375rem] float-right ml-2 text-[0.6875rem] leading-[0.875rem] text-ink-muted tabular-nums">{at}</span>
        </p>
      </div>
    </div>
  )
}
