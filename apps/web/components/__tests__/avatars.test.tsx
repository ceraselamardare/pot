// @vitest-environment jsdom
// Brand avatars (brand/avatars/README.md): the Avatar fallback to initials, the picture when one is chosen, and the
// You → Profile picker (native radios: names, keyboard, status, touch targets).
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AvatarPicker } from "@/components/app-shell/AvatarPicker"
import { Avatar, AvatarStack } from "@/components/pot/Avatar"
import { AVATAR_IDS, avatarOrNull, avatarSrc, isAvatarId } from "@/lib/avatars"

afterEach(() => cleanup())

/** apps/web, from this file (not process.cwd(): the root `pnpm test` runs from the repo root; jsdom's import.meta.url
 *  is not a file URL) */
const WEB = resolve(__dirname, "../..")

const LEO = { name: "Leo", initials: "L", joinIndex: 2 }

describe("avatar ids", () => {
  it("accepts pot-01..pot-10 only", () => {
    expect(AVATAR_IDS).toHaveLength(10)
    for (const id of AVATAR_IDS) expect(isAvatarId(id)).toBe(true)
    for (const bad of ["pot-00", "pot-11", "pot-1", "POT-01", "", null, undefined, 1, "../pot-01", "pot-01.svg"]) expect(isAvatarId(bad)).toBe(false)
    expect(avatarOrNull("pot-07")).toBe("pot-07")
    expect(avatarOrNull("pot-99")).toBeNull()
    expect(avatarSrc("pot-03")).toBe("/avatars/pot-03.svg")
  })

  it("every picture is a small, self-contained brand SVG (viewBox 0 0 96 96, no style, no external refs, < 2 KB)", () => {
    const tokens = JSON.parse(readFileSync(join(WEB, "../../brand/tokens.json"), "utf8")) as {
      color: { tokens: { name: string; value: { day: string; night: string } }[] }
    }
    const allowed = new Set(
      tokens.color.tokens
        .filter((t) => /^member-\d$/.test(t.name) || ["brand", "brand-soft", "ground", "on-brand"].includes(t.name))
        .flatMap((t) => [t.value.day, t.value.night].map((v) => v.toLowerCase())),
    )
    for (const id of AVATAR_IDS) {
      const svg = readFileSync(join(WEB, `public/avatars/${id}.svg`), "utf8")
      expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">'), id).toBe(true)
      expect(Buffer.byteLength(svg), id).toBeLessThan(2048)
      expect(svg, id).not.toMatch(/<style|href=|url\(|<image|<script|<text/i)
      for (const c of svg.match(/#[0-9a-f]{3,8}\b/gi) ?? []) expect(allowed.has(c.toLowerCase()), `${id} ${c}`).toBe(true)
      expect(readFileSync(join(WEB, `../../brand/avatars/${id}.svg`), "utf8"), `${id} brand copy`).toBe(svg)
    }
  })
})

describe("Avatar", () => {
  it("without a choice it is exactly the initials seat (member colour by join order)", () => {
    const { container } = render(<Avatar person={LEO} />)
    const el = container.firstElementChild as HTMLElement
    expect(el.textContent).toBe("L")
    expect(el.className).toContain("bg-member-3")
    expect(el.className).toContain("text-on-brand")
    expect(el.dataset.avatar).toBe("initials")
    expect(el.querySelector("img")).toBeNull()
  })

  it("null and unknown ids fall back to initials, never a broken image", () => {
    for (const avatar of [null, "pot-42" as never, "../../etc" as never]) {
      const { container } = render(<Avatar person={{ ...LEO, avatar }} />)
      expect(container.querySelector("img")).toBeNull()
      expect(container.textContent).toBe("L")
      cleanup()
    }
  })

  it("with a choice it shows the picture, keeps the round mask and is named by the person", () => {
    const { container } = render(<Avatar person={{ ...LEO, avatar: "pot-03" }} size="md" decorative={false} />)
    const el = container.firstElementChild as HTMLElement
    const img = el.querySelector("img")!
    expect(img.getAttribute("src")).toBe("/avatars/pot-03.svg")
    expect(img.getAttribute("alt")).toBe("")
    expect(el.className).toContain("rounded-pill")
    expect(el.className).toContain("overflow-hidden")
    expect(el.className).not.toContain("bg-member-3")
    expect(el.textContent).toBe("")
    expect(screen.getByRole("img", { name: "Leo" })).toBe(el)
  })

  it("stacks mix pictures and initials", () => {
    const { container } = render(
      <AvatarStack
        people={[
          { id: "a", name: "Maya", initials: "M", joinIndex: 0, avatar: "pot-01" },
          { id: "b", name: "Sam", initials: "S", joinIndex: 1 },
        ]}
      />,
    )
    const seats = container.querySelectorAll("[data-avatar]")
    expect([...seats].map((s) => (s as HTMLElement).dataset.avatar)).toEqual(["pot-01", "initials"])
  })
})

describe("AvatarPicker", () => {
  const renderPicker = (value: (typeof AVATAR_IDS)[number] | null = null, status?: "idle" | "saving" | "saved") => {
    const onChange = vi.fn()
    render(<AvatarPicker name="Leo" initials="L" joinIndex={2} value={value} onChange={onChange} status={status} />)
    return onChange
  }

  it("is a named group of 11 radios: initials first (the default), then the ten pictures", () => {
    renderPicker()
    const group = screen.getByRole("group", { name: "Avatar" })
    const radios = within(group).getAllByRole("radio")
    expect(radios).toHaveLength(11)
    expect(radios.map((r) => r.getAttribute("aria-label"))).toEqual([
      "Use my initials",
      "Pot pal",
      "Sun",
      "Cat",
      "Rocket",
      "Sprout",
      "Wave",
      "Party hat",
      "Mountains",
      "Noodle bowl",
      "Bird",
    ])
    expect((screen.getByRole("radio", { name: "Use my initials" }) as HTMLInputElement).checked).toBe(true)
    expect(new Set(radios.map((r) => (r as HTMLInputElement).name)).size).toBe(1)
    expect(group.getAttribute("aria-describedby")).toBeTruthy()
  })

  it("shows the current choice as checked, with a check mark (not colour alone)", () => {
    renderPicker("pot-06")
    expect((screen.getByRole("radio", { name: "Wave" }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole("radio", { name: "Use my initials" }) as HTMLInputElement).checked).toBe(false)
    const label = screen.getByRole("radio", { name: "Wave" }).closest("label")!
    expect(label.querySelector("svg")).not.toBeNull()
  })

  it("picking calls onChange with the id, and initials with null", async () => {
    const onChange = renderPicker("pot-02")
    fireEvent.click(screen.getByRole("radio", { name: "Cat" }))
    expect(onChange).toHaveBeenLastCalledWith("pot-03")
    fireEvent.click(screen.getByRole("radio", { name: "Use my initials" }))
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it("works from the keyboard: Tab into the group, arrows move and select", async () => {
    const user = userEvent.setup()
    const onChange = renderPicker(null)
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Use my initials" }))
    await user.keyboard("{ArrowRight}")
    expect(onChange).toHaveBeenLastCalledWith("pot-01")
  })

  it("every option is a 48 px target (tap-min 44)", () => {
    renderPicker()
    for (const r of screen.getAllByRole("radio")) expect(r.closest("label")!.className).toContain("size-12")
  })

  it("announces saving and saved in a polite status line", () => {
    renderPicker("pot-01", "saving")
    expect(screen.getByRole("status").textContent).toBe("Saving…")
    cleanup()
    renderPicker("pot-01", "saved")
    expect(screen.getByRole("status").textContent).toBe("Saved")
  })
})
