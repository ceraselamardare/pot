// @ts-check
import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"
import { BANNED_CI, BANNED_CS } from "./i18n/banned.mjs"

// F-02 (frontend-architecture §9.4): the jargon lint's second layer, react/jsx-no-literals and the import guards.
// Layer 1 is i18n/lint-copy.mjs over en.json (run by `pnpm lint` before ESLint).
const JARGON = `/\\b(?:${BANNED_CI.join("|")})\\b/i`
const JARGON_CS = `/\\b(?:${BANNED_CS.join("|")})\\b/`
const UI_ATTR = "/^(aria-label|aria-description|title|placeholder|alt|label)$/"

const RPC_BAN = {
  selector: "Literal[value=/rpc\\.testnet\\.near\\.org|lava\\.build/]",
  message: "Deprecated RPC (D-32). Use NEXT_PUBLIC_RPC_URLS.",
}

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // rev4 (F-01): the only inline script is the no-flash theme script, with an explicit disable comment.
      "react/no-danger": "error",
      // D-32: the deprecated testnet RPC must never appear in code
      "no-restricted-syntax": ["error", RPC_BAN],
    },
  },
  {
    // UI code: every user-facing string goes through t(), so the en.json lint is authoritative (§9.4)
    files: ["app/**/*.tsx", "components/**/*.tsx"],
    ignores: ["components/ui/**", "components/advanced/**", "**/*.test.tsx"],
    rules: {
      "react/jsx-no-literals": [
        "error",
        { noStrings: true, ignoreProps: true, noAttributeStrings: false, allowedStrings: ["•••", "·", "✕", "✓", "+", "$"] },
      ],
      "no-restricted-syntax": [
        "error",
        RPC_BAN,
        { selector: `JSXText[value=${JARGON}]`, message: "Jargon in UI text (D-44). Use the ux-spec §1.2 words via t()." },
        { selector: `JSXText[value=${JARGON_CS}]`, message: "Jargon in UI text (D-44). Use the ux-spec §1.2 words via t()." },
        {
          selector: `JSXAttribute[name.name=${UI_ATTR}] > Literal[value=${JARGON}]`,
          message: "Jargon in a UI attribute (D-44). Use t().",
        },
        {
          selector: "Literal[value=/(^|\\s)(text|decoration|placeholder)-brand(-deep)?(\\s|$|\\/)/]",
          message: "Marigold is never text (brand rule 2): no text-brand / text-brand-deep classes.",
        },
        {
          selector: "TemplateElement[value.raw=/(^|\\s)(text|decoration|placeholder)-brand(-deep)?(\\s|$|\\/)/]",
          message: "Marigold is never text (brand rule 2): no text-brand / text-brand-deep classes.",
        },
      ],
    },
  },
  {
    // D-42 bundle rule: signing / auth / wallet libraries load lazily from lib/signing only (§1.3)
    files: ["app/**", "components/**", "hooks/**", "lib/client/**"],
    ignores: ["lib/client/keys/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "near-api-js", message: "near-api-js lives in the lazy signing chunk (lib/signing, D-42)." },
            { name: "@pot/sdk/sign", message: "@pot/sdk/sign lives in the lazy signing chunk (lib/signing, D-42)." },
          ],
          patterns: [
            { group: ["@auth0/*"], message: "auth0-spa-js loads lazily from lib/signing/near-auth (D-42)." },
            { group: ["@hot-labs/*"], message: "near-connect loads lazily from lib/signing/near-connect (D-42)." },
          ],
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    ".next-*/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
  ]),
])
