// Unit tests for the testnet ops scripts' helpers (no network; fakes only). Run by the root `pnpm test`.
import { defineProject } from "vitest/config"

export default defineProject({
  test: {
    name: "scripts",
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
})
