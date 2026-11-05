// CLI-1 / APP-5 (notes/security-audit-2026-11-04.md): the app's Content-Security-Policy. next.config.ts sends it on
// every route as a static header, built once at build time from the same NEXT_PUBLIC_* env the browser bundle inlines
// (so the allowlist always matches the hosts this build talks to). Pure and dependency-free: next.config.ts imports it
// and lib/security/csp.test.ts checks it.
//
// Why these choices (the full reasoning is in notes/frontend.md "Security fixes (2026-11-05)"):
//  - connect-src is the main win. A full-access device key signs silently (CLI-1), so an injected script's best move is
//    to sign a delegate and ship it to its own relayer. With this allowlist fetch / XHR / WebSocket / EventSource /
//    sendBeacon can only reach our origin, our two RPCs, the NEAR Auth tenant and NEAR Connect's wallet hosts; our own
//    relayer only relays the hub / token / Pot calls its policy allows (no AddKey, no plain transfers).
//  - script-src keeps 'unsafe-inline', honestly: Next's App Router streams its RSC payload through inline
//    `self.__next_f.push(...)` scripts and the theme script runs before paint. Nonces would make every page dynamic
//    (Cache Components / partial prerendering off, frontend-architecture D-43) and hashes can't cover streamed
//    payloads. NEAR Connect also runs each wallet in a sandboxed `srcdoc` iframe that INHERITS this policy and
//    injects the wallet's code as an inline <script>. What script-src still does: no script from any other origin, no
//    eval / new Function ('unsafe-eval' only in `next dev`, where React needs it), no plugins (object-src 'none').
//  - Not covered by CSP: an injected script can still navigate the page (top-level navigation has no directive). The
//    second half of CLI-1 (a function-call key for 0-deposit calls) and CLI-2 (DeleteKey on sign-out) close that; both
//    are known limitations, out of scope for this round.

export interface CspEnv {
  NODE_ENV?: string
  VERCEL_ENV?: string
  NEXT_PUBLIC_RPC_URLS?: string
  NEXT_PUBLIC_NEAR_AUTH_DOMAIN?: string
  NEXT_PUBLIC_NEAR_AUTH_BASE_URL?: string
  /** escape hatch: extra connect-src origins (space or comma separated) for a wallet that adds a backend host */
  CSP_EXTRA_CONNECT_SRC?: string
}

/** D-32: FastNEAR first, dRPC as failover (same default as @pot/sdk TESTNET_RPC_URLS). Never rpc.testnet.near.org. */
const DEFAULT_RPC_URLS = ["https://rpc.testnet.fastnear.com", "https://near-testnet.drpc.org"]
const DEFAULT_NEAR_AUTH_DOMAIN = "login.testnet.fast-auth.com"

/**
 * NEAR Connect (@hot-labs/near-connect 0.11.4, lazy-loaded on "I have a NEAR wallet"): the wallet list (manifest) and
 * each testnet wallet's executor script, fetched by the page. Derived from the package's defaults and the live
 * manifest's `executor` URLs for the wallets that declare `features.testnet` (the only ones a testnet build lists).
 */
export const NEAR_CONNECT_HOSTS = [
  "https://raw.githubusercontent.com", // the manifest + Meteor, Ledger, Nightly, NEAR CLI, WalletConnect executors
  "https://cdn.jsdelivr.net", // the manifest's fallback mirror
  "https://wallet.intear.tech", // Intear's executor and its API
  "https://evm-on-near.dev", // the Ethereum-wallets executor
] as const

/**
 * What the testnet wallets' executors call from inside NEAR Connect's sandboxed srcdoc iframe (it inherits this
 * policy, so these must be listed or the wallet breaks). Grepped from the executors; RPC reads go to OUR RPCs because
 * lib/signing/near-connect/wallet.ts passes them as NEAR Connect's `providers`.
 */
export const WALLET_BACKEND_HOSTS = [
  "https://mc.meteorwallet.app", // Meteor's connect backend (HTTP + its bridge socket)
  "wss://mc.meteorwallet.app",
  "https://test.rpc.fastnear.com", // Meteor's / Nightly's built-in testnet RPC when no provider is used
  "wss://logout-bridge-service.intear.tech", // Intear's sign-out bridge
  "https://api.testnet.fastnear.com", // Ledger's account lookup
] as const

/** Wallet icons in NEAR Connect's picker (testnet wallets: Meteor, Nightly / WalletConnect, Ethereum wallets) and
 *  Meteor's loading animation inside its frame. */
export const WALLET_ICON_HOSTS = [
  "https://raw.githubusercontent.com",
  "https://storage.herewallet.app",
  "https://evm-on-near.dev",
  "https://meteorwallet.app",
] as const

/** Web fonts the Meteor and NEAR CLI wallet frames load (their stylesheets and the font files they point at). */
export const WALLET_FONT_HOSTS = ["https://rsms.me", "https://fonts.cdnfonts.com"] as const

/** Intear shows its approval page in a frame inside NEAR Connect's (the others open a window). */
export const WALLET_FRAME_HOSTS = ["https://wallet.intear.tech"] as const

/** Vercel's preview toolbar (preview deployments only; the hosts Vercel documents for a CSP with the toolbar). */
const VERCEL_LIVE = "https://vercel.live"

const list = (v: string | undefined): string[] =>
  (v ?? "")
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)

/** The origin of an http(s)/ws(s) URL, else null (a CSP source must never carry a path, quote or semicolon). */
export function originOf(url: string): string | null {
  try {
    const u = new URL(url)
    if (!["http:", "https:", "ws:", "wss:"].includes(u.protocol)) return null
    return u.origin
  } catch {
    return null
  }
}

const uniq = (xs: (string | null)[]): string[] => [...new Set(xs.filter((x): x is string => !!x))]

/** The RPC origins the browser reads from (NEXT_PUBLIC_RPC_URLS, else the D-32 default pair). */
export function rpcOrigins(env: CspEnv): string[] {
  const urls = list(env.NEXT_PUBLIC_RPC_URLS)
  return uniq((urls.length ? urls : DEFAULT_RPC_URLS).map(originOf))
}

/** The NEAR Auth tenant the browser exchanges its code at (oidc.ts nearAuthConfig: base URL, else the domain). */
export function nearAuthOrigin(env: CspEnv): string | null {
  const domain = env.NEXT_PUBLIC_NEAR_AUTH_DOMAIN || DEFAULT_NEAR_AUTH_DOMAIN
  return originOf(env.NEXT_PUBLIC_NEAR_AUTH_BASE_URL || `https://${domain}`)
}

/** Directive name → sources, in the order they are sent. */
export function cspDirectives(env: CspEnv): [string, string[]][] {
  const dev = env.NODE_ENV === "development"
  const preview = env.VERCEL_ENV === "preview"
  const extra = uniq(list(env.CSP_EXTRA_CONNECT_SRC).map(originOf))
  return [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : []), ...(preview ? [VERCEL_LIVE] : [])]],
    // React style props, motion's inline transforms and NEAR Connect's injected <style> need inline styles
    ["style-src", ["'self'", "'unsafe-inline'", ...WALLET_FONT_HOSTS]],
    // next/font is self-hosted (app/fonts.ts)
    ["font-src", ["'self'", "data:", ...WALLET_FONT_HOSTS, ...(preview ? ["https://assets.vercel.com"] : [])]],
    // our avatars and stickers are same-origin; QR codes and NEAR Connect's built-in icons are data: URLs
    ["img-src", ["'self'", "data:", "blob:", ...WALLET_ICON_HOSTS, ...(preview ? [VERCEL_LIVE, "https://vercel.com"] : [])]],
    [
      "connect-src",
      uniq([
        "'self'",
        ...rpcOrigins(env),
        nearAuthOrigin(env),
        ...NEAR_CONNECT_HOSTS,
        ...WALLET_BACKEND_HOSTS,
        ...extra,
        ...(preview ? [VERCEL_LIVE, "wss://ws-us3.pusher.com"] : []),
      ]),
    ],
    // NEAR Connect's wallet frames are srcdoc (they inherit this policy and need no frame source); NEAR Auth and most
    // wallets' sign pages open as windows; Intear's opens in a frame
    ["frame-src", ["'self'", ...WALLET_FRAME_HOSTS, ...(preview ? [VERCEL_LIVE] : [])]],
    ["child-src", ["'self'"]],
    // the service worker (public/sw.js) only
    ["worker-src", ["'self'"]],
    ["manifest-src", ["'self'"]],
    ["media-src", ["'self'"]],
    ["object-src", ["'none'"]],
    // nothing uses <base>: 'none' is stricter than 'self'
    ["base-uri", ["'none'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
  ]
}

/** The header value: `directive src src; directive src; …`. */
export function contentSecurityPolicy(env: CspEnv = process.env as CspEnv): string {
  return cspDirectives(env)
    .map(([d, srcs]) => `${d} ${srcs.join(" ")}`)
    .join("; ")
}
