// README drift check (test-plan §5.3): every "do X → see Y" step marker <!-- J-n --> in the judging guide
// (docs/judging-guide.md, linked from README.md) has the test that runs it, and the J-7 command block appears verbatim in
// scripts/readme-cli-check.sh (E-11). The README itself must link to the guide. Every live proof in docs/proofs.json
// is listed in the guide's J-10 table (and nothing else is), and every quoted UI label in the README and the guide
// still exists in apps/web/i18n/en.json, so a renamed button can't leave a judge looking for the old one.
//   node scripts/check-readme-steps.ts
import { readFileSync } from "node:fs"

/** Where each README step is executed. A `test` entry must find the pattern in that file. */
export const STEP_TESTS: Record<string, { file: string; pattern: RegExp } | { cli: true } | { ci: true }> = {
  // the simulated explainer (/demo, plan/design-direction/05): the mock tier walks the chapters
  "J-1": { file: "apps/web/e2e/mock/demo-explainer.spec.ts", pattern: /test\("J-1\b/ },
  "J-2": { file: "apps/web/e2e/mock/demo-explainer.spec.ts", pattern: /test\("J-2\b/ },
  "J-3": { file: "apps/web/e2e/mock/demo-explainer.spec.ts", pattern: /test\("J-3\b/ },
  "J-4": { file: "apps/web/e2e/mock/demo-explainer.spec.ts", pattern: /test\("J-4\b/ },
  "J-5": { file: "apps/web/e2e/mock/demo-explainer.spec.ts", pattern: /test\("J-5\b/ },
  // its server HTML, read without JavaScript
  "J-6": { file: "apps/web/e2e/mock/demo-explainer-nojs.spec.ts", pattern: /test\("J-6\b/ },
  "J-7": { cli: true },
  "J-8": { ci: true },
  // the live app on testnet, signed with throwaway wallets (scripts/with-testnet-lock.sh; E-a create, E-c instant spend)
  "J-9": { file: "apps/web/e2e/testnet/flows.testnet.ts", pattern: /test\("E-c\b/ },
  // the live proofs: node scripts/verify-proofs.mjs (read-only; network)
  "J-10": { cli: true },
}

/** Quoted text in the README and the guide that is not a UI label (section names, CLI output). */
export const NOT_UI_LABELS = new Set(["Try it", "Account is locked (no access keys)", "has been running for over 60 seconds"])

/** Double-quoted prose (outside code, HTML and image alt text) that should be a UI label from en.json. */
export function quotedLabels(md: string): string[] {
  const prose = md
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]*`/g, "")
    .replace(/<(?:img|source|picture|p|\/p|\/picture|!--)[^>]*>/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
  return [...new Set([...prose.matchAll(/"([^"\n]{2,120})"/g)].map((m) => m[1]!))]
}

/** A label matches an en.json value: contained in one, or the whole label fits a {placeholder} template. */
export function labelMatcher(en: Record<string, string>): (label: string) => boolean {
  const values = Object.values(en).filter((v): v is string => typeof v === "string")
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const templates = values
    .filter((v) => /\{[a-zA-Z_]+\}/.test(v))
    .map((v) => v.split(/\{[a-zA-Z_]+\}/).map(esc))
    .filter((parts) => parts.join("").length >= 3)
  const whole = templates.map((parts) => new RegExp(`^${parts.join(".+?")}$`))
  const inside = templates.filter((parts) => parts.join("").length >= 12).map((parts) => new RegExp(parts.join(".+?")))
  return (label) =>
    NOT_UI_LABELS.has(label) || values.some((v) => v.includes(label)) || whole.some((r) => r.test(label)) || inside.some((r) => r.test(label))
}

interface Proofs {
  txs: { hash: string }[]
}

export function readmeMarkers(readme: string): string[] {
  return [...readme.matchAll(/<!-- (J-\d+) -->/g)].map((m) => m[1]!)
}

/** The `near …` command lines of the README's J-7 code block. */
export function j7Commands(readme: string): string[] {
  const at = readme.indexOf("<!-- J-7 -->")
  if (at < 0) return []
  const block = /```bash\n([\s\S]*?)```/.exec(readme.slice(at))
  return (block?.[1] ?? "").split("\n").filter((l) => l.startsWith("near "))
}

export const GUIDE = "docs/judging-guide.md"

export function checkReadmeSteps(readme: string, read: (path: string) => string, guide: string = read(GUIDE)): string[] {
  const problems: string[] = []
  if (!readme.includes(`(${GUIDE})`)) problems.push(`README.md doesn't link to ${GUIDE}`)
  const markers = readmeMarkers(guide)
  for (const id of Object.keys(STEP_TESTS)) if (!markers.includes(id)) problems.push(`${id}: no <!-- ${id} --> marker in ${GUIDE}`)
  for (const id of markers) {
    const t = STEP_TESTS[id]
    if (!t) problems.push(`${id}: guide step without a test mapping in scripts/check-readme-steps.ts`)
    else if ("file" in t && !t.pattern.test(read(t.file))) problems.push(`${id}: ${t.file} has no test matching ${t.pattern}`)
  }
  const cli = read("scripts/readme-cli-check.sh")
  const cmds = j7Commands(guide)
  if (!cmds.length) problems.push("J-7: no near command block")
  for (const c of cmds) if (!cli.includes(c)) problems.push(`J-7: not run verbatim by scripts/readme-cli-check.sh: ${c}`)
  // J-10: the guide lists exactly the proofs that scripts/verify-proofs.mjs checks
  const proofs = JSON.parse(read("docs/proofs.json")) as Proofs
  const j10 = guide.slice(Math.max(0, guide.indexOf("<!-- J-10 -->")))
  const listed = new Set([...j10.matchAll(/txns\/([1-9A-HJ-NP-Za-km-z]{43,44})/g)].map((m) => m[1]!))
  for (const { hash } of proofs.txs) if (!listed.has(hash)) problems.push(`J-10: proof ${hash} from docs/proofs.json is not in the guide`)
  for (const hash of listed) if (!proofs.txs.some((t) => t.hash === hash)) problems.push(`J-10: ${hash} is in the guide but not in docs/proofs.json`)
  // quoted UI labels still exist
  const fits = labelMatcher(JSON.parse(read("apps/web/i18n/en.json")) as Record<string, string>)
  for (const [name, md] of [["README.md", readme], [GUIDE, guide]] as const)
    for (const label of quotedLabels(md)) if (!fits(label)) problems.push(`${name}: "${label}" is not a UI label in apps/web/i18n/en.json`)
  return problems
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = new URL("../", import.meta.url)
  const read = (p: string) => readFileSync(new URL(p, root), "utf8")
  const problems = checkReadmeSteps(read("README.md"), read)
  for (const p of problems) console.error(`README drift: ${p}`)
  if (problems.length) process.exit(1)
  console.log(`README steps ok: ${readmeMarkers(read(GUIDE)).join(" ")} in ${GUIDE}; J-7 commands, J-10 proofs and quoted UI labels in step`)
}
