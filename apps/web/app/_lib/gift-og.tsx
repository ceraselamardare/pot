// The pay-in pages' link preview (1200×630, the invite / claim previews' look): a marigold ground, the Pot's cover tile,
// "Pay Lisbon Trip" (a payment link or page) or "Send a gift to Lisbon Trip ☕" (a gift one) in Gabarito 800 eggplant
// (on-brand), how many people are in it, and the glyph + lowercase wordmark bottom left. No balance, no names. Unknown
// link / page or any error: the static brand image.
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { ImageResponse } from "next/og"
import { t } from "@/i18n/t"
import type { GiftPotVM } from "@/lib/client/mock/gifts"
import type { PayInTone } from "@/lib/gifts"
import { C, COVERS, GLYPH, WORDMARK } from "./og-brand"

export const OG_SIZE = { width: 1200, height: 630 }

const fontPath = (f: string) => join(process.cwd(), "assets", "fonts", f)

async function staticImage(): Promise<Response> {
  const png = await readFile(join(process.cwd(), "public", "og-image.png"))
  return new Response(new Uint8Array(png), { headers: { "content-type": "image/png", "cache-control": "public, max-age=300" } })
}

export async function giftOgImage(read: () => Promise<{ pot: GiftPotVM; tone: PayInTone } | null>): Promise<Response> {
  let pot: GiftPotVM | null = null
  let tone: PayInTone = "payment"
  let fonts: [Buffer, Buffer] | null = null
  try {
    const r = await read()
    pot = r?.pot ?? null
    if (r) tone = r.tone
    if (pot) fonts = await Promise.all([readFile(fontPath("Gabarito-ExtraBold.ttf")), readFile(fontPath("Figtree-SemiBold.ttf"))])
  } catch {
    pot = null
  }
  if (!pot || !fonts) return staticImage()
  return new ImageResponse(<Card pot={pot} tone={tone} />, {
    ...OG_SIZE,
    emoji: "twemoji",
    fonts: [
      { name: "Gabarito", data: fonts[0], weight: 800, style: "normal" },
      { name: "Figtree", data: fonts[1], weight: 600, style: "normal" },
    ],
  })
}

function Card({ pot, tone }: { pot: GiftPotVM; tone: PayInTone }) {
  const [from, to] = COVERS[((pot.cover % 6) + 6) % 6]!
  const headline = tone === "gift" ? t("gift.og.title", { potName: pot.name }) : t("give.og.title.payment", { potName: pot.name })
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", background: C.brand, fontFamily: "Figtree", position: "relative" }}>
      <div
        style={{
          marginTop: 56,
          width: 240,
          height: 240,
          borderRadius: 54,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundImage: `linear-gradient(135deg, ${from}, ${to})`,
          fontSize: 128,
        }}
      >
        {pot.emoji}
      </div>
      <div style={{ marginTop: 26, maxWidth: 1040, display: "flex", justifyContent: "center", textAlign: "center", fontFamily: "Gabarito", fontWeight: 800, fontSize: headline.length > 30 ? 60 : 72, lineHeight: 1.05, color: C.onBrand }}>
        {headline}
      </div>
      <div style={{ marginTop: 12, display: "flex", fontSize: 36, fontWeight: 600, color: C.onBrand }}>{t("gift.members", { n: pot.members })}</div>
      <div style={{ position: "absolute", left: 48, bottom: 40, display: "flex", alignItems: "center", gap: 12 }}>
        <svg width={68} height={48} viewBox="60 128 392 278">
          <rect x="72" y="196" width="56" height="40" rx="20" fill={C.onBrand} />
          <rect x="384" y="196" width="56" height="40" rx="20" fill={C.onBrand} />
          <path d={GLYPH} fill={C.onBrand} fillRule="evenodd" />
          <rect x="92" y="140" width="328" height="44" rx="22" fill={C.onBrand} />
        </svg>
        <svg width={64} height={36} viewBox="38 -619 1454 819">
          <path d={WORDMARK} fill={C.onBrand} />
        </svg>
      </div>
    </div>
  )
}
