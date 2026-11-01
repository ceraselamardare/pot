import { fileURLToPath } from "node:url"
import { defineConfig, devices } from "@playwright/test"

// X-07: the testnet tier (test-plan §5.2). Real chain, real relayer, the deployed preview contracts
// (notes/deploy.md). Gated: it only runs with E2E_TESTNET=1, because every run signs testnet transactions
// through the app's own relayer (dev sessions + demo personas) and spends preview NEAR.
//   E2E_TESTNET=1 E2E_PORT=3417 pnpm --filter web exec playwright test -c e2e/testnet/playwright.config.ts
// The web server is a production build in testnet mode (NEXT_PUBLIC_DATA_SOURCE=testnet) on localhost:<port>,
// whose origin is passed as NEXT_PUBLIC_APP_URL so the API's Origin check accepts the browser. One phone-sized
// project (390×844); the flows run serially (one chain, shared Pots).
if (process.env.E2E_TESTNET !== "1") throw new Error("testnet e2e is gated: set E2E_TESTNET=1 (it signs testnet transactions)")

const PORT = Number(process.env.E2E_PORT ?? 3417)
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`
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
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
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
          NEXT_PUBLIC_FLAG_DEV_SESSION: "true",
          FLAG_DEV_SESSION: "true",
          // the live persona demo (README J-2…J-5's old path) is at /demo/live, off unless this flag is on
          FLAG_DEMO_LIVE: "true",
          // every run claims demo dollars from one local IP; the per-IP faucet cap ($1,000/day) is for the public
          QUOTA_IP_FAUCET_USD: process.env.QUOTA_IP_FAUCET_USD ?? "50000000000",
          // demo spends count per visitor AND per IP net (30/day): live tests, load tests and every testnet run here
          // share one laptop IP, so the demo suite hit `quota_exceeded` (family spend) on its first spend (QA 2026-10-22)
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
