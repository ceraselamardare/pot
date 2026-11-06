// The Project Thirty cast for the /group-gift mocks and tables: lib/marketing/group-gift.ts's six friends in join
// order (avatar colours member-1…6) and the two relatives who pay in by link without joining (no join order, so
// Avatar shows a not-joined seat), with their names from en.json.
import { t } from "@/i18n/t"
import { GIFT_CAST, type GiftPerson } from "@/lib/marketing/group-gift"

const NAMES = {
  ana: t("uc.gift.cast.ana"),
  ben: t("uc.gift.cast.ben"),
  kofi: t("uc.gift.cast.kofi"),
  mia: t("uc.gift.cast.mia"),
  raj: t("uc.gift.cast.raj"),
  zara: t("uc.gift.cast.zara"),
} as const satisfies Record<GiftPerson, string>

export interface GiftMember {
  id: string
  name: string
  initials: string
  joinIndex: number | null
}

export const GIFT_PEOPLE: Record<GiftPerson, GiftMember> = Object.fromEntries(
  GIFT_CAST.map((id, i) => [id, { id, name: NAMES[id], initials: NAMES[id].slice(0, 1), joinIndex: i }]),
) as Record<GiftPerson, GiftMember>

const outsider = (id: string, name: string, who: string) => ({ id, name, initials: name.slice(0, 1), joinIndex: null, who })

/** Nora's relatives, who pay in by link (lib/marketing/group-gift.ts GIFT_OUTSIDE, same ids) */
export const OUTSIDERS = {
  ruth: outsider("ruth", t("uc.gift.outside.ruth"), t("uc.gift.outside.ruth.who")),
  theo: outsider("theo", t("uc.gift.outside.theo"), t("uc.gift.outside.theo.who")),
} as const

export const nameOf = (id: GiftPerson) => NAMES[id]

export const GIFT_EMOJI = "🎁"
