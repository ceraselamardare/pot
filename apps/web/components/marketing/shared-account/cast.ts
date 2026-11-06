// The Crew for the /shared-account-with-friends mocks and tables: lib/marketing/shared-account.ts's people in join
// order (avatar colours member-1…5), with their names from en.json.
import { t } from "@/i18n/t"
import { CREW_CAST, type CrewPerson } from "@/lib/marketing/shared-account"

const NAMES = {
  jo: t("uc.shared.cast.jo"),
  ama: t("uc.shared.cast.ama"),
  dev: t("uc.shared.cast.dev"),
  kit: t("uc.shared.cast.kit"),
  lou: t("uc.shared.cast.lou"),
} as const satisfies Record<CrewPerson, string>

export interface CrewMember {
  id: CrewPerson
  name: string
  initials: string
  joinIndex: number
}

export const CREW_PEOPLE: Record<CrewPerson, CrewMember> = Object.fromEntries(
  CREW_CAST.map((id, i) => [id, { id, name: NAMES[id], initials: NAMES[id].slice(0, 1), joinIndex: i }]),
) as Record<CrewPerson, CrewMember>

export const crewName = (id: CrewPerson) => NAMES[id]
