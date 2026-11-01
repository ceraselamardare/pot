// Drift guard: when the contract source sits next to the sdk (the monorepo), its error codes and
// event names must equal the sdk's. Skips silently when contracts/ isn't there.
import { existsSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { HUB_ERROR_CODES } from "./types/errors.ts"
import { HUB_EVENT_NAMES } from "./types/events.ts"

const src = (f: string) => new URL(`../../../contracts/pot-hub/src/${f}`, import.meta.url)
const snake = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase()

describe.skipIf(!existsSync(src("errors.rs")))("reconcile with contracts/pot-hub", () => {
  it("HUB_ERROR_CODES = errors.rs", () => {
    const rs = [...readFileSync(src("errors.rs"), "utf8").matchAll(/pub const (ERR_[A-Z0-9_]+)/g)].map((m) => m[1])
    expect([...HUB_ERROR_CODES].sort()).toEqual(rs.sort())
  })
  it("HUB_EVENT_NAMES = the PotEvent variants of events.rs", () => {
    const text = readFileSync(src("events.rs"), "utf8")
    const body = text.slice(text.indexOf("pub enum PotEvent"))
    const variants = [...body.matchAll(/#\[event_version\("[^"]+"\)\]\s*([A-Z][A-Za-z]+)/g)].map((m) => snake(m[1] as string))
    expect([...HUB_EVENT_NAMES].sort()).toEqual(variants.sort())
  })
})
