// The per-invite link preview (F-24; design-direction 01 §1; frontend-architecture §2.5), 1200×630 in the
// brand's look (brand/web/og-image.png): a marigold ground, the Pot's cover tile centred in the middle 630 px
// square (chats crop to a square; at thumbnail size the tile is all that's left), the name in Gabarito 800 in
// eggplant `on-brand` (8.9:1), initials-only avatars in member colours with "3 friends are in", and the
// eggplant glyph + lowercase wordmark bottom left. Never a balance (platforms cache previews for days) and never
// names (review-security M-7). Closed Pot: "Closed". Unknown slug or any error: the static brand image.
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { ImageResponse } from "next/og"
import { t } from "@/i18n/t"
import { getOgPreview, type OgPreview } from "./invite-preview"

export const size = { width: 1200, height: 630 }
export const contentType = "image/png"
export const alt = "Pot"

const C = {
  brand: "#ffb320",
  onBrand: "#2b1b3a",
  surface: "#ffffff",
  member: ["#ffd166", "#9ad7c2", "#b8c7ff", "#f5b3c8", "#d7c1f0", "#c9e3a6"],
  brandSoft: "#ffe7a8",
}

// components/pot/CoverTile.tsx COVER_GRADIENTS, as colours
const COVERS: [string, string][] = [
  [C.member[0]!, C.member[3]!],
  [C.member[1]!, C.member[2]!],
  [C.member[4]!, C.member[2]!],
  [C.member[3]!, C.member[4]!],
  [C.member[5]!, C.member[1]!],
  [C.brandSoft, C.member[0]!],
]

const GLYPH =
  "M108 176 H404 V252 C404 340 340 392 256 392 C222 392 190 383 164 366 L110 394 L128 338 C114 314 108 286 108 252 Z M178 278 a18 18 0 1 0 36 0 a18 18 0 1 0 -36 0 Z M238 278 a18 18 0 1 0 36 0 a18 18 0 1 0 -36 0 Z M298 278 a18 18 0 1 0 36 0 a18 18 0 1 0 -36 0 Z"
const WORDMARK =
  "M326 13Q262 13 215.0 -16.0Q168 -45 142.0 -102.0Q116 -159 116 -245Q116 -325 142.5 -382.5Q169 -440 216.5 -471.5Q264 -503 327 -503Q394 -503 444.5 -469.5Q495 -436 523.5 -378.0Q552 -320 552 -245Q552 -170 523.0 -111.5Q494 -53 442.5 -20.0Q391 13 326 13ZM48 190V-490H168L210 -356H201V-144H210V190ZM295 -143Q334 -143 360.5 -171.5Q387 -200 387 -245Q387 -289 360.5 -318.5Q334 -348 295 -348Q256 -348 229.0 -318.5Q202 -289 202 -245Q202 -200 229.0 -171.5Q256 -143 295 -143Z M846 13Q769 13 711.0 -20.0Q653 -53 620.0 -111.0Q587 -169 587 -244Q587 -320 620.0 -378.0Q653 -436 711.0 -469.5Q769 -503 846 -503Q924 -503 982.5 -469.5Q1041 -436 1073.5 -378.0Q1106 -320 1106 -244Q1106 -169 1073.5 -111.0Q1041 -53 982.5 -20.0Q924 13 846 13ZM846 -145Q888 -145 915.0 -172.5Q942 -200 942 -245Q942 -290 915.0 -317.5Q888 -345 846 -345Q805 -345 778.0 -317.5Q751 -290 751 -245Q751 -201 778.0 -173.0Q805 -145 846 -145Z M1395 8Q1308 8 1258.5 -33.0Q1209 -74 1209 -169V-484L1207 -490L1241 -609H1371V-213Q1371 -177 1387.5 -162.0Q1404 -147 1431 -147Q1446 -147 1459.5 -150.0Q1473 -153 1482 -156V-4Q1463 2 1442.0 5.0Q1421 8 1395 8ZM1133 -340V-490H1482V-340Z"

const fontPath = (f: string) => join(process.cwd(), "assets", "fonts", f)

async function staticImage(): Promise<Response> {
  const png = await readFile(join(process.cwd(), "public", "og-image.png"))
  return new Response(new Uint8Array(png), { headers: { "content-type": "image/png", "cache-control": "public, max-age=300" } })
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  let p: OgPreview | null = null
  let fonts: [Buffer, Buffer] | null = null
  try {
    const { slug } = await params
    p = await getOgPreview(slug)
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

function Card({ p }: { p: OgPreview }) {
  const [from, to] = COVERS[((p.cover % 6) + 6) % 6]!
  const shown = p.members.slice(0, 5)
  const line = p.status === "closed" ? t("og.closed") : t("og.members", { n: p.memberCount })
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", background: C.brand, fontFamily: "Figtree", position: "relative" }}>
      <div
        style={{
          marginTop: 52,
          width: 280,
          height: 280,
          borderRadius: 62,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundImage: `linear-gradient(135deg, ${from}, ${to})`,
          fontSize: 150,
        }}
      >
        {p.emoji}
      </div>
      <div
        style={{
          marginTop: 22,
          maxWidth: 900,
          display: "flex",
          justifyContent: "center",
          textAlign: "center",
          fontFamily: "Gabarito",
          fontWeight: 800,
          fontSize: p.name.length > 22 ? 52 : 64,
          lineHeight: 1.08,
          color: C.onBrand,
          lineClamp: 2,
        }}
      >
        {p.name}
      </div>
      <div style={{ position: "absolute", bottom: 40, left: 0, right: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 18 }}>
        {p.status !== "closed" && shown.length > 0 && (
          <div style={{ display: "flex" }}>
            {shown.map((m, i) => (
              <div
                key={i}
                style={{
                  width: 56,
                  height: 56,
                  marginLeft: i === 0 ? 0 : -12,
                  borderRadius: 28,
                  border: `4px solid ${C.surface}`,
                  background: C.member[m.joinIndex % 6],
                  color: C.onBrand,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 20,
                  fontWeight: 600,
                }}
              >
                {m.initials}
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", fontSize: 32, fontWeight: 600, color: C.onBrand }}>{line}</div>
      </div>
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
