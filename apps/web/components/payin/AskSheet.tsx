"use client"
// The row's Ask (?sheet=ask; "pay in", notes/frontend.md 2026-11-03): two ways to ask for money, named by who pays.
//   - Ask the group: everyone in the Pot adds a little more (the top-up ask, ?sheet=topup). Off, with its reason, in a
//     Pot of one ("Once someone else joins"), while an ask is open, or while the Pot is closing.
//   - Ask anyone by link: a pay-in link for people outside the Pot (?sheet=payin). They pay in; they don't join.
// Picking one swaps the sheet in the same history entry (✕ / Back leave both). No marigold here: it's a menu.
import { HandCoins, Link2 } from "lucide-react"
import { MoreItem, topupState } from "@/components/pot/PotActions"
import { Sheet } from "@/components/sheets/Sheet"
import { t } from "@/i18n/t"
import type { PotVM } from "@/lib/client/mock/types"
import { swapSheet } from "@/lib/client/sheet"

export function AskSheet({ pot, open, onClose }: { pot: PotVM; open: boolean; onClose: () => void }) {
  const group = topupState(pot)
  const closing = pot.status !== "open" || !!pot.closingInFlight
  return (
    <Sheet open={open} onClose={onClose} title={t("ask.title")} description={pot.name}>
      <ul className="-mx-3 flex flex-col pb-2" data-ask-list>
        <MoreItem Icon={HandCoins} title={t("topup.menu")} sub={group.sub} disabled={group.disabled} onClick={() => swapSheet("topup")} data="ask-group" />
        <MoreItem
          Icon={Link2}
          title={t("ask.anyone")}
          sub={closing ? t("pot.closing") : t("ask.anyone.sub", { potName: pot.name })}
          disabled={closing}
          onClick={() => swapSheet("payin")}
          data="ask-anyone"
        />
      </ul>
    </Sheet>
  )
}
