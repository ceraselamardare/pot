// The Lisbon Trip group-chat mock (the video's ChatScreen, marketing/video/src/ui/screens/ChatScreen.tsx), for the
// inside of a <PhoneFrame>: a generic messenger (not any real app's look) in token colours. Header (back, the
// group's picture, "Lisbon Trip", "Maya, Sam, Leo"), bottom-anchored bubbles on `surface` over a `surface-sunken`
// wallpaper (`ground` in Night), Maya's Pot invite card, then Leo's "is typing" bubble, and a composer.
// Avatars use the member colours in join order (Maya member-1, Sam member-2, Leo member-3).
//
// Sizes are a real phone's (about 375 logical px wide; <PhoneFrame> zooms the screen to fit). It fills its parent
// (absolute, inset 0) and pads itself by the phone's --phone-safe-top/bottom. Messages are bottom-anchored: on
// a shorter screen the oldest bubbles crop off the top, as in a real chat.
// Every row carries data-chat-row="<id>" (boat · promise · airbnb · invite · typing) for the builder's motion.
// The typing dots stay still unless `animateTyping` (then they pulse 4 times and rest; never under reduced motion).
import { ArrowUp, ChevronLeft, Phone, Plus, Video } from "lucide-react"
import { Avatar } from "@/components/pot/Avatar"
import { TypingDots } from "@/components/feedback/TypingDots"
import { CoverTile } from "@/components/pot/CoverTile"
import { t } from "@/i18n/t"
import { cn } from "@/lib/client/cn"
import { PEOPLE } from "@/lib/client/mock/fixtures"
import { InviteBubble } from "./InviteBubble"

/** The D-61 cast in join order (avatar colour member-((joinIndex mod 6) + 1)). */
export const CHAT_CAST = {
  maya: { id: "maya", name: PEOPLE.maya.name, initials: PEOPLE.maya.name.slice(0, 1), joinIndex: 0 },
  sam: { id: "sam", name: PEOPLE.sam.name, initials: PEOPLE.sam.name.slice(0, 1), joinIndex: 1 },
  leo: { id: "leo", name: PEOPLE.leo.name, initials: PEOPLE.leo.name.slice(0, 1), joinIndex: 2 },
} as const

type Person = (typeof CHAT_CAST)[keyof typeof CHAT_CAST]
export type ChatRowId = "boat" | "promise" | "airbnb" | "invite" | "typing"
export const CHAT_ROWS: readonly ChatRowId[] = ["boat", "promise", "airbnb", "invite", "typing"]

const TEXT_ROWS = [
  { id: "boat", from: CHAT_CAST.sam, text: "home.chat.msg.boat", at: "home.chat.at.boat" },
  { id: "promise", from: CHAT_CAST.leo, text: "home.chat.msg.promise", at: "home.chat.at.promise" },
  { id: "airbnb", from: CHAT_CAST.sam, text: "home.chat.msg.airbnb", at: "home.chat.at.airbnb" },
] as const

/** Incoming bubble shape: round, with a small corner at the sender's tail. */
export const BUBBLE = "rounded-[1.125rem] rounded-bl-md bg-surface"

export function ChatThread({
  rows = CHAT_ROWS,
  hideInvite = false,
  animateTyping = false,
  className,
}: {
  /** which rows to show, in story order (default: all five) */
  rows?: readonly ChatRowId[]
  /** keep the invite's space but hide it, while a breakout twin of it floats over the phone */
  hideInvite?: boolean
  /** let the typing dots pulse (4 × 1.2 s, then rest); off by default, and always off under reduced motion */
  animateTyping?: boolean
  className?: string
}) {
  const show = new Set(rows)
  return (
    <div className={cn("absolute inset-0 flex flex-col bg-surface-sunken font-sans text-ink dark:bg-ground", className)}>
      <header className="relative z-10 shrink-0 border-b border-line bg-surface pt-[var(--phone-safe-top,0px)]">
        <div className="flex h-14 items-center gap-2 pr-3 pl-1">
          <ChevronLeft className="size-7 shrink-0" strokeWidth={2} />
          <CoverTile emoji="✈️" cover={0} size="md" className="size-[2.375rem] rounded-pill text-[1.1875rem]" />
          <div className="ml-0.5 min-w-0 flex-1">
            <p className="truncate text-body leading-5 font-bold">{t("home.chat.title")}</p>
            <p className="truncate text-[0.8125rem] leading-[1.0625rem] text-ink-muted">
              {[CHAT_CAST.maya, CHAT_CAST.sam, CHAT_CAST.leo].map((p) => p.name).join(", ")}
            </p>
          </div>
          <Video className="mr-3.5 size-6 shrink-0" strokeWidth={2} />
          <Phone className="mr-1 size-[1.375rem] shrink-0" strokeWidth={2} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col justify-end gap-2.5 overflow-hidden px-3 pt-2 pb-2.5">
        <p className="flex justify-center">
          <span className="rounded-pill bg-surface px-2.5 py-0.5 text-xs font-semibold text-ink-muted">{t("feed.day.today")}</span>
        </p>
        {TEXT_ROWS.filter((r) => show.has(r.id)).map((r) => (
          <Row key={r.id} id={r.id} from={r.from}>
            <div className={cn(BUBBLE, "px-[0.6875rem] pt-[0.4375rem] pb-2")}>
              <p className="mb-px text-[0.8125rem] leading-[1.0625rem] font-bold text-ink-muted">{r.from.name}</p>
              <p className="text-body leading-[1.3125rem] break-words">
                {t(r.text)}
                <Time>{t(r.at)}</Time>
              </p>
            </div>
          </Row>
        ))}
        {show.has("invite") ? (
          <Row id="invite" from={CHAT_CAST.maya} className={hideInvite ? "invisible" : undefined}>
            {/* one cqw of the 17rem bubble's card (minus its p-1), so WebKit doesn't zoom the card twice */}
            <InviteBubble className="w-[17rem] [--og-u:calc((17rem_-_0.5rem)/100)]" />
          </Row>
        ) : null}
        {show.has("typing") ? (
          <Row id="typing" from={CHAT_CAST.leo}>
            <div className={cn(BUBBLE, "px-3.5 py-[0.8125rem] text-ink-muted")}>
              <TypingDots still={!animateTyping} size="md" className="gap-[5px]" />
            </div>
          </Row>
        ) : null}
      </div>

      <footer className="relative z-10 shrink-0 border-t border-line bg-surface pb-[var(--phone-safe-bottom,0px)]">
        <div className="flex h-14 items-center gap-2.5 px-3">
          <Plus className="size-[1.625rem] shrink-0" strokeWidth={2} />
          <span className="flex h-9 min-w-0 flex-1 items-center rounded-pill border border-line bg-surface-sunken px-3.5 text-body text-ink-muted">
            {t("home.chat.composer")}
          </span>
          <span className="grid size-[2.125rem] shrink-0 place-items-center rounded-pill bg-ink text-surface">
            <ArrowUp className="size-5" strokeWidth={2} />
          </span>
        </div>
      </footer>
    </div>
  )
}

/** One incoming message: the sender's avatar at the bubble's foot, then the bubble (at most 272 px). */
function Row({ id, from, className, children }: { id: ChatRowId; from: Person; className?: string; children: React.ReactNode }) {
  return (
    <div data-chat-row={id} className={cn("flex items-end gap-1.5", className)}>
      <Avatar person={from} size="sm" className="size-7 text-[0.6875rem]" />
      <div className="flex max-w-[17rem] min-w-0 flex-col items-start">{children}</div>
    </div>
  )
}

/** The bubble's time, floated to the end of the last line (the messenger convention). */
function Time({ children }: { children: React.ReactNode }) {
  return (
    <span className="relative top-[0.4375rem] float-right ml-2 text-[0.6875rem] leading-[0.875rem] text-ink-muted tabular-nums">
      {children}
    </span>
  )
}
