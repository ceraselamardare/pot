// "One Pot, one DAO, no keys": the Pot (its cover and name) is a sealed box. A key comes at its side, bumps it and is
// refused (a ✕ and "0 keys"; ink-muted, not `declined`: a permission, not a failed request), then the only seats
// light up around it, two over its top edge and two under it: Maya, Sam, Leo and the rulebot. No padlock (03 §5,
// 07 §3.6): nobody locked it, nobody holds a key. End frame: the refused key · 0 keys, Lisbon Trip with its four seats
// lit. Loop: `dao`, 4 s.
import { Bot, KeyRound, X } from "lucide-react"
import type { ReactNode } from "react"
import { Avatar } from "@/components/pot/Avatar"
import { CoverTile } from "@/components/pot/CoverTile"
import { t } from "@/i18n/t"
import { cn } from "@/lib/client/cn"
import { CHAT_CAST } from "../ChatThread"
import { Scene } from "./Scene"

const { maya: MAYA, sam: SAM, leo: LEO } = CHAT_CAST
const POT = t("create.name.placeholder") // "Lisbon Trip"

export function DaoScene() {
  return (
    <Scene id="dao" label={t("home.tech.dao.scene", { pot: POT })}>
      <div className="h-full @container/dao">
        <div className="flex h-full items-center justify-center gap-1.5 px-3">
          {/* the key, refused at the box's side */}
          <span className="flex w-12 shrink-0 flex-col items-end gap-0.5">
            <span className="sc sc-dao-key relative -mr-1 grid size-8 place-items-center">
              <KeyRound aria-hidden className="sc sc-dao-keyicon size-5 text-ink" strokeWidth={2} />
              <span className="sc sc-dao-x absolute -right-0.5 -bottom-0.5 grid size-4 place-items-center rounded-pill bg-surface-sunken text-ink ring-2 ring-ground">
                <X aria-hidden className="size-3" strokeWidth={2} />
              </span>
            </span>
            <span className="sc sc-dao-zero text-body-sm whitespace-nowrap text-ink-muted">{t("home.tech.dao.s.keys")}</span>
          </span>
          {/* the Pot, sealed, its only seats over its top and bottom edges */}
          <span className="relative">
            <span className="flex h-17 items-center gap-2 rounded-md border border-line-strong bg-surface px-5 text-label whitespace-nowrap text-ink @max-2xs/dao:px-3">
              <CoverTile emoji="🇵🇹" cover={0} size="sm" />
              {POT}
            </span>
            <SeatAt at="top-0 left-1/4" lit="sc-dao-s1">
              <Avatar person={MAYA} size="sm" ring="ground" />
            </SeatAt>
            <SeatAt at="top-0 left-3/4" lit="sc-dao-s2">
              <Avatar person={SAM} size="sm" ring="ground" />
            </SeatAt>
            <SeatAt at="top-full left-1/4" lit="sc-dao-s3">
              <Avatar person={LEO} size="sm" ring="ground" />
            </SeatAt>
            <SeatAt at="top-full left-3/4" lit="sc-dao-s4">
              <span className="grid size-8 place-items-center rounded-pill bg-surface-sunken text-ink ring-2 ring-ground">
                <Bot aria-hidden className="size-5" strokeWidth={2} />
              </span>
            </SeatAt>
          </span>
        </div>
      </div>
    </Scene>
  )
}

/** A seat centred on a point of the box's edge. */
function SeatAt({ at, lit, children }: { at: string; lit: string; children: ReactNode }) {
  return (
    <span className={cn("absolute -translate-1/2", at)}>
      <span className={cn("sc grid", lit)}>{children}</span>
    </span>
  )
}
