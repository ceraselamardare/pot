import type { NextConfig } from "next"

// Rev 9: the e2e mock wallet (lib/signing/near-connect/e2e-mock-wallet.ts) signs with a key the test puts in
// localStorage. It exists for local Playwright builds only: refuse it on any Vercel build (preview or production)
// and on mainnet, so a shipped bundle can never contain it.
const E2E_MOCK_WALLET = process.env.NEXT_PUBLIC_E2E_MOCK_WALLET === "1"
if (E2E_MOCK_WALLET && (process.env.VERCEL || process.env.VERCEL_ENV || process.env.NEXT_PUBLIC_NETWORK === "mainnet"))
  throw new Error("NEXT_PUBLIC_E2E_MOCK_WALLET=1 is for local test builds only (refused on Vercel and mainnet)")

// frontend-architecture §1.5. Cache Components stay on (D-43): never export dynamic / revalidate /
// fetchCache / dynamicParams / runtime from any segment, and read params/searchParams/cookies()/headers()
// only inside <Suspense>.
const nextConfig: NextConfig = {
  // integrations: NEXT_DIST_DIR=.next-<name> lets a Playwright server build and run beside another agent's `.next`
  // (two builds in one folder clobber each other). Unset = the default `.next`.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  cacheComponents: true,
  partialPrefetching: true,
  transpilePackages: ["@pot/sdk"],
  turbopack: {
    // Tailwind v4 through the Turbopack loader; there is no PostCSS config (kb/frontend-stack.md).
    rules: { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } },
    // Rev 9: the e2e mock wallet is compiled in only for a flagged local test build; every other build gets a stub
    resolveAlias: {
      "pot-e2e-mock-wallet": E2E_MOCK_WALLET ? "./lib/signing/near-connect/e2e-mock-wallet.ts" : "./lib/signing/near-connect/e2e-mock-wallet.off.ts",
    },
  },
  async redirects() {
    // ux-spec IA deep link -> sheet query state (frontend-architecture §2.2)
    return [
      { source: "/p/:slug/r/:id", destination: "/p/:slug?r=:id", permanent: false },
      // the /demo explainer's old step links (plan/design-direction/05 §3.1): /demo?step=4 → /demo/4 (308)
      { source: "/demo", has: [{ type: "query", key: "step", value: "(?<step>[1-6])" }], destination: "/demo/:step", permanent: true },
    ]
  },
  async headers() {
    return [
      // rev4 (review-security M-3): static security headers on every route; no nonce, so Cache Components
      // keeps working. Listed FIRST: for the same key a later matching entry wins (/j/* keeps
      // Referrer-Policy: same-origin, /sw.js its own CSP). Test W-08.
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'",
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
      {
        source: "/j/:path*",
        headers: [
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Robots-Tag", value: "noindex" },
        ],
      },
    ]
  },
}

export default nextConfig
