// The README drift check: the real README passes; a step without a test, or an edited J-7 command, fails.
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { checkReadmeSteps } from "../check-readme-steps.ts"

const root = new URL("../../", import.meta.url)
const read = (p: string) => readFileSync(new URL(p, root), "utf8")
const readme = read("README.md")

describe("check-readme-steps", () => {
  it("the README, the demo explainer specs and readme-cli-check.sh agree", () => {
    expect(checkReadmeSteps(readme, read)).toEqual([])
  })
  it("a new step with no test fails", () => {
    expect(checkReadmeSteps(`${readme}\n<!-- J-99 -->\n`, read)).toContain("J-99: README step without a test mapping in scripts/check-readme-steps.ts")
  })
  it("an edited J-7 command that the CLI check doesn't run fails", () => {
    const edited = readme.replace("get_factory_info json-args '{}'", "get_factory_info json-args '{\"x\":1}'")
    expect(checkReadmeSteps(edited, read).some((p) => p.startsWith("J-7: not run verbatim"))).toBe(true)
  })
  it("a removed marker fails", () => {
    expect(checkReadmeSteps(readme.replace("<!-- J-3 -->", ""), read)).toContain("J-3: no <!-- J-3 --> marker in README.md")
  })
})
