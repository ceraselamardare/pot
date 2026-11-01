# QA report: full regression, traceability, CI, security sweep (wave 4)

> Written 2026-10-22 (local 04:10-05:15 EEST, 01:10-02:15 UTC) by the QA + release-readiness engineer.
> Testnet only, every chain-touching run under `scripts/with-testnet-lock.sh`, own build dir `NEXT_DIST_DIR=.next-qa`,
> no git, no deploys. Raw logs were kept in the session scratchpad; the outputs below are copied from them.

> **Rev 9 (2026-11-01):** the live demo (`demo.testnet.ts`, J-1…J-5 on testnet), the test-account sign-in and their tests were
> removed (plan/decisions.md). Rows below that cite them (dev sessions, demo leases, `/api/demo/state`, the pool) are history. The
> testnet suites now sign in through NEAR Connect with the e2e mock wallet and throwaway 0-NEAR accounts; the results of the Rev 9
> run are in §10 at the end.

## 1. Regression matrix (final state: all green)

| # | Layer | Command (repo root unless noted) | Final result (actual output) | Runs |
|---|---|---|---|---|
| 1 | Sputnik artifacts | `cd contracts/res/sputnik && shasum -a 256 -c SHA256SUMS` | `sputnikdao2_testnet_global_278adc7.wasm: OK` · `sputnikdao2_mainnet_v3_2.wasm: OK` · `sputnikdao_factory2_mainnet.wasm: OK` | 1 |
| 2 | Contracts, both Sputnik builds (A `Ea8t…`, B `DtHZ…`, protocol 86) | `cd contracts && cargo test` | **120 passed, 0 failed**, exit 0, 12 min 03 s: pot-hub unit+proptest 21 · t_calibrate 2 · t_close 8 · t_close40 2 (268.6 s) · t_contrib 6 · t_create 18 · t_invite 6 · t_rules 2 · t_safety 8 · t_spend 10 · t_vote 6 · test-usdc 31 | 1 |
| 3 | Contracts ★ on protocol 88 | `POT_SANDBOX_VERSION=2.14.0-rc.4 cargo test -p pot-tests -- t00_ t01_ t10_ t20_ t40_ t50_ t60_ t70_ t89_` | **18 passed** (9 ★ groups × builds A/B), exit 0; harness prints `[harness] sandbox 2.14.0-rc.4 protocol 88` | 1 |
| 4 | Typecheck | `pnpm typecheck` + `pnpm exec tsc -p scripts` | web (`next typegen && tsc`) + sdk clean; scripts clean | 2 |
| 5 | Lint | `pnpm lint` | `lint-copy: 752 strings, 0 banned words` · `messages.d.ts is up to date` · eslint clean (web + sdk) | 2 |
| 6 | Unit + property + DB integration | `pnpm test` (Vitest projects web, sdk, **scripts** (new)) | first run `Test Files 45 passed \| 4 skipped (49)` · `Tests 752 passed \| 21 skipped (773)`; **final** `Test Files 50 passed \| 4 skipped (54)` · `Tests 770 passed \| 21 skipped (791)` (+18 new tests: 2 Q1, 4 Q2, 5 Q3, 3 SEC-1, 4 README drift) | 3 |
| 7 | sdk under plain Node | `pnpm --filter @pot/sdk test:node` | `# tests 3 # pass 3 # fail 0` | 1 |
| 8 | Web build | `cd apps/web && NEXT_DIST_DIR=.next-qa pnpm exec next build` | passes (mock and `NEXT_PUBLIC_DATA_SOURCE=testnet`); 30 static pages; `/`, `/demo` (30 s revalidate), `/pots`, `/requests`, `/you`, `/you/advanced` static, `/p/[slug]` + `/j/[slug]` partial prerender, 24 API routes ƒ | 4 |
| 9 | Mock e2e, all projects (mobile-day, mobile-night, desktop) | `cd apps/web && E2E_PORT=3851 NEXT_DIST_DIR=.next-qa NEXT_PUBLIC_DATA_SOURCE=mock pnpm exec playwright test` | **164 passed, 13 skipped (1.0 m)** before and after the fixes (the 13 skips are per-project gates) | 2 |
| 10 | Integrations tier (fake NEAR Auth issuer, fake RPC, mock wallet) | `cd apps/web && E2E_INT_PORT=3860 NEXT_DIST_DIR=.next-qa pnpm exec playwright test -c e2e/integrations/playwright.config.ts` | **5 passed** (13.4 s; 12.0 s after the fixes): NEAR Auth popup, redirect fallback, new device via "Confirm it's you", wallet sign-in, wallet refusals | 2 |
| 11 | Backend live suite (testnet) | `scripts/with-testnet-lock.sh env LIVE_TESTNET=1 pnpm --filter web exec vitest run server/live --reporter=verbose` | run 1: **2 failed \| 11 passed** (bug Q1 below, the second failure was its cascade: `ERR_PAYOUTS_PENDING`); **run 2: `Test Files 3 passed (3)` · `Tests 13 passed (13)`**, 201 s. Two-phase instant: first answer 3,128 ms, final 8,240 ms | 2 |
| 12 | HTTP end-to-end story | `scripts/with-testnet-lock.sh scripts/run e2e-chain --base http://localhost:3862` (own `next start`) | run 1: `ASSERTION FAILED: Pot holds $450` while the chain showed `"450000000"` (Q2); **run 2: `E2E PASSED in 127 s (19 txs)`**, instant first answer 2,823 ms / final 7,959 ms, close $22.00 × 3, DAO $0.00, hub `closed`, feed 200 with 9 items | 2 |
| 13 | Testnet flows E-a…E-d, E-f | `scripts/with-testnet-lock.sh env E2E_TESTNET=1 E2E_PORT=3863 NEXT_DIST_DIR=.next-qa pnpm --filter web exec playwright test -c e2e/testnet/playwright.config.ts flows.testnet.ts` | runs 1 and 2: E-a, E-b, E-c ✓, **E-d ✘** ("Approvals · 1 of 2" never shown; Q3), E-f not run; **run 3: `5 passed (2.5m)`** (E-a 10.2 s · E-b 35.2 s, was 1.2 m · E-c 11.6 s · E-d 26.3 s · E-f 59.4 s, the new close copy "Pot closed" verified on chain) | 3 |
| 14 | Testnet demo = README judge script J-1…J-5 (E-10) | `… playwright test -c e2e/testnet/playwright.config.ts demo.testnet.ts` | run 1: J-3 ✘ `quota_exceeded` family `spend` (Q4); run 2 ✓ 4 passed (1.2 m); run 3 J-2 ✘ by design (a reused lease at $130 < $320); **run 4 (`E2E_DEMO_FRESH=1`, after all fixes): `4 passed (40.7s)`**, J-4+J-5 23.4 s (was 46.2 s) | 4 |
| 15 | Testnet p2 (rules + close) | `… playwright test … p2.testnet.ts deposit.testnet.ts` | **setup 39.0 s ✓ · P2-a rules $50 limit 23.6 s ✓ · P2-b full close, payouts on chain 1.1 m ✓** | 1 |
| 16 | Testnet 1Click simulator | (same run) | **simulate → arrives → one tap adds it → Pot balance updates: 1.0 m ✓** (`4 passed (3.2m)` for 15 + 16) | 1 |
| 17 | README CLI twins (E-11, new) | `scripts/with-testnet-lock.sh scripts/readme-cli-check.sh` | 7 × `ok`, `info list-keys hub: 1 key(s)`, `README CLI twins: PASS`; a wrong `ROOT` → exit 1 with 6 FAILs | 2 |
| 18 | README drift (new) | `node scripts/check-readme-steps.ts` | `README steps ok: J-1 J-2 J-3 J-4 J-5 J-6 J-7 J-8; J-7 8 commands` | 1 |
| 19 | SEC-1 (new) | `node scripts/check-pins.ts` | `SEC-1 ok: next@16.4.2 react-dom@19.3.1 react@19.3.1` | 1 |
| 20 | Security headers W-08 on a running build | `next start` of `.next-qa` + `curl -sD-` on `/ /pots /p/lisbon-trip /j/lisbon-trip /demo /api/health /sw.js` | all present, see §5 | 1 |

Not re-run: `e2e/testnet/screens.testnet.ts` (read-only screenshot capture; it would overwrite `notes/screens/live-*`).

## 2. Bugs found and fixed (each with a test)

| ID | File | Cause | Fix | Test |
|---|---|---|---|---|
| **Q1** | `apps/web/server/relay/classify.ts` | A relayed vote's `proposalStatus` came only from a `get_proposal` view read after the outcome. An RPC node a block behind answered `Approved` after the DAO's callback had already set `Failed` (the payout to an unregistered payee had failed), so the deciding vote reported `{proposalStatus: "Approved", payout: "failed"}`. Live suite R3 failed; R8 then failed with `ERR_PAYOUTS_PENDING`. | New `voteStatus(viewed, payout)`: the receipts win. A failed payout means `Failed`; a sent payout with a lagging `InProgress` view means `Approved`; otherwise the view stands. | `server/relay/pipeline.test.ts`: 2 new R11 cases (fail before the fix, pass after); live suite 13/13 |
| **Q2** | `scripts/lib/env.ts` | The scripts' `rpc()` had one URL (FastNEAR) and four retries. `e2e-chain`'s balance read returned nothing for the whole 20 s `eventually` window although the chain already had $450, and `eventually` swallowed the error, so the cause can't be proven after the fact; the likely one is FastNEAR rate-limiting this IP right after the live suite (FastNEAR answered 200 again minutes later). | `rpc()` fails over FastNEAR → dRPC on network errors, 408/429/5xx, non-JSON bodies and JSON-RPC rate limits (contract errors don't fail over), in up to 4 rounds with backoff. `eventually()` logs the last value and error when it gives up. | `scripts/lib/env.test.ts` (4 cases) in the new `scripts` Vitest project; `e2e-chain` PASSED |
| **Q3** | `apps/web/lib/client/live/refresh.ts` (new), `queries.ts`, `settle.ts` | **Livelock on the live Pot screen.** Each heartbeat change (seq, balance…) made every change detector call `invalidateQueries`, which **cancels** the bundle fetch in flight and starts another. The cancelled fetches' RPC reads stay queued in the tab's 100/min FIFO token bucket and still run (the trace showed 5-10 bundle fetches starting in the same millisecond and RPC calls paced at exactly 600 ms), so the surviving fetch waited behind them and the next change cancelled it again. On page A the bundle never landed after E-c: the feed missed Ben's $20 spend and Ana's own new $120 request for > 40 s while the hero (heartbeat) moved on, so E-d's "Approvals · 1 of 2" never appeared. The demo passed only because fewer changes overlapped. | `refreshQuery()`: never cancel; if a fetch is in flight, let it land and refetch once afterwards (callers in the same 50 ms burst add nothing). Used by both change detectors; `invalidatePot` now passes `cancelRefetch: false` (settlePot re-reads at the action's block anyway). Also: the open proposals' votes are read through the unbudgeted signing-path client (≤ 1 call per 3 s, only while a proposal is open), so votes never wait behind a saturated queue. | `lib/client/live/refresh.test.ts` (3 cases with a real QueryClient, incl. one showing the old 5-restart behavior), `lib/client/live/queries.test.ts` (2 cases; fails if the budgeted client is used); testnet flows 5/5 (E-b 1.2 m → 35 s), demo J-4+J-5 46 s → 23 s |
| **Q4** | `apps/web/e2e/testnet/playwright.config.ts` | Demo spends are counted per visitor **and per IP net** (`user_spend`, 30/day). The live suite, the B-19 load test and earlier runs all come from one laptop IP, so the demo suite's first spend got `quota_exceeded` (family `spend`) and the UI showed "We couldn't send this right now". Test environment, not a product bug (the cap is intended). | The local test server gets `QUOTA_USER_SPEND=400` (overridable), as the config already does for the faucet and hub caps. | demo suite 4/4 |

Also done (no bug): `spikes/meta-tx/.keys/*.json` were mode 0644; set to 0600 (throwaway testnet keys, gitignored).

## 3. Remaining issues (honest)

1. **The refused-spend state is not exercised on chain.** No testnet or live test makes the hub refuse an instant spend
   after an approved early answer (it needs a race or a payee leaving the token). Covered by `lib/client/machines/spend.test.ts`,
   the live-action mapping (`payoutOf`: `final && inner_failed` → refused) and the backend's classify tests. The flows
   re-run verified the rest of the spend paths and the new close copy on chain.
2. **The demo pool is below target**: `/api/demo/state` → `pool: {ready: 2, leased: 9, target: 3}`. The reconcile cron
   retires expired leases and refills; on this laptop run `scripts/with-testnet-lock.sh scripts/run demo-pool` (≈ 0.12 NEAR per Pot).
3. **CI has never run on GitHub** (no repository). The YAML passes `@action-validator/cli` 0.6.0 and every command
   in it was run locally, but the Ubuntu specifics (Postgres service, `pnpm/action-setup@v6` with pnpm 11, the cargo-near
   installer, the sandbox download on Linux) are unverified until the first push.
4. **The testnet CI job can't pass Vercel Deployment Protection yet**: `e2e/testnet/playwright.config.ts` has no
   protection-bypass cookie step (test-plan §5.2). Fine for an unprotected or local target.
5. `pnpm audit --prod`: one **high**, unpatched upstream (see §5); the CI gate is `--audit-level critical`.
6. The M-3 "report-only" CSP for `script-src` / `connect-src` is not emitted (only the enforced directives are). Not a
   regression; listed for the security owner.
7. Pot count by origin: `get_config.pot_count` = **59** (chain), `sponsored_today` = 29 (UTC day, shared with other
   agents' runs). This QA session created 8 Pots in the dev DB (e2e-chain ×2, flows ×3, p2 ×1, simulator ×1, one pool
   refill kicked by a demo lease) plus the live suite's Pots (2 per run × 2 runs, in `pot_test` schemas).

## 4. Traceability: P-1…P-11 (implementation-plan §1.1) and the contract invariants → passing tests

Test IDs as in test-plan §1. "(new)" = added in this wave. File names are under `apps/web/` unless they start with
`contracts/`, `packages/` or `scripts/`.

| P | Contract (sandbox, A+B) | Unit / property | API / backend | E2E mocked | E2E testnet + live | Gaps |
|---|---|---|---|---|---|---|
| **P-1 Login** | — | U-WEB-05/06 (`keys/device-key-store.test.ts`), U-11 | A-07, A-08, A-21, A-25 (`server/session/session.test.ts`), A-09 (`wallet.test.ts`), A-10, A-30 (`devices.test.ts`, `nearauth.test.ts`), A-28 | M-01 | integrations tier 5/5 (NEAR Auth popup + redirect + new device, wallet); flows E-a/E-b dev sessions; live `relay.live` | live Google login only by hand (`notes/near-auth-manual-test.md`); QA-1/QA-3 device rows |
| **P-2 Creation** | T-01…T-06, T-89, T-90 | U-06, U-07, PR-05 | A-01 (R2), A-02, A-23 | M-06 | flows E-a (create, creator NEAR stays 0, `get_policy` via sdk), p2 setup, live R2, e2e-chain step 4 (5.5 s) | E-05 timing p95 not measured |
| **P-3 Invite + join** | T-50…T-57, T-93 | U-08 | A-01 (R4, R5), A-24 | M-01, M-18 | flows E-b (join from the link, fragment stripped, member in `get_members`), live R4/R5 | in-app browser rows (QA) |
| **P-4 Add money** | T-10…T-17 | U-03, PR-04 | A-04, A-11 | M-02 | flows E-b (others see $150/$250 ≤ 30 s), live R1, e2e-chain step 5, simulator suite | PF-04 "≤ 5 s after finality" not asserted as a number |
| **P-5 Instant spend** | T-20…T-28, T-30, T-31, T-88, T-94 | U-WEB-01 (spend machine), PR-03 | A-04, A-05 (two-phase), Q1 tests | M-03 | flows E-c, demo J-3, live R3 (first 3.1 s ≤ 4 s, final 8.2 s ≤ 10 s), e2e-chain step 6 | refused state on chain (§3.1) |
| **P-6 Group vote** | T-29, T-40…T-46, T-96, T-97 | U-04, U-05, U-07 | A-01 (R11), A-22, Q1 tests | M-04, M-05 | flows E-d (own approval counted, friend approves, `sync` → hub `approved`), demo J-4+J-5, live R3 vote + R9 retry | M-17 "Direct change" cards not built |
| **P-7 Any-chain** | — | `oneclick.test.ts` (31), `deposit.test.tsx` | A-16, A-27 | M-09 (`deposit.spec.ts`) | simulator suite ✓ (testnet) | real 1Click only on mainnet (clip) |
| **P-8 Rules** | T-60…T-62, T-91 | U-06 (300 Tgas) | A-01 (R6, R7, R11) | M-08 (`p2.spec.ts`) | p2 P2-a ✓, live R6 + R7 | — |
| **P-9 Close** | T-70…T-75, T-88, T-92, P-01 | PR-01 (10k), PR-02 (507 vectors Rust ↔ TS), PR-04, U-10 | A-01 (R8, R11) | M-07 (`p2.spec.ts`, `p2.test.tsx`) | flows E-f ✓, p2 P2-b ✓, live R8, e2e-chain step 9 ($22.00 × 3) | — |
| **P-10 Notifications** | — | `pwa.test.ts`, `sw.test.ts` | A-14, A-15 (`notify.test.ts`, incl. a real encrypted push to a local push service) | `pwa.spec.ts` (permission, badge, sw headers) | — | W-04…W-07 on real devices (manual) |
| **P-11 Visibility** | T-01 (`get_policy`, `get_factory_info`) | — | — | M-16 (Advanced "On-chain rules", no Trezu on testnet) | **E-11 `scripts/readme-cli-check.sh` (new)**, demo J-1 | — |
| Security (rev4) | T-89…T-97, PR-05 | U-11 | A-22…A-31 | M-18, M-19 (server side) | live: `demo_forbidden` on the reference Pot | E-12 is a manual run; **SEC-1 (new)** |
| Brand | — | U-WEB-09 | — | M-13, M-15, M-20, M-21, M-22 | — | M-12 visual baselines |

**Contract invariants (contracts-spec §7.1) → tests**, all passing on builds A and B (row 2) unless noted:

| INV | Tests | | INV | Tests |
|---|---|---|---|---|
| 01 auth by predecessor | T-31, T-80, T-81, T-89 | | 11 close math | T-14, T-70…T-75, P-01, T-88, T-92 |
| 02 four proposal kinds | T-30, T-57 | | 12 bounded storage/NEAR | T-02, T-05, T-06, T-44, T-55, T-56, T-83, T-88, T-90…T-92 |
| 03 hub votes only its own | T-20, T-27, T-28a, T-29, T-46, T-85, T-96 | | 13 checked u128 | P-01, T-86 |
| 04 exact kind | T-20 (+ U-07) | | 14 DAO call surface | T-01, T-85 |
| 05 instant iff | T-20…T-25, T-31, T-88, T-94 | | 15 owner powers | T-05, T-82, T-95 |
| 06 reservations | T-03, T-04, T-17, T-24, T-26, T-28b, T-29, T-40…T-42, T-45, T-54, T-74, T-97, PR-03 | | 16 policy template | T-01 (+ policy snapshot unit) |
| 07 callbacks never panic | T-04, T-28a/b, T-80, `unit_time.rs`, `t_calibrate` (contracts D2: manual promise results, not `#[callback_result]`) | | 17 vendored code by hash | T-00, T-01, SHA256SUMS, J-7 `view-account-summary` |
| 08 contributions | T-10…T-17 | | 18 hub spends only for relayers | T-89, T-90, PR-05 |
| 09 joins | T-50…T-55, T-57, T-93 | | 19 config ranges | T-95 |
| 10 rules auth | T-60…T-62, T-91 | | | |

Excluded by plan: T-47, T-48 (`withdraw_request`, Phase 3, not built).

**Gaps closed in this wave:** E-11 CLI twins (`scripts/readme-cli-check.sh`), the README drift check
(`scripts/check-readme-steps.ts` + 4 tests), SEC-1 (`scripts/check-pins.ts` + 3 tests), the X-02 CI workflow.
**Gaps left (not cheap):** M-12 visual baselines, M-14 target-size assertions, M-17 direct-change cards (feature not
built), W-01 installability (CDP in a persistent context), PF-01 bundle budget script, PF-02 Lighthouse, PF-04 latency
summary, the protection-bypass step for testnet CI, and the manual items (AX-02…AX-09 devices, W-04…W-07 push on
devices, QA-1…QA-5, E-12 abuse run, the live Google login).

## 5. Security sweep

**Secrets in the tree** (excluding `node_modules`, `.next*`, `target`):
- gitleaks 8.30.1 (`dir`, default rules, redacted): 11 findings. **Real secrets only in gitignored files**:
  `apps/web/.keys/preview.env` (1), `apps/web/.env.local` (3). The other 7 are false positives, checked one by one
  with values masked: deterministic invite fixture seeds documented as "never real secrets"
  (`lib/client/mock/fixtures.ts` ×2), a test idempotency key (`packages/pot-sdk/src/sign/sign.test.ts`), the public
  shared NEAR Auth testnet client id (`notes/near-auth-manual-test.md` ×2), a tx hash (`notes/backend.md`), a public
  key in an error message (`spikes/meta-tx/out/06-extra.log`).
- `ed25519:` strings of private-key length (80+ base58): 229 in `spikes/` logs and 1Click outputs plus
  `server/features/oneclick/fixtures/dry-quotes.json`; by field name they are **signatures** (`"signature"` 221,
  `Signature:` 8). The only `"private_key"` values (10) are in `spikes/meta-tx/.keys/` (gitignored throwaway testnet
  keys; now mode 0600). `apps/web/.keys/*` and `.env.local` are mode 0600.
- No PEM private keys. One JWT-shaped string: a deliberately invalid bearer in `spikes/oneclick/02-fees-swaptypes.mjs`
  (a negative test). No `*_SECRET=`/`*_KEY=` values outside `.env.local`/`.keys`.
- **Every key location is gitignored** (checked against `.gitignore` with the `ignore` matcher git uses, since there is
  no repo): `apps/web/.keys/`, `spikes/meta-tx/.keys/`, `apps/web/.env.local`, `.near-credentials/`, build and test
  output; `.env.example` is tracked. Custody keys live in the near-cli-rs legacy keychain outside the tree.
- **`.env.example` has no secrets**: every secret name is empty; the only value is the throwaway local DB URL
  `postgres://pot:pot@localhost:54329/…`.

**`pnpm audit --prod`**: `1 vulnerabilities found · Severity: 1 high`: `braces <=3.0.3` (GHSA-vfj7-8cjw-p6xm,
stack-exhaustion DoS on deeply nested glob patterns), path `apps__web > shadcn > @shadcn/registry > fast-glob >
micromatch > braces`. **No patched release exists** (latest braces is 3.0.3, 2024-05-21). It is the shadcn CLI's glob
code, used at build/scaffold time with our own patterns, not reachable from a request. SEC-1 passes (next 16.4.2,
react/react-dom 19.3.1). Options for later: move `shadcn` to devDependencies (its CSS import is build-time) or override
when braces ships a fix.

**Headers on a running build** (`next start`, port 3864): every route (`/`, `/pots`, `/p/lisbon-trip`,
`/j/lisbon-trip`, `/demo`, `/api/health`) sends `Content-Security-Policy: frame-ancestors 'none'; object-src 'none';
base-uri 'none'; form-action 'self'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Permissions-Policy: camera=(), microphone=(), geolocation=()`, `Strict-Transport-Security: max-age=63072000`;
`Referrer-Policy` is `same-origin` on `/j/*` (the invite fragment page) and `strict-origin-when-cross-origin`
elsewhere; `/j/*` is `Cache-Control: private, no-cache, no-store`. `/sw.js`: `Content-Security-Policy: default-src
'self'; script-src 'self'`, `Cache-Control: no-cache, no-store, must-revalidate`. `/demo` without JavaScript contains
"Lisbon Trip", "$450", the banner and three `action="/api/demo/session"` forms; `/api/demo/state` →
`reference.balance "450000000"`, Maya, Sam, Leo.

## 6. CI (X-02)

`.github/workflows/ci.yml`, validated with `npx -y @action-validator/cli@0.6.0` → valid. Jobs:
- `contracts` (path-filtered on PRs): ubuntu-24.04, Rust 1.93.0 (`setup-rust-toolchain@v2`, `build-warnings: ""`),
  cargo-near 0.22.0 by its pinned installer URL, `shasum -c` of the Sputnik wasm, `scripts/build.sh`, unit + proptest,
  then the sandbox suite with `POT_NO_BUILD=1 --test-threads=2` (A and B run inside one suite via `dual!`, so no matrix).
- `contracts-p88`: the ★ filter on `POT_SANDBOX_VERSION=2.14.0-rc.4`.
- `web`: Node 22.22.x, pnpm 11 (from `packageManager`), a `postgres:17-alpine` service on 54329 (same major as
  `infra/docker-compose.yml`), creates `pot_test`, then typecheck, `tsc -p scripts`, lint, the README drift check,
  `pnpm test`, sdk `test:node`, the build, the mock Playwright tier (3 projects) and the integrations tier.
- `security`: SEC-1, `pnpm audit --prod --audit-level critical`, gitleaks 8.30.1 over the full history, and a `git grep`
  for private-key-length `ed25519:` strings.
- `e2e-testnet`: `workflow_dispatch` only, with a `testnet_base_url` input; drives an already deployed preview (demo,
  flows, p2, simulator) and runs the CLI twins. No NEAR keys in GitHub.

## 7. Testnet spend and balances

No top-up was taken from `pot-funds-65k8.testnet` (45.0596 NEAR before and after).

| Account | Start (04:12) | End (05:12) | Δ |
|---|---|---|---|
| `pots.potprev.testnet` (hub) | 9.0880 | 8.0532 | −1.035 (`free_balance` now 2.16 NEAR above the 0.5 reserve) |
| `users.potprev.testnet` (relayer) | 3.4189 | 2.7459 | −0.673 |
| `treasury.potprev.testnet` | 0.5821 | 0.5755 | −0.007 |
| `usdc.potprev.testnet` | 2.1834 | 2.2409 | +0.058 (registrations' storage) |
| `potprev.testnet` / `reserve` | 1.0615 / 0.0997 | unchanged | — |

Consumed ≈ **1.71 NEAR** of preview funds (budget ≤ 4): 2 live runs, 2 e2e-chain runs, 3 flows, 4 demo, 1 p2 +
simulator, plus the pool refills the demo leases triggered. Pots: §3 item 7.

## 8. Cleanup

Deleted `apps/web/.next-*` build dirs (agents' and mine) and every `test-results/` / `playwright-report/` folder at
the end of the wave; `apps/web/.next` was left in place. My servers (ports 3862, 3863, 3864 and the Playwright web
servers) were stopped.

## 9. Human-only items

- Make the repo, push, enable CI and Dependabot; the first CI run verifies §3.3.
- Fill `<APP_URL>` in README.md after a deploy (and replace the mock screenshots with production ones if wanted).
- Lock the hub (delete its key) on the planned date; then run `EXPECT_HUB_LOCKED=1 scripts/readme-cli-check.sh`.
- The live Google login and "Confirm it's you" on `localhost:3000` (`notes/near-auth-manual-test.md`), a real NEAR
  Connect wallet, push on real phones, the device/VoiceOver QA rows, and the E-12 abuse run.
- Decide whether `spikes/` (throwaway, with gitignored keys) belongs in the public repo; the submission plan says no.
- Add a LICENSE file (submission-plan §1.1 row 14).

## 10. Rev 9 run (2026-11-01): live demo and test-account sign-in removed

| Check | Command | Result |
|---|---|---|
| Typecheck | `pnpm typecheck` (+ `pnpm exec tsc -p scripts`) | clean |
| Lint | `pnpm lint` | `lint-copy: 1313 strings, 0 banned words`; eslint 0 problems |
| Unit + DB | `pnpm test` | 56 files passed, 3 skipped; 870 passed, 32 skipped |
| Web build | `cd apps/web && NEXT_DIST_DIR=.next-rm pnpm build` | passes; no `/demo/live`, `/api/demo/*`, `/api/session/dev`, `/api/cron/demo-pool`; no e2e mock wallet code in the output |
| Mock e2e | `E2E_PORT=3797 NEXT_PUBLIC_DATA_SOURCE=mock NEXT_DIST_DIR=.next-rm-mock pnpm exec playwright test` | 204 passed, 21 skipped (mobile-day, mobile-night, desktop) |
| Integrations | `E2E_INT_PORT=3793 NEXT_DIST_DIR=.next-rm-int pnpm exec playwright test -c e2e/integrations/playwright.config.ts` | 5 passed |
| Testnet Playwright | `E2E_TESTNET=1 … playwright test -c e2e/testnet/playwright.config.ts flows p2 deposit` (lock) | flows 5/5, p2 3/3, deposit 1/1 |
| Live | `LIVE_TESTNET=1 … vitest run server/live` (lock) | 2 files, 9 passed |
| HTTP E2E | `scripts/run e2e-chain --base http://localhost:3418` (lock) | `E2E PASSED in 143 s (16 txs)` |

Spend ≈ 0.85 NEAR (notes/deploy.md "Rev 9 spend").
