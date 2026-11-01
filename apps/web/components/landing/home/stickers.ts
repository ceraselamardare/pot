// The landing page's die-cut stickers (the video's set, marketing/video/public/images/stickers/*.png), converted to
// transparent WebP at 256 and 512 px wide in public/landing/stickers/<name>-<w>.webp (sharp, lossy colour at
// q74-90 with lossless alpha; every 512 px file ≤ 40 KB). `width`/`height` are the 512 px file's pixels, so
// `width / height` is the intrinsic aspect ratio the <Sticker> reserves before the file loads.

export const STICKER_WIDTHS = [256, 512] as const

export const STICKERS = {
  tram: { width: 512, height: 434 },
  pastel: { width: 512, height: 412 },
  groceries: { width: 512, height: 670 },
  boat: { width: 512, height: 588 },
  tickets: { width: 512, height: 507 },
  receipt: { width: 512, height: 826 },
  sunglasses: { width: 512, height: 281 },
  suitcase: { width: 512, height: 517 },
} as const

export type StickerName = keyof typeof STICKERS

export const STICKER_NAMES = Object.keys(STICKERS) as StickerName[]

/** width / height of the sticker art. */
export function stickerRatio(name: StickerName): number {
  const s = STICKERS[name]
  return s.width / s.height
}

/** Public path of one size: /landing/stickers/tram-512.webp */
export function stickerSrc(name: StickerName, width: (typeof STICKER_WIDTHS)[number] = 512): string {
  return `/landing/stickers/${name}-${width}.webp`
}

/** "…/tram-256.webp 256w, …/tram-512.webp 512w" */
export function stickerSrcSet(name: StickerName): string {
  return STICKER_WIDTHS.map((w) => `${stickerSrc(name, w)} ${w}w`).join(", ")
}
