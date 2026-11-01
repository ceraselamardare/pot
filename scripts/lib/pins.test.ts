// SEC-1: the lockfile check must fail a downgrade that `pnpm audit` can't see (GHSA-673q-mjm6-r5xr).
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { checkPins, resolvedVersions } from "../check-pins.ts"

const lock = (next: string, react = "19.3.1") => `lockfileVersion: '9.0'
packages:
  next@${next}:
    resolution: {integrity: sha512-x}
  react-dom@${react}:
    resolution: {integrity: sha512-y}
  react@${react}:
    resolution: {integrity: sha512-z}
snapshots:
  next@${next}(react-dom@${react}(react@${react}))(react@${react}):
    dependencies: {}
`

describe("SEC-1 check-pins", () => {
  it("passes the repo's real lockfile", () => {
    const real = readFileSync(new URL("../../pnpm-lock.yaml", import.meta.url), "utf8")
    expect(checkPins(real)).toEqual([])
    expect(resolvedVersions(real).next).toEqual(["16.4.2"])
  })
  it("fails next 16.4.0 (the RCE range) and an old react", () => {
    expect(checkPins(lock("16.4.0"))).toEqual(["next@16.4.0 is below 16.4.1"])
    expect(checkPins(lock("16.4.2", "19.3.0"))).toEqual(["react@19.3.0 is below 19.3.1", "react-dom@19.3.0 is below 19.3.1"])
  })
  it("passes the boundary 16.4.1, fails a 16.4.1 prerelease and a missing package", () => {
    expect(checkPins(lock("16.4.1"))).toEqual([])
    expect(checkPins(lock("16.4.1-canary.3"))).toEqual(["next@16.4.1-canary.3 is below 16.4.1"])
    expect(checkPins("lockfileVersion: '9.0'\n")).toContain("next: not found in the lockfile")
  })
})
