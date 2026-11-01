#!/usr/bin/env node
// Generates app/tokens.css from the brand's tokens.json (frontend-architecture §7.1, D-67, F-01).
//
//   node scripts/gen-tokens.mjs           write app/tokens.css
//   node scripts/gen-tokens.mjs --check   exit 1 if app/tokens.css is stale (CI, test U-WEB-09a)
//
// Nobody edits tokens.css by hand: a token change starts in the Design System artifact, then tokens.json.
// tokens.json is looked up at docs/brand/tokens.json (the product repo layout, D-64) and then brand/tokens.json
// (this planning folder).

import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export const WEB_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..")
export const REPO_ROOT = resolve(WEB_DIR, "../..")
export const OUT_FILE = join(WEB_DIR, "app/tokens.css")

/** @returns {string} absolute path of the brand directory that holds tokens.json and web/ */
export function findBrandDir() {
  for (const dir of [join(REPO_ROOT, "docs/brand"), join(REPO_ROOT, "brand")]) {
    if (existsSync(join(dir, "tokens.json"))) return dir
  }
  throw new Error("tokens.json not found in docs/brand/ or brand/")
}

/** @param {string} px e.g. "44px" */
const rem = (px) => {
  const n = Number.parseFloat(px)
  if (!px.endsWith("px") || Number.isNaN(n)) throw new Error(`expected a px value, got ${px}`)
  return `${+(n / 16).toFixed(4)}rem`
}

// Derived values, not tokens (frontend-architecture §7.1): the Day-only 1 px border on marigold buttons
// (brand README §3 rule 1) and the sheet scrim.
const DERIVED = {
  day: { "brand-border": "var(--pot-brand-deep)", scrim: "rgb(43 27 58 / 0.45)" },
  night: { "brand-border": "transparent", scrim: "rgb(0 0 0 / 0.35)" },
}

/**
 * @param {any} tokens parsed tokens.json
 * @param {string} source path shown in the header comment
 * @returns {string}
 */
export function generateTokensCss(tokens, source = "brand/tokens.json") {
  const themes = tokens.color.themes.map((/** @type {{id: string}} */ t) => t.id)
  if (themes.join() !== "day,night") throw new Error(`expected themes day,night, got ${themes}`)

  /** @param {"day"|"night"} theme */
  const themeVars = (theme) => {
    const lines = []
    for (const t of tokens.color.tokens) lines.push(`--pot-${t.name}: ${t.value[theme].toLowerCase()};`)
    for (const t of tokens.shadow.tokens) lines.push(`--pot-${t.name}: ${t.value[theme]};`)
    for (const [k, v] of Object.entries(DERIVED[theme])) lines.push(`--pot-${k}: ${v};`)
    return lines
  }

  const statics = []
  for (const group of tokens.type.groups) {
    for (const s of group.styles) {
      if (s.name === "wordmark") continue // reference only: the wordmark ships as outlines
      statics.push(`--pot-text-${s.name}: ${rem(s.fontSize)};`)
      statics.push(`--pot-text-${s.name}-line-height: ${rem(s.lineHeight)};`)
      statics.push(`--pot-text-${s.name}-font-weight: ${s.fontWeight};`)
      statics.push(`--pot-text-${s.name}-letter-spacing: ${s.letterSpacing ?? "0em"};`)
    }
  }
  for (const t of tokens.spacing.tokens) statics.push(`--pot-${t.name}: ${rem(t.value)};`)
  for (const t of tokens.radius.tokens) {
    statics.push(`--pot-${t.name}: ${t.name === "radius-pill" ? t.value : rem(t.value)};`)
  }
  for (const t of tokens.layout.tokens) {
    // breakpoints can't be custom properties inside media queries; globals.css mirrors them as literals
    if (t.name.startsWith("bp-")) statics.push(`/* --pot-${t.name}: ${t.value} (literal in globals.css) */`)
    else statics.push(`--pot-${t.name}: ${rem(t.value)};`)
  }

  const block = (/** @type {string} */ sel, /** @type {string[]} */ lines, indent = "  ") =>
    `${sel} {\n${lines.map((l) => indent + l).join("\n")}\n${indent.slice(2)}}`

  return [
    `/* GENERATED from ${source} by apps/web/scripts/gen-tokens.mjs. Do not edit by hand. */`,
    `/* Theme-switched colours and shadows: Day on :root and [data-theme="day"], Night on [data-theme="night"]. */`,
    "",
    block(":root", statics),
    "",
    block(':root,\n[data-theme="day"]', ["color-scheme: light;", ...themeVars("day")]),
    "",
    block('[data-theme="night"]', ["color-scheme: dark;", ...themeVars("night")]),
    "",
    "/* No-JS fallback (e.g. the /demo HTML AI judges read): Night when the OS is dark and no data-theme is set. */",
    "@media (prefers-color-scheme: dark) {",
    block("  :root:not([data-theme])", ["color-scheme: dark;", ...themeVars("night")], "    "),
    "}",
    "",
  ].join("\n")
}

export function readTokens() {
  const dir = findBrandDir()
  const file = join(dir, "tokens.json")
  return { tokens: JSON.parse(readFileSync(file, "utf8")), source: relative(REPO_ROOT, file) }
}

function main() {
  const { tokens, source } = readTokens()
  const css = generateTokensCss(tokens, source)
  if (process.argv.includes("--check")) {
    const current = existsSync(OUT_FILE) ? readFileSync(OUT_FILE, "utf8") : ""
    if (current !== css) {
      console.error(`app/tokens.css is stale. Run: pnpm --filter web gen:tokens`)
      process.exit(1)
    }
    console.log("app/tokens.css is up to date")
    return
  }
  writeFileSync(OUT_FILE, css)
  console.log(`wrote ${relative(REPO_ROOT, OUT_FILE)} from ${source}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
