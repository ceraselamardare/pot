// @ts-check
import js from "@eslint/js"
import tseslint from "typescript-eslint"

export default tseslint.config(
  { ignores: ["node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // D-32: the deprecated testnet RPC must never appear in code
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/rpc\\.testnet\\.near\\.org|lava\\.build/]",
          message: "Deprecated RPC (D-32). Use the RPC failover list from SdkConfig.",
        },
      ],
    },
  },
  {
    // only src/sign/** may touch near-api-js (D-42: keep it off first-load bundles)
    files: ["src/**/*.ts"],
    ignores: ["src/sign/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [{ name: "near-api-js", message: "near-api-js belongs in src/sign/** only (lazy chunk, D-42)." }] },
      ],
    },
  },
)
