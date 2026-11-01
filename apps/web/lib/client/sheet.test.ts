// @vitest-environment jsdom
// Sheet history (notes/frontend.md "Back in multi-step sheets"): one entry per step, so the in-sheet [Back] and the
// browser's Back agree; close() unwinds every step's entry; a cold deep link never leaves the app.
import { beforeEach, describe, expect, it } from "vitest"
import { canPopStep, closeSheet, openSheet, pushSheetStep, sheetDepth, sheetStepBack } from "./sheet"

const here = () => `${window.location.pathname}${window.location.search}`
const popped = () => new Promise<void>((r) => window.addEventListener("popstate", () => setTimeout(r, 0), { once: true }))
const dropD = (p: URLSearchParams) => p.delete("d")
const dropSrc = (p: URLSearchParams) => {
  p.delete("src")
  p.delete("d")
}

beforeEach(() => window.history.replaceState(null, "", "/p/lisbon-trip"))

describe("sheet history", () => {
  it("Add money → network → address: one entry per step; Back pops one; close unwinds them all", async () => {
    openSheet("add")
    expect([here(), sheetDepth(), canPopStep()]).toEqual(["/p/lisbon-trip?sheet=add", 1, false])
    pushSheetStep((p) => {
      p.set("src", "xc")
      p.set("amount", "100")
    })
    expect([sheetDepth(), canPopStep()]).toEqual([2, true])
    pushSheetStep((p) => p.set("d", "dp_1"))
    expect([here(), sheetDepth()]).toEqual(["/p/lisbon-trip?sheet=add&src=xc&amount=100&d=dp_1", 3])

    // in-sheet Back = history.back(): the network entry, as the browser's Back would
    let p = popped()
    sheetStepBack(dropD)
    await p
    expect([here(), sheetDepth()]).toEqual(["/p/lisbon-trip?sheet=add&src=xc&amount=100", 2])

    // ✕ from the network step: back to the bare page, not to the Add sheet
    p = popped()
    closeSheet()
    await p
    expect([here(), sheetDepth()]).toEqual(["/p/lisbon-trip", 0])
  })

  it("a deep link straight to a later step: Back replaces the entry with the previous step (stays in the app)", () => {
    window.history.replaceState(null, "", "/p/lisbon-trip?sheet=add&src=xc&d=dp_1")
    const before = window.history.length
    sheetStepBack(dropD)
    expect(here()).toBe("/p/lisbon-trip?sheet=add&src=xc")
    sheetStepBack(dropSrc)
    expect(here()).toBe("/p/lisbon-trip?sheet=add")
    closeSheet()
    expect(here()).toBe("/p/lisbon-trip")
    expect(window.history.length).toBe(before)
  })

  it("a step pushed over a cold deep link pops back to it, and close strips the cold entry too", async () => {
    window.history.replaceState(null, "", "/p/lisbon-trip?sheet=add")
    pushSheetStep((p) => p.set("src", "xc"))
    expect([sheetDepth(), canPopStep()]).toEqual([1, true])
    const p = popped()
    closeSheet()
    await p
    expect(here()).toBe("/p/lisbon-trip")
  })
})
