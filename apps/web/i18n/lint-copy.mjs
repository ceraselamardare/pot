#!/usr/bin/env node
// Jargon lint, layer 1 (D-44, frontend-architecture §9.3): every en.json value outside the allowlist must be
// free of the banned words. Run by `pnpm lint` (package.json) and `pnpm lint:copy`. Exit 1 on any hit.
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { findBanned, isAllowlisted } from "./banned.mjs"

/** @param {Record<string, string>} messages @returns {{key: string, word: string, value: string}[]} */
export function lintCopy(messages) {
  const hits = []
  for (const [key, value] of Object.entries(messages)) {
    if (isAllowlisted(key)) continue
    const word = findBanned(value)
    if (word) hits.push({ key, word, value })
  }
  return hits
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  const file = fileURLToPath(new URL("./en.json", import.meta.url))
  const messages = JSON.parse(readFileSync(file, "utf8"))
  const hits = lintCopy(messages)
  if (hits.length) {
    for (const h of hits) console.error(`lint-copy: "${h.word}" in ${h.key}: ${h.value}`)
    console.error(`lint-copy: ${hits.length} banned word(s). Use the ux-spec §1.2 vocabulary.`)
    process.exit(1)
  }
  console.log(`lint-copy: ${Object.keys(messages).length} strings, 0 banned words`)
}
