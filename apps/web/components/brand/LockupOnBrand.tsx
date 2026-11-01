// The lockup on a marigold ground (the link-preview form, as brand/web/og-image.png and app/j/[slug]/opengraph-image
// draw it): on marigold the mark's own tile would vanish, so the brand uses the eggplant glyph
// (brand/logo/pot-glyph-eggplant.svg, the pot-bubble with its dots cut through) beside the eggplant lowercase
// wordmark (brand/logo/pot-wordmark.svg, the same outlines as Lockup.tsx). Geometry and colour unchanged (#2B1B3A,
// the same in Day and Night: the ground is marigold in both). Never recolour or redraw it (D-67), and only ever on
// a marigold (`brand`) surface. The glyph never appears here without the name.
//
// Sizing: in em, so the proportions live here, not in the caller: the glyph is 4.6em tall, the wordmark 3.5em,
// 1.2em apart. Set the unit with a font-size on `className` (the invite card uses one cqw of its link preview).
// Decorative by default (aria-hidden); pass `title` to make it one image named "Pot".
import { cn } from "@/lib/client/cn"
import { WORDMARK } from "./Lockup"

export function LockupOnBrand({ className, title }: { className?: string; title?: string }) {
  return (
    <span
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={cn("inline-flex items-center gap-[1.2em] leading-none", className)}
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="60 128 392 278" aria-hidden className="h-[4.6em] w-auto">
        <g fill="#2B1B3A">
          <rect x="72" y="196" width="56" height="40" rx="20" />
          <rect x="384" y="196" width="56" height="40" rx="20" />
          <path
            fillRule="evenodd"
            d="M108 176 H404 V252 C404 340 340 392 256 392 C222 392 190 383 164 366 L110 394 L128 338 C114 314 108 286 108 252 Z M178 278 a18 18 0 1 0 36 0 a18 18 0 1 0 -36 0 Z M238 278 a18 18 0 1 0 36 0 a18 18 0 1 0 -36 0 Z M298 278 a18 18 0 1 0 36 0 a18 18 0 1 0 -36 0 Z"
          />
          <rect x="92" y="140" width="328" height="44" rx="22" />
        </g>
      </svg>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="38 -619 1454 819" aria-hidden className="h-[3.5em] w-auto">
        <path d={WORDMARK} fill="#2B1B3A" />
      </svg>
    </span>
  )
}
