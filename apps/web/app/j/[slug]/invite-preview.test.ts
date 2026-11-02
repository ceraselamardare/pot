// The invite landing's server read and its link-preview image data (privacy audit 2026-11-02): someone holding an
// invite link sees the Pot's name, cover, balance/goal, member count and the inviter's chosen name (active invite
// only), never anyone else's name or picture; the preview image (fetchable by anyone who knows the slug) gets no
// names or initials at all. Mock data source (the seeded world: Porto Weekend, Maya invites, Maya + Sam are in).
import { vi } from "vitest"
vi.mock("server-only", () => ({}))
import { describe, expect, it } from "vitest"
import { getInvitePreview, getOgPreview } from "./invite-preview"

const PK = "BYQrv4recka1ASkHNkAiZ4ZTSoAjp91824cnR15bRmok" // e2e/fixtures/pot.ts PORTO_INVITE_PK
const NOW = Date.now()

describe("getInvitePreview", () => {
  it("an active invite: the inviter's name and initials; every other seat plain; nobody else named", async () => {
    const p = (await getInvitePreview("porto-weekend", PK, NOW))!
    expect(p).toMatchObject({ name: "Porto Weekend", inviteState: "active", inviter: "Maya", inviterIsMember: true, memberCount: 2 })
    expect(p.seats).toEqual([
      { key: "maya", initials: "M", joinIndex: 0 },
      { key: "sam", initials: "", joinIndex: 1 },
    ])
    expect(JSON.stringify(p)).not.toContain("Sam")
    expect(JSON.stringify(p)).not.toMatch(/avatar/)
  })

  it("no invite key, or one that isn't the Pot's: the count only, no names at all", async () => {
    for (const i of [null, "BYQrv4recka1ASkHNkAiZ4ZTSoAjp91824cnR15bRmoX"]) {
      const p = (await getInvitePreview("porto-weekend", i, NOW))!
      expect(p.seats).toBeNull()
      expect(p.inviter).toBeNull()
      expect(p.memberCount).toBe(2)
      expect(JSON.stringify(p)).not.toMatch(/Maya|Sam/)
    }
  })
})

describe("getOgPreview (the per-invite image)", () => {
  it("only what the public ledger says: name, emoji, count, join order", async () => {
    const p = (await getOgPreview("porto-weekend", NOW))!
    expect(p.members).toEqual([{ joinIndex: 0 }, { joinIndex: 1 }])
    expect(JSON.stringify(p)).not.toMatch(/Maya|Sam|initials/)
  })
})
