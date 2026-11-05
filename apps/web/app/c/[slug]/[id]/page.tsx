// /c/[slug]/[id]: the claim page of a payment link (pay by link, hub 1.1.0). Link: /c/<slug>/<request id>#<secret>.
// A static frame + a <Suspense> body that reads params (Cache Components) and renders the link from the server
// (claim-preview.ts: "Maya sent you $84 from Lisbon Trip", for the first paint and link previews). The client island
// (ClaimFlow) owns the #secret, keeps the link fresh, signs in and claims. Never indexed.
import type { Metadata } from "next"
import { connection } from "next/server"
import { Suspense } from "react"
import { Lockup } from "@/components/brand/Lockup"
import { LiveRegion } from "@/components/app-shell/Shell"
import { ClaimFlow, ClaimNotFound } from "@/components/paylink/ClaimFlow"
import { PublicNotice } from "@/components/public/PublicNotice"
import { t } from "@/i18n/t"
import { claimTitle, getClaimPreview, parseClaimParams } from "./claim-preview"

// (typed by hand: the generated PageProps needs `next typegen` in the default dist dir)
type Props = { params: Promise<{ slug: string; id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, id } = await params
  await connection()
  const ok = parseClaimParams(slug, id)
  const p = ok ? await getClaimPreview(ok.slug, ok.id).catch(() => null) : null
  const title = claimTitle(p)
  const description = t("claim.trust")
  return {
    title: { absolute: title },
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description },
  }
}

export default function ClaimPage({ params }: Props) {
  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-flow flex-col px-4 pt-12 pb-[calc(16px+env(safe-area-inset-bottom))] md:px-6">
      <div className="mb-6 flex justify-center">
        <Lockup className="h-10 w-auto" />
      </div>
      <Suspense fallback={<ClaimSkeleton />}>
        <ClaimBody params={params} />
      </Suspense>
      <LiveRegion />
    </main>
  )
}

function ClaimSkeleton() {
  return (
    <div aria-hidden className="flex flex-col items-center gap-4">
      <div className="size-20 rounded-lg bg-surface-sunken" />
      <div className="h-8 w-64 rounded-sm bg-surface-sunken" />
      <div className="h-40 w-full rounded-lg bg-surface-sunken" />
    </div>
  )
}

async function ClaimBody({ params }: Pick<Props, "params">) {
  const { slug, id } = await params
  await connection()
  const ok = parseClaimParams(slug, id)
  if (!ok) return <ClaimNotFound />
  const p = await getClaimPreview(ok.slug, ok.id).catch(() => null)
  return (
    <>
      <ClaimFlow slug={ok.slug} id={ok.id} initial={p} />
      {/* CLI-4 (security audit 2026-11-04): "made by people who use Pot, not by Pot" + Report this page */}
      <PublicNotice page="pay_link" slug={ok.slug} />
    </>
  )
}
