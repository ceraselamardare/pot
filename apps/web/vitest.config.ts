import { fileURLToPath } from "node:url"
import { defineProject } from "vitest/config"

export default defineProject({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      // as in a normal build (next.config.ts): no e2e mock wallet
      "pot-e2e-mock-wallet": fileURLToPath(new URL("./lib/signing/near-connect/e2e-mock-wallet.off.ts", import.meta.url)),
    },
  },
  test: {
    name: "web",
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules/**", ".next/**", "e2e/**"],
  },
})
