import { defineConfig, devices } from "@playwright/test"
import { onboardedState } from "./e2e/fixtures/onboarding"

// test-plan §5.1 / frontend-architecture §11.2. Production build + `next start` (never `next dev`), so what
// is tested is what ships. Port 3100 keeps :3000 free for `next dev` (NEAR Auth's shared testnet client only
// accepts http://localhost:3000). Later tiers add WebKit (iPhone 13), a 320 px project, the mock RPC server
// (e2e/fixtures/mock-rpc-server.ts) and the testnet/pwa specs.
const PORT = Number(process.env.E2E_PORT ?? 3100)
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`

// The installed (standalone) app on a 390x844 phone; devices['iPhone 13'] is the Safari-tab viewport (390x664).
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    // the first-run intro is done in every context, so specs written before it are unaffected
    // (e2e/fixtures/onboarding.ts; e2e/mock/onboarding.spec.ts opts out)
    storageState: onboardedState(BASE_URL),
  },
  projects: [
    { name: "mobile-day", use: { ...devices["Desktop Chrome"], ...phone, colorScheme: "light" } },
    { name: "mobile-night", use: { ...devices["Desktop Chrome"], ...phone, colorScheme: "dark" } },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 }, colorScheme: "light" },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm exec next build && pnpm exec next start -p ${PORT} -H 127.0.0.1`,
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 240_000,
        stdout: "pipe",
      },
})
