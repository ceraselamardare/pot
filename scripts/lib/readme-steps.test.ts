// The README drift check: the real README + judging guide pass; a step without a test, an edited J-7 command, a
// removed marker or a README that stops linking the guide fails.
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { GUIDE, checkReadmeSteps } from "../check-readme-steps.ts"

const root = new URL("../../", import.meta.url)
const read = (p: string) => readFileSync(new URL(p, root), "utf8")
const readme = read("README.md")
const guide = read(GUIDE)

describe("check-readme-steps", () => {
  it("the README, the judging guide, the demo explainer specs and readme-cli-check.sh agree", () => {
    expect(checkReadmeSteps(readme, read, guide)).toEqual([])
  })
  it("a new step with no test fails", () => {
    expect(checkReadmeSteps(readme, read, `${guide}\n<!-- J-99 -->\n`)).toContain("J-99: guide step without a test mapping in scripts/check-readme-steps.ts")
  })
  it("an edited J-7 command that the CLI check doesn't run fails", () => {
    const edited = guide.replace("get_factory_info json-args '{}'", "get_factory_info json-args '{\"x\":1}'")
    expect(checkReadmeSteps(readme, read, edited).some((p) => p.startsWith("J-7: not run verbatim"))).toBe(true)
  })
  it("a removed marker fails", () => {
    expect(checkReadmeSteps(readme, read, guide.replace("<!-- J-3 -->", ""))).toContain(`J-3: no <!-- J-3 --> marker in ${GUIDE}`)
  })
  it("a proof dropped from the J-10 table, or a hash that isn't in docs/proofs.json, fails", () => {
    // any proof of today's file (the reference story replaces them all)
    const hash = (JSON.parse(read("docs/proofs.json")) as { txs: { hash: string }[] }).txs[0]!.hash
    expect(checkReadmeSteps(readme, read, guide.replaceAll(`txns/${hash}`, "txns/x"))).toContain(
      `J-10: proof ${hash} from docs/proofs.json is not in the guide`,
    )
    const extra = "11111111111111111111111111111111111111111111"
    expect(checkReadmeSteps(readme, read, `${guide}\n[x](https://testnet.nearblocks.io/txns/${extra})\n`)).toContain(
      `J-10: ${extra} is in the guide but not in docs/proofs.json`,
    )
  })
  it("a quoted UI label that the app no longer has fails; templates and non-UI quotes pass", () => {
    const stale = `${guide}\nTap "Demo dollars (test money)".\n`
    expect(checkReadmeSteps(readme, read, stale)).toContain(`${GUIDE}: "Demo dollars (test money)" is not a UI label in apps/web/i18n/en.json`)
    const fine = `${guide}\nTap "OK $300", then "Join Lisbon Trip"; see "Try it".\n`
    expect(checkReadmeSteps(readme, read, fine)).toEqual([])
  })
  it("a README that no longer links the guide fails", () => {
    expect(checkReadmeSteps(readme.replaceAll(`(${GUIDE})`, "(x.md)"), read, guide)).toContain(`README.md doesn't link to ${GUIDE}`)
  })
})
