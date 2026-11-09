# Tests

| Layer | Command | Needs |
|---|---|---|
| Contracts: unit, property, sandbox on Sputnik builds A and B | `cd contracts && cargo test` | arm64 macOS or Linux; downloads the nearcore sandbox |
| Contracts on protocol 88 (★ tests) | `cd contracts && POT_SANDBOX_VERSION=2.14.0-rc.4 cargo test -p pot-tests -- t00_ t01_ t10_ t20_ t40_ t50_ t60_ t70_ t89_` | same |
| Typecheck, lint (incl. the jargon lint), unit + DB integration | `pnpm db:up && pnpm typecheck && pnpm lint && pnpm test` | Docker: the local Postgres (`pnpm db:up`); without it the DB test files fail to connect |
| Mocked UI end to end (3 projects, axe, brand checks) | `cd apps/web && E2E_PORT=3100 NEXT_PUBLIC_DATA_SOURCE=mock pnpm exec playwright test` | Playwright Chromium |
| Integrations (fake NEAR Auth issuer, fake RPC, mock wallet) | `cd apps/web && pnpm exec playwright test -c e2e/integrations/playwright.config.ts` | Postgres. The wallet sign-in tests need nothing else; the NEAR Auth ones create accounts through the relayer code path, so they also need `RELAYER_KEYS` / `TREASURY_KEYS` (preview keys, not in this repo) and are not expected to pass without them |
| Testnet (signs testnet txs through our relayer; each run creates throwaway 0-NEAR accounts that sign in with a NEAR wallet) | `E2E_TESTNET=1 scripts/with-testnet-lock.sh pnpm --filter web exec playwright test -c e2e/testnet/playwright.config.ts` | preview keys, `pot-funds-65k8.testnet` in the near-cli-rs legacy keychain |
| README CLI twins (J-7) | `scripts/readme-cli-check.sh` | network only |

**If port 54329 or the container name is taken** (another checkout, another Postgres): start a second database
with `POT_DB_PORT=54339 POT_DB_NAME=pot2 pnpm db:up`, then run the tests with
`POT_DB_PORT=54339 DATABASE_URL_TEST=postgres://pot:pot@localhost:54339/pot_test pnpm test`. The second database
gets its own container (`pot2-postgres`) and its own volume (`pot2-pgdata`); `POT_DB_NAME=pot2 docker compose -f
infra/docker-compose.yml config` shows both before you start it, and
`POT_DB_NAME=pot2 docker compose -f infra/docker-compose.yml down -v` removes them afterwards. For `pnpm dev` on that database, change the port in `DATABASE_URL` and `DATABASE_URL_UNPOOLED` in
`apps/web/.env.local` too. The integrations tier reads `POT_DB_PORT` too. The test helpers create and drop their own
schemas, so don't point them at a database you care about.

**All keyless checks in one command:** `scripts/judge-check.sh` (see its header for options).

**Screenshots:** the mocked e2e suite saves review screenshots to `apps/web/test-results/screens/` (gitignored).
`SAVE_SCREENS=1` writes them to the tracked `notes/screens/` instead.

`scripts/judge-check.sh` runs every keyless tier in one go and prints a summary (`--quick` skips the contract tests,
the slow part: a cold `cargo test` takes about a quarter of an hour). The first full QA pass, from 2026-10-22, with the
bugs it found, is in `notes/qa-report.md`. CI is `.github/workflows/ci.yml`.
