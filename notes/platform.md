# Platform notes: wave 0 foundations

> Written 2026-10-22 by the platform agent. Covers X-01 (without git) and F-01, plus the `@pot/sdk` skeleton and test tooling.
> Sources: `plan/decisions.md` (Rev 7), `plan/frontend-architecture.md` §1, §7, §8, §11, `plan/test-plan.md`, `plan/implementation-plan.md` X-01/F-01, `brand/`, `kb/frontend-stack.md`, `kb/pwa-push.md`.

## What exists

```
pnpm-workspace.yaml     apps/*, packages/*; pnpm 11 allowBuilds
package.json            root scripts (below); packageManager pnpm@11.1.0; engines node >=22.22.2
tsconfig.base.json      ES2022, Bundler resolution, strict + noUncheckedIndexedAccess, allowImportingTsExtensions
vitest.config.ts        Vitest 4 "workspace": test.projects = [apps/web, packages/pot-sdk]
.env.example            every env var named in api-spec / architecture / frontend-architecture (names only)
.gitignore              original entries kept; build/test/cache/credential entries appended
infra/docker-compose.yml  Postgres 17 (container pot-postgres, host port 54329, UTC); init creates pot + pot_test
apps/web/               Next.js 16.4.2 app (F-01)
packages/pot-sdk/       @pot/sdk skeleton (source-only TS)
```

### apps/web
- **Next 16.4.2**, App Router, Turbopack. `next.config.ts` follows frontend-architecture §1.5:
  - `cacheComponents` and `partialPrefetching` are on (D-43), and `@pot/sdk` is in `transpilePackages`;
  - Tailwind runs through the `@tailwindcss/turbopack` loader, with no PostCSS file;
  - the `/p/:slug/r/:id` redirect;
  - the rev4 static security headers: a CSP with `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'none'` and `form-action 'self'`, plus XFO DENY, nosniff, Referrer-Policy, Permissions-Policy and HSTS, the `/sw.js` headers, and the `/j/*` headers.
- **Brand (D-67, D-45)**
  - `scripts/gen-tokens.mjs` reads `tokens.json` and writes `app/tokens.css`. It looks in `docs/brand/` first, then `brand/`. `--check` fails when the file is stale.
  - The output covers the Day and Night colours and shadows as `--pot-*` variables, a `prefers-color-scheme` fallback for when no `data-theme` is set, and the derived `--pot-brand-border` and `--pot-scrim`.
  - It also emits the type, spacing, radius and layout tokens as `--pot-*`.
  - `app/globals.css` maps all of these into `@theme inline` (`bg-brand`, `text-on-brand`, `text-ink-muted`, `font-display`, `text-balance-hero`, `rounded-lg`, `shadow-card`, `max-w-flow`, `max-xs:` …) and maps the shadcn base-nova names (`--primary`, `--background` …) onto brand roles. It also holds the focus ring, the Dynamic Type `@supports` block and the lockup's theme swap.
  - `lib/theme/script.ts` is the no-flash `data-theme` head script from brand README §7. `app/layout.tsx` inlines it, the only `react/no-danger` exception.
  - `lib/theme/useTheme.ts` is a `useSyncExternalStore` hook; its `setTheme('auto'|'day'|'night')` also rewrites the theme-color metas.
  - `app/fonts.ts` loads Gabarito (`--font-display`) and Figtree (`--font-sans`) through next/font. `tabular-nums` works on both, and the e2e test checks it.
  - `app/manifest.ts` mirrors `brand/web/site.webmanifest`, with the plan's `start_url: /pots?source=pwa`, `id`, `scope`, `orientation`, `categories`, `lang` and `dir`.
  - Root `metadata` and `viewport` follow brand README §11: icons from `public/`, OG `/og-image.png` at 1200×630, `summary_large_image`, and the media-matched theme-color pair `#faf9f6` / `#1c1424`.
  - `public/` holds byte-identical copies of the 7 brand web files (checked by U-WEB-09).
  - `components/brand/Lockup.tsx` is the inline lockup SVG, transcribed with its metadata stripped. CSS shows the on-light or on-dark wordmark path depending on the theme.
- **shadcn 4.22.1 `init --defaults`** (base-nova, Base UI) wrote `components.json` and `lib/utils.ts`.
  - `components/ui/button.tsx` was then edited to the brand variants. `secondary` is the **default**. `primary` is the marigold button: 52 px, eggplant text, a Day `brand-deep` border and `brand-deep` when pressed. `outline` is an alias of `secondary`, and there is no `destructive`.
  - `components/ui/sonner.tsx` is wired to `useTheme`; there is no `next-themes`.
- **Providers:** TanStack Query and the Toaster.
- **Placeholder home (`app/page.tsx`):** the lockup as the `<h1>`, the tagline, a sample "$450.00" in `font-display text-balance-hero tabular-nums`, one marigold `primary` button and one secondary button.
- **Folder layout** per frontend-architecture §1.2. Empty folders hold `.gitkeep` files: `app/(app)/…`, `app/j/[slug]`, `app/demo`, `app/api`, `components/*`, `lib/*` (incl. `lib/server/db` for Drizzle), `e2e/{fixtures,mock,testnet,pwa}`, `i18n`, `assets/fonts`, `public/{icons,screens}`.
- **`AGENTS.md`** has a short pointer block. `next dev` appends its own managed block; commit it.

### packages/pot-sdk (`@pot/sdk`)
- Source-only TypeScript with `exports` `.`, `./sign` and `./testing`, and `sideEffects: false`. near-api-js 7.3.1 is an optional peer dependency and a dev dependency.
- The layout follows frontend-architecture §1.4: `config.ts` (`SdkConfig`, `daoIdFromSlug`), `money.ts` (`Micro`), and `types/ read/ actions/ math/ sign/ testing/`, each with a stub `index.ts`.
- `tsconfig` sets `erasableSyntaxOnly` and `verbatimModuleSyntax`. Relative imports use explicit `.ts` extensions.
- ESLint (typescript-eslint) bans the deprecated RPC literal, and allows `near-api-js` imports only in `src/sign/**`.
- **Verified:**
  - Turbopack resolves the `.ts`-suffixed imports in the workspace package. A temporary import in `page.tsx` built and rendered, which closes frontend-architecture §1.4's ⚠️.
  - `node --test` runs the source directly under Node 22.22.2 (`pnpm --filter @pot/sdk test:node`).

## How to run

| Command (repo root) | What it does |
|---|---|
| `pnpm install` | install everything (pnpm 11.1.0, Node 22.22.2) |
| `pnpm dev` | `next dev` for apps/web on :3000 (the only origin NEAR Auth's shared testnet client accepts) |
| `pnpm build` | builds packages (none have a build step yet) and then `next build` |
| `pnpm --filter web build` / `pnpm start` | production build / `next start` |
| `pnpm typecheck` | `next typegen && tsc --noEmit` (web) and `tsc --noEmit` (sdk) |
| `pnpm lint` | ESLint 9 in each package (`eslint-config-next` core-web-vitals + typescript; `react/no-danger`; near.org ban) |
| `pnpm test` | Vitest 4.1.12 over both projects (`web`, `sdk`) |
| `pnpm test:e2e` | Playwright: `next build && next start` on **127.0.0.1:3100**, projects `mobile-day` (390×844, light), `mobile-night` (390×844, dark), `desktop` (1280×800) |
| `pnpm test:contracts` | `cd contracts && cargo test` (contracts are owned by the contracts agent; not run here) |
| `pnpm db:up` / `pnpm db:down` / `pnpm db:psql` | start/stop the local Postgres, open psql |
| `pnpm --filter web gen:tokens` / `check:tokens` | regenerate / verify `app/tokens.css` |
| `pnpm --filter @pot/sdk test:node` | sdk tests under plain `node --test` |

**Local env:** copy `.env.example` to `apps/web/.env.local`. Next reads env files from the app directory.

**Database:**
- Dev: `postgres://pot:pot@localhost:54329/pot`. Tests: `postgres://pot:pot@localhost:54329/pot_test`.
- The server is Postgres 17.11 in UTC, bound to 127.0.0.1, with the named volume `pot-pgdata`.
- It is running now.
- `docker compose -f infra/docker-compose.yml down -v` wipes the data. The init SQL then re-runs on the next start.

## Versions installed (exact pins)

| Area | Packages |
|---|---|
| Toolchain | Node 22.22.2, pnpm 11.1.0, TypeScript 5.9.3, ESLint 9.39.5, eslint-config-next 16.4.2, typescript-eslint 8.72.0 (sdk), @types/node 22.20.5 |
| Framework | next 16.4.2, react / react-dom 19.3.1, @types/react / @types/react-dom 19.3.0 |
| Styling and UI | tailwindcss / @tailwindcss/turbopack 4.3.3, shadcn 4.22.1, @base-ui/react 1.9.0, class-variance-authority 0.7.1, cn 0.5.0, tw-animate-css 1.4.0, lucide-react 1.61.0, sonner 2.0.8, motion 14.4.0, qrcode.react 4.2.0 |
| Data and forms | @tanstack/react-query 5.104.5, react-hook-form 7.90.0, zod 4.6.7, @hookform/resolvers 6.0.0 |
| NEAR | near-api-js 7.3.1, @hot-labs/near-connect 0.11.4, near-connect-hooks 1.1.6, @noble/curves 2.2.0, @noble/hashes 2.2.0, @scure/base 2.2.0, borsh 2.0.0 (the last four are the exact versions near-api-js 7.3.1 pins, so one copy each) |
| Auth | @auth0/auth0-spa-js 2.28.4, jose 6.2.13 |
| Backend | drizzle-orm 0.45.4, drizzle-kit 0.31.11, pg 8.23.1, @types/pg 8.23.1, @vercel/functions 3.10.2, workflow 5.2.3, botid 1.5.11, web-push 3.6.7, @types/web-push 3.6.4, ulid 3.0.2, grammy 1.46.0, server-only / client-only 0.0.1 |
| Tests | vitest 4.1.12, fast-check 4.10.2, msw 3.0.3, @playwright/test 1.64.1 (Chromium 156.0.8078.4, build 1248, downloaded to `~/Library/Caches/ms-playwright`), @axe-core/playwright 4.14.0 |
| Infra | Docker image `postgres:17-alpine` (17.11) |

**`allowBuilds`** in `pnpm-workspace.yaml`. Only `esbuild` is allowed to run scripts (vitest and drizzle-kit need it). These are skipped:
- `sharp`
- `unrs-resolver`
- `msw`
- `@swc/core` (via workflow)
- `browser-tabs-lock` (via auth0-spa-js)
- `cbor-extract` (via workflow)

## Test results at hand-off (2026-10-22)
- `pnpm install`, `typecheck` and `lint` are clean. `pnpm install --frozen-lockfile` reports "Already up to date".
- `pnpm test`: 29 passing.
  - sdk smoke: a version check and a fast-check property on `daoIdFromSlug`.
  - web: **U-WEB-09** (`apps/web/scripts/brand-drift.test.ts`):
    - (a) `tokens.css` is up to date;
    - (b) the 7 `public/` files match `brand/web` by sha256;
    - (c) the WCAG contrast pairs hold in Day and Night.
- `pnpm --filter web build`: `/`, `/_not-found` and `/manifest.webmanifest` are all prerendered static.
- `pnpm test:e2e`: 12 passing, 4 tests in each of the 3 projects:
  1. Home in brand colours:
     - `data-theme` matches the OS scheme, and `body` has the `ground` background;
     - exactly 1 marigold button, `rgb(255, 179, 32)` with `rgb(43, 27, 58)` text;
     - a Day border of 1 px `rgb(184, 120, 0)`, transparent in Night;
     - the primary button is 52 px tall, in Figtree;
     - the amount is Gabarito with `tabular-nums`.
  2. axe (wcag2a/2aa/21aa/22aa): 0 violations.
  3. Security headers (W-08) and the manifest (W-02 subset).
  4. The theme-color pair and `og:image`.
- Screenshots in Day and Night were checked by eye: the lockup's wordmark swaps, and the mark stays the same in both themes.

## Deviations from the plan (and why)

1. **No `@near-js/*` packages were added.** near-api-js v7 merged them into one tree-shakeable package, and kb/frontend-stack.md says "Don't add `@near-js/*` 2.x yourself". near-connect-hooks 1.1.6 depends only on `near-api-js ^7`, so the tree has a single near-api-js.
2. **`tokens.json` is read from `brand/`.** This folder has no `docs/brand/`, because the user made `brand/` read-only and there is no fresh repo yet. The generator and U-WEB-09 check `docs/brand/` first, so they keep working after X-01's copy on Nov 1 with no change.
3. **Postgres 17, not 18.** The user asked for 17. test-plan §1 and §7 say a `postgres:18` CI service container; data-model's quota patterns were tested on 18.4. **X-02 must use the same major in CI as locally**, so either set CI to `postgres:17` or bump `infra/docker-compose.yml` to 18. Also check which major the Neon project runs.
4. **Vitest "workspace" is the root `vitest.config.ts` with `test.projects`.** Vitest 4 removed `vitest.workspace.*`.
5. **No create-next-app.** It runs `git init` (forbidden here) and writes `~/Library/Preferences`. The scaffold was written by hand to match its output for 16.4.2: the cacheComponents and partialPrefetching flags, the Turbopack Tailwind loader, `allowBuilds` for sharp and unrs-resolver, `next typegen` types, and `next dev`'s AGENTS.md. Then `shadcn init` ran for real.
6. **The generator does more than the plan's `tokens.css` sketch.** Besides the colours, it also emits the type, spacing, radius and layout tokens. `@theme inline` points at those variables instead of hand-copied numbers, so U-WEB-09(a) covers them too. The breakpoint `--breakpoint-xs: 22.5rem` stays a literal in `globals.css`, because CSS variables can't be used in media queries.
7. **The pins follow D-40 and the frontend-architecture Choices, not the latest releases:**
   - motion 14.4.0, although 14.5.0 is out;
   - vitest 4.1.12, not 5.0.5;
   - @auth0/auth0-spa-js 2.28.4, not 2.29.0, because the nonce analysis in D-20 was done against 2.28.4;
   - TypeScript 5.9.3 and ESLint 9.
8. **`resend` and `react-email` are not installed.** H-07 means there is no domain and so no email. `grammy` (Phase 2 Telegram) is installed, because it is small.
9. **`near-connect-hooks` is installed but not mounted,** as asked. frontend-architecture §1.1 says the MVP calls the connector directly.
10. **`workflow` 5.2.3 is installed but not wired into `next.config.ts`.** kb/frontend-stack.md warns that any plugin which injects a `webpack` config makes Turbopack `next build` fail. Whoever adds `withWorkflow` should confirm that `pnpm --filter web build` still passes. It also pulls a large dependency tree: `node_modules` is about 930 MB.
11. **Playwright uses the bundled Chromium (build 1248).** test-plan describes the `chrome` channel plus WebKit `iPhone 13`. The phone projects use a 390×844 viewport with `isMobile`/`hasTouch`. WebKit, the 320 px project, the mock RPC server and the M-xx suites come with F-04 and F-17.
12. **Only `button` and `sonner` exist from shadcn.** The other primitives (drawer, dialog, …) are added per feature with `pnpm dlx shadcn@4.22.1 add …`.
13. **Not done here; these are other tasks:**
    - the CI workflow and the SEC-1 `check-pins.mjs` (X-02);
    - copying `kb/`, `plan/` and `brand/` to `docs/`;
    - LICENSE, `.claude/settings.json` and the repo itself (X-01 in a fresh repo; no git per the user);
    - i18n and the jargon lint (F-02).
    The page copy is inline English for now; F-02 moves it to `en.json`.

## What the next agents must know
- **pnpm 11:**
  - a new dependency with an install script fails with `ERR_PNPM_IGNORED_BUILDS`. pnpm then writes `set this to true or false` placeholders into `pnpm-workspace.yaml`; replace them with a real value.
  - `minimumReleaseAge` is 1 day, so versions younger than that are silently skipped.
  - Add dependencies from the repo root with `pnpm --filter web add …` or `pnpm --filter @pot/sdk add …`, and pin exact versions.
- **Cache Components:** `params`, `searchParams`, `cookies()` and `headers()` can only be read inside `<Suspense>`. Segment config exports are banned.
- **`@pot/sdk` code:**
  - relative imports take the `.ts` extension;
  - type-only imports use `import type`;
  - no `enum`, `namespace` or parameter properties (`erasableSyntaxOnly`);
  - near-api-js only under `src/sign/**`.
- **UI:**
  - `<Button>` defaults to secondary; use `variant="primary"` for the screen's single marigold button.
  - Base UI takes `render={<Link …/>}`, not `asChild`.
  - Never hard-code a colour: use the token utilities.
  - A token change means editing `tokens.json` and then running `pnpm --filter web gen:tokens`.
  - `dark:` classes follow `data-theme="night"`.
- **e2e:**
  - `reuseExistingServer` is on locally. A stale `next start` on :3100 would serve an old build, so stop it or set `E2E_BASE_URL`.
  - Headless Chrome can't `pushManager.subscribe`.
- **`typecheck` runs `next typegen`,** which generates `next-env.d.ts` (gitignored) and the global `PageProps`/`LayoutProps` types.
- **Postgres keeps running** (`pot-postgres`, restart `unless-stopped`). Stop it with `pnpm db:down`.
- **Nothing is deployed or linked to Vercel, and no keys exist anywhere.** `.env.example` holds names only, plus the throwaway local DB URL.
