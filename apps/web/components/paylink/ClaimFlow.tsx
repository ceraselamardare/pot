"use client"
// The claim page's island (/c/<slug>/<id>#<secret>; pay by link, hub 1.1.0). Shows who sent how much from which Pot,
// then one action: [Get $84] → sign in if needed (NEAR Auth / a NEAR wallet; the mock signs a guest in as Alex) →
// the claim is signed here with the #secret (never sent anywhere) → "$84 is yours" with where it went (their Pot
// dollars) and a receipt. Every other state of the link has its own calm screen (lib/client/paylink/claim.ts).
//  - The #secret is kept in sessionStorage['pot.claim.<slug>.<id>'] so a sign-in redirect can't lose it, and the
//    fragment is stripped once the money is claimed.
//  - The link refreshes by itself while it can change on its own (waiting for the group's OK, a claim in flight).
import { Check, Clock, Hourglass, ShieldCheck, Undo2, X } from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react"
import { Glyph } from "@/components/brand/Glyph"
import { TypingDots } from "@/components/feedback/TypingDots"
import { MoneyText } from "@/components/money/MoneyText"
import { CoverTile } from "@/components/pot/CoverTile"
import { ReceiptLink } from "@/components/receipt/ReceiptLink"
import { SignInOptions } from "@/components/features/auth/SignInOptions"
import { Button } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { mockJoinSession } from "@/lib/client/actions"
import { announce } from "@/lib/client/browser"
import { IS_LIVE } from "@/lib/client/config"
import { useMeInfo, useOwnDollars } from "@/lib/client/data"
import { mockTxHash } from "@/lib/client/mock/world"
import { formatUsd } from "@/lib/client/money"
import { claimLink, useClaimLink } from "@/lib/client/paylink/actions"
import { claimReducer, claimScreen, initialClaim, retryable, type ClaimLinkVM, type ClaimScreen, type SecretCheck } from "@/lib/client/paylink/claim"
import { publicKeyOfSecret } from "@/lib/client/paylink/keys"
import { secretFromHash } from "@/lib/client/paylink/link"
import { formatDate } from "@/lib/client/time"
import { cn } from "@/lib/client/cn"

const stash = (slug: string, id: number) => `pot.claim.${slug}.${id}`

/** The #secret: the fragment, else the copy kept for this link in sessionStorage. undefined on the server. */
function useFragmentSecret(slug: string, id: number): { secret: string } | { error: "missing" | "malformed" } | undefined {
  const raw = useSyncExternalStore(
    (cb) => {
      window.addEventListener("hashchange", cb)
      return () => window.removeEventListener("hashchange", cb)
    },
    () => {
      const h = window.location.hash
      if (h.length > 1) {
        const r = secretFromHash(h)
        if ("secret" in r)
          try {
            sessionStorage.setItem(stash(slug, id), r.secret)
          } catch {}
        return h
      }
      try {
        const s = sessionStorage.getItem(stash(slug, id))
        return s ? `#${s}` : ""
      } catch {
        return ""
      }
    },
    () => null,
  )
  return useMemo(() => (raw === null ? undefined : secretFromHash(raw)), [raw])
}

export function ClaimFlow({ slug, id, initial }: { slug: string; id: number; initial: ClaimLinkVM | null }) {
  const meInfo = useMeInfo()
  const me = meInfo === undefined ? undefined : (meInfo?.id ?? null)
  const frag = useFragmentSecret(slug, id)
  const [phase, dispatch] = useReducer(claimReducer, initialClaim)
  const [pkCheck, setPkCheck] = useState<{ secret: string; pk: string; ok: boolean } | null>(null)
  const [txHash, setTxHash] = useState<string | undefined>()
  // the link refreshes by itself while it can change on its own (useClaimLink), and while a claim is in flight
  const fresh = useClaimLink(slug, id, initial, phase.tag === "claiming")
  // the server's first paint stands in until the browser has read the link (no flash of a skeleton)
  const link = fresh === undefined ? (initial ?? undefined) : fresh
  const secret = frag && "secret" in frag ? frag.secret : null

  // the #secret must belong to this link (an old link, or one pasted from another payment, can't claim it)
  const claimPk = link?.claimPk
  useEffect(() => {
    if (!secret || !claimPk) return
    let cancelled = false
    publicKeyOfSecret(secret)
      .then((pk) => !cancelled && setPkCheck({ secret, pk: claimPk, ok: pk === claimPk }))
      .catch(() => !cancelled && setPkCheck({ secret, pk: claimPk, ok: false }))
    return () => {
      cancelled = true
    }
  }, [secret, claimPk])
  const check: SecretCheck =
    frag === undefined
      ? "checking"
      : "error" in frag
        ? frag.error
        : pkCheck && pkCheck.secret === frag.secret && pkCheck.pk === claimPk
          ? pkCheck.ok
            ? "ok"
            : "wrong"
          : "checking"

  const screen = claimScreen(link, check, me, phase)

  // the claim itself (once signed in)
  const amount = link?.amount ?? "0"
  useEffect(() => {
    if (phase.tag !== "claiming" || !secret) return
    let cancelled = false
    claimLink(slug, id, secret)
      .then((r) => {
        if (cancelled) return
        if (r.ok) {
          setTxHash(r.txHash ?? (IS_LIVE ? undefined : mockTxHash(`${slug}:claim:${id}`)))
          dispatch({ type: "CLAIM_OK", amount })
        } else dispatch({ type: "CLAIM_ERR", kind: r.kind })
      })
      .catch(() => !cancelled && dispatch({ type: "CLAIM_ERR", kind: "network" }))
    return () => {
      cancelled = true
    }
  }, [phase.tag, secret, slug, id, amount])

  // after the money is theirs: forget the secret, strip it from the address bar, say it once
  const announced = useRef(false)
  useEffect(() => {
    if (phase.tag !== "success" || announced.current) return
    announced.current = true
    try {
      sessionStorage.removeItem(stash(slug, id))
    } catch {}
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`)
    announce(`${t("claim.success.title", { amount: formatUsd(BigInt(phase.amount), "whole") })}. ${t("claim.success.body")}`)
  }, [phase, slug, id])

  const signedIn = !!me
  const get = () => dispatch({ type: "TAP_GET", signedIn })
  return (
    <div className="flex flex-col gap-5" data-claim={screen}>
      {link ? <ClaimHero link={link} /> : screen === "not_found" ? null : <HeroSkeleton />}
      <Action
        screen={screen}
        link={link ?? null}
        phase={phase}
        meName={meInfo?.name ?? null}
        meId={me ?? null}
        txHash={txHash}
        onGet={get}
        onSignedIn={() => dispatch({ type: "SIGNED_IN" })}
        onCancel={() => dispatch({ type: "CANCEL" })}
        onRetry={() => dispatch({ type: "RETRY", signedIn })}
      />
    </div>
  )
}

function HeroSkeleton() {
  return (
    <div aria-hidden className="flex flex-col items-center gap-3">
      <div className="size-20 rounded-lg bg-surface-sunken" />
      <div className="h-8 w-64 rounded-sm bg-surface-sunken" />
      <div className="h-12 w-40 rounded-sm bg-surface-sunken" />
    </div>
  )
}

/** Who, how much, from where: the page's one H1. */
function ClaimHero({ link }: { link: ClaimLinkVM }) {
  const amount = formatUsd(BigInt(link.amount), "whole")
  const title = link.requesterName
    ? t("claim.title", { name: link.requesterName, amount, potName: link.potName })
    : t("claim.title.anon", { amount, potName: link.potName })
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <CoverTile emoji={link.potEmoji} cover={link.potCover} size="xl" />
      <h1 className="font-display text-title text-balance text-ink">{title}</h1>
      <p>
        <MoneyText micro={BigInt(link.amount)} variant="hero" className="text-ink" strike={link.status === "returned" || link.status === "void" || link.status === "expired"} />
      </p>
      <p className="text-body text-ink-muted">{t("claim.for", { reason: t(`spend.reason.word.${link.category}`) })}</p>
    </div>
  )
}

function StateCard({ icon, title, body, kind }: { icon: React.ReactNode; title: string; body?: string; kind: ClaimScreen }) {
  return (
    <section aria-labelledby="claim-state-h" className="flex items-start gap-3 rounded-lg bg-surface p-4 shadow-card" data-claim-state={kind}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <h2 id="claim-state-h" className="font-display text-heading text-ink">
          {title}
        </h2>
        {body && <p className="mt-1 text-body-sm text-ink-muted">{body}</p>}
      </div>
    </section>
  )
}

function Action({
  screen,
  link,
  phase,
  meName,
  meId,
  txHash,
  onGet,
  onSignedIn,
  onCancel,
  onRetry,
}: {
  screen: ClaimScreen
  link: ClaimLinkVM | null
  phase: ReturnType<typeof claimReducer>
  meName: string | null
  meId: string | null
  txHash?: string
  onGet: () => void
  onSignedIn: () => void
  onCancel: () => void
  onRetry: () => void
}) {
  const amount = link ? formatUsd(BigInt(link.amount), "whole") : ""
  const potName = link?.potName ?? ""
  const name = link?.requesterName ?? t("claim.sender")
  const until = link ? t("claim.until", { date: formatDate(link.expiresAt) }) : ""
  const statusRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (screen === "success" || screen === "error") statusRef.current?.focus()
  }, [screen])

  switch (screen) {
    case "loading":
      return <div aria-hidden className="min-h-40 rounded-lg bg-surface-sunken" />
    case "not_found":
      return <Blank title={t("claim.not_found.title")} body={t("claim.not_found.body")} kind="not_found" />
    case "incomplete":
      return <StateCard kind="incomplete" icon={<X aria-hidden className="size-5 text-declined" strokeWidth={2.5} />} title={t("claim.incomplete.title")} body={t("claim.incomplete.body", { name })} />
    case "wrong":
      return <StateCard kind="wrong" icon={<X aria-hidden className="size-5 text-declined" strokeWidth={2.5} />} title={t("claim.wrong.title")} body={t("claim.wrong.body", { name })} />
    case "waiting":
      return (
        <div aria-live="polite">
          <StateCard kind="waiting" icon={<Clock aria-hidden className="size-5 text-waiting" strokeWidth={2.25} />} title={t("claim.waiting.title")} body={t("claim.waiting.body", { potName })} />
        </div>
      )
    case "busy":
      return (
        <div aria-live="polite" className="flex items-center gap-3 rounded-lg bg-surface p-4 shadow-card" data-claim-state="busy">
          <TypingDots className="text-ink-muted" />
          <p className="text-label text-ink">{t("claim.busy")}</p>
        </div>
      )
    case "claimed":
      return <StateCard kind="claimed" icon={<Check aria-hidden className="size-5 text-ink-muted" strokeWidth={2.5} />} title={t("claim.claimed.title")} body={t("claim.claimed.body", { name })} />
    case "returned":
      return link?.returnedOnExpiry ? (
        <StateCard kind="expired" icon={<Hourglass aria-hidden className="size-5 text-ink-muted" strokeWidth={2.25} />} title={t("claim.expired.title")} body={t("claim.expired.body", { potName, name })} />
      ) : (
        <StateCard kind="returned" icon={<Undo2 aria-hidden className="size-5 text-ink-muted" strokeWidth={2.25} />} title={t("claim.returned.title")} body={t("claim.returned.body", { name, potName })} />
      )
    case "expired":
      return <StateCard kind="expired" icon={<Hourglass aria-hidden className="size-5 text-ink-muted" strokeWidth={2.25} />} title={t("claim.expired.title")} body={t("claim.expired.body", { potName, name })} />
    case "void":
      return <StateCard kind="void" icon={<X aria-hidden className="size-5 text-declined" strokeWidth={2.5} />} title={t("claim.void.title")} body={t("claim.void.body", { potName })} />
    case "claiming":
      return (
        <section aria-busy className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg bg-surface p-4 shadow-card" data-claim-state="claiming">
          <TypingDots className="text-ink" />
          <p role="status" className="text-label text-ink">
            {t("claim.claiming", { amount })}
          </p>
        </section>
      )
    case "success":
      return <Success amount={phase.tag === "success" ? phase.amount : (link?.amount ?? "0")} potName={potName} meId={meId} txHash={txHash} headingRef={statusRef} />
    case "error": {
      const kind = phase.tag === "error" ? phase.kind : "failed"
      return (
        <div className="flex flex-col gap-3" data-claim-state="error">
          <h2 ref={statusRef} tabIndex={-1} role="alert" className="flex items-start gap-2 text-body text-ink outline-none">
            <X aria-hidden className="mt-0.5 size-5 shrink-0 text-declined" strokeWidth={2.5} />
            {t(kind === "network" ? "claim.error.network" : "claim.error.failed")}
          </h2>
          {retryable(kind) && (
            <Button variant="primary" className="w-full" onClick={onRetry}>
              {t("claim.error.retry")}
            </Button>
          )}
        </div>
      )
    }
    case "signin":
      return (
        <section aria-labelledby="claim-signin-h" className="flex flex-col gap-3 rounded-lg bg-surface p-4 shadow-card" data-claim-state="signin">
          <h2 id="claim-signin-h" className="font-display text-heading text-ink">
            {t("claim.signin.title", { amount })}
          </h2>
          <p className="text-body-sm text-ink-muted">{t("claim.signin.body")}</p>
          {IS_LIVE ? (
            <SignInOptions primary onSignedIn={onSignedIn} />
          ) : (
            <>
              <Button variant="primary" className="w-full" onClick={() => void mockJoinSession("alex").then(onSignedIn)}>
                {t("claim.signin.google")}
              </Button>
              <p className="text-center text-body-sm text-ink-muted">{t("claim.signin.mock")}</p>
            </>
          )}
          <Button variant="ghost" className="w-full" onClick={onCancel}>
            {t("claim.signin.back")}
          </Button>
        </section>
      )
    case "ready":
      return (
        <div className="flex flex-col gap-3" data-claim-state="ready">
          <Button variant="primary" className="w-full" onClick={onGet} data-claim-get>
            {t("claim.cta", { amount })}
          </Button>
          {meName && <p className="text-center text-body-sm text-ink-muted">{t("claim.signed_in_as", { name: meName })}</p>}
          <p className="text-center text-body-sm text-ink-muted">{until}</p>
          <div className="flex items-start gap-3 rounded-md bg-surface-sunken p-3">
            <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-ink" strokeWidth={2} />
            <p className="text-body-sm text-ink">{t("claim.trust")}</p>
          </div>
        </div>
      )
  }
}

/** A /c address that can't be a link at all (bad slug or id). */
export function ClaimNotFound() {
  return <Blank title={t("claim.not_found.title")} body={t("claim.not_found.body")} kind="not_found" />
}

function Blank({ title, body, kind }: { title: string; body: string; kind: ClaimScreen }) {
  return (
    <div className="flex flex-col items-center pt-6 text-center" data-claim-state={kind}>
      <Glyph className="mb-6 h-16 w-auto" />
      <h1 className="font-display text-title text-balance text-ink">{title}</h1>
      <p className="mt-2 max-w-80 text-body text-ink-muted">{body}</p>
    </div>
  )
}

/** "$84 is yours": where it went (their Pot dollars, with the balance) and its receipt. */
function Success({
  amount,
  potName,
  meId,
  txHash,
  headingRef,
}: {
  amount: string
  potName: string
  meId: string | null
  txHash?: string
  headingRef: React.RefObject<HTMLHeadingElement | null>
}) {
  const balance = useOwnDollars(meId, !!meId)
  const whole = formatUsd(BigInt(amount), "whole")
  return (
    <section aria-labelledby="claim-success-h" className="flex flex-col gap-4 rounded-lg bg-surface p-4 shadow-card" data-claim-state="success">
      <div className="flex items-center gap-3">
        <span className="pot-pop grid size-10 shrink-0 place-items-center rounded-pill bg-brand-soft">
          <Check aria-hidden className="size-6 text-approved" strokeWidth={2.75} />
        </span>
        <div>
          <h2 id="claim-success-h" ref={headingRef} tabIndex={-1} className="font-display text-heading text-ink outline-none">
            {t("claim.success.title", { amount: whole })}
          </h2>
          <p className="text-body-sm text-ink-muted">{t("claim.success.body")}</p>
        </div>
      </div>
      <dl className="flex min-h-12 items-center justify-between gap-3 rounded-md border border-line px-3">
        <dt className="text-body-sm text-ink-muted">{t("claim.success.balance")}</dt>
        <dd className={cn(balance === undefined && "text-ink-muted")} data-claim-balance>
          {balance === undefined ? <TypingDots size="sm" /> : <MoneyText micro={balance} className="text-ink" />}
        </dd>
      </dl>
      <ReceiptLink txHash={txHash} what={t("claim.receipt", { amount: whole, potName })} className="self-start" />
      <Button variant="primary" className="w-full" render={<Link href="/you" />}>
        {t("claim.success.cta")}
      </Button>
    </section>
  )
}
