// Maya's Pot invite as it unfurls in a group chat (the video's LinkBubble + OgCard; the real preview image is
// app/j/[slug]/opengraph-image.tsx): a chat bubble with Maya's name, the link card (a marigold top in the OG
// image's look: the 🇵🇹 cover tile, "Lisbon Trip" in Gabarito 800 eggplant, the eggplant glyph + lowercase
// wordmark, two member-colour seats and "2 friends are in"; initials would be unreadable at this size), the
// card's title and trust sentence, then Maya's message.
// It is an illustration, not a button or a link. At the story's moment Maya and Sam are in ($300 of $450).
//
// Logo: on marigold the mark's tile would vanish, so this uses the brand's marigold-ground form (as og-image.png
// does): <LockupOnBrand> (components/brand), the eggplant glyph beside the eggplant wordmark, never recoloured.
// The mark always appears with the name, and no floating card may cover one without the other (Hero).
//
// Width: `w-full max-w-[17rem]` (272 px, a messenger's widest bubble) by default; pass a width class. The
// marigold top scales with that width (cqw). Inside a <PhoneFrame>, whose screen is CSS-zoomed, WebKit applies the
// zoom to cqw a second time (the tile, title and logo shrink to ~63 %), so a caller there sets `--og-u` to one
// cqw of the card in rem/px (ChatThread does); every size below is calc(n × var(--og-u, 1cqw)).
// Semantics: aria-hidden by default (it usually sits inside a <PhoneFrame> or a <FloatCard> that carries the
// label); pass `label` to make it one image with that sentence (home.chat.invite.label).
import { LockupOnBrand } from "@/components/brand/LockupOnBrand"
import { avatarTint } from "@/components/pot/Avatar"
import { CoverTile } from "@/components/pot/CoverTile"
import { t } from "@/i18n/t"
import { cn } from "@/lib/client/cn"
import { PEOPLE } from "@/lib/client/mock/fixtures"

const IN_SO_FAR = [
  { id: "maya", name: PEOPLE.maya.name, initials: PEOPLE.maya.name.slice(0, 1), joinIndex: 0 },
  { id: "sam", name: PEOPLE.sam.name, initials: PEOPLE.sam.name.slice(0, 1), joinIndex: 1 },
]

export function InviteBubble({
  showSender = true,
  time = true,
  label,
  className,
}: {
  /** Maya's name at the top of the bubble (as the first bubble of her run) */
  showSender?: boolean
  /** the "21:05" time after her message */
  time?: boolean
  /** makes the bubble one image with this sentence; otherwise it is aria-hidden */
  label?: string
  className?: string
}) {
  const potName = t("home.chat.title")
  return (
    <div
      data-invite-bubble
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("w-full max-w-[17rem] rounded-[1.125rem] rounded-bl-md bg-surface p-1 font-sans text-ink", className)}
    >
      <div aria-hidden={label ? true : undefined}>
        {showSender ? (
          <p className="mx-2 mt-[3px] mb-1 text-[0.8125rem] leading-[1.0625rem] font-bold text-ink-muted">{PEOPLE.maya.name}</p>
        ) : null}

        <div className="overflow-hidden rounded-[0.875rem] bg-surface-sunken">
          {/* the link preview image: marigold, laid out like the per-invite OG image (1200 × 630), in cqw */}
          <div className="@container relative flex aspect-[1200/630] flex-col items-center bg-brand text-on-brand">
            <CoverTile
              emoji="🇵🇹"
              cover={0}
              size="md"
              className="mt-[calc(4.3*var(--og-u,1cqw))] size-[calc(23.3*var(--og-u,1cqw))] rounded-[calc(5.2*var(--og-u,1cqw))] text-[length:calc(12.5*var(--og-u,1cqw))]"
            />
            <p className="mt-[calc(1.8*var(--og-u,1cqw))] max-w-[75%] truncate font-display text-[length:calc(5.6*var(--og-u,1cqw))] leading-[1.08] font-extrabold">{potName}</p>
            <div className="absolute inset-x-[calc(4*var(--og-u,1cqw))] bottom-[calc(3.4*var(--og-u,1cqw))] flex items-center justify-between gap-[calc(2*var(--og-u,1cqw))]">
              <LockupOnBrand className="text-[length:var(--og-u,1cqw)]" />
              <span className="flex items-center gap-[calc(1.6*var(--og-u,1cqw))]">
                <span className="flex">
                  {IN_SO_FAR.map((p, i) => (
                    <span
                      key={p.id}
                      className={cn("size-[calc(5.6*var(--og-u,1cqw))] rounded-pill ring-[length:calc(0.4*var(--og-u,1cqw))] ring-brand", avatarTint(p.joinIndex), i > 0 && "-ml-[calc(1.2*var(--og-u,1cqw))]")}
                    />
                  ))}
                </span>
                <span className="text-[length:calc(3.2*var(--og-u,1cqw))] leading-none font-semibold whitespace-nowrap">
                  {t("og.members", { n: IN_SO_FAR.length })}
                </span>
              </span>
            </div>
          </div>
          <div className="px-2.5 pt-2 pb-2.5">
            <p className="text-[0.9375rem] leading-5 font-bold">{t("landing.title", { inviter: PEOPLE.maya.name, potName })}</p>
            <p className="mt-0.5 text-[0.8125rem] leading-[1.125rem] text-ink-muted">{t("landing.trust")}</p>
          </div>
        </div>

        <p className="px-2 pt-1.5 pb-1 text-body leading-[1.3125rem]">
          {t("home.chat.msg.invite")}
          {time ? (
            <span className="relative top-[0.4375rem] float-right ml-2 text-[0.6875rem] leading-[0.875rem] text-ink-muted tabular-nums">
              {t("home.chat.at.invite")}
            </span>
          ) : null}
        </p>
      </div>
    </div>
  )
}
