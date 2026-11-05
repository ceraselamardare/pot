// @vitest-environment jsdom
// CLI-7 (security audit 2026-11-04): the invite / payment-link #secret leaves the address bar as soon as this tab has
// its own copy, and a terminal answer forgets the copy.
import { beforeEach, describe, expect, it } from "vitest"
import { forgetStashedSecret, stripStashedFragment } from "./fragment-secret"

const SECRET = "BRAbJjE8R1JdaHN-iZSfqrXAy9bh7PcCDRgjLjlET1o"
const KEY = "pot.invite.porto-weekend"

beforeEach(() => {
  sessionStorage.clear()
  window.history.replaceState({ keep: 1 }, "", `/j/porto-weekend?i=pk#${SECRET}`)
})

describe("stripStashedFragment (CLI-7)", () => {
  it("strips the fragment once the tab holds the same secret; path, query and history state stay", () => {
    sessionStorage.setItem(KEY, SECRET)
    expect(stripStashedFragment(KEY, SECRET)).toBe(true)
    expect(window.location.hash).toBe("")
    expect(`${window.location.pathname}${window.location.search}`).toBe("/j/porto-weekend?i=pk")
    expect(window.history.state).toEqual({ keep: 1 })
  })

  it("keeps the fragment when there is no safe copy (storage blocked or a different secret)", () => {
    expect(stripStashedFragment(KEY, SECRET)).toBe(false)
    expect(window.location.hash).toBe(`#${SECRET}`)
    sessionStorage.setItem(KEY, "another")
    expect(stripStashedFragment(KEY, SECRET)).toBe(false)
    expect(stripStashedFragment(KEY, null)).toBe(false)
    expect(window.location.hash).toBe(`#${SECRET}`)
  })

  it("forgetStashedSecret drops the tab's copy", () => {
    sessionStorage.setItem(KEY, SECRET)
    forgetStashedSecret(KEY)
    expect(sessionStorage.getItem(KEY)).toBeNull()
  })
})
