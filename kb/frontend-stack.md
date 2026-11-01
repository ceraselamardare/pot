# Frontend stack: Next.js 16.4, Tailwind v4, shadcn/ui (Base UI), Motion, TanStack, NEAR libs in Next
> Owner: web. Last verified: 2026-10-21. Legend: ✅ verified · 📄 docs-only · ⚠️ unverified/conflicting

Scope: versions/compat of the planned Pot web stack, NEAR client libs inside Next, copy-jargon lint, test tooling. PWA/service worker/push/install UX live in [pwa-push.md](pwa-push.md). Smoke app (throwaway): `scratchpad/web/pot-smoke` + `scratchpad/web/e2e` (node_modules deleted afterwards).

## TL;DR
- ✅ **The planned stack works together today.** next 16.4.2 + react 19.3 + tailwindcss 4.3.3 + shadcn CLI 4.22.1 (Base UI 1.9.0) + sonner 2.0.8 + motion 14.4 + @tanstack/react-query 5.104.5 + react-hook-form 7.90 + zod 4.6.7 + @hookform/resolvers 6.0.0 + near-api-js 7.3.1 + @hot-labs/near-connect 0.11.4. `next build` (Turbopack) passes in ~3–5 s. At 390×844 in Chrome 155 the following all ran: Drawer, toast, form validation, a live testnet RPC view call, NEAR Connect (6 testnet wallets), the SW, the manifest and axe (0 violations).
- ✅ **Security floor: next ≥ 16.4.1.** GHSA-673q-mjm6-r5xr (critical 9.5, unauthenticated RCE in `use cache`) affects 16.0.0–16.4.0. 16.4.1 also fixes an Image-Optimization SVG RCE and a Server Actions DoS (2026-10-14). Bump react/react-dom to **19.3.1** ("Improve transport protocol" RSC fix); the scaffold pins 19.3.0.
- ✅ **`create-next-app@16.4.2 --yes` turns Cache Components on by default** (`cacheComponents: true`, `partialPrefetching: true`). It also wires Tailwind through the **`@tailwindcss/turbopack` loader (no PostCSS file)**, and pins TS 5.9.3 and ESLint 9.39.5. Two rules follow from Cache Components. (1) Read `params`/`searchParams`/`cookies()`/`headers()` **inside `<Suspense>`**; otherwise `next build` fails (verified on `/p/[slug]`). (2) **Never export `dynamic` / `revalidate` / `fetchCache` / `dynamicParams` / `runtime`** (`maxDuration` is still allowed).
- ❌ **The plan's "vaul bottom sheets" is outdated.** The default shadcn style is now `base-nova`, and `shadcn add drawer` installs a **Base UI Drawer** (`@base-ui/react/drawer`). vaul's README says "This repo is unmaintained" (last release 1.1.2, 2024-12-14); only the `radix-nova`/`new-york-v4` styles still use vaul. Base UI uses a `render` prop, not Radix `asChild`.
- ✅ **near-api-js 7.3.1 runs in client components with zero polyfills** (no `Buffer` in the lib). It adds **+58 KB brotli** to first-load JS for just `JsonRpcProvider` + `formatNearAmount`, so keep it off first-load paths (dynamic `import()` or a fetch-based read helper).
- ✅ **`https://rpc.testnet.near.org` is dead for apps.** It returns HTTP 429 `"WARNING! THIS ENDPOINT IS DEPRECATED! STOP USING IT NOW! Switch to https://fastnear.com…"`. Because the 429 carries no CORS header, browsers report it as a CORS error. `https://rpc.testnet.fastnear.com` answers with `access-control-allow-origin: *` (verified browser call).
- ✅ **pnpm 11 quirks.**
  - Any dependency with an install script fails `pnpm add` with `ERR_PNPM_IGNORED_BUILDS` (exit 1) until it is listed under `allowBuilds:` in `pnpm-workspace.yaml`.
  - `minimumReleaseAge` defaults to 1 day: motion 14.5.0, published 7 h earlier, was silently skipped in favour of 14.4.0.
  - `.npmrc` is auth-only.
- ✅ **Stay on TypeScript 5.9 and ESLint 9.**
  - TS 7.0.2 typechecks fine in `next build`, but `eslint` crashes with "typescript-eslint does not support TS 7.0".
  - ESLint 10 runs, but with unmet peers (`eslint-plugin-import`/`jsx-a11y`/`react` cap at ^9).
  - Set tsconfig `target` ≥ ES2020 (the scaffold has ES2017) so BigInt literals (`10_000n`) compile.
- ✅ **Fonts.** Geist (next/font/google) has `tnum`: digits are proportional by default and equal-width with Tailwind `tabular-nums` (measured). Inter also has `tnum` (📄). Put `tabular-nums` on every amount.
- ✅ **The no-jargon rule is two cheap layers, both tested.** `scripts/lint-copy.mjs` over `i18n/en.json`, plus an ESLint `no-restricted-syntax` regex config for JSX text, UI attributes, template literals and `toast()` strings. Skip next-intl (it has open Cache Components issues). Use a typed `t()` over `en.json` instead.

## Plan check
| Plan claim (the original plan) | Status | Note |
|---|---|---|
| A: Stack "Next.js (App Router) + TypeScript, Tailwind v4, shadcn/ui, Motion, TanStack Query … Vercel" | ✅ confirmed | Versions in Reference. Next ≥ 16.4.1 required (security). |
| A Versions: "@hot-labs/near-connect (0.8.2 seen)" | ❌ corrected | Latest **0.11.4** (2026-05-11). near-connect-hooks **1.1.6** depends on near-api-js ^7. |
| A Versions: "near-api-js" (unpinned) | ✅ | **7.3.1** (2026-08-12). v7 consolidated the `@near-js/*` packages into one tree-shakeable package. Don't add `@near-js/*` 2.x yourself. |
| A Versions: "@fast-auth-near/browser-sdk" | ⚠️ | 1.4.2 depends on **near-api-js ^5.1.1**, `@near-js/*` 1.x/2.x and `react-native-auth0`, so pnpm auto-installs **react-native 0.88**. It builds and imports in Turbopack (79 KB br async chunk) but leaves 2 near-api-js majors in the app → auth. |
| C5: "vaul bottom sheets" | ❌ corrected | shadcn default Drawer = Base UI Drawer; vaul unmaintained. |
| C5: "shadcn/ui (Sheet, Drawer, Dialog, sonner toasts)" | ✅ | All added with CLI 4.22.1 (`base-nova`). The sonner wrapper pulls in `next-themes`. |
| C5: "Inter or Geist with tabular figures, balance at 44 px semibold" | ✅ | Geist `tnum` measured at 44 px/600. |
| C5: "A lint rule over `i18n/en.json` blocks the left column" | ✅ sketched + tested | See Snippets 9–10. |
| C5: "Dynamic Type via rem" | ❌/⚠️ | In iOS Safari, rem alone does not follow the Text Size setting. You need `html { font: -apple-system-body }` (then set the font-family). Untested on device → product-ux. |
| C6: "[PWA: Next.js + serwist service worker]" | ❌ corrected | See pwa-push.md: native Next manifest + hand-written SW. Serwist is incompatible with default Turbopack/Cache Components setups. |
| C8: "Playwright … two contexts (Maya, Leo)" | ✅ | Two `browser.newContext()` instances are storage-isolated (verified). |
| C8: "fast-check property tests for pro-rata math" | ✅ | fast-check 4.10.2 + `node --test`, 2,000 runs of the P-9 invariant pass. |
| Implied polish-day tooling: "Lighthouse" (PWA/a11y checks) | ✅ with change | Lighthouse 13.5.0 categories are performance, accessibility, best-practices, seo and **agentic-browsing**. There is no PWA category (removed in v12). Check installability via DevTools/CDP. |
| Caveats: "Package versions other than near-connect 0.8.2 were not verified" | ✅ now verified | Table below (npm, 2026-10-21). |

## Reference

### Versions (npm registry, 2026-10-21)
| Package | Latest (publish date) | Pin advice for Nov 1 | Notes |
|---|---|---|---|
| next | 16.4.2 (10-15) | `16.4.2` exact | 16.4.0 10-06; 16.4.1 = security release 10-14; canary 16.5.0-canary.21. engines `node >=20.9.0`. |
| react / react-dom | 19.3.1 (10-14) | `19.3.1` | The scaffold pins 19.3.0. 19.3 adds stable `<ViewTransition>`, Fragment refs, `browser()`. |
| typescript | 7.0.2 (07-08); 5.9.3 | `5.9.3` | Scaffold `^5`. TS 7 has no JS API (arrives in 7.1), which breaks typescript-eslint. |
| eslint / eslint-config-next | 10.13.0 / 16.4.2 | `9.39.5` / `16.4.2` | ESLint 9 shows an npm "no longer supported" deprecation but works. |
| tailwindcss / @tailwindcss/turbopack | 4.3.3 (07-16) / 4.3.3 (first published 07-31) | `4.3.3` | v4.3.0 2026-05-08. Tailwind's own docs still show `@tailwindcss/postcss` (also 4.3.3). |
| shadcn (CLI, also a runtime dep for `shadcn/tailwind.css`) | 4.22.1 (10-18) | `4.22.1` | CLI v4 since 2026-03. Base UI default since 2026-07. |
| @base-ui/react | 1.9.0 (10-09) | `1.9.0` | Drawer, Dialog, Button primitives. |
| cn / class-variance-authority / tw-animate-css | 0.5.0 / 0.7.1 / 1.4.0 | as installed | shadcn now imports `cn` from the `cn` package (2026-09). |
| sonner / next-themes | 2.0.8 (08-09) / 0.4.6 | as installed | |
| vaul | 1.1.2 (2024-12-14) | **do not use** | README: "This repo is unmaintained." |
| motion | 14.5.0 (10-21 04:35Z); 14.4.0 (10-19) | `14.5.0` after 10-22 | 13.0 (08-05) removed the optional `@emotion/is-prop-valid`. 14.0 (10-02) removed internal APIs. Import from `motion/react`. |
| @tanstack/react-query | 5.104.5 (10-19) | `5.104.5` | |
| lucide-react | 1.61.0 (10-21); v1.0.0 2026-03-23 | latest 1.6x | shadcn added `^1.60.0`. |
| react-hook-form / zod / @hookform/resolvers | 7.90.0 / 4.6.7 (10-12) / 6.0.0 (10-19) | as listed | resolvers 6.0 only breaks the Effect resolver (needs effect v4). zodResolver is unchanged. |
| near-api-js | 7.3.1 (08-12) | `7.3.1` | ESM+CJS, `sideEffects:false`. Deps: @noble/curves, @noble/hashes, @noble/post-quantum, @scure/base, borsh 2, is-my-json-valid, near-seed-phrase. **engines `node >=22.22.2`**. |
| @hot-labs/near-connect / near-connect-hooks | 0.11.4 (05-11) / 1.1.6 (03-12) | `0.11.4` / `1.1.6` | near-connect is CJS with no deps, 213 KB unpacked. |
| @fast-auth-near/browser-sdk | 1.4.2 (07-24) | → auth | Depends on near-api-js ^5.1.1, @near-js/accounts ^2, elliptic, @auth0/auth0-spa-js, react-native-auth0. |
| @playwright/test | 1.64.1 (10-14) | `1.64.1` | Bundled browsers: chromium 156.0.8078.4 (rev 1248), webkit 27.2, firefox 157. |
| @axe-core/playwright / axe-core | 4.14.0 | `4.14.0` | |
| lighthouse | 13.5.0 (10-21) | n/a (`npx`) | |
| fast-check | 4.10.2 (09-19) | `4.10.2` | |
| web-push (server) | 3.6.7 (2024-01-16) | `3.6.7` | → infra for sending. |
| pnpm | local 11.1.0; latest 11.28.7 / 12.15.0 (10-21) | pin via `packageManager` | The scaffold writes `"packageManager": "pnpm@11.1.0"`. |

### Next.js 16.x facts that matter for Pot
- ✅/📄 **Turbopack is the default bundler for `next dev` and `next build`.** Opt out with `--webpack`. If any `webpack` config is present (including one injected by a plugin), `next build` **fails** unless you pass `--webpack` (bundled docs `upgrading/version-16.md` L130-148).
- 📄 **`proxy.ts` replaces `middleware.ts`.** It runs on Node and exports `proxy`. `middleware.ts` is deprecated and kept only for Edge. The Edge runtime itself is deprecated.
- ✅ **Cache Components** (`cacheComponents` + `partialPrefetching`) is the default for new apps since 16.4 and "will become the default in Next.js 17" (blog). Build output marks such routes `◐ (Partial Prerender)`.
- 📄 Route segment config under Cache Components:
  - Removed: `dynamic`, `dynamicParams`, `revalidate`, `fetchCache`.
  - `runtime` is unsupported ("remove the export even when it is set to `runtime = 'nodejs'`").
  - Kept: `maxDuration`, `preferredRegion`.
  - New: `instant`, `ensureStatic`, `prefetch`.
  - `Date.now()`, `Math.random()` and `crypto.randomUUID()` during prerender are build errors. Move them into Client Components or after `await connection()`.
  - The `export const instant = false` opt-out on a segment (or the codemod `npx @next/codemod@canary cache-components-instant-false ./app`) defers validation.
- 📄 **Versions.**
  - Node ≥ 20.9; TS ≥ 5.1.
  - Supported browsers: Chrome/Edge/Firefox 111+, Safari 16.4+.
  - `next lint` is removed; the `lint` script is just `eslint`.
  - `next build` no longer prints "First Load JS". Use **`next analyze`** (Turbopack Bundle Analyzer): `-o` writes `.next/diagnostics/analyze`, and `next analyze export --route /` streams JSONL.
- ✅ **TS checking.** Since 16.3, `next build` runs the project-local **`tsc` CLI** (`experimental.useTypeScriptCli` defaults to true). It runs `tsc --project tsconfig.json --noEmit … --tsBuildInfoFile .next/cache/.tsbuildinfo` (from `next/dist/lib/typescript/runTypeCheckCli.js`).
- ✅ **AGENTS.md.** `next dev` writes and maintains an `AGENTS.md` block that tells agents to read `node_modules/next/dist/docs/`, which holds version-matched docs (present in 16.4.2: `01-app/…`). Commit it.
- 📄 **Network resilience (16.3, experimental).** `experimental.useOffline: true` + `useOffline()` from `next/offline` keep soft navigations and Server Actions pending while offline and retry on reconnect. A full reload offline still needs a SW.
- 📄 **Playwright helper.** `instant()` from `@next/playwright` asserts what is visible instantly during a navigation (16.3).
- 📄 **`server-only` / `client-only`.** "In Next.js, installing `server-only` or `client-only` is optional." Use `import "server-only"` in relayer/VAPID/DB modules and `import "client-only"` in wallet/push modules.

### What `npx create-next-app@16.4.2 pot --yes --use-pnpm` generates (✅ observed)
```jsonc
// package.json (excerpt)
"dependencies": { "next": "16.4.2", "react": "19.3.0", "react-dom": "19.3.0" },
"devDependencies": { "@tailwindcss/turbopack": "^4", "@types/node": "^20", "@types/react": "^19", "@types/react-dom": "^19",
  "eslint": "^9", "eslint-config-next": "16.4.2", "tailwindcss": "^4", "typescript": "^5" },
"packageManager": "pnpm@11.1.0", "scripts": { "dev": "next dev", "build": "next build", "start": "next start", "lint": "eslint" }
```
```ts
// next.config.ts (as generated)
const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: { rules: { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } } },
};
```
```yaml
# pnpm-workspace.yaml (as generated)
allowBuilds:
  sharp: false
  unrs-resolver: false
```
It also creates `AGENTS.md`, `app/{layout,page}.tsx`, `globals.css` (`@import "tailwindcss"`), Geist + Geist_Mono via `next/font/google`, and tsconfig `target: ES2017`. Side effect: it writes `~/Library/Preferences/create-next-app-nodejs/config.json`. Other options: `--cache-components`, `--react-compiler`, `--biome`, `--rspack`, `--no-agent-feedback`, `--empty`, `--api`.

### shadcn CLI 4.22.1 (✅ observed in the smoke app)
- **`init`.** `pnpm dlx shadcn@4.22.1 init --defaults --yes` (`--defaults` = `--template=next --preset=base-nova`) detects Next and "Tailwind v4" even with the Turbopack loader and no PostCSS. `-b base|radix|aria` picks the primitive library.
- **What it writes.** `components.json` gets `"style":"base-nova"`, `"iconLibrary":"lucide"`, `"tailwind.config":""`. Deps added: `@base-ui/react`, `class-variance-authority`, `cn`, `lucide-react`, `shadcn`, `tw-animate-css`. `lib/utils.ts` becomes `export { cn } from "cn"`. `globals.css` gets `@import "tw-animate-css"; @import "shadcn/tailwind.css"; @custom-variant dark (&:is(.dark *)); @theme inline {…}` with OKLCH tokens.
- **`add`.** `shadcn add drawer sheet dialog sonner --yes` adds `next-themes` + `sonner`.
- **Drawer deps by style** (live registry `ui.shadcn.com/r/styles/<style>/drawer.json`):
  - base-nova: `cn`, `@base-ui/react`
  - radix-nova: `cn`, `vaul`
  - new-york-v4: `cn`, `vaul`
- **Base UI Drawer API.**
  - `Drawer.Root` props: `snapPoints`, `swipeDirection` (default `down`), `modal` (bool | `'trap-focus'`).
  - Parts: `Backdrop`, `Viewport`, `Popup`, `Content`, `Title`, `Description`, `Close`, `SwipeArea`, `Indent`.
  - **`Drawer.VirtualKeyboardProvider`** gives keyboard-aware focus/scroll for sheets with inputs, uses `visualViewport` and exposes `--drawer-keyboard-inset`. The shadcn wrapper does **not** include it; wrap form sheets yourself (📄 docs + code read; not device-tested).
  - CSS vars: `--drawer-height`, `--drawer-swipe-progress`, `--drawer-snap-point-offset`, `--nested-drawers`.
  - The shadcn docs say: add `body { position: relative; }` for iOS Safari.

### NEAR libs inside Next (✅ unless marked)
- **near-api-js 7.3.1.**
  - Imported directly in a `"use client"` module; Turbopack prod build OK.
  - `new JsonRpcProvider({ url }).viewAccount({ accountId: "testnet" })` returned the testnet balance in Chrome via FastNEAR.
  - `lib/index.js` (148 KB) contains 0 `Buffer` references, so no polyfills or `resolveAlias` are needed.
  - v7 release notes: "Replace Buffer usage with Uint8Array and Web Standard APIs" (📄).
  - It also exports `FailoverRpcProvider` (multi-RPC).
- **RPC endpoints, live 2026-10-21** (OPTIONS preflight + POST `status`):

  | URL | Result |
  |---|---|
  | `https://rpc.testnet.near.org` | **429**, `{"code":-429,"message":"WARNING! THIS ENDPOINT IS DEPRECATED! STOP USING IT NOW! Switch to https://fastnear.com or alternative RPC providers at https://docs.near.org/api/rpc/providers"}`; no ACAO header, so the browser reports a CORS failure |
  | `https://rpc.testnet.fastnear.com` | 200, `access-control-allow-origin: *`, allow-headers `*` |
  | `https://test.rpc.fastnear.com` | 200, ACAO `*` |
  | `https://near-testnet.lava.build` | **410 Gone** |
- **@hot-labs/near-connect 0.11.4.**
  - SSR-safe to import (every `window`/`indexedDB`/`localStorage` access is guarded).
  - The constructor starts a manifest fetch and IndexedDB; construct it **only in the browser** (event handler or effect).
  - `network` **defaults to `"mainnet"`**; pass `{ network: "testnet" }`.
  - With dynamic `import()` it becomes its own async chunk (≈13.9 KB compressed). `availableWallets.length === 6` on testnet after `whenManifestLoaded`, with no `walletConnect` configured (wallets needing WalletConnect are filtered out).
  - Per auth's [near-connect.md](near-connect.md): `near-connect-hooks` ships no `"use client"`, so import `NearProvider` only from a client component. Gasless signing only works with wallets declaring `signDelegateActions`.
- **@fast-auth-near/browser-sdk 1.4.2** (→ auth owns the details).
  - `pnpm add` needs `allowBuilds: { browser-tabs-lock: false, secp256k1: false }`; without it, `ERR_PNPM_IGNORED_BUILDS`.
  - pnpm auto-installs peer **react-native@0.88.0** (31 MB) via `react-native-auth0`. It also installs near-api-js 5.1.1, `@near-js/{accounts,transactions}` 1.x and 2.x, and `@near-js/crypto` 1.4.2 (`pnpm peers check`: unmet `@near-js/crypto ^2.0.1`, `keystores`, `providers`).
  - Its public types use near-api-js v5 classes (`Connection`, `near-api-js/lib/transaction`).
  - Dynamic import in Turbopack: builds and evaluates in Chrome with no errors (exports `FastAuthClient`, `FastAuthSigner`, …), 293.8 KB raw / **79.3 KB brotli** async chunk. Runtime login/sign paths were not exercised here.

### Fonts, forms, data
- ✅ **Geist.** `next/font/google` `Geist({ variable: "--font-sans", subsets: ["latin"] })` loads one variable face, "Geist 100 900".
  - Digit widths at 44 px/600: `1111111111` = 172.14 px vs `8888888888` = 283.38 px proportional; 274.56 px for both with `tabular-nums`.
  - `next/font/google` downloads the font at build time. The `geist` npm package 1.8.1 is the offline alternative.
  - 📄 Inter has `tnum`, `zero` and `ss01`.
- ✅ **Forms.** `useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({ resolver: zodResolver(schema) })` with `z.coerce.number<string>()` typechecks (TS 5.9) and validates in the browser.
- 📄 **TanStack Query v5 with the App Router.**
  - Server: always a new `QueryClient`. Browser: a singleton (`environmentManager.isServer()`; the legacy `isServer` boolean still exists in 5.104.5 ✅).
  - Use `staleTime > 0`, and `HydrationBoundary` for RSC prefetch.
  - For Pot, fetch chain/API data client-side; don't prefetch user data in RSC (that would force Suspense/dynamic boundaries under Cache Components).
- 📄 **Motion 14.** Use `motion/react` (re-exports framer-motion: `LazyMotion`, `domAnimation`, `MotionConfig`, `useReducedMotion`; `motion/react-m` for `m`). Motion 13.4 added `AnimateView` (React 19.3 view transitions).

### i18n decision
- ⚠️ **next-intl 4.14.9 supports Next 16**, but `getTranslations()` reads `headers()`, which conflicts with Cache Components/`use cache` (issues amannn/next-intl#1493 and #2229). Not worth it for one locale.
- ✅ **Recommended: typed `t()` over `i18n/en.json`** (Snippet 8). Use `Intl.NumberFormat` for dollars and `Intl.PluralRules` (or `use-intl/core` `createTranslator`) if ICU plurals are needed.

### Test tooling
- ✅ **Playwright 1.64.1.**
  - `chromium.launch({ channel: "chrome" })` drives the installed Chrome 155, avoiding a browser download (the machine's cache only has chromium rev 1228; 1.64 wants 1248).
  - Device descriptors: `iPhone 12/13/14` = viewport **390×664** (screen 390×844, WebKit), `iPhone 15/16` 393×659, `iPhone 16 Pro/17` 402×681, `Pixel 7` 412×839.
  - Use `viewport: {width:390,height:844}` to emulate the installed (standalone) app and `devices['iPhone 13']` for a Safari tab.
- ✅ **Two contexts are isolated:** `localStorage` set in Maya's context is `null` in Leo's.
- ✅ **@axe-core/playwright 4.14.0.** `new AxeBuilder({ page }).withTags(["wcag2a","wcag2aa","wcag21aa","wcag22aa"]).analyze()` gave 0 violations on the smoke page.
- ✅ **Lighthouse 13.5.0** (`npx -y lighthouse@13.5.0 URL --chrome-flags="--headless=new"`).
  - Categories: `performance, accessibility, best-practices, seo, agentic-browsing`. No PWA/installability audits. Default mobile screen **412×823**; override with `--screenEmulation.width=390 --screenEmulation.height=844 --screenEmulation.deviceScaleFactor=3`.
  - Installability: DevTools › Application › Manifest, or CDP `Page.getInstallabilityErrors` (see pwa-push.md).
- ✅ **fast-check 4.10.2** runs under `node --test` (ESM) on Node 22.22.2.

### Smoke test log (2026-10-21, macOS 26 arm64, Node 22.22.2, pnpm 11.1.0)
| Step | Result |
|---|---|
| `npx -y create-next-app@16.4.2 pot-smoke --yes --use-pnpm --disable-git` | ✅ 10.9 s, 353 packages; `next build` 3.4 s |
| `pnpm dlx shadcn@4.22.1 init --defaults --yes`, then `add drawer sheet dialog sonner --yes` | ✅ |
| `pnpm add near-api-js@7.3.1 @hot-labs/near-connect@0.11.4 motion @tanstack/react-query react-hook-form zod @hookform/resolvers web-push` | ✅ motion resolved to 14.4.0 (14.5.0 < 24 h old) |
| `app/p/[slug]/page.tsx` awaiting `params` at top level | ❌ build error "Route "/p/[slug]": Next.js encountered uncached or runtime data during prerendering…". Fixed by moving the `await params` into a child inside `<Suspense>` → `◐ /p/[slug]` |
| `next build` with all libs + `app/manifest.ts` + `public/sw.js` + `app/api/push/route.ts` (web-push) | ✅ ~3–5 s; TypeScript step 0.9–1.7 s |
| Chrome 155, 390×844: Drawer open/validate/submit/close, sonner toast, near-api-js view via FastNEAR, NEAR Connect dynamic import (6 wallets), SW scope `/` controlling after reload, manifest `application/manifest+json`, POST `/api/push` 200, axe 0 violations, console errors 0 | ✅ |
| Same, RPC `rpc.testnet.near.org` | ❌ CORS errors (endpoint deprecated, 429) |
| `@serwist/turbopack` 9.5.13 / bundled `new URL()` SW / Web Push e2e | see pwa-push.md |
| TS 7.0.2 | ✅ `next build` typecheck (catches a planted error) / ❌ `eslint` crash |
| ESLint 10.13.0 | ✅ runs / ⚠️ unmet peers |
| tsconfig `target` ES2017 + BigInt literal | ❌ TS2737. Fixed with `ES2022` **plus deleting `.next/cache/.tsbuildinfo`** (stale incremental info kept the old error) |
| eslint-plugin-react-hooks 7 (`react-hooks/set-state-in-effect`) | flagged `setState` in `useEffect` in my first install/push hooks; rewritten with `useSyncExternalStore` (Snippet 11) |

## Snippets
Tested = built with `next build` 16.4.2 + run in Chrome 155 unless noted.

**1. `pnpm-workspace.yaml`** (✅ the `allowBuilds` behaviour is verified; ⚠️ `minimumReleaseAgeExclude` is untested, from 📄 pnpm docs v10.16+)
```yaml
allowBuilds:            # pnpm 11: every dep with install scripts must be listed (true = run, false = skip)
  sharp: false          # from create-next-app; image optimisation not needed
  unrs-resolver: false  # from create-next-app (eslint import resolver)
  # esbuild: true       # only if you add esbuild (e.g. Serwist)
# minimumReleaseAge: 1440  # default in pnpm 11 (minutes)
# minimumReleaseAgeExclude:  # use for urgent security patches published < 24 h ago
#   - next@16.4.3
```

**2. `next.config.ts`** (✅)
```ts
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [{ source: "/sw.js", headers: [
      { key: "Content-Type", value: "application/javascript; charset=utf-8" },
      { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
      { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
    ] }]
  },
  turbopack: { rules: { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } } },
}
export default nextConfig
```

**3. `app/layout.tsx`** (✅; the font variable fixes shadcn's `--font-sans: var(--font-sans)` self-reference)
```tsx
import type { Metadata, Viewport } from "next"
import { Geist } from "next/font/google"
import { Providers } from "./providers"
import "./globals.css"

const geist = Geist({ variable: "--font-sans", subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Pot",
  appleWebApp: { capable: true, title: "Pot", statusBarStyle: "default" }, // emits mobile-web-app-capable etc.
  formatDetection: { telephone: false },
}
export const viewport: Viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover",
  interactiveWidget: "resizes-content", // Chrome Android only; iOS ignores (see pwa-push.md)
  themeColor: "#ffffff",
}
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-dvh flex flex-col relative">{/* relative: Base UI drawer on iOS */}
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
```

**4. `app/providers.tsx`** (✅ as written; the docs-recommended `getQueryClient()` singleton is equivalent, 📄)
```tsx
"use client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState, type ReactNode } from "react"
import { Toaster } from "@/components/ui/sonner"

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 5_000, retry: 1 } } }))
  return (
    <QueryClientProvider client={qc}>
      {children}
      <Toaster position="top-center" mobileOffset={{ top: "calc(env(safe-area-inset-top) + 8px)" }} />
    </QueryClientProvider>
  )
}
```
(`mobileOffset` accepts `string | number | {top,right,bottom,left}` in sonner 2.0.8 types ✅; the safe-area value itself is untested.)

**5. Cache Components-safe dynamic route** (✅ builds as `◐`)
```tsx
// app/p/[slug]/page.tsx
import { Suspense } from "react"
export default function PotPage({ params }: PageProps<"/p/[slug]">) {
  return (
    <main className="p-4">
      <Suspense fallback={<div className="h-8 w-40 animate-pulse rounded bg-muted" />}>
        <PotTitle params={params} />
      </Suspense>
    </main>
  )
}
async function PotTitle({ params }: { params: PageProps<"/p/[slug]">["params"] }) {
  const { slug } = await params
  return <h1 className="text-2xl font-semibold">Pot {slug}</h1>
}
// Escape hatch if a segment fights you: `export const instant = false` (📄)
```

**6. near-api-js read in a client component + near-connect lazy load** (✅)
```tsx
"use client"
import { useQuery } from "@tanstack/react-query"
import { JsonRpcProvider, formatNearAmount } from "near-api-js" // ~+58 KB br on this route
const provider = new JsonRpcProvider({ url: process.env.NEXT_PUBLIC_NEAR_RPC ?? "https://rpc.testnet.fastnear.com" })

export function NearBalance({ accountId }: { accountId: string }) {
  const q = useQuery({ queryKey: ["viewAccount", accountId], queryFn: () => provider.viewAccount({ accountId }) })
  return <span className="tabular-nums">{q.data ? formatNearAmount(String(q.data.amount), 2) : "…"}</span>
}

export async function openWalletSelector() {           // call from onClick only
  const { NearConnector } = await import("@hot-labs/near-connect")
  const c = new NearConnector({ network: "testnet" })   // default would be "mainnet"
  await c.whenManifestLoaded
  return c                                              // c.availableWallets.length === 6 on testnet (2026-10-21)
}
```

**7. Form: RHF + zod 4 + resolvers 6** (✅)
```tsx
const schema = z.object({
  amount: z.coerce.number<string>().positive("Enter an amount").max(10_000),
  reason: z.string().trim().min(2, "Add a short reason"),
})
const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
  resolver: zodResolver(schema), defaultValues: { amount: "", reason: "" },
})
// <input inputMode="decimal" className="h-12 text-base tabular-nums" {...form.register("amount")} />
// text-base (16px) on inputs avoids iOS focus zoom.
```

**8. Typed `t()` + dollars** (✅ built, rendered "This needs 3 of 5 approvals · $150.00"; needs tsconfig target ≥ ES2020)
```ts
// lib/i18n.ts
import en from "@/i18n/en.json"
export type MessageKey = keyof typeof en
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const s: string = en[key]
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s
}
/** USDC has 6 decimals: pass micro-units as bigint. */
export function formatUsd(micro: bigint): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(micro / 10_000n) / 100)
}
```

**9. Copy lint for `i18n/en.json`** (✅; exits 1 and lists every banned word: `[proposal, DAO, gas, wallet, USDC]`). Wire it as `"lint:copy": "node scripts/lint-copy.mjs"` in CI and pre-commit.
```js
// scripts/lint-copy.mjs
import fs from "node:fs"
export const BANNED = [
  "DAO", "multisig", "treasury", "proposals?", "vote", "council", "bond", "gas", "yocto(?:NEAR)?",
  "storage deposit", "wallets?", "account ID", "transaction hash", "tx hash", "USDC", "Sputnik", "Trezu",
  "NEAR", "blockchain", "crypto", "token", "seed phrase", "private key", "sign(?:ing)? transaction",
]
const re = new RegExp(`\\b(${BANNED.join("|")})\\b`, "gi")
const ALLOW_KEYS = [/^advanced\./] // Settings -> Advanced may say "account ID" / "Trezu"
const file = process.argv[2] ?? "i18n/en.json"
const flat = (o, p = "") => Object.entries(o).flatMap(([k, v]) => typeof v === "object" ? flat(v, p + k + ".") : [[p + k, String(v)]])
const hits = flat(JSON.parse(fs.readFileSync(file, "utf8")))
  .filter(([k]) => !ALLOW_KEYS.some((r) => r.test(k)))
  .map(([k, v]) => [k, v, [...v.matchAll(re)].map((m) => m[0]).join(", ")]).filter(([, , m]) => m)
for (const [k, v, m] of hits) console.error(`${file}: "${k}" contains banned word(s) [${m}]: ${v}`)
process.exit(hits.length ? 1 : 0)
```
Product-ux owns the final word list. "Vote" is banned per C5 ("Approve / organizers").

**10. ESLint layer for TSX copy** (✅ flags `aria-label="Your wallet"`, `<p>Submit a proposal to the DAO</p>`, `` {`Pay ${n} USDC`} `` and `toast.error("Not enough gas")`; ignores `"add_proposal"` and clean copy)
```js
// eslint.jargon.mjs, then in eslint.config.mjs: defineConfig([...nextVitals, ...nextTs, jargon, globalIgnores([...])])
const WORDS = "DAO|multisig|treasury|proposals?|council|bond|gas|yocto(?:NEAR)?|storage deposit|wallets?|account ID|transaction hash|USDC|Sputnik|Trezu|blockchain|seed phrase"
const RE = `/\\b(${WORDS})\\b/i`
const msg = "Crypto jargon in UI copy. Use i18n/en.json wording from the C5 glossary."
export const jargon = {
  files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
  ignores: ["components/advanced/**"],
  rules: { "no-restricted-syntax": ["error",
    { selector: `JSXText[value=${RE}]`, message: msg },
    { selector: `JSXAttribute[name.name=/^(aria-label|title|placeholder|alt|label|description)$/] Literal[value=${RE}]`, message: msg },
    { selector: `JSXExpressionContainer TemplateElement[value.raw=${RE}]`, message: msg },
    { selector: `CallExpression[callee.object.name="toast"] > Literal[value=${RE}]`, message: msg },
    { selector: `CallExpression[callee.name="toast"] > Literal[value=${RE}]`, message: msg },
  ] },
}
```
Optional stricter rule: `react/jsx-no-literals` (eslint-plugin-react is already in eslint-config-next) forces all copy through `t()`.

**11. Browser-only values without `setState` in effects** (✅ passes `react-hooks/set-state-in-effect`; full hooks in pwa-push.md)
```ts
const subscribe = (cb: () => void) => { const mq = matchMedia("(display-mode: standalone)"); mq.addEventListener("change", cb); return () => mq.removeEventListener("change", cb) }
export const useStandalone = () => useSyncExternalStore(subscribe, () => matchMedia("(display-mode: standalone)").matches, () => false)
```

**12. Playwright: Maya + Leo at 390×844, axe, two contexts** (✅ core calls run in `e2e/smoke.mjs`)
```ts
import { test, expect, chromium } from "@playwright/test"
import { AxeBuilder } from "@axe-core/playwright"
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
test("Leo approves Maya's request", async ({ browser }) => {
  const maya = await (await browser.newContext(phone)).newPage()
  const leo = await (await browser.newContext(phone)).newPage()
  await maya.goto("/demo?as=maya"); await leo.goto("/demo?as=leo")
  // …act…
  const axe = await new AxeBuilder({ page: leo }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()
  expect(axe.violations).toEqual([])
})
// playwright.config.ts: projects [{ name: "chrome", use: { channel: "chrome" } }, { name: "webkit", use: { ...devices["iPhone 13"] } }]
```

**13. fast-check property (P-9 pro-rata)** (✅ `node --test`, 2,000 runs)
```js
import fc from "fast-check"; import assert from "node:assert/strict"; import { test } from "node:test"
function settle(balance, contributions) { const total = contributions.reduce((a, b) => a + b, 0n)
  const s = contributions.map((c) => (balance * c) / total); s[s.length - 1] += balance - s.reduce((a, b) => a + b, 0n); return s }
test("settle pays exactly the balance, never negative", () => fc.assert(fc.property(
  fc.bigInt({ min: 0n, max: 10n ** 12n }), fc.array(fc.bigInt({ min: 1n, max: 10n ** 12n }), { minLength: 1, maxLength: 30 }),
  (b, cs) => { const s = settle(b, cs); assert.equal(s.reduce((a, x) => a + x, 0n), b); assert.ok(s.every((x) => x >= 0n)) }), { numRuns: 2000 }))
```

## Gotchas & failure modes
- **Cache Components build errors are the #1 surprise.**
  - Awaiting `params` at page top level fails the build (exact text in the smoke log). Fix with `<Suspense>`, or `export const instant = false` on that segment (📄).
  - Under Cache Components, `generateMetadata` that reads `params` (e.g. OG tags for the `/j/[code]` invite) needs the documented "dynamic marker" pattern or `'use cache'` (📄 migrating guide, untested).
  - Library code that exports `dynamic`/`revalidate` via destructuring (Serwist) is **silently ignored**, not rejected (see pwa-push.md).
- **Base UI vs Radix muscle memory.** AI agents will write `<DrawerTrigger asChild>`; Base UI needs `render={<Button />}` (TypeScript error otherwise). Docs for Radix-based shadcn components don't apply 1:1.
- **shadcn font token.** After `init`, `globals.css` has `--font-sans: var(--font-sans)` while the scaffold layout defines `--font-geist-sans`. Rename the next/font variable to `--font-sans` (verified: body computes to `Geist, "Geist Fallback"`).
- **Motion on the LCP element.** `initial={{ opacity: 0 }}` on the balance hero made it the LCP element with ~397 ms render delay (unthrottled) and LCP 3.3 s in Lighthouse mobile. Render the hero balance without an opacity entrance (`initial={false}`, or animate `transform` only).
- **Deprecated testnet RPC = "CORS error".** Grep the codebase and env for `rpc.testnet.near.org` and `near-testnet.lava.build` (410). Use an env-configured RPC URL plus near-api-js `FailoverRpcProvider`. Infra's [backend-infra.md](backend-infra.md) recommends FastNEAR primary + `near-testnet.drpc.org` failover (it measured `rpc.testnet.near.org` at +3.05 s per call).
- **near-connect defaults to mainnet**; never construct it at module scope in a server-rendered file.
- **Two near-api-js majors** (v7 for Pot + v5 inside the FastAuth SDK). Don't pass v7 `Transaction`/`Action` objects into SDK APIs typed against v5. Keep the SDK behind a dynamic import (→ auth).
- **pnpm 11.**
  - `ERR_PNPM_IGNORED_BUILDS` exits 1 and writes `'<pkg>': set this to true or false` placeholders into `pnpm-workspace.yaml`; you must edit them.
  - `minimumReleaseAge` hides fresh releases (including security patches) for 24 h; use `minimumReleaseAgeExclude` for those.
  - Settings other than auth/registry are ignored in `.npmrc`.
  - `pnpm dlx` also needs >1-day-old versions.
- **Stale TS incremental cache.** After changing `tsconfig.json` compilerOptions, delete `.next/cache/.tsbuildinfo`. Vercel restores `.next/cache` between builds, so the same stale-error risk applies there.
- **TS 7** breaks typescript-eslint, and **ESLint 10** has unmet peers. Keep TS 5.9 + ESLint 9 until after the event.
- **Headless Chrome** cannot `pushManager.subscribe` (it hangs). Test push headed or on a device.
- **create-next-app side effect:** it writes `~/Library/Preferences/create-next-app-nodejs/config.json`.
- **Tailwind loader only applies to Turbopack.** If anyone runs `next build --webpack`, CSS loses Tailwind unless they add `@tailwindcss/postcss` + `postcss.config.mjs`.

## Costs, limits, latencies
| Metric | Value | How |
|---|---|---|
| `next build` (Turbopack) | 3.4 s scaffold; 3.0–4.9 s with full stack; TS step 0.9–1.7 s | ✅ `time pnpm build`, M-series Mac |
| First-load JS `/` (Drawer + form + Motion + near-api-js + TanStack + sonner + Base UI) | 1,137 KB raw / **351 KB gzip / 302 KB brotli**, 9 scripts | ✅ Playwright, sum of script bodies, Node zlib |
| Same `/` without near-api-js | 914 KB raw / 282 KB gzip / **244 KB brotli**, so near-api-js costs ≈ 58 KB br | ✅ |
| `/p/[slug]` (layout + providers only) | 512 KB raw / 152 KB gzip / **131 KB brotli** | ✅ |
| Analyzer, compressed bytes on `/` | next+react ~222 KB, motion-dom+framer ~60 KB, zod 33 KB, @base-ui ~42 KB, near-api-js 14 KB + @noble/curves 20 KB + hashes 7 KB + post-quantum 4.6 KB + borsh 3.6 KB + is-my-json-valid/is-property 6.4 KB, sonner 9 KB, RHF 11 KB, query-core 12 KB | ✅ `next analyze -o` + `next analyze export --route /` (analysis build; indicative) |
| NEAR Connect async chunk | ≈13.9 KB compressed | ✅ analyzer |
| FastAuth SDK async chunk | 293.8 KB raw / 79.3 KB brotli | ✅ Playwright |
| Lighthouse 13.5 mobile (local `next start`) | Perf 92, A11y 100, BP 100, SEO 100; LCP 3.3 s (Motion opacity), TBT 70 ms, CLS 0 | ✅ |
| node_modules | ~879 MB (`du`, pnpm hardlinks) incl. FastAuth SDK's react-native 31 MB | ✅ |

## Open questions / needs a human
- **Decide by Nov 1:** keep `cacheComponents: true` (recommended: scaffold default, docs/AGENTS.md assume it, instant shells) or flip it to `false` if Day-1/2 friction appears (dynamic invite metadata, libraries with segment config). Note: the Oct 14 RCE was in `use cache`; patched in ≥ 16.4.1.
- **Pin on Nov 1:** next 16.4.2 (or newer patch), react/react-dom 19.3.1, typescript 5.9.3, eslint 9.39.5. Re-run `pnpm outdated` and check https://github.com/vercel/next.js/security/advisories.
- → **infra:** Vercel pnpm detection maps lockfile 9.0 to "pnpm 9 or 10" in the docs (updated 2026-08-11), and vercel/vercel#17434 is titled "pnpm 11 and 12 not supported". Honour `packageManager: pnpm@11.x` via Corepack (`ENABLE_EXPERIMENTAL_COREPACK=1`) or `installCommand`, and confirm the Node version on Vercel satisfies near-api-js `engines.node >=22.22.2`. Pick the testnet RPC (FastNEAR; key or rate limits?).
- → **relayer / sputnik / intents / contracts / auth:** `rpc.testnet.near.org` is deprecated (429 with "STOP USING IT NOW"). Point scripts and `near` CLI network configs at FastNEAR or another provider.
- → **auth:** @fast-auth-near/browser-sdk 1.4.2 pulls near-api-js 5 + react-native 0.88 + mismatched `@near-js/*` peers. Is there a newer SDK or a web-only entry?
- → **product-ux:** iOS Dynamic Type needs `html { font: -apple-system-body; font-family: var(--font-sans) }` (rem alone ignores Text Size). Bottom sheets are Base UI (snap points, swipe, keyboard provider), not vaul.
- Human: optionally delete `~/Library/Preferences/create-next-app-nodejs/config.json` (written by this research run; my delete was blocked by the sandbox).

## Sources
- https://nextjs.org/blog/next-16-4 : 16.4 (2026-10-06), Cache Components recommended and default in create-next-app, React 19.3, Turbopack output, `agentUpgrade`/`agentFeedback` : 2026-10-21
- https://nextjs.org/blog/next-16-3 : TS 7 via local tsc, `useOffline`, persistent build cache, `@next/playwright` `instant()` : 2026-10-21
- https://nextjs.org/blog/next-16 : Turbopack default, `--webpack`, `proxy.ts`, Node 20.9 / TS 5.1 / Safari 16.4 floors, removals (`next lint`, ppr flags) : 2026-10-21
- https://nextjs.org/docs/app/api-reference/config/next-config-js/useTypeScriptCli : CLI checker default, TS 7 support : 2026-10-21
- next@16.4.2 bundled docs `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` (L130-148 webpack-config build failure; L1003 First Load JS removed), `…/02-route-segment-config/index.md`, `…/migrating-to-cache-components.md` : segment-config removals, `instant=false`, `runtime` removal, GET handlers : 2026-10-21
- next@16.4.2 `dist/lib/typescript/runTypeCheckCli.js` L20-50 : tsc CLI args and `.next/cache/.tsbuildinfo` : 2026-10-21
- https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr : critical `use cache` RCE, affects 16.0.0–16.4.0, fixed 16.4.1, published 2026-10-14 : 2026-10-21
- https://github.com/vercel/next.js/releases/tag/v16.4.1 : GHSA-673q-mjm6-r5xr, GHSA-2464-fhr4-w9xw, GHSA-p3m5-59mp-jv5r : 2026-10-21
- https://github.com/facebook/react/releases : 19.3.1/19.2.9/19.1.10/19.0.9 "Improve transport protocol"; 19.3.0 features : 2026-10-21
- https://nextjs.org/docs/app/getting-started/server-and-client-components : `server-only`/`client-only` install optional (lastUpdated 2026-10-05) : 2026-10-21
- https://tailwindcss.com/blog : v4.3 (2026-05-08) : 2026-10-21
- https://tailwindcss.com/docs/installation/framework-guides/nextjs : official guide uses `@tailwindcss/postcss` : 2026-10-21
- https://tailwindcss.com/docs/compatibility : Chrome 111 / Safari 16.4 / Firefox 128 : 2026-10-21
- https://ui.shadcn.com/docs/changelog : CLI v4 (2026-03), Base UI default (2026-07), `cn` package (2026-09) : 2026-10-21
- https://ui.shadcn.com/docs/components/drawer : "The drawer component now uses Base UI instead of Vaul"; `body { position: relative }` on iOS : 2026-10-21
- https://ui.shadcn.com/r/styles/base-nova/drawer.json, …/radix-nova/drawer.json, …/new-york-v4/drawer.json : Drawer dependencies per style : 2026-10-21
- https://raw.githubusercontent.com/emilkowalski/vaul/main/README.md : "This repo is unmaintained" : 2026-10-21
- https://base-ui.com/react/components/drawer : Drawer parts, snapPoints, `VirtualKeyboardProvider`, `render` prop : 2026-10-21
- https://raw.githubusercontent.com/motiondivision/motion/main/CHANGELOG.md : Motion 13.0/14.0 breaking changes, AnimateView : 2026-10-21
- https://github.com/react-hook-form/resolvers/releases : v6.0.0 changes only the Effect resolver : 2026-10-21
- https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr : `getQueryClient` pattern, `environmentManager.isServer()` : 2026-10-21
- https://rsms.me/inter/ : Inter `tnum`, `zero`, `ss01` : 2026-10-21
- https://github.com/amannn/next-intl/issues/1493 and https://github.com/amannn/next-intl/issues/2229 : next-intl vs `cacheComponents` / `use cache` : 2026-10-21
- https://github.com/near/near-api-js/releases : v7 consolidation of `@near-js/*`, Buffer removal, 7.3.0 ML-DSA keys : 2026-10-21
- https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/ : TS 7.0 (2026-07-08) has no API; `@typescript/typescript6` side-by-side : 2026-10-21
- https://github.com/pnpm/pnpm/releases/tag/v11.0.0 : pnpm 11 defaults (`minimumReleaseAge` 1440, `strictDepBuilds`, `allowBuilds`, `.npmrc` auth-only) : 2026-10-21
- https://raw.githubusercontent.com/pnpm/pnpm.io/main/docs/settings/dependency-resolution.md : `minimumReleaseAge`, `minimumReleaseAgeExclude` (v10.16+) : 2026-10-21
- https://vercel.com/docs/package-managers : pnpm 6–12 listed; lockfile 9.0 → "pnpm 9 or 10" (updated 2026-08-11) : 2026-10-21
- https://github.com/vercel/vercel/issues/17434 : "pnpm 11 and 12 not supported" (title via search; not opened) ⚠️ : 2026-10-21
- https://github.com/GoogleChrome/lighthouse/releases/tag/v12.0.0 : PWA category removed : 2026-10-21
- https://www.tpgi.com/text-resizing-web-pages-ios-using-dynamic-type/ and https://furbo.org/2024/07/04/dynamic-type-on-the-web/ : `-apple-system-body` for Dynamic Type : 2026-10-21
- npm registry via `npm view <pkg> version time peerDependencies dependencies engines --json` : all versions/dates/peers above : 2026-10-21
- Live curl to `rpc.testnet.near.org`, `rpc.testnet.fastnear.com`, `test.rpc.fastnear.com`, `near-testnet.lava.build` (OPTIONS + POST `status`) : RPC status table : 2026-10-21
- Local smoke test `scratchpad/web/pot-smoke` + `scratchpad/web/e2e/{smoke,measure,tnum,fa,probe,install}.mjs` (Chrome 155.0.8059.85, Playwright 1.64.1) : every ✅ marked "verified/measured" above : 2026-10-21

## Review corrections (2026-10-21, brand)

From the brand integration ([../brand/README.md](../brand/README.md) §5, decisions.md Revision 6: D-45, D-67). The body above is unchanged.
- **The fonts are Gabarito (display) + Figtree (text), per Cerasela's brand.** Geist was a placeholder and Inter isn't used. Where this file says Geist (the TL;DR, "Fonts, forms, data", snippet 3), read Gabarito + Figtree. The `--font-sans` naming advice still holds, and `--font-display` follows the same pattern.
- ✅ **next/font, in next@16.4.2** (`npm pack`; `font-data.json`, `validate-google-font-function-call.js`, `find-font-files-in-css.js`, `capsize-font-metrics.json`):
  - both families are in `next/font/google`. Gabarito: variable `wght` 400-900, normal only. Figtree: variable `wght` 300-900, normal and italic. Both have subsets `latin` and `latin-ext`;
  - omitting `weight` selects the variable axis, and `display` defaults to `'swap'`;
  - `subsets` only marks which files are preloaded, while every `@font-face` from Google's CSS is kept, so latin-ext still loads on demand;
  - capsize metrics exist for both, so `adjustFontFallback` builds a size-adjusted Arial fallback.
- ✅ **Tabular figures.** fontTools 4.67.0 read the latin woff2 files fetched from the css2 API with next 16.4.2's own user agent (Chrome/104), plus the static TTFs:
  - both fonts have GSUB `tnum` (and `pnum`);
  - default figures are proportional (the digit advance spread is 205-232 units per 1000), so `tabular-nums` is mandatory on every amount, exactly as with Geist;
  - with `tnum`, all ten digits share one advance. Gabarito: 540 / 560 / 568 / 576 at 400 / 700 / 800 / 900. Figtree: 623 / 629 / 632 at 400 / 600 / 700;
  - "+" and U+2212 "−" have equal advances; the hyphen-minus is narrower.
  - No workaround is needed.
- **Theme.** Snippet 3's `themeColor: "#ffffff"` becomes the media-matched pair `#faf9f6` / `#1c1424`. Night is in scope, driven by a `data-theme` head script (frontend-architecture §7.1). That plan doesn't mount `next-themes`, so the shadcn sonner wrapper's `useTheme` import is pointed at the app's own hook.
