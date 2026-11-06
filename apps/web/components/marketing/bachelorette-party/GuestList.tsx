// Beside /bachelorette-party's steps: who's in the Pot and who isn't. The eight friends (avatars and names, in join
// order) are in; Jess, the bride, sits apart on a not-joined seat with the reason. One image (role="img" +
// uc.party.guests.label); everything inside is aria-hidden + inert. A sunken stage like the trip page's chat
// (`ground` in Night, so the `surface` card reads as raised). No marigold, no stickers.
import { Avatar } from "@/components/pot/Avatar"
import { CoverTile } from "@/components/pot/CoverTile"
import { t } from "@/i18n/t"
import { PARTY_CAST } from "@/lib/marketing/bachelorette-party"
import { GUEST, PARTY_EMOJI, PARTY_PEOPLE } from "./cast"

const PEOPLE = PARTY_CAST.map((id) => PARTY_PEOPLE[id])

export function GuestList() {
  return (
    <div
      role="img"
      aria-label={t("uc.party.guests.label", { n: PEOPLE.length, guest: GUEST.name })}
      className="rounded-lg bg-surface-sunken p-3 md:p-4 dark:bg-ground dark:ring-1 dark:ring-line"
    >
      <div aria-hidden inert className="flex flex-col gap-3">
        <div className="rounded-lg bg-surface p-4 shadow-card">
          <div className="flex items-center gap-3">
            <CoverTile emoji={PARTY_EMOJI} cover={4} size="md" />
            <div className="min-w-0">
              <p className="truncate text-body font-bold text-ink">{t("uc.party.pot")}</p>
              <p className="text-body-sm text-ink-muted">{t("uc.party.guests.in")}</p>
            </div>
          </div>
          <ul className="mt-4 grid grid-cols-4 gap-x-2 gap-y-3">
            {PEOPLE.map((p) => (
              <li key={p.id} className="flex min-w-0 flex-col items-center gap-1">
                <Avatar person={p} size="md" />
                <span className="w-full truncate text-center text-body-sm text-ink">{p.name}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex items-start gap-3 rounded-lg border border-dashed border-line-strong px-4 py-3">
          <Avatar person={GUEST} size="md" className="ring-1 ring-line-strong" />
          <div className="min-w-0">
            <p className="text-label text-ink-muted">{t("uc.party.guests.out")}</p>
            <p className="text-body font-semibold text-ink">
              {GUEST.name}
              <span className="font-normal text-ink-muted">
                {" · "}
                {t("uc.party.guests.out.who")}
              </span>
            </p>
            <p className="mt-1 text-body-sm text-ink-muted">{t("uc.party.guests.out.note")}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
