// SEC-1 (test-plan §7 `security` job, review-security M-8): every resolved `next` in pnpm-lock.yaml must be
// ≥ 16.4.1 (GHSA-673q-mjm6-r5xr, RCE in `use cache`, 16.0.0-16.4.0 — not in the npm advisory DB on 2026-10-21,
// so `pnpm audit` alone would pass a downgrade) and `react` / `react-dom` ≥ 19.3.1. Raised to 16.4.5, the latest
// security release, on 2026-11-05 (audit CLI-8).
//   node scripts/check-pins.ts [path/to/pnpm-lock.yaml]      (Node ≥ 22.18 runs .ts directly)
import { readFileSync } from "node:fs"

export const MINIMUM: Record<string, string> = { next: "16.4.5", react: "19.3.1", "react-dom": "19.3.1" }

const cmp = (a: string, b: string): number => {
  const x = a.split(".").map(Number)
  const y = b.split(".").map(Number)
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0)
  return 0
}

/** Every resolved version of the pinned packages (package keys `  name@x.y.z` / `  name@x.y.z(peers)`). */
export function resolvedVersions(lock: string): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const m of lock.matchAll(/^ {2}'?(next|react|react-dom)@(\d+\.\d+\.\d+[^(:'\s]*)/gm)) {
    const [, name, version] = m as unknown as [string, string, string]
    ;(out[name] ??= []).includes(version) || out[name]!.push(version)
  }
  return out
}

/** Problems found (empty = pass). A pinned package missing from the lockfile is a problem too. */
export function checkPins(lock: string): string[] {
  const found = resolvedVersions(lock)
  const problems: string[] = []
  for (const [name, min] of Object.entries(MINIMUM)) {
    const vs = found[name] ?? []
    if (!vs.length) problems.push(`${name}: not found in the lockfile`)
    for (const v of vs) if (cmp(v.replace(/-.*/, ""), min) < 0 || (/-/.test(v) && cmp(v.replace(/-.*/, ""), min) === 0))
      problems.push(`${name}@${v} is below ${min}`)
  }
  return problems
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const path = process.argv[2] ?? new URL("../pnpm-lock.yaml", import.meta.url).pathname
  const problems = checkPins(readFileSync(path, "utf8"))
  const found = resolvedVersions(readFileSync(path, "utf8"))
  if (problems.length) {
    for (const p of problems) console.error(`SEC-1 FAIL: ${p}`)
    process.exit(1)
  }
  console.log(`SEC-1 ok: ${Object.entries(found).map(([n, v]) => `${n}@${v.join(",")}`).join(" ")}`)
}
