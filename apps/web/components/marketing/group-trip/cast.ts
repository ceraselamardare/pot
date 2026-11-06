// The Ski Weekend cast for the /group-trip mocks and tables: lib/marketing/group-trip.ts's people in join order
// (avatar colours member-1…6), with their names from en.json.
import { t } from "@/i18n/t"
import { SKI_CAST, type SkiPerson } from "@/lib/marketing/group-trip"

const NAMES = {
  maya: t("uc.trip.cast.maya"),
  sam: t("uc.trip.cast.sam"),
  leo: t("uc.trip.cast.leo"),
  priya: t("uc.trip.cast.priya"),
  tom: t("uc.trip.cast.tom"),
  ines: t("uc.trip.cast.ines"),
} as const satisfies Record<SkiPerson, string>

export interface SkiMember {
  id: SkiPerson
  name: string
  initials: string
  joinIndex: number
}

export const SKI_PEOPLE: Record<SkiPerson, SkiMember> = Object.fromEntries(
  SKI_CAST.map((id, i) => [id, { id, name: NAMES[id], initials: NAMES[id].slice(0, 1), joinIndex: i }]),
) as Record<SkiPerson, SkiMember>

export const nameOf = (id: SkiPerson) => NAMES[id]
