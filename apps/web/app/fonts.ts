// D-45 (rev6): Gabarito for display, Figtree for text, self-hosted by next/font (display: swap and a
// size-adjusted fallback are the defaults). No `weight` = the whole variable wght axis.
// `subsets` only picks what is preloaded; latin-ext (ă, ș, ț in names) still loads on demand.
// Both fonts have proportional default figures: every amount needs `tabular-nums` (MoneyText adds it).
import { Figtree, Gabarito } from "next/font/google"

export const display = Gabarito({
  subsets: ["latin"],
  variable: "--font-display",
  fallback: ["Figtree", "system-ui", "sans-serif"],
})

export const sans = Figtree({
  subsets: ["latin"],
  variable: "--font-sans",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
})
