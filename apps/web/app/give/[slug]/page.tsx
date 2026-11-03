// /give/[slug]: a Pot's public gift page (gifts, hub 1.2.0; notes/gifts-plan.md). Off until a member turns it on
// (••• → Gifts); then anyone can send the Pot a gift here. Shows the cover, the name, how many people are in it, the
// members' one-liner, presets, totals and only givers who chose to be shown. Params are read inside <Suspense>
// (Cache Components); the client island (GiveFlow) keeps it fresh, signs in inline and sends. Never indexed.
import type { Metadata } from "next"
import { connection } from "next/server"
import { Suspense } from "react"
import { Lockup } from "@/components/brand/Lockup"
import { LiveRegion } from "@/components/app-shell/Shell"
import { Blank, GiftPageFlow } from "@/components/gifts/GiveFlow"
import { getGiftPagePreview, giftDescription, giftTitle, parseGiftSlug } from "@/app/_lib/gift-preview"

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  await connection()
  const ok = parseGiftSlug(slug)
  const p = ok ? await getGiftPagePreview(ok).catch(() => null) : null
  const title = giftTitle(p?.on ? p.pot.name : null, p?.tone)
  const description = giftDescription(p?.tone)
  return { title: { absolute: title }, description, robots: { index: false, follow: false }, openGraph: { title, description } }
}

export default function GiftPage({ params }: Props) {
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
  const { slug } = await params
  await connection()
  const ok = parseGiftSlug(slug)
  if (!ok) return <Blank kind="not_found" />
  const p = await getGiftPagePreview(ok).catch(() => null)
  return <GiftPageFlow slug={ok} initial={p} />
}
