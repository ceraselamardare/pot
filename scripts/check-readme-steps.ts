// README drift check (test-plan §5.3): every "do X → see Y" step marker <!-- J-n --> in README.md has the test that
// runs it, and the J-7 command block appears verbatim in scripts/readme-cli-check.sh (E-11).
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

export function checkReadmeSteps(readme: string, read: (path: string) => string): string[] {
  const problems: string[] = []
  const markers = readmeMarkers(readme)
  for (const id of Object.keys(STEP_TESTS)) if (!markers.includes(id)) problems.push(`${id}: no <!-- ${id} --> marker in README.md`)
  for (const id of markers) {
    const t = STEP_TESTS[id]
    if (!t) problems.push(`${id}: README step without a test mapping in scripts/check-readme-steps.ts`)
    else if ("file" in t && !t.pattern.test(read(t.file))) problems.push(`${id}: ${t.file} has no test matching ${t.pattern}`)
  }
  const cli = read("scripts/readme-cli-check.sh")
  const cmds = j7Commands(readme)
  if (!cmds.length) problems.push("J-7: no near command block")
  for (const c of cmds) if (!cli.includes(c)) problems.push(`J-7: not run verbatim by scripts/readme-cli-check.sh: ${c}`)
  return problems
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = new URL("../", import.meta.url)
  const read = (p: string) => readFileSync(new URL(p, root), "utf8")
  const problems = checkReadmeSteps(read("README.md"), read)
  for (const p of problems) console.error(`README drift: ${p}`)
  if (problems.length) process.exit(1)
  console.log(`README steps ok: ${readmeMarkers(read("README.md")).join(" ")}; J-7 ${j7Commands(read("README.md")).length} commands`)
}
