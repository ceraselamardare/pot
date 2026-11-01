import { fileURLToPath } from "node:url"
import { defineConfig, devices } from "@playwright/test"

// Integrations tier (notes/integrations.md): the REAL app in testnet mode (live data source, real API routes, real
// session cookies) against local fakes only — a fake NEAR RPC, the fake NEAR Auth issuer (JWKS), a build-flagged
// mock wallet, and a fresh pot_test schema. Nothing touches testnet. It exercises the full NEAR Auth path (popup →
// /authorize with the device-bound nonce → code exchange → POST /api/session → account creation) and the NEP-413
// wallet sign-in. Its own dist dir, so it can build beside another agent's `.next`.
//   E2E_INT_PORT=3790 pnpm --filter web exec playwright test -c e2e/integrations/playwright.config.ts
const PORT = Number(process.env.E2E_INT_PORT ?? 3790)
const RPC = Number(process.env.FAKE_RPC_PORT ?? PORT + 1)
const ISSUER = Number(process.env.FAKE_ISSUER_PORT ?? PORT + 2)
const BASE_URL = `http://localhost:${PORT}`
const WEB = fileURLToPath(new URL("../..", import.meta.url))
const SCHEMA = "t_e2e_integrations"
const DIST = process.env.NEXT_DIST_DIR ?? ".next-integrations"

const env: Record<string, string> = {
  NEXT_DIST_DIR: DIST,
  NEXT_PUBLIC_DATA_SOURCE: "testnet",
  NEXT_PUBLIC_RELAY_MODE: "live",
  NEXT_PUBLIC_APP_URL: BASE_URL,
  NEXT_PUBLIC_RPC_URLS: `http://127.0.0.1:${RPC}`,
  SERVER_RPC_URLS: `http://127.0.0.1:${RPC}`,
  NEXT_PUBLIC_FLAG_DEV_SESSION: "false",
  FLAG_DEV_SESSION: "false",
  NEXT_PUBLIC_FLAG_NEAR_AUTH: "true",
  NEXT_PUBLIC_NEAR_AUTH_CLIENT_ID: "e2e-client",
  NEXT_PUBLIC_NEAR_AUTH_BASE_URL: `http://127.0.0.1:${ISSUER}`,
  NEAR_AUTH_CLIENT_ID: "e2e-client",
  NEAR_AUTH_JWKS_URL: `http://127.0.0.1:${ISSUER}/.well-known/jwks.json`,
  NEAR_AUTH_REQUIRE_NONCE: "true",
  NEXT_PUBLIC_E2E_MOCK_WALLET: "1",
  DATABASE_URL: `postgres://pot:pot@localhost:54329/pot_test?options=-c%20search_path%3D${SCHEMA}`,
  DATABASE_URL_UNPOOLED: `postgres://pot:pot@localhost:54329/pot_test?options=-c%20search_path%3D${SCHEMA}`,
  FAKE_RPC_PORT: String(RPC),
  FAKE_ISSUER_PORT: String(ISSUER),
  FAKE_DB_SCHEMA: SCHEMA,
}

export default defineConfig({
  testDir: ".",
  testMatch: /.*\.int\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  outputDir: "../../test-results/integrations",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: "light",
  },
  projects: [{ name: "integrations" }],
  webServer: [
    {
      command: "pnpm exec tsx --conditions react-server e2e/integrations/fakes.ts",
      cwd: WEB,
      url: `http://127.0.0.1:${RPC}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: "pipe",
      env,
    },
    {
      command: `pnpm exec next build && pnpm exec next start -p ${PORT} -H localhost`,
      cwd: WEB,
      url: BASE_URL,
      reuseExistingServer: false,
      timeout: 400_000,
      stdout: "pipe",
      env,
    },
  ],
})

export const FAKE_RPC = `http://127.0.0.1:${RPC}`
