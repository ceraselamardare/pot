// The Lake House Weekend cast for the /bachelorette-party mocks and tables: lib/marketing/bachelorette-party.ts's
// eight friends in join order (avatar colours member-1…6, then again), with their names from en.json. The guest of
// honour isn't in the Pot, so she has no join order (Avatar shows a not-joined seat).
import { t } from "@/i18n/t"
import { PARTY_CAST, type PartyPerson } from "@/lib/marketing/bachelorette-party"

const NAMES = {
  chloe: t("uc.party.cast.chloe"),
  amara: t("uc.party.cast.amara"),
  bea: t("uc.party.cast.bea"),
  dani: t("uc.party.cast.dani"),
  ellie: t("uc.party.cast.ellie"),
  hana: t("uc.party.cast.hana"),
  rosa: t("uc.party.cast.rosa"),
  zoe: t("uc.party.cast.zoe"),
} as const satisfies Record<PartyPerson, string>

export interface PartyMember {
  id: string
  name: string
  initials: string
  joinIndex: number | null
}

export const PARTY_PEOPLE: Record<PartyPerson, PartyMember> = Object.fromEntries(
  PARTY_CAST.map((id, i) => [id, { id, name: NAMES[id], initials: NAMES[id].slice(0, 1), joinIndex: i }]),
) as Record<PartyPerson, PartyMember>

/** the guest of honour: not in the Pot */
export const GUEST: PartyMember = { id: "guest", name: t("uc.party.guest"), initials: t("uc.party.guest").slice(0, 1), joinIndex: null }

export const nameOf = (id: PartyPerson) => NAMES[id]

export const PARTY_EMOJI = "🪩"
