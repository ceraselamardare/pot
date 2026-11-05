# Tests

| Layer | Command | Needs |
|---|---|---|
| Contracts: unit, property, sandbox on Sputnik builds A and B | `cd contracts && cargo test` | arm64 macOS or Linux; downloads the nearcore sandbox |
| Contracts on protocol 88 (★ tests) | `cd contracts && POT_SANDBOX_VERSION=2.14.0-rc.4 cargo test -p pot-tests -- t00_ t01_ t10_ t20_ t40_ t50_ t60_ t70_ t89_` | same |
| Typecheck, lint (incl. the jargon lint), unit + DB integration | `pnpm typecheck && pnpm lint && pnpm test` | Postgres for the DB tests (`pnpm db:up`) |
| Mocked UI end to end (3 projects, axe, brand checks) | `cd apps/web && E2E_PORT=3100 NEXT_PUBLIC_DATA_SOURCE=mock pnpm exec playwright test` | Playwright Chromium |
| Integrations (fake NEAR Auth issuer, fake RPC, mock wallet) | `cd apps/web && pnpm exec playwright test -c e2e/integrations/playwright.config.ts` | Postgres |
| Testnet (signs testnet txs through our relayer; each run creates throwaway 0-NEAR accounts that sign in with a NEAR wallet) | `E2E_TESTNET=1 scripts/with-testnet-lock.sh pnpm --filter web exec playwright test -c e2e/testnet/playwright.config.ts` | preview keys, `pot-funds-65k8.testnet` in the near-cli-rs legacy keychain |
| README CLI twins (J-7) | `scripts/readme-cli-check.sh` | network only |

The latest full run, with outputs and the bugs it found, is in `notes/qa-report.md`. CI is
`.github/workflows/ci.yml`.
