// Vitest 4 "workspace": the root config lists the projects (the old vitest.workspace file was removed in v4).
// `pnpm test` at the root runs every package's unit tests in one process.
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    projects: ["apps/web", "packages/pot-sdk", "scripts"],
  },
})
