// /j/[slug]: the invite landing (F-13 UI; ux-spec §4.1; design-direction 01 §1; frontend-architecture §2.5).
// Show the Pot before login: a static frame + a <Suspense> body that reads params / ?i= and renders the real Pot
// on the server (works without JS for the first paint). The client island (JoinCta) owns the #secret and the
// join machine. Link: /j/<slug>?i=<invite public key>#<secret> (D-08).
import type { Metadata } from "next"
import { connection } from "next/server"
import { ShieldCheck } from "lucide-react"
import { Suspense } from "react"
import { Lockup } from "@/components/brand/Lockup"
import { Glyph } from "@/components/brand/Glyph"
import { Avatar } from "@/components/pot/Avatar"
import { CoverTile } from "@/components/pot/CoverTile"
import { GoalBar } from "@/components/pot/GoalBar"
import { MoneyText } from "@/components/money/MoneyText"
import { JoinCta } from "@/components/landing/JoinCta"
import { t } from "@/i18n/t"
import { formatUsd } from "@/lib/client/money"
import { getInvitePreview, type InvitePreview } from "./invite-preview"

type Props = PageProps<"/j/[slug]">

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params
  const { i } = await searchParams
  await connection()
  const p = await getInvitePreview(slug, typeof i === "string" ? i : null)
  const title = !p ? t("app.name") : p.inviter ? t("landing.title", { inviter: p.inviter, potName: p.name }) : t("share.preview.invited", { potName: p.name })
  return {
    title: { absolute: title },
    description: t("landing.trust"),
    robots: { index: false, follow: false },
    openGraph: { title, description: t("landing.trust") },
  }
}

export default function InvitePage({ params, searchParams }: Props) {
  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-flow flex-col px-4 pt-12 pb-[calc(16px+env(safe-area-inset-bottom))] md:px-6">
      <div className="mb-6 flex justify-center">
        <Lockup className="h-10 w-auto" />
      </div>
      <Suspense fallback={<InviteSkeleton />}>
        <InviteBody params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  )
}

function InviteSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-4">
      <div className="h-32 rounded-lg bg-surface-sunken" />
      <div className="mx-auto h-8 w-64 rounded-sm bg-surface-sunken" />
      <div className="h-44 rounded-lg bg-surface-sunken" />
    </div>
  )
}

async function InviteBody({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const { slug } = await params
  const { i } = await searchParams
  await connection()
  const p = await getInvitePreview(slug, typeof i === "string" ? i : null)
  if (!p) return <InviteError kind="invalid" />
  if (p.status === "closed") return <InviteError kind="pot_closed" potName={p.name} />
  if (p.inviteState === "expired") return <InviteError kind="expired" inviter={p.inviter ?? p.name} />
  if (p.inviteState === "used") return <InviteError kind="used" inviter={p.inviter ?? p.name} />
  if (p.inviteState === "replaced") return <InviteError kind="replaced" inviter={p.name} />
  return (
    <>
      <InviteHero p={p} />
      <JoinCta slug={p.slug} potName={p.name} suggested={p.goalEach} />
    </>
  )
}

function InviteHero({ p }: { p: InvitePreview }) {
  const balance = BigInt(p.balance)
  const totalIn = BigInt(p.totalIn)
  const goal = p.goal ? BigInt(p.goal) : null
  // who's in: the inviter by name (with an active invite), everyone else as a count (privacy audit 2026-11-02)
  const others = p.memberCount - 1
  const inLine =
    p.seats && p.inviter && p.inviterIsMember
      ? others <= 0
        ? t("landing.members.one", { name: p.inviter })
        : t("landing.members.with", { name: p.inviter, n: others })
      : t("landing.members.count", { n: p.memberCount })
  return (
    <div className="flex flex-col gap-5">
      <CoverTile emoji={p.emoji} cover={p.cover} size="banner" />
      <h1 className="text-center font-display text-title text-balance text-ink">
        {p.inviter ? t("landing.title", { inviter: p.inviter, potName: p.name }) : t("landing.title.fallback", { potName: p.name })}
      </h1>
      <div className="flex flex-col items-center gap-2">
        <div aria-hidden className="flex items-center" data-invite-seats>
          {p.seats?.slice(0, 6).map((m, idx) => (
            <Avatar key={m.key} person={{ name: "", initials: m.initials, joinIndex: m.joinIndex, avatar: null }} size="sm" ring="ground" className={idx > 0 ? "-ml-2" : undefined} />
          ))}
          <span className={`${p.seats?.length ? "-ml-2 " : ""}size-8 rounded-pill border-[1.5px] border-dashed border-line-strong bg-ground`} />
        </div>
        <p className="text-body-sm text-ink-muted" data-invite-members>
          {inLine}
        </p>
      </div>

      <section
        aria-label={
          balance > 0n
            ? t("landing.balance", { potName: p.name, balance: formatUsd(balance, "whole"), count: p.memberCount })
            : t("landing.balance.zero", { potName: p.name })
        }
        className="rounded-lg bg-surface p-4 shadow-card"
      >
        <p className="text-body-sm text-ink-muted">{t("pot.hero.label")}</p>
        {balance > 0n ? (
          <p className="mt-1">
            <MoneyText micro={balance} variant="hero" className="text-ink" />
          </p>
        ) : (
          <p className="mt-1 font-display text-heading text-ink">{t("landing.balance.zero", { potName: p.name })}</p>
        )}
        {goal !== null && <GoalBar collected={totalIn} goal={goal} className="mt-4" />}
        {p.goalEach && <p className="mt-1 text-body-sm text-ink">{t("landing.share", { suggested: formatUsd(BigInt(p.goalEach), "whole") })}</p>}
      </section>

      <div className="flex items-start gap-3 rounded-md bg-surface-sunken p-3">
        <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-ink" strokeWidth={2} />
        <p className="text-body-sm text-ink">{t("landing.trust")}</p>
      </div>
      <div className="flex flex-col gap-1 text-center text-body-sm text-ink-muted">
        <p>
          {p.oneOkCap
            ? t("landing.rules_peek.one_ok", {
                instantLimit: formatUsd(BigInt(p.instantCap), "whole"),
                oneOk: formatUsd(BigInt(p.oneOkCap), "whole"),
                thresholdWords: t("landing.rules_peek.majority"),
              })
            : t("landing.rules_peek", {
                instantLimit: formatUsd(BigInt(p.instantCap), "whole"),
                thresholdWords: t("landing.rules_peek.majority"),
              })}
        </p>
        {p.expiresAt && <p>{t("landing.expiry", { date: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(p.expiresAt) })}</p>}
      </div>
    </div>
  )
}

function InviteError({
  kind,
  inviter,
  potName,
}: {
  kind: "invalid" | "expired" | "used" | "replaced" | "pot_closed"
  inviter?: string
  potName?: string
}) {
  const title =
    kind === "pot_closed" ? t("invite.pot_closed.title", { potName: potName ?? "" }) : t(`invite.${kind}.title` as "invite.invalid.title")
  const body =
    kind === "invalid"
      ? t("invite.invalid.body")
      : kind === "pot_closed"
        ? t("invite.pot_closed.body")
        : t(`invite.${kind}.body` as "invite.expired.body", { inviter: inviter ?? "" })
  return (
    <div className="flex flex-1 flex-col items-center justify-center pb-16 text-center" data-invite-error={kind}>
      <Glyph className="mb-6 h-16 w-auto" />
      <h1 className="font-display text-title text-balance text-ink">{title}</h1>
      <p className="mt-2 max-w-80 text-body text-ink-muted">{body}</p>
    </div>
  )
}
