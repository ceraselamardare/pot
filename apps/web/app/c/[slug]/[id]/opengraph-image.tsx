// A payment link's preview (pay by link, hub 1.1.0), 1200×630 in the invite preview's look: a marigold ground, the
// Pot's cover tile, "Maya sent you $84" in Gabarito 800 eggplant (on-brand), "from Lisbon Trip", and the eggplant
// glyph + lowercase wordmark bottom left. The amount is the link's own (fixed, not a balance); the name follows the
// claim page's rule (claim-preview.ts: only while the link is open). Unknown link or any error: the static brand image.
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { ImageResponse } from "next/og"
import { t } from "@/i18n/t"
import { formatUsd } from "@/lib/client/money"
import type { ClaimLinkVM } from "@/lib/client/paylink/claim"
import { C, COVERS, GLYPH, WORDMARK } from "@/app/_lib/og-brand"
import { getClaimPreview, parseClaimParams } from "./claim-preview"

export const size = { width: 1200, height: 630 }
export const contentType = "image/png"
export const alt = "Pot"

const fontPath = (f: string) => join(process.cwd(), "assets", "fonts", f)

async function staticImage(): Promise<Response> {
  const png = await readFile(join(process.cwd(), "public", "og-image.png"))
  return new Response(new Uint8Array(png), { headers: { "content-type": "image/png", "cache-control": "public, max-age=300" } })
}

export default async function Image({ params }: { params: Promise<{ slug: string; id: string }> }) {
  let p: ClaimLinkVM | null = null
  let fonts: [Buffer, Buffer] | null = null
  try {
    const { slug, id } = await params
    const ok = parseClaimParams(slug, id)
    p = ok ? await getClaimPreview(ok.slug, ok.id) : null
    if (p) fonts = await Promise.all([readFile(fontPath("Gabarito-ExtraBold.ttf")), readFile(fontPath("Figtree-SemiBold.ttf"))])
  } catch {
    p = null
  }
  if (!p || !fonts) return staticImage()
  return new ImageResponse(<Card p={p} />, {
    ...size,
    emoji: "twemoji",
    fonts: [
      { name: "Gabarito", data: fonts[0], weight: 800, style: "normal" },
      { name: "Figtree", data: fonts[1], weight: 600, style: "normal" },
    ],
  })
}

function Card({ p }: { p: ClaimLinkVM }) {
  const [from, to] = COVERS[((p.potCover % 6) + 6) % 6]!
  const amount = formatUsd(BigInt(p.amount), "whole")
  const headline = p.requesterName ? t("claim.og.title", { name: p.requesterName, amount }) : amount
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
        {p.potEmoji}
      </div>
      <div style={{ marginTop: 26, maxWidth: 1000, display: "flex", justifyContent: "center", textAlign: "center", fontFamily: "Gabarito", fontWeight: 800, fontSize: headline.length > 26 ? 60 : 72, lineHeight: 1.05, color: C.onBrand }}>
        {headline}
      </div>
      <div style={{ marginTop: 12, display: "flex", fontSize: 36, fontWeight: 600, color: C.onBrand }}>{t("claim.og.line", { potName: p.potName })}</div>
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
