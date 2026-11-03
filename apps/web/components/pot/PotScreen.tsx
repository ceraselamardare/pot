"use client"
// The Pot screen (ux-spec §4.4, design-direction 02 §2, frontend-architecture §2.1-2.2). Answers "how much is in
// the Pot, and what's needed from me?". Phones: header, hero, Activity · Members · Settings, "Waiting on you"
// pinned above the feed. From bp-lg (1024 px): two columns, the Pot on the left (Activity · Settings) and
// Waiting on you, your requests and Members on the right (sticky).
// Under the balance, the action row (PotActions): Add money · Spend · Ask (Invite in a Pot of one) · More.
// Sheets are URL state: ?sheet=add|spend|share|close|rules|refund|ask|topup|payin|publicpage|payinlinks|more and ?r=<id>.
// ?tab=settings (the Rules tab until 2026-11-03; ?tab=rules still opens it). A push opens
// ?pid=<proposal id> (the SW maps the notification's proposal to it); it resolves here to the request, the close
// or the rules change behind that proposal.
import { Check, Clock } from "lucide-react"
import Link from "next/link"
import { useEffect } from "react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { EmptyState, PotSkeleton } from "@/components/feedback/States"
import { BalanceHero } from "@/components/pot/BalanceHero"
import { ActivityFeed, RequestRow } from "@/components/pot/Feed"
import { PotHeader } from "@/components/pot/PotParts"
import { PotActions, PotMoreSheet } from "@/components/pot/PotActions"
import { RequestCard } from "@/components/pot/RequestCard"
import { MembersTab } from "@/components/pot/Tabs"
import { SettingsTab } from "@/components/pot/SettingsTab"
import { AskSheet } from "@/components/payin/AskSheet"
import { PayInSheet } from "@/components/payin/PayInSheet"
import { PayInLinksSheet } from "@/components/payin/PayInLinksSheet"
import { PublicPageSheet } from "@/components/payin/PublicPageSheet"
import { TabList } from "@/components/pot/Controls"
import { AddFlow } from "@/components/sheets/AddFlow"
import { ApproveSheet } from "@/components/sheets/ApproveSheet"
import { ClosedMoment, CloseSheet } from "@/components/sheets/CloseSheet"
import { RulesSheet } from "@/components/sheets/RulesSheet"
import { RefundSheet } from "@/components/sheets/RefundSheet"
import { PersonActivitySheet } from "@/components/activity/PersonActivitySheet"
import { PayLinkSheet } from "@/components/paylink/LinkPanel"
import { CoachCard } from "@/components/pwa/Coach"
import { ShareSheet } from "@/components/sheets/ShareSheet"
import { SpendSheet } from "@/components/sheets/SpendSheet"
import { DepositCards, useArrivedDeposit } from "@/components/features/deposit/DepositCard"
import { GoalBanner, shownGoalState } from "@/components/wave4/GoalBanner"
import { pageTitle, t } from "@/i18n/t"
import { announce } from "@/lib/client/browser"
import { usePot } from "@/lib/client/data"
import type { PotVM } from "@/lib/client/mock/types"
import { pendingIn, useOps } from "@/lib/client/ops/store"
import { closeSheet, openSheet, resolveProposalParam, useSheetParams, useTabParam } from "@/lib/client/sheet"
import { formatUsd } from "@/lib/client/money"
import { useNow } from "@/lib/client/time"
import { GiftDetailsSheet } from "@/components/gifts/GiftDetailsSheet"
import { GIFTS_ON } from "@/lib/client/gifts/flag"
import { collectedOf, useWithGifts } from "@/lib/client/gifts/data"
import { TopupCard } from "@/components/topups/TopupCard"
import { TopupSheet } from "@/components/topups/TopupSheet"
import { useWithTopups } from "@/lib/client/topups/data"

// "rules" = the old name of Settings (links from before 2026-11-03, YourTrust, activity rows): shown as Settings
const TABS = ["activity", "members", "settings", "rules"] as const
/** ?sheet=paylink&link=<request id> */
const linkParam = (v: string | null): number | null => (v && /^\d{1,10}$/.test(v) ? Number(v) : null)
type Tab = Exclude<(typeof TABS)[number], "rules">

export function PotScreen() {
  const { slug } = useParams<{ slug: string }>()
  const res = usePot(slug)
  if (res.state === "loading") return <PotSkeleton />
  if (res.state === "not_found")
    return (
      <main id="main" className="mx-auto max-w-flow px-4 pt-12">
        <EmptyState
          headingLevel={1}
          title={t("pot.not_found.title")}
          body={t("pot.not_found.body")}
          action={<Button render={<Link href="/pots" />}>{t("pot.not_found.cta")}</Button>}
        />
      </main>
    )
  if (res.state === "not_member")
    return (
      <main id="main" className="mx-auto max-w-flow px-4 pt-12">
        <EmptyState
          headingLevel={1}
          title={t("pot.not_member.title")}
          body={t("pot.not_member.body", { potName: res.name })}
          action={<Button render={<Link href="/pots" />}>{t("pot.not_found.cta")}</Button>}
        />
      </main>
    )
  return <PotLoaded pot={res.data} />
}

function PotLoaded({ pot: base }: { pot: PotVM }) {
  // hub 1.2.0 gifts: the feed rows and the goal's count (the mock's potView has them; testnet adds them here)
  const withGifts = useWithGifts(base)
  // "Ask for a top-up": the open ask (its card) and the asks' feed rows (the mock's potView has them; testnet adds them)
  const pot = useWithTopups(withGifts)
  const now = useNow()
  const ops = useOps()
  const potOps = ops.filter((o) => o.pot === pot.slug)
  const [rawTab, setTab] = useTabParam<(typeof TABS)[number]>(TABS, "activity")
  const { sheet, requestId, params: sheetParams } = useSheetParams()
  // old links (before "pay in", 2026-11-03): ?sheet=gifts / ?kind=gift land on Settings → Money from outside
  const legacyGifts = sheetParams.get("sheet") === "gifts" || sheetParams.get("kind") === "gift"
  const tab: Tab = legacyGifts || rawTab === "rules" ? "settings" : rawTab
  const me = pot.me!
  const meId = me.person.id
  const title = pageTitle(pot.name)

  const { params } = useSheetParams()
  // integrations (D-50): ?sheet=add&src=xc[&d=<id>] is the any-chain deposit (AddFlow); an arrived one takes the marigold
  const arrived = useArrivedDeposit(pot.slug)
  const pid = params.get("pid")
  // a push deep link: ?pid=<proposal id> → the sheet for whatever that proposal is (frontend-architecture §8.2)
  useEffect(() => {
    if (pid === null || !/^\d+$/.test(pid)) return
    resolveProposalParam(Number(pid), {
      close: pot.close?.proposalId ?? null,
      rules: pot.rulesChange?.proposalId ?? null,
      requests: pot.feed.flatMap((f) => (f.kind === "request" && f.request.proposalId != null ? [[f.request.proposalId, f.request.id] as const] : [])),
    })
  }, [pid, pot.close?.proposalId, pot.rulesChange?.proposalId, pot.feed])

  const closeWaiting = !!pot.close && pot.close.status === "needs" && !pot.close.myVote && !pot.close.mine
  const rulesWaiting = !!pot.rulesChange && pot.rulesChange.status === "needs" && !pot.rulesChange.myVote && !pot.rulesChange.mine
  const waiting = (where: "m" | "lg") =>
    (pot.waitingOnMe.length > 0 || closeWaiting || rulesWaiting) && (
    <section aria-labelledby={`waiting-h-${where}`} className="flex flex-col gap-2">
      <h2 id={`waiting-h-${where}`} className="font-display text-heading text-ink">
        {t("pot.waiting.header")}
      </h2>
      {closeWaiting && pot.close && (
        <div className="flex items-center gap-3 rounded-lg bg-surface p-4 shadow-card" data-close-card>
          <p className="min-w-0 flex-1 text-label text-ink">{t("close.approve.title", { name: pot.close.proposer.name, potName: pot.name })}</p>
          <Button onClick={() => openSheet("close")}>{t("approve.cta.review")}</Button>
        </div>
      )}
      {rulesWaiting && pot.rulesChange && (
        <div className="flex items-center gap-3 rounded-lg bg-surface p-4 shadow-card" data-rules-card>
          <p className="min-w-0 flex-1 text-label text-ink">{t("approve.rules.title", { name: pot.rulesChange.proposer.name })}</p>
          <Button onClick={() => openSheet("rules")}>{t("approve.cta.review")}</Button>
        </div>
      )}
      {pot.waitingOnMe.map((r) => (
        <RequestCard key={r.id} r={r} me={meId} now={now} />
      ))}
    </section>
  )
  const mine = pot.mine.filter((r) => r.status === "needs")
  // hub 1.1.0: the goal with a date sits in the hero while the Pot is open; its refund (closing, closed) on Activity
  const goalShown = pot.goalDetail ? shownGoalState(pot.goalDetail, now) : null
  const goalRefund = goalShown === "refunding" || goalShown === "refunded" || (goalShown === "refundable" && pot.status !== "open")
  const feed =
    pot.feed.length <= 1 && potOps.length === 0 ? (
      <EmptyState
        visual="dots"
        headingLevel={3}
        title={pot.creator.id === meId ? t("pot.feed.empty.title") : t("pot.feed.empty.member")}
        body={pot.creator.id === meId ? t("pot.feed.empty.body", { potName: pot.name }) : undefined}
        action={pot.creator.id === meId ? <Button onClick={() => openSheet("share")}>{t("members.invite_cta")}</Button> : undefined}
        className="rounded-md bg-surface"
      />
    ) : (
      <ActivityFeed items={pot.feed} ops={potOps} me={me.person} now={now} potName={pot.name} />
    )

  return (
    <>
      <title>{title}</title>
      <main id="main" className="mx-auto w-full max-w-flow px-4 pb-8 md:px-6 lg:grid lg:max-w-app lg:grid-cols-[minmax(0,1fr)_23.5rem] lg:gap-8">
        <div className="min-w-0">
          <PotHeader pot={pot} />
          <BalanceHero
            balance={pot.balance}
            share={pot.myShare}
            contributed={me.contributed}
            pendingIn={pendingIn(potOps, pot.slug)}
            goal={pot.goal}
            collected={collectedOf(pot)}
            closedAt={pot.status === "closed" ? (pot.closedAt ?? null) : null}
            onShare={() => openSheet("refund")}
            goalSlot={pot.goalDetail && !goalRefund ? <GoalBanner goal={pot.goalDetail} potName={pot.name} now={now} /> : undefined}
            actions={
              <PotActions
                pot={pot}
                addVariant={arrived ? "secondary" : "primary"}
                spendBlocked={pot.goalDetail?.spendsBlocked && pot.status === "open" ? t("spend.goal_blocked") : null}
              />
            }
          />
          <div className="mt-6">
            {/* phones: three tabs; desktop: Activity · Settings (Members live in the right column) */}
            <TabList<Tab>
              idBase="pot"
              label={pot.name}
              value={tab}
              onChange={setTab}
              className="lg:hidden"
              tabs={[
                { value: "activity", label: t("pot.tabs.activity") },
                { value: "members", label: t("pot.tabs.members") },
                { value: "settings", label: t("pot.tabs.settings") },
              ]}
            />
            <TabList<Tab>
              idBase="pot-lg"
              panelBase="pot"
              label={pot.name}
              value={tab === "members" ? "activity" : tab}
              onChange={setTab}
              className="hidden lg:flex lg:max-w-80"
              tabs={[
                { value: "activity", label: t("pot.tabs.activity") },
                { value: "settings", label: t("pot.tabs.settings") },
              ]}
            />
          </div>
          <div className="mt-4">
            {tab === "settings" ? (
              <div role="tabpanel" id="pot-panel-settings" aria-labelledby="pot-tab-settings">
                <SettingsTab pot={pot} />
              </div>
            ) : tab === "members" ? (
              <>
                <div role="tabpanel" id="pot-panel-members" aria-labelledby="pot-tab-members" className="lg:hidden">
                  <MembersTab pot={pot} />
                </div>
                <div role="tabpanel" id="pot-panel-activity" aria-labelledby="pot-lg-tab-activity" className="hidden lg:block">
                  {feed}
                </div>
              </>
            ) : (
              <div role="tabpanel" id="pot-panel-activity" aria-labelledby="pot-tab-activity" className="flex flex-col gap-6">
                {goalRefund && pot.goalDetail && <GoalBanner goal={pot.goalDetail} potName={pot.name} now={now} />}
                {!(goalRefund && pot.status === "closing") && <PotStateCard pot={pot} />}
                <DepositCards pot={pot} actor={meId} />
                {pot.topup && <TopupCard v={pot.topup} me={meId} />}
                <CoachCard pot={pot.slug} />
                {(pot.waitingOnMe.length > 0 || closeWaiting || rulesWaiting) && <div className="lg:hidden">{waiting("m")}</div>}
                <div className="-mt-2">
                  <h2 className="sr-only">{t("pot.feed.header")}</h2>
                  {feed}
                </div>
              </div>
            )}
          </div>
        </div>

        <aside className="hidden lg:block" aria-label={t("pot.waiting.header")}>
          <div className="sticky top-6 flex flex-col gap-6 pt-3">
            {waiting("lg") || (
              <section className="flex flex-col gap-2">
                <h2 className="font-display text-heading text-ink">{t("pot.waiting.header")}</h2>
                <p className="rounded-md bg-surface p-3 text-body-sm text-ink-muted">{t("requests.section.waiting.empty")}</p>
              </section>
            )}
            {mine.length > 0 && (
              <section className="flex flex-col gap-2">
                <h2 className="font-display text-heading text-ink">{t("pot.mine.header")}</h2>
                <ul className="flex flex-col gap-2">
                  {mine.map((r) => (
                    <RequestRow key={r.id} r={r} now={now} />
                  ))}
                </ul>
              </section>
            )}
            <MembersTab pot={pot} compact />
          </div>
        </aside>
      </main>

      <AddFlow pot={pot} actor={meId} />
      <SpendSheet pot={pot} open={sheet === "spend"} onClose={closeSheet} />
      <ShareSheet pot={pot} open={sheet === "share"} onClose={closeSheet} />
      <ApproveSheet pot={pot} requestId={requestId} onClose={closeSheet} />
      <CloseSheet pot={pot} open={sheet === "close"} onClose={closeSheet} />
      <RulesSheet pot={pot} open={sheet === "rules"} onClose={closeSheet} />
      <RefundSheet pot={pot} open={sheet === "refund"} onClose={closeSheet} />
      <AskSheet pot={pot} open={sheet === "ask"} onClose={closeSheet} />
      <TopupSheet pot={pot} open={sheet === "topup"} onClose={closeSheet} />
      <PotMoreSheet pot={pot} open={sheet === "more"} onClose={closeSheet} />
      <PersonActivitySheet pot={pot} who={params.get("who")} open={sheet === "person" && !!params.get("who")} onClose={closeSheet} />
      <PayLinkSheet pot={pot} id={linkParam(params.get("link"))} open={sheet === "paylink" && linkParam(params.get("link")) !== null} onClose={closeSheet} />
      {GIFTS_ON && (
        <>
          <PayInSheet pot={pot} open={sheet === "payin"} onClose={closeSheet} />
          <PublicPageSheet pot={pot} open={sheet === "publicpage"} onClose={closeSheet} />
          <PayInLinksSheet pot={pot} open={sheet === "payinlinks"} onClose={closeSheet} />
          <GiftDetailsSheet pot={pot} giftRef={params.get("gift")} open={sheet === "gift" && !!params.get("gift")} onClose={closeSheet} />
        </>
      )}
    </>
  )
}

/**
 * Closing: "Adding money and spending are paused" (show the lock before it bites, D-09) with [Review].
 * Closed: the calm closed card (read-only Pot; the money is in each person's Pot account; no cash-out yet),
 * announced once per device.
 */
function PotStateCard({ pot }: { pot: PotVM }) {
  const closed = pot.status === "closed"
  const refund = pot.me?.getsBack ?? 0n
  useEffect(() => {
    if (!closed) return
    const key = `pot.closed.seen.${pot.slug}`
    try {
      if (localStorage.getItem(key)) return
      localStorage.setItem(key, "1")
    } catch {}
    announce(t("close.done.self", { refund: formatUsd(refund) }))
  }, [closed, pot.slug, refund])
  if (closed)
    return (
      <section aria-labelledby="pot-closed-h" className="rounded-lg bg-surface p-4 shadow-card" data-pot-closed>
        <h2 id="pot-closed-h" className="text-center font-display text-heading text-ink">
          {t("close.done.title")}
        </h2>
        <ClosedMoment refund={refund} contributed={pot.me?.contributed ?? 0n} />
        <Button className="w-full" onClick={() => openSheet("close")}>
          {t("close.summary.cta")}
        </Button>
      </section>
    )
  if (pot.status === "closing" || pot.closingInFlight)
    return (
      <div className="flex items-start gap-3 rounded-md bg-surface-sunken p-3" data-pot-closing>
        <Clock aria-hidden className="mt-0.5 size-5 shrink-0 text-waiting" strokeWidth={2.25} />
        <p className="min-w-0 flex-1 text-body-sm text-ink">{t("pot.closing")}</p>
        {pot.status === "closing" && (
          <Button size="sm" variant="ghost" onClick={() => openSheet("close")} className="-my-1">
            <Check aria-hidden strokeWidth={2.25} />
            {t("approve.cta.review")}
          </Button>
        )}
      </div>
    )
  return null
}
