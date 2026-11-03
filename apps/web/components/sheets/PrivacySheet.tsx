"use client"
// "Who can see what" (?sheet=privacy; privacy audit 2026-11-02, notes/backend.md). A quiet explainer, never inline:
// opened from a Pot's ••• menu and You (both through the shell's PwaHost), and from the public record's footer link
// ("What's public?", RecordScreen keeps its own open state: the record page is outside the shell). Two short lists,
// each item an icon + words: what anyone can read on the public ledger, and what Pot keeps for the Pot's members
// only; then one line on invite and payment links, and one on the optional survey (the Pot team only). Calm: no marigold ([Got it] is secondary).
import {
  CheckCheck,
  ClipboardList,
  Coins,
  Gift,
  Globe,
  HandCoins,
  History,
  Link2,
  Lock,
  MessageSquareText,
  MessagesSquare,
  ReceiptText,
  Receipt,
  ScrollText,
  Share2,
  Tag,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react"
import { useId } from "react"
import { Sheet } from "@/components/sheets/Sheet"
import { Button } from "@/components/ui/button"
import { t, type MessageKey } from "@/i18n/t"
import { GIFTS_ON } from "@/lib/client/gifts/flag"

type PrivacyKey = Extract<MessageKey, `privacy.${string}`>

const PUBLIC: [LucideIcon, PrivacyKey][] = [
  [Coins, "privacy.public.money"],
  [Tag, "privacy.public.kind"],
  [Users, "privacy.public.members"],
  [ScrollText, "privacy.public.rules"],
  [CheckCheck, "privacy.public.approvals"],
  [Receipt, "privacy.public.receipt"],
  // gifts (hub 1.2.0): amounts and sender accounts are on the public ledger
  ...(GIFTS_ON ? ([[Gift, "privacy.public.gifts"]] as [LucideIcon, PrivacyKey][]) : []),
]

const MEMBERS: [LucideIcon, PrivacyKey][] = [
  [UserRound, "privacy.members.names"],
  [MessageSquareText, "privacy.members.notes"],
  [MessagesSquare, "privacy.members.comments"],
  [ReceiptText, "privacy.members.receipts"],
  [Link2, "privacy.members.links"],
  [History, "privacy.members.activity"],
  // "Ask for a top-up": the asks, their reasons and who added (2026-11-03)
  [HandCoins, "privacy.members.topups"],
  // gift notes: members (and the giver); the public gift page only if the giver chose
  ...(GIFTS_ON ? ([[Gift, "privacy.members.gift_notes"]] as [LucideIcon, PrivacyKey][]) : []),
]

function List({ id, icon: Icon, heading, why, items, kind }: { id: string; icon: LucideIcon; heading: string; why: string; items: [LucideIcon, PrivacyKey][]; kind: string }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2" data-privacy-list={kind}>
      <h3 id={id} className="flex items-center gap-2 text-label text-ink">
        <Icon aria-hidden className="size-5 shrink-0" strokeWidth={2} />
        {heading}
      </h3>
      <p className="text-body-sm text-ink-muted">{why}</p>
      <ul className="flex flex-col rounded-md bg-surface-sunken px-3 py-1">
        {items.map(([ItemIcon, key]) => (
          <li key={key} className="flex items-start gap-3 py-2 text-body text-ink" data-privacy-item={key}>
            <ItemIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted" strokeWidth={2} />
            <span className="min-w-0 [overflow-wrap:anywhere]">{t(key)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function PrivacySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const id = useId()
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("privacy.title")}
      footer={
        <Button className="w-full" onClick={onClose}>
          {t("privacy.done")}
        </Button>
      }
    >
      <div className="flex flex-col gap-5 pt-1" data-privacy-sheet>
        <List id={`${id}-public`} icon={Globe} heading={t("privacy.public.heading")} why={t("privacy.public.why")} items={PUBLIC} kind="public" />
        <List id={`${id}-members`} icon={Lock} heading={t("privacy.members.heading")} why={t("privacy.members.why")} items={MEMBERS} kind="members" />
        <p className="flex items-start gap-3 text-body-sm text-ink-muted" data-privacy-links>
          <Share2 aria-hidden className="mt-0.5 size-5 shrink-0" strokeWidth={2} />
          <span>{t("privacy.links")}</span>
        </p>
        {GIFTS_ON && (
          <p className="flex items-start gap-3 text-body-sm text-ink-muted" data-privacy-gifts>
            <Gift aria-hidden className="mt-0.5 size-5 shrink-0" strokeWidth={2} />
            <span>{t("privacy.gifts")}</span>
          </p>
        )}
        {/* the optional first-run survey (components/onboarding): the Pot team only, never a group */}
        <p className="flex items-start gap-3 text-body-sm text-ink-muted" data-privacy-survey>
          <ClipboardList aria-hidden className="mt-0.5 size-5 shrink-0" strokeWidth={2} />
          <span>{t("privacy.survey")}</span>
        </p>
      </div>
    </Sheet>
  )
}
