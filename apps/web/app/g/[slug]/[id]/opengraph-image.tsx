// A gift link's preview: "Send a gift to Lisbon Trip ☕" (app/_lib/gift-og.tsx).
import { giftOgImage, OG_SIZE } from "@/app/_lib/gift-og"
import { getGiftLandingPreview, parseGiftLinkParams } from "@/app/_lib/gift-preview"

export const size = OG_SIZE
export const contentType = "image/png"
export const alt = "Pot"

export default async function Image({ params }: { params: Promise<{ slug: string; id: string }> }) {
  return giftOgImage(async () => {
    const { slug, id } = await params
    const ok = parseGiftLinkParams(slug, id)
    return ok ? ((await getGiftLandingPreview(ok.slug, ok.id))?.pot ?? null) : null
  })
}
