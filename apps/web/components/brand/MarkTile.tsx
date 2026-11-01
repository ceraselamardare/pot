// The Pot mark on its own: the app-icon tile (brand/logo/pot-mark.svg, metadata stripped; geometry and colours
// unchanged): the marigold #FFB320 tile, the eggplant #2B1B3A pot, marigold typing dots. It is the same tile the
// lockup (Lockup.tsx) starts with. Never recolour or redraw it (D-67); it never changes between Day and Night.
// Use it where the app's icon stands for "Pot" (a notification, an app grid), always next to the name "Pot".
// This is the full drawing, for 33 px and up; at 32 px and below the brand uses pot-mark-small.svg's cut
// (brand README §2).
//
// Decorative by default (aria-hidden; the name beside it is the text); pass `title` to make it one image.
export function MarkTile({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <rect width="512" height="512" rx="112" fill="#FFB320" />
      <rect x="72" y="196" width="56" height="40" rx="20" fill="#2B1B3A" />
      <rect x="384" y="196" width="56" height="40" rx="20" fill="#2B1B3A" />
      <path d="M108 176 H404 V252 C404 340 340 392 256 392 C222 392 190 383 164 366 L110 394 L128 338 C114 314 108 286 108 252 Z" fill="#2B1B3A" />
      <rect x="92" y="140" width="328" height="44" rx="22" fill="#2B1B3A" />
      <circle cx="196" cy="278" r="18" fill="#FFB320" />
      <circle cx="256" cy="278" r="18" fill="#FFB320" />
      <circle cx="316" cy="278" r="18" fill="#FFB320" />
    </svg>
  )
}
