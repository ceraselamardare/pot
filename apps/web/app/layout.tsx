import type { Metadata, Viewport } from "next"
import { t } from "@/i18n/t"
import { THEME_SCRIPT } from "@/lib/theme/script"
import { display, sans } from "./fonts"
import { Providers } from "./providers"
import "./globals.css"

// Tagline = en.json app.description (brand README §9).
const DESCRIPTION = t("app.description")

function appUrl(): URL {
  if (process.env.NEXT_PUBLIC_APP_URL) return new URL(process.env.NEXT_PUBLIC_APP_URL)
  // on Vercel without a custom domain: the project's production URL, else this deployment's URL
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return new URL(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
  if (process.env.VERCEL_URL) return new URL(`https://${process.env.VERCEL_URL}`)
  return new URL("http://localhost:3000")
}

// brand README §11, frontend-architecture §2.7 / §8.1. Icons come from public/ (copied byte-identical from
// brand/web); there are deliberately no app/icon.* or app/apple-icon.* file conventions.
export const metadata: Metadata = {
  metadataBase: appUrl(),
  title: { default: "Pot", template: "%s · Pot" },
  description: DESCRIPTION,
  applicationName: "Pot",
  appleWebApp: { capable: true, title: "Pot", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    siteName: "Pot",
    title: "Pot",
    description: DESCRIPTION,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Pot: group chat money that follows its own rules",
      },
    ],
  },
  twitter: { card: "summary_large_image" }, // no twitter.images: X falls back to og:image
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content", // Chrome Android only; iOS uses visualViewport (KB)
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9f6" }, // Day ground
    { media: "(prefers-color-scheme: dark)", color: "#1c1424" }, // Night ground
  ],
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`} suppressHydrationWarning>
      <head>
        {/* eslint-disable-next-line react/no-danger -- the one allowed inline script: no-flash theme (D-67) */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-ground font-sans text-body text-ink tabular-nums antialiased">
        {/* F-25 keyboard path: the first Tab stop skips the bars and banners (WCAG 2.4.1) */}
        <a
          href="#main"
          className="sr-only rounded-pill bg-surface px-4 py-3 text-label text-ink shadow-card focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:px-4 focus:py-3"
        >
          {t("a11y.skip")}
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
