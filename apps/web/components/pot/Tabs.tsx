"use client"
// Members and Rules tabs (ux-spec §4.5-4.6; design-direction 02 §6a-6b; F-20).
// Members: words, not signs ("Gets back $150.00"); no red or green for people, because nobody owes anybody.
//   "Gets back" is exactly what a close would pay now: hub preview_close at the live balance (testnet), the sdk
//   prorata twin (mock). "How it's worked out" explains the math in words.
// Rules (the first section of the Settings tab, components/pot/SettingsTab.tsx): GoHenry's "value + meaning" rows; the
// per-person meter is ink on surface-sunken (never marigold, which would read as a goal bar). [Ask the group to change
// a rule] (secondary: the hero's Add money stays the one marigold) opens the change sheet; while a change waits (≤ 1 per
// Pot, ERR_RULES_PENDING) a waiting card with [Review] replaces it. A sole member changes the rules directly (set_rules).
import { HUB_LIMITS } from "@pot/sdk"
import { Clock, Flag, Hand, Hourglass, Link2, ShieldCheck, Sprout, Undo2, UserCheck, UserRound, Users, UsersRound, Zap } from "lucide-react"
import { MyTrustCard, TrustBadge, trustWord } from "@/components/wave4/Trust"
import { formatDate } from "@/lib/client/time"
import { useState, type ReactNode } from "react"
import { Avatar } from "@/components/pot/Avatar"
import { MoneyText } from "@/components/money/MoneyText"
import { inWords } from "@/components/pot/Feed"
import { StatusChip } from "@/components/pot/StatusChip"
import { Sheet } from "@/components/sheets/Sheet"
import { Button } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { formatUsd } from "@/lib/client/money"
import type { PotVM } from "@/lib/client/mock/types"
import type { Rules } from "@/lib/client/rules"
import { openSheet } from "@/lib/client/sheet"
import { useNow } from "@/lib/client/time"

export function MembersTab({ pot, compact }: { pot: PotVM; compact?: boolean }) {
  const H = compact ? "h3" : "h2"
  return (
    <section aria-labelledby={`members-h-${compact ? "c" : "f"}`} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <H id={`members-h-${compact ? "c" : "f"}`} className="font-display text-heading text-ink">
          {t("members.header", { n: pot.members.length })}
        </H>
        <Button size="sm" onClick={() => openSheet("share")} className="min-h-11">
          {t("members.invite_cta")}
        </Button>
      </div>
      {!compact && <p className="-mt-2 text-body-sm text-ink-muted">{t("members.refund_hint")}</p>}
      {!compact && (
        <dl className="grid grid-cols-3 gap-2 rounded-md bg-surface-sunken p-3">
          {(
            [
              ["members.totals.in", pot.totalIn],
              ["members.totals.spent", pot.spent],
              ["members.totals.left", pot.balance],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="flex flex-col">
              <dt className="text-body-sm text-ink-muted">{t(k)}</dt>
              <dd>
                <MoneyText micro={v} className="text-ink" />
              </dd>
            </div>
          ))}
        </dl>
      )}
      <ul className="flex flex-col gap-2">
        {pot.members.map((m) => {
          const name = m.isMe ? t("members.you", { name: m.person.name }) : m.person.name
          // hub 1.1.0: earned trust as a badge (icon + word) and what they can spend without asking
          const trust = m.trust?.enabled ? m.trust : null
          const sentence = `${name}. ${t("members.row", {
            contributed: formatUsd(m.contributed),
            spentShare: formatUsd(m.spentShare),
            refund: formatUsd(m.getsBack),
          })}`
          return (
            <li key={m.person.id} aria-label={sentence} className="list-none">
              {/* tap a person: what they did in this Pot (?sheet=person&who=, components/activity/PersonActivitySheet) */}
              <button
                type="button"
                onClick={() => openSheet("person", { who: m.person.id })}
                aria-label={trust ? `${name}, ${trustWord(trust.level)}. ${t("members.activity.hint")}` : `${name}. ${t("members.activity.hint")}`}
                data-member={m.person.id}
                className="flex min-h-16 w-full items-center gap-3 rounded-md bg-surface p-3 text-left hover:bg-surface-sunken"
              >
              <Avatar person={m.person} size="md" />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-label text-ink">
                  {name}
                  {trust && <TrustBadge trust={trust} />}
                </p>
                <p className="text-body-sm text-ink-muted tabular-nums">
                  {t("members.row.short", { contributed: formatUsd(m.contributed), spentShare: formatUsd(m.spentShare) })}
                </p>
                {trust && (
                  <p className="text-body-sm text-ink-muted tabular-nums" data-member-up-to>
                    {t("trust.member.up_to", { amount: formatUsd(trust.instantUpTo, "whole") })}
                  </p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-body-sm text-ink-muted">{t("members.gets_back")}</p>
                <MoneyText micro={m.getsBack} className="text-ink" />
              </div>
              </button>
            </li>
          )
        })}
      </ul>
      {pot.members.length === 1 && <p className="text-body text-ink-muted">{t("members.only_you")}</p>}
      <div className="flex flex-wrap items-center gap-x-2">
        <p className="text-body-sm text-ink-muted">{t("members.explainer")}</p>
        <HowItsWorkedOut />
      </div>
    </section>
  )
}

/** Buddy's model: the close math in words, in a small sheet (design-direction 02 §6a footer). */
function HowItsWorkedOut() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="link" className="min-h-11 text-body-sm" onClick={() => setOpen(true)} data-members-how>
        {t("members.how")}
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={t("members.how.title")}
        footer={
          <Button className="w-full" onClick={() => setOpen(false)}>
            {t("members.how.done")}
          </Button>
        }
      >
        <div className="flex flex-col gap-3 pt-1 text-body text-ink">
          <p>{t("members.how.body1")}</p>
          <p>{t("members.how.body2")}</p>
          <p className="text-body-sm text-ink-muted">{t("members.how.body3")}</p>
        </div>
      </Sheet>
    </>
  )
}

/** The rules as plain sentences (shared by the Rules tab and the change sheet's preview). */
export function ruleSentences(rules: Rules, k: number, n: number) {
  return {
    // an instant limit of $0: nothing is approved without asking (the hub sends every spend to the group)
    instant: rules.instantCap > 0n ? t("rules.instant", { instantLimit: formatUsd(rules.instantCap, "whole") }) : t("rules.instant.none", { k, n }),
    threshold: t("rules.threshold", { k, n }),
    budget: t("rules.budget", { memberBudget: formatUsd(rules.memberBudget, "whole") }),
    recipients: rules.instantPayees === "members_and_allowlist" && rules.payeeAllowlist.length > 0 ? t("rules.recipients.named") : t("rules.recipients"),
    expiry: t("rules.expiry", { days: rules.expiryDays }),
    leftovers: t("rules.leftovers"),
    size: t("rules.size", { max: HUB_LIMITS.maxMembers }),
  }
}

/** hub 1.1.0 rule sentences (null = that rule is off): earned trust, the one-OK ceiling, the goal with a date. */
export function extrasSentences(pot: Pick<PotVM, "rules" | "extras" | "goalDetail">) {
  const x = pot.extras
  const g = pot.goalDetail
  return {
    trust: x?.trust ? t("rules.trust", { step: 3, instantLimit: formatUsd(pot.rules.instantCap, "whole"), max: formatUsd(pot.rules.instantCap * 3n, "whole") }) : null,
    oneOk: x && x.oneOkCap > 0n ? t("rules.one_ok", { oneOk: formatUsd(x.oneOkCap, "whole") }) : null,
    goal: g
      ? g.allOrNothing
        ? t("rules.goal.aon", { amount: formatUsd(g.amount, "whole"), date: formatDate(g.deadline) })
        : t("rules.goal", { amount: formatUsd(g.amount, "whole"), date: formatDate(g.deadline) })
      : null,
    links: t(x?.links ? "rules.links.on" : "rules.links.off"),
  }
}

/** The Pot's rules as sentences, the footnotes and "Changing the rules" (Settings → Rules · the group decides). */
export function RulesSection({ pot }: { pot: PotVM }) {
  const used = pot.me?.spentInstant ?? 0n
  const budget = pot.rules.memberBudget
  const pct = budget > 0n ? Math.min(100, Number((used * 100n) / budget)) : 0
  const sentences = ruleSentences(pot.rules, pot.k, pot.n)
  const none = pot.rules.instantCap <= 0n
  const named = pot.rules.instantPayees === "members_and_allowlist" ? pot.rules.payeeAllowlist : []
  // the Pot's own rules (no template names): with a $0 instant limit the "bigger spends" and per-person rows
  // say nothing new, so the first row carries the approvals
  const extra = extrasSentences(pot)
  const rows: { icon: typeof Zap; text: string; meter?: boolean; list?: string[] }[] = [
    { icon: Zap, text: sentences.instant },
    ...(extra.trust ? [{ icon: Sprout, text: extra.trust }] : []),
    ...(extra.oneOk ? [{ icon: Hand, text: extra.oneOk }] : []),
    ...(none ? [] : [{ icon: Users, text: sentences.threshold }, { icon: UserRound, text: sentences.budget, meter: true }]),
    ...(extra.goal ? [{ icon: Flag, text: extra.goal }] : []),
    { icon: UserCheck, text: sentences.recipients, list: named.length ? named : undefined },
    { icon: Hourglass, text: sentences.expiry },
    { icon: Undo2, text: sentences.leftovers },
    { icon: UsersRound, text: sentences.size },
    // hub 1.1.0 pay by link: always said, on or off (a Pot from before 1.1.0 reads off until a rules change turns it on)
    { icon: Link2, text: extra.links },
  ]
  return (
    <div className="flex flex-col gap-4">
      {/* hub 1.1.0: what I can spend without asking, and how it grows */}
      {pot.me?.trust?.enabled && <MyTrustCard trust={pot.me.trust} />}
      <ul className="flex flex-col gap-2" data-rules-list>
        {rows.map(({ icon: Icon, text, meter, list }) => (
          <li key={text} className="flex gap-3 rounded-md bg-surface p-4">
            <Icon aria-hidden className="mt-0.5 size-6 shrink-0 text-ink" strokeWidth={2} />
            <div className="min-w-0 flex-1">
              <p className="text-body text-ink tabular-nums">{text}</p>
              {list && (
                <ul className="mt-1.5 flex flex-col gap-0.5 text-body-sm break-all text-ink-muted" data-rules-named>
                  {list.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              )}
              {meter && pot.me && (
                <div className="mt-3">
                  <div aria-hidden className="h-1.5 overflow-hidden rounded-pill bg-surface-sunken">
                    <div className="h-full rounded-pill bg-ink" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1.5 text-body-sm text-ink-muted">{t("rules.budget.used", { used: formatUsd(used, "whole") })}</p>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
      {/* footnotes under the list: quiet, one icon each */}
      <div className="-mt-1 flex flex-col gap-2">
        {pot.me && pot.me.contributed === 0n && <p className="text-body-sm text-ink-muted">{t("rules.new_member")}</p>}
        <p className="flex items-start gap-2 text-body-sm text-ink-muted" data-rules-footnote>
          <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
          {t("rules.footer", { creator: pot.creator.name })}
        </p>
      </div>
      <RulesChange pot={pot} />
    </div>
  )
}

/** One card: "Changing the rules", what it takes, and the one way in (or the change that's waiting). */
function RulesChange({ pot }: { pot: PotVM }) {
  const now = useNow()
  const change = pot.rulesChange && pot.rulesChange.status === "needs" ? pot.rulesChange : null
  const sole = pot.n === 1
  let body: ReactNode
  if (pot.status !== "open") body = <p className="text-body-sm text-ink-muted">{t("rules.change.closing")}</p>
  else if (change)
    body = (
      <div className="flex flex-col gap-3" data-rules-pending={change.proposalId}>
        <div className="flex items-start gap-3">
          <Avatar person={change.proposer} size="sm" ring="surface" />
          <div className="min-w-0 flex-1">
            <p className="text-label text-ink">{t("rules.change.pending", { name: change.mine ? t("feed.you") : change.proposer.name })}</p>
            <p className="mt-1 flex flex-wrap items-center gap-2">
              <StatusChip status="needs">{t("approve.progress", { count: change.approvals.length, k: change.k })}</StatusChip>
              <span className="text-body-sm text-ink-muted">{t("approve.expires", { relativeTime: inWords(change.expiresAt, now) })}</span>
            </p>
          </div>
        </div>
        <Button className="w-full" onClick={() => openSheet("rules")}>
          {t("approve.cta.review")}
        </Button>
      </div>
    )
  // the hub says a change is open but this device can't show it yet: hold the button (ERR_RULES_PENDING)
  else if (pot.rulesPending)
    body = (
      <p className="flex items-start gap-2 rounded-md bg-surface-sunken p-3 text-body-sm text-ink" data-rules-in-flight>
        <Clock aria-hidden className="mt-0.5 size-4 shrink-0 text-waiting" strokeWidth={2.25} />
        {t("rules.change.in_flight")}
      </p>
    )
  else
    body = (
      <>
        <p className="-mt-2 text-body-sm text-ink-muted">{sole ? t("rules.change.sole_note") : t("rules.change.note", { k: pot.k, n: pot.n })}</p>
        <Button className="w-full" onClick={() => openSheet("rules")}>
          {sole ? t("rules.change.cta.sole") : t("rules.change.cta")}
        </Button>
      </>
    )
  return (
    <section aria-labelledby="rules-change-h" className="flex flex-col gap-3 rounded-md bg-surface p-4" data-rules-change>
      <h3 id="rules-change-h" className="text-label text-ink">
        {t("rules.change.h")}
      </h3>
      {body}
    </section>
  )
}
