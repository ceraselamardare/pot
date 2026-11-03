// /g/[slug]/[id]: a gift link's landing (gifts, hub 1.2.0; notes/gifts-plan.md). Anyone with the link can send the Pot a
// gift; they don't join it. A static frame + a <Suspense> body that reads params (Cache Components) and renders the
// link from the server (app/_lib/gift-preview.ts) for the first paint and link previews; the client island (GiveFlow)
// keeps it fresh, signs in inline and sends. Never indexed (next.config.ts headers).
import type { Metadata } from "next"
import { connection } from "next/server"
import { Suspense } from "react"
import { Lockup } from "@/components/brand/Lockup"
import { LiveRegion } from "@/components/app-shell/Shell"
import { Blank, GiftLinkFlow } from "@/components/gifts/GiveFlow"
import { getGiftLandingPreview, giftDescription, giftTitle, parseGiftLinkParams } from "@/app/_lib/gift-preview"

// (typed by hand: the generated PageProps needs `next typegen` in the default dist dir)
type Props = { params: Promise<{ slug: string; id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, id } = await params
  await connection()
  const ok = parseGiftLinkParams(slug, id)
  const p = ok ? await getGiftLandingPreview(ok.slug, ok.id).catch(() => null) : null
  const title = giftTitle(p?.pot.name ?? null, p?.link.tone)
  const description = giftDescription(p?.link.tone)
  return { title: { absolute: title }, description, robots: { index: false, follow: false }, openGraph: { title, description } }
}

export default function GiftLinkPage({ params }: Props) {
  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-flow flex-col px-4 pt-12 pb-[calc(16px+env(safe-area-inset-bottom))] md:px-6">
      <div className="mb-6 flex justify-center">
        <Lockup className="h-10 w-auto" />
      </div>
      <Suspense fallback={<GiveSkeleton />}>
        <Body params={params} />
      </Suspense>
      <LiveRegion />
    </main>
  )
}

function GiveSkeleton() {
  return (
    <div aria-hidden className="flex flex-col items-center gap-4">
      <div className="size-20 rounded-lg bg-surface-sunken" />
      <div className="h-8 w-64 rounded-sm bg-surface-sunken" />
      <div className="h-40 w-full rounded-lg bg-surface-sunken" />
    </div>
  )
}

async function Body({ params }: Pick<Props, "params">) {
  const { slug, id } = await params
  await connection()
  const ok = parseGiftLinkParams(slug, id)
  if (!ok) return <Blank kind="not_found" />
  const p = await getGiftLandingPreview(ok.slug, ok.id).catch(() => null)
  return <GiftLinkFlow slug={ok.slug} id={ok.id} initial={p} />
}
