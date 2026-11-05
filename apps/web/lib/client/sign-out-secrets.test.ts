// @vitest-environment jsdom
// CLI-6 (security audit 2026-11-04): signing out forgets the bearer secrets this device kept: payment-link secrets
// (localStorage `pot.paylinks.v1`) and invite secrets (IndexedDB `pot-invites`). Nothing else of the person's
// device-only state is the secret store's business (the theme, the coach) and stays.
import "fake-indexeddb/auto"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { loadInvite, saveInvite } from "./live/invites"
import { loadLinkSecret, saveLinkSecret, savePendingLink } from "./paylink/secrets"
import * as mock from "./mock/store"
import { forgetLinkSecrets, signOut } from "./session"

const INVITE = { pot: "lisbon-trip.pots.potprev.testnet", pk: "ed25519:x", secret: "s".repeat(43), createdAt: 1 }

beforeEach(async () => {
  localStorage.clear()
  sessionStorage.clear()
  saveLinkSecret("lisbon-trip", 7, { secret: "link-secret", createdAt: 1 })
  savePendingLink("lisbon-trip", "ref1", { secret: "pending-secret", createdAt: 2 })
  await saveInvite(INVITE)
  localStorage.setItem("pot.theme", "dark")
})
afterEach(() => localStorage.clear())

describe("sign-out forgets link secrets (CLI-6)", () => {
  it("they are there before", async () => {
    expect(loadLinkSecret("lisbon-trip", 7)?.secret).toBe("link-secret")
    expect((await loadInvite(INVITE.pot))?.secret).toBe(INVITE.secret)
  })

  it("forgetLinkSecrets drops the payment links (also pending ones) and the invites; other device state stays", async () => {
    await forgetLinkSecrets()
    expect(loadLinkSecret("lisbon-trip", 7)).toBeNull()
    expect(localStorage.getItem("pot.paylinks.v1")).toBeNull()
    expect(await loadInvite(INVITE.pot)).toBeNull()
    expect(localStorage.getItem("pot.theme")).toBe("dark")
  })

  it("signOut (the mock data source here) runs it before ending the session", async () => {
    mock.setSession("maya")
    sessionStorage.setItem("pot.invite.porto-weekend", "in-flight")
    await signOut()
    expect(loadLinkSecret("lisbon-trip", 7)).toBeNull()
    expect(await loadInvite(INVITE.pot)).toBeNull()
    // the tab's in-flight invite stash stays (the invite page's "Not you? Switch" signs out mid-join)
    expect(sessionStorage.getItem("pot.invite.porto-weekend")).toBe("in-flight")
  })
})
