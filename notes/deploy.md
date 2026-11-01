# Deploy notes: the testnet preview environment (wave 2)

> Owner: the deploy + backend-integration engineer. Written 2026-10-22. **Testnet only.** The frontend agent reads
> this file for the account ids and env. Status: **deployed, verified, seeded; live tests and the HTTP E2E pass.**

## Account map (root `potprev.testnet`)

| Account | Role | Keys |
|---|---|---|
| `potprev.testnet` | preview root; hub `owner` (set_config) | 1 FAK, near-cli-rs legacy keychain (`~/.near-credentials/testnet`) |
| `pots.potprev.testnet` | **Pot Hub** (rulebot + factory) | 1 FAK, kept until the Nov 12 lock |
| `usdc.potprev.testnet` | **USDC (test)**, 6 decimals | **none: locked** (delete-keys tx `2RweVK5cWkpbCU4sZtUEamU3CPyp8yCmsTPn8GGmZtbf`; `list-keys` is an empty table) |
| `users.potprev.testnet` | **relayer** + parent of user/persona accounts; the hub's only sponsor | recovery FAK (legacy keychain) + 4 pool keys = `RELAYER_KEYS` |
| `treasury.potprev.testnet` | hot demo-dollar float (≈ $992k test) for the faucet and seeding | recovery FAK + 2 pool keys = `TREASURY_KEYS` |
| `reserve.potprev.testnet` | cold supply ($999,000,000 test) | 1 FAK (legacy keychain) |
| `<slug>.pots.potprev.testnet` | one Sputnik DAO per Pot | none, ever |
| `u-<8>.users.potprev.testnet` | dev-session / NEAR Auth users (0 NEAR) | the user's device key |
| `maya` / `sam` / `leo` `[-<k>].users.potprev.testnet` | demo personas | `DEMO_PERSONA_KEY` (kept on preview, also for the reference personas) |

Hub `get_config`: `version 1.0.0`, `owner potprev.testnet`, `usdc usdc.potprev.testnet`,
`dao_code_hash Ea8tHXFSQVszVwGASyzAfLq65DjcRDhkfab4FcPaRpgD` (testnet global Sputnik), `dao_float = min_dao_float = 0.05 NEAR`,
`relayers [users.potprev.testnet]`, default limits except `min_hub_reserve 0.5 NEAR` (the coded minimum; preview budget), `paused false`.
Deployed code = the contracts-wave builds (checked by `scripts/run deploy status` against `view_account.code_hash`):
`pot_hub.wasm` sha256 `06861ce7c8ebcbc0bfd0748d7bba96bf3ce1dd14def955c64609025c8dc8b6ae`,
`test_usdc.wasm` sha256 `8253d2238075a9be7aa350783f507953268dbcafcf8d5ac3b5c3d29db42ac6d6`.

Deploy txs: root `2QDtLgqCnuaiPjiUCd5FnyygK1ZHD4grHiFP8nyCqzsC` (testnet registrar; the faucet answered 429) · accounts
`B1xSTzQE…` (pots) `BceZSfTt…` (usdc) `FR4AtXeJ…` (users) `65HwWmXA…` (treasury) `6e6eXNDY…` (reserve) · token deploy+init
`8QnRwn5oG771acWNAfuSqfTS7jv9HRyQF9ZWi32XeAMZ` · register treasury `B6CctV2C…`, hub `6RyvveqP…` · reserve → treasury $1M
`xMziTaxh5uzaGWZCRvpTF1W6318REuRDMnpLG2HzAgy` · token lock `2RweVK5cWkpbCU4sZtUEamU3CPyp8yCmsTPn8GGmZtbf` · hub deploy+init
`6Hh8TLwsSns3qwM8Bf9V1xQuWnwCmFb4bxCXjoYMR8v7` · relayer pool keys `4KWJruZ1…` `jLi5Kcn2…` `GDwtdgYh…` `2uQjrWNB…` · treasury pool
keys `JCoDGJAw…` `Gv7F9yh9…` · top-ups from the holding account: hub `BH4xz46qdP5rsBkK3h1dP9EYjHW4t5uLgtVj79Yjm76d`, relayer
`ELrApdfugvvRTKZUzDNwqVjeHYu4jhAQ6wrCh1yWYCDg`.

## Demo Pots (seeded through the relayer path: personas sign delegates with `DEMO_PERSONA_KEY`, the relayer submits, the hub sponsors)

| Pot | Kind | State |
|---|---|---|
| **`lisbon-trip.pots.potprev.testnet`** | **reference** (`DEMO_REFERENCE_POT`) | D-61 seeded: $450, Maya/Sam/Leo $150 each, open, 2 of 3 approvals, trip rules ($100 instant, $200 per person), no requests |
| `lisbon-qg6e.pots.potprev.testnet` | pool (`demo_pot` row `ready`) | $450, `maya-qg6e` / `sam-qg6e` / `leo-qg6e` |
| `lisbon-fhq8.pots.potprev.testnet` | pool (`demo_pot` row `ready`) | $450, `maya-fhq8` / `sam-fhq8` / `leo-fhq8` |
| `lisbon-fpcz.pots.potprev.testnet` | pool (`demo_pot` row `ready`) | $450, `maya-fpcz` / `sam-fpcz` / `leo-fpcz` (started by a live test, finished by the script: resumable) |

Reference seeding txs (15): create maya/sam/leo `CnPMkYKL…` `34HaSLRX…` `A5F5mDDw…`, register `F6UCAjWR…` `EPiYfkAn…` `A5DLdER4…`,
fund `Bg98XYBx…` `4PFcLEqR…` `2u2gJELc…`, **create_pot `3VpaA2MPY9LRoiobKFf7vLhNGoSKfY5TCGpV7XAmd2CY`**, join sam `A3FUQBRN…`,
add sam `E5f2JRgz…`, add maya `HM56jUM6…`, join leo `CA6KoGzo…`, add leo `HFy2Vfzi…`. On chain: `ft_balance_of` = `"450000000"`,
`get_members` = 3 × `150000000`, `get_policy` = member (3) + rulebot (`pots.potprev.testnet`), bond `"0"`, `list-keys` of the DAO empty.
The `demo_pot`, `app_user`, `pot`, `invite_meta` and `feed_event` rows are in the local dev DB (`postgres://pot:pot@localhost:54329/pot`,
migrated with `drizzle-kit migrate`). `GET /api/demo/state` returns the reference Pot ($450, Maya/Sam/Leo) and `pool.ready = 3`.

## Env for `apps/web/.env.local` (written by `scripts/run env`; secrets from `apps/web/.keys/preview.env`)

```
NEXT_PUBLIC_NETWORK=testnet
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_HUB_ID=pots.potprev.testnet
NEXT_PUBLIC_USDC_ID=usdc.potprev.testnet
NEXT_PUBLIC_RPC_URLS=https://rpc.testnet.fastnear.com,https://near-testnet.drpc.org
NEXT_PUBLIC_TX_API=https://tx.test.fastnear.com
NEXT_PUBLIC_EXPLORER=https://testnet.nearblocks.io
NEXT_PUBLIC_FLAG_DEV_SESSION=true      FLAG_DEV_SESSION=true
NEXT_PUBLIC_FLAG_DEMO=true             FLAG_DEMO=true
RELAYER_ACCOUNT_ID=users.potprev.testnet
TREASURY_ACCOUNT_ID=treasury.potprev.testnet
DEMO_REFERENCE_POT=lisbon-trip.pots.potprev.testnet
DEMO_POOL_TARGET=3
MPC_SIGN_DEPOSIT_YOCTO=1
RELAYER_FLOOR_NEAR=0.3  RELAYER_CRITICAL_NEAR=0.6  RELAYER_WARN_NEAR=1        (scaled to the ≈ 2 NEAR preview relayer)
QUOTA_GLOBAL_POTS_CREATED=40  QUOTA_GLOBAL_DEV_ACCOUNTS=60  QUOTA_IP_DEV_ACCOUNTS=60  QUOTA_IP_FAUCET_USD=20000000000
                                                                              (local headroom: one laptop runs live tests, E2E, Playwright)
DATABASE_URL / DATABASE_URL_UNPOOLED=postgres://pot:pot@localhost:54329/pot   DATABASE_URL_TEST=…/pot_test
[secret] RELAYER_KEYS (4), TREASURY_KEYS (2), DEMO_PERSONA_KEY, APP_HMAC_SECRET
```

Not set by the script (frontend-owned): `NEXT_PUBLIC_DATA_SOURCE=testnet`, `NEXT_PUBLIC_RELAY_MODE=live`. Add them, or anything else,
**below the marker line** of `.env.local`; `scripts/run env` keeps that part.

## Scripts (`scripts/`, run with `scripts/run <name>`; tsx + `scripts/tsconfig.run.json`, testnet-only)

`scripts/run` maps `@/…` to `apps/web/…`, `@pot/sdk[/sign]` to the workspace package and `near-api-js` to the app's copy, and runs
with `--conditions react-server` so the backend modules' `server-only` guard is a no-op. Typecheck: `pnpm exec tsc -p scripts`.

| Command | What |
|---|---|
| `scripts/run deploy status` | §3.7 smoke checks: get_config, token metadata/supply/registration, code sha256 = local wasm, token keyless, relayer pool, balances (exit 1 on a failed check) |
| `scripts/run deploy accounts \| token \| lock-token \| hub \| redeploy-hub` | the runbook steps, idempotent (each reads the chain first); custody keys stay in the near-cli-rs legacy keychain |
| `scripts/run deploy fund <account> <NEAR>` | top up from the root |
| `scripts/run keys init \| onchain \| show` | generate the hot key pools into `apps/web/.keys/preview.env` (0600, prints public keys only), add them on chain |
| `scripts/run env` | (re)write `apps/web/.env.local` |
| `scripts/run seed-demo --kind reference \| pool [--count n] \| shared` · `--status` | D-61 seeded Pots through the relay pipeline (resumable); `--status` lists `demo_pot` rows and the reference Pot on chain |
| `scripts/run invite new \| sign <secret> <pot> <joiner> \| link <slug> <secret> \| verify …` | invite keys and join signatures (C-10 O5) |
| `scripts/run e2e-chain [--base http://localhost:3418]` | the MVP story over HTTP against `next start` (below) |

E2E: `cd apps/web && NEXT_DIST_DIR=.next-backend pnpm exec next build && NEXT_DIST_DIR=.next-backend pnpm exec next start -p 3418`, then
`scripts/run e2e-chain --base http://localhost:3418` (all under `scripts/with-testnet-lock.sh`; the own distDir keeps other agents' `.next`
intact). Live tests: `scripts/with-testnet-lock.sh env LIVE_TESTNET=1 pnpm --filter web exec vitest run server/live --reporter=verbose`
(≈ 0.2 NEAR per full run; they use the `*_LIVE` key pools only). Ops: `scripts/run demo-pool`, `scripts/run load-demo --base …`,
`curl -H "authorization: Bearer $CRON_SECRET" localhost:3418/api/cron/reconcile`.

## NEAR spent (budget ≤ 18 NEAR from `pot-funds-65k8.testnet`)

The holding account went **26.8684 → 9.3609 NEAR: 17.51 NEAR moved** (13 to the root at creation, then 3.5 to the hub and 1 to the
relayer after the frontend's Playwright runs had used most of the hub's sponsorship float). Nothing else is to be taken from it.

Balances now (2026-10-22 ≈ 02:50 local):

| Account | NEAR | Notes |
|---|---|---|
| `potprev.testnet` | 1.06 | ops gas |
| `pots.potprev.testnet` | 8.52 | ≈ 5.2 is code + state storage; `free_balance` 3.36 (reserve 0.5 kept) ≈ 35 more sponsored Pots |
| `usdc.potprev.testnet` | 2.11 | code + registrations |
| `users.potprev.testnet` | 2.27 | relayer; critical at 0.6 → top up with `scripts/run deploy fund users.potprev.testnet 1` (root) |
| `treasury.potprev.testnet` | 0.29 | + $992,350 test |
| `reserve.potprev.testnet` | 0.10 | + $999,000,000 test |

Consumed so far ≈ 3.2 NEAR (29 sponsored Pots, 16 of them mine: reference + 3 pool + live tests + E2E; the rest are the frontend's
Playwright runs), mostly DAO floats (0.05 each, which stay in the DAOs) plus account creations, registrations and gas.

## Keys and locks

- Token: **locked** (no key). Hub: key kept (the lock is Nov 12, runbook §3.10). DAOs: keyless from birth.
- Reference personas keep `DEMO_PERSONA_KEY` on preview (rev4 step 9 deletes it on prod, C-13). The API refuses demo intents on the
  reference Pot first (`demo_forbidden`, live-tested).
- Hot keys only in `apps/web/.keys/preview.env` and `apps/web/.env.local` (both gitignored, 0600). Custody keys only in the near-cli-rs
  legacy keychain. No key was printed.
- **Key pools are split (wave 3, frontend request 4).** Servers (`next dev`/`start`, `scripts/run …`, Playwright) use `RELAYER_KEYS` (4) /
  `TREASURY_KEYS` (2) and coordinate through the dev DB's `lease` rows. The live tests (own `pot_test` schemas, so own lease rows) use
  **only** `RELAYER_KEYS_LIVE` (4) / `TREASURY_KEYS_LIVE` (2) from `apps/web/.keys/preview.env`, split per live file
  (`server/live/harness.ts` `liveSlice`); `scripts/run env` never copies them into `.env.local`. Added on chain 2026-10-22 by
  `scripts/run keys init-live` + `scripts/with-testnet-lock.sh scripts/run keys onchain`: `users.potprev.testnet` AddKey txs
  `CzuiYJEn9kzYLdS1YEe259BEv9LDLdueD3kM72pzkgsK` `65cejShjJwgjeoim6wmsTLGuMdwb5r8iqt7cKtAM2DA8` `DJ7o2TcGWpVtHXZ4UTz6EsMjL3mm8LYENmBhwZpmmeCa`
  `4Hp2fZyyoaWt74voDPbSTtnUbh3z29MBz6BRKrhCzWD2` (now 8 pool + recovery), `treasury.potprev.testnet` `711EEk7VWxoC4tmvegMATEQw92TG49RDokEyAMGDjLQG`
  `9tMCjBQP39x2oPTx5h7QPWgK1qdi4e2FJ85g8oVu4nD3` (4 pool + recovery). Every testnet run still goes through `scripts/with-testnet-lock.sh`
  (one IP for FastNEAR, the hub's sponsorship balance).

## Funding log (lead)
- 2026-10-22: faucet top-up of 4 × 10 NEAR swept into `pot-funds-65k8.testnet`, which now holds **49.36 NEAR**.
- Preview balances at that time: hub `pots.potprev.testnet` 8.45, relayer `users.potprev.testnet` 2.14, treasury 0.29, root 1.06.
- The faucet allows roughly 2-4 new accounts per IP per window and reports "created" even when it refuses. Always verify on chain.
- 2026-10-22 ≈ 00:31 UTC (backend-hardening, wave 3): **4.3 NEAR** from `pot-funds-65k8.testnet` (49.36 → 45.06): relayer
  `users.potprev.testnet` +2 (`EktgrjLqfUuvoqjEX3A9NVxVuzdt6tuEfcfNuD2xt4LC`), hub `pots.potprev.testnet` +2
  (`55zHhqrA15eqnJMLBSQSLat53M1U2AGY87Qqg7jkwKiD`), treasury `treasury.potprev.testnet` +0.3 (`9BjhYCBFfFmCqhZUJaZ35aopVe9hVbSRNLxtRzXmd81P`),
  for the demo-pool refills, the B-19 load test and the final live runs (≤ 8 NEAR allowed). Balances right after: relayer 4.22,
  hub 10.41, treasury 0.59.

## Demo pool (B-12, wave 3)

`scripts/with-testnet-lock.sh scripts/run demo-pool` (= `GET /api/cron/demo-pool`, = step 6 of `GET /api/cron/reconcile`) retires expired
leases, keeps tonight's shared Pot (`lisbon-<yyyymmdd>`, reseeded below $300 or not open) and refills the pool to `DEMO_POOL_TARGET` (3).
Run live 2026-10-22: shared `lisbon-20261022` (create_pot `EtQovA3PnUc7WoRcuLTzwVFTmCn9gYnyuS9AmuKbCQVs`) + pool `lisbon-pkbh`, `lisbon-c546`
(156 s), later `lisbon-j4b5` (resumed from step 3 after a killed run), `lisbon-ctb7`, `lisbon-44mw`, `lisbon-ah2e` (150 s). `lisbon-c7vg` was
started by a demo session's `after()` refill and finished by the reconcile cron. The B-19 load test leased (and so retires) five pool Pots;
the pool was back at 3 ready at the end of the wave.

## Env additions (wave 3; `.env.local` below the marker, local only)

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | X-06 dev VAPID pair (generated locally, never committed, never printed). Preview/prod get their own pair, never rotated |
| `CRON_SECRET` | `GET /api/cron/{reconcile,demo-pool}` auth (Bearer). Vercel injects its own on deploy |
| `QUOTA_GLOBAL_DEMO_YOCTO=3 NEAR` | local headroom: the preview's 1 NEAR/day demo budget was used up by seeding + load tests (it stops refills, by design) |
| optional: `HUB_WARN_NEAR` (5 prod / 1 preview), `HUB_FLOOR_NEAR` (1), `TREASURY_WARN_USD` (100000), `TREASURY_CRITICAL_USD` (1000), `FLAG_DEMO_PUSH`, `DEMO_POOL_TARGET` | B-11 thresholds, R-15 demo push, pool size |

`apps/web/vercel.json` holds the crons (`/api/cron/reconcile` 04:00 UTC, `/api/cron/demo-pool` 04:30 UTC; Hobby = daily). **Not deployed.**

## QA wave 4 spend (2026-10-22, 04:12-05:12 local)
No top-up from `pot-funds-65k8.testnet` (still 45.0596 NEAR). Preview funds consumed ≈ 1.71 NEAR: hub 9.0880 → 8.0532,
relayer 3.4189 → 2.7459, treasury 0.5821 → 0.5755. Hub `pot_count` 59. Details: notes/qa-report.md §7.
