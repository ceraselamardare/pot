// The gift pages' server read (/g/<slug>/<id> a gift link, /give/<slug> the public gift page): what the link preview
// and the first paint show before the browser takes over (lib/client/gifts/data.ts keeps them fresh).
//  - mock data source: the seeded world + the gifts showcase (links made in a browser exist only there: the page's
//    client island finds them);
//  - testnet: our server's gift tables + the hub (server/features/gifts resolveGiftLanding / resolveGiftPage).
// Privacy: only what any gift page may show (the Pot's name, emoji, member count; the link's own amount and note; on
// the public page, givers who chose to be shown). Never a member's name.
import "server-only"
import { t } from "@/i18n/t"
import { IS_LIVE } from "@/lib/client/config"
import { GIFTS_ON } from "@/lib/client/gifts/flag"
import { landingFromWire, pageFromWire } from "@/lib/client/gifts/wire"
import { giftLandingOf, giftPageOf, withGiftShowcase, type GiftLandingVM, type GiftPageVM } from "@/lib/client/mock/gifts"
import { seedWorld } from "@/lib/client/mock/world"
import { GIFT_LINK_ID_RE } from "@/lib/gifts"
import { giftDeps, resolveGiftLanding, resolveGiftPage } from "@/server/features/gifts"

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,40}$/

export const parseGiftSlug = (slug: string): string | null => (SLUG_RE.test(slug) ? slug : null)
export const parseGiftLinkParams = (slug: string, id: string): { slug: string; id: string } | null =>
  SLUG_RE.test(slug) && GIFT_LINK_ID_RE.test(id) ? { slug, id } : null

const mockWorld = (now: number) => withGiftShowcase(seedWorld(now), now)

export async function getGiftLandingPreview(slug: string, id: string, now: number = Date.now()): Promise<GiftLandingVM | null> {
  if (!GIFTS_ON) return null
  if (!IS_LIVE) return giftLandingOf(mockWorld(now), slug, id, now)
  const r = await resolveGiftLanding(giftDeps(), id)
  return r && r.pot.slug === slug ? landingFromWire(r) : null
}

export async function getGiftPagePreview(slug: string, now: number = Date.now()): Promise<GiftPageVM | null> {
  if (!GIFTS_ON) return null
  if (!IS_LIVE) return giftPageOf(mockWorld(now), slug)
  const r = await resolveGiftPage(giftDeps(), slug)
  return r ? pageFromWire(r) : null
}

/** "Send a gift to Lisbon Trip ☕" (the page title and the link preview's). */
export const giftTitle = (potName: string | null): string => (potName ? t("gift.og.title", { potName }) : t("app.name"))
