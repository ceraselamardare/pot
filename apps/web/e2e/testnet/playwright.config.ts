import { fileURLToPath } from "node:url"
import { defineConfig, devices } from "@playwright/test"

// X-07: the testnet tier (test-plan §5.2). Real chain, real relayer, the deployed preview contracts
// (notes/deploy.md). Gated: it only runs with E2E_TESTNET=1, because every run signs testnet transactions
// and spends preview NEAR. Always under the testnet lock:
//   E2E_TESTNET=1 E2E_PORT=3417 scripts/with-testnet-lock.sh pnpm --filter web exec playwright test -c e2e/testnet/playwright.config.ts
// People sign in like anyone with a NEAR wallet (Rev 9: no test-account sign-in): each suite creates throwaway
// testnet accounts from the holding account (e2e/testnet/accounts.ts, near-cli-rs legacy keychain) and the browser
// signs in through NEAR Connect with the e2e mock wallet (NEXT_PUBLIC_E2E_MOCK_WALLET=1, local builds only) holding
// those keys: NEP-413 sign-in → wallet session; every action → signDelegateActions → our relayer.
// The web server is a production build in testnet mode (NEXT_PUBLIC_DATA_SOURCE=testnet) on localhost:<port>,
// whose origin is passed as NEXT_PUBLIC_APP_URL so the API's Origin check accepts the browser. One phone-sized
// project (390×844); the flows run serially (one chain, shared Pots). The mock wallet can't run against a deployed
// preview (refused on Vercel builds), so there is no E2E_BASE_URL mode any more.
if (process.env.E2E_TESTNET !== "1") throw new Error("testnet e2e is gated: set E2E_TESTNET=1 (it signs testnet transactions)")

const PORT = Number(process.env.E2E_PORT ?? 3417)
const BASE_URL = `http://localhost:${PORT}`
const WEB = fileURLToPath(new URL("../..", import.meta.url))

export default defineConfig({
  testDir: ".",
  testMatch: /.*\.testnet\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 300_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  outputDir: "../../test-results/testnet",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    colorScheme: "light",
  },
  projects: [{ name: "testnet" }],
  webServer: {
    command: `pnpm exec next build && pnpm exec next start -p ${PORT} -H localhost`,
    cwd: WEB,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 400_000,
    stdout: "pipe",
    env: {
      NEXT_PUBLIC_DATA_SOURCE: "testnet",
      NEXT_PUBLIC_RELAY_MODE: "live",
      NEXT_PUBLIC_APP_URL: BASE_URL,
      // NEAR Connect → the e2e mock wallet (refused by next.config.ts on Vercel and mainnet builds)
      NEXT_PUBLIC_E2E_MOCK_WALLET: "1",
      // every run claims demo dollars from one local IP; the per-IP faucet cap ($1,000/day) is for the public
      QUOTA_IP_FAUCET_USD: process.env.QUOTA_IP_FAUCET_USD ?? "50000000000",
      // every run's people sign in from one laptop IP (wallet sessions: 100/day per IP)
      QUOTA_USER_SPEND: process.env.QUOTA_USER_SPEND ?? "400",
      // the preview's 1 NEAR/day hub sponsorship cap is shared with every other preview user; each run here
      // creates one Pot (≈ 0.07 NEAR of hub float), so a local test server gets 2 NEAR/day
      QUOTA_GLOBAL_HUB_YOCTO: process.env.QUOTA_GLOBAL_HUB_YOCTO ?? "2000000000000000000000000",
      // two phones + the test runner + the relayer share one IP: browsers read dRPC first, the server FastNEAR
      // first, so neither exhausts the other's per-IP budget (both stay each other's failover)
      NEXT_PUBLIC_RPC_URLS: "https://near-testnet.drpc.org,https://rpc.testnet.fastnear.com",
      SERVER_RPC_URLS: "https://rpc.testnet.fastnear.com,https://near-testnet.drpc.org",
    },
  },
})
