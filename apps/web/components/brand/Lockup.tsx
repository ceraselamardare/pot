// The Pot lockup (mark + lowercase wordmark), transcribed from brand/logo/pot-lockup-on-light.svg and
// pot-lockup-on-dark.svg (metadata stripped; geometry and colours unchanged). Never recolour or redraw it
// (D-67). Only the wordmark swaps between the on-light (#2B1B3A) and on-dark (#F6F1EA) files by theme;
// the CSS that picks one lives in app/globals.css (.pot-lockup-day / .pot-lockup-night).
// Minimum width 96 px (brand README §2).

/** pot-wordmark.svg's outlines (lowercase "pot", Gabarito ExtraBold), shared with LockupOnBrand. */
export const WORDMARK = "M326 13Q262 13 215.0 -16.0Q168 -45 142.0 -102.0Q116 -159 116 -245Q116 -325 142.5 -382.5Q169 -440 216.5 -471.5Q264 -503 327 -503Q394 -503 444.5 -469.5Q495 -436 523.5 -378.0Q552 -320 552 -245Q552 -170 523.0 -111.5Q494 -53 442.5 -20.0Q391 13 326 13ZM48 190V-490H168L210 -356H201V-144H210V190ZM295 -143Q334 -143 360.5 -171.5Q387 -200 387 -245Q387 -289 360.5 -318.5Q334 -348 295 -348Q256 -348 229.0 -318.5Q202 -289 202 -245Q202 -200 229.0 -171.5Q256 -143 295 -143Z M846 13Q769 13 711.0 -20.0Q653 -53 620.0 -111.0Q587 -169 587 -244Q587 -320 620.0 -378.0Q653 -436 711.0 -469.5Q769 -503 846 -503Q924 -503 982.5 -469.5Q1041 -436 1073.5 -378.0Q1106 -320 1106 -244Q1106 -169 1073.5 -111.0Q1041 -53 982.5 -20.0Q924 13 846 13ZM846 -145Q888 -145 915.0 -172.5Q942 -200 942 -245Q942 -290 915.0 -317.5Q888 -345 846 -345Q805 -345 778.0 -317.5Q751 -290 751 -245Q751 -201 778.0 -173.0Q805 -145 846 -145Z M1395 8Q1308 8 1258.5 -33.0Q1209 -74 1209 -169V-484L1207 -490L1241 -609H1371V-213Q1371 -177 1387.5 -162.0Q1404 -147 1431 -147Q1446 -147 1459.5 -150.0Q1473 -153 1482 -156V-4Q1463 2 1442.0 5.0Q1421 8 1395 8ZM1133 -340V-490H1482V-340Z"

export function Lockup({ className, title = "Pot" }: { className?: string; title?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1265 512"
      role="img"
      aria-label={title}
      className={className}
    >
      <rect width="512" height="512" rx="112" fill="#FFB320" /><g transform="translate(256 262) scale(1.0) translate(-256 -262)"><rect x="72" y="196" width="56" height="40" rx="20" fill="#2B1B3A" /><rect x="384" y="196" width="56" height="40" rx="20" fill="#2B1B3A" /><path d="M108 176 H404 V252 C404 340 340 392 256 392 C222 392 190 383 164 366 L110 394 L128 338 C114 314 108 286 108 252 Z" fill="#2B1B3A" /><rect x="92" y="140" width="328" height="44" rx="22" fill="#2B1B3A" /><circle cx="196" cy="278" r="18" fill="#FFB320" /><circle cx="256" cy="278" r="18" fill="#FFB320" /><circle cx="316" cy="278" r="18" fill="#FFB320" /></g>
      <g transform="translate(602.94 363.50) scale(0.43878)">
        <path className="pot-lockup-day" d={WORDMARK} fill="#2B1B3A" />
        <path className="pot-lockup-night" d={WORDMARK} fill="#F6F1EA" />
      </g>
    </svg>
  )
}
