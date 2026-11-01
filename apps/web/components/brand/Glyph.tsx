// The pot-bubble glyph alone (brand/logo/pot-glyph-eggplant.svg and pot-glyph-marigold.svg, geometry unchanged):
// eggplant on Day, marigold on Night, chosen by CSS (.pot-glyph in globals.css). For empty states and loading
// only; never an icon inside a button (brand README §2).
export function Glyph({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="60 128 392 278"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <g className="pot-glyph">
        <rect x="72" y="196" width="56" height="40" rx="20" />
        <rect x="384" y="196" width="56" height="40" rx="20" />
        <path
          fillRule="evenodd"
          d="M108 176 H404 V252 C404 340 340 392 256 392 C222 392 190 383 164 366 L110 394 L128 338 C114 314 108 286 108 252 Z M178 278 a18 18 0 1 0 36 0 a18 18 0 1 0 -36 0 Z M238 278 a18 18 0 1 0 36 0 a18 18 0 1 0 -36 0 Z M298 278 a18 18 0 1 0 36 0 a18 18 0 1 0 -36 0 Z"
        />
        <rect x="92" y="140" width="328" height="44" rx="22" />
      </g>
    </svg>
  )
}
