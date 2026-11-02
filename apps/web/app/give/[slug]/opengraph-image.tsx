// The public gift page's preview: "Send a gift to Lisbon Trip ☕" (app/_lib/gift-og.tsx); the brand image while the
// page is off.
import { giftOgImage, OG_SIZE } from "@/app/_lib/gift-og"
import { getGiftPagePreview, parseGiftSlug } from "@/app/_lib/gift-preview"

export const size = OG_SIZE
export const contentType = "image/png"
export const alt = "Pot"

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  return giftOgImage(async () => {
    const { slug } = await params
    const ok = parseGiftSlug(slug)
    const p = ok ? await getGiftPagePreview(ok) : null
    return p?.on ? p.pot : null
  })
}
