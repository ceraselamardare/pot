import { describe, expect, it } from "vitest"
import { BACK_TO, addFlowReducer, canGoBack, initialAddFlow, previousParams, urlStep, type AddFlowEvent, type AddFlowState } from "./add-flow"

const run = (events: AddFlowEvent[], from: AddFlowState = initialAddFlow) => events.reduce(addFlowReducer, from)
const url = (step: "amount" | "network" | "address" | null): AddFlowEvent => ({ type: "URL", step })

describe("add money flow: steps and Back (notes/frontend.md 'Back in multi-step sheets')", () => {
  it.each([
    [{ sheet: "add", src: null, d: null }, "amount"],
    [{ sheet: "add", src: "xc", d: null }, "network"],
    [{ sheet: "add", src: "xc", d: "dp_1" }, "address"],
    [{ sheet: "spend", src: null, d: null }, null],
    [{ sheet: null, src: "xc", d: "dp_1" }, null],
  ] as const)("urlStep(%j) = %s", (p, step) => expect(urlStep(p)).toBe(step))

  it("Back goes one step back, and never from the first step or once money is on its way", () => {
    expect(BACK_TO).toEqual({ amount: null, network: "amount", address: "network", tracking: null })
    expect([canGoBack("amount"), canGoBack("network"), canGoBack("address"), canGoBack("tracking"), canGoBack(null)]).toEqual([false, true, true, false, false])
  })

  it("the previous step's URL drops only this step's params (a deep link's Back)", () => {
    const p = new URLSearchParams("sheet=add&src=xc&d=dp_1&amount=100")
    previousParams("address")!(p)
    expect(p.toString()).toBe("sheet=add&src=xc&amount=100")
    previousParams("network")!(p)
    expect(p.toString()).toBe("sheet=add&amount=100")
    expect(previousParams("amount")).toBeNull()
    expect(previousParams("tracking")).toBeNull()
  })

  it("network → Back keeps the amount and the source", () => {
    const s = run([url("amount"), { type: "AMOUNT", value: "100" }, { type: "SOURCE", value: "pot_dollars" }, url("network"), url("amount")])
    expect(s).toMatchObject({ step: "amount", typed: "100", source: "pot_dollars", closing: false })
  })

  it("address → Back keeps the network; Back again keeps the amount", () => {
    const atAddress = run([url("amount"), { type: "AMOUNT", value: "100" }, url("network"), { type: "CHAIN", value: "sol" }, url("address")])
    const network = addFlowReducer(atAddress, url("network"))
    expect(network).toMatchObject({ step: "network", chain: "sol", typed: "100" })
    expect(addFlowReducer(network, url("amount"))).toMatchObject({ step: "amount", chain: "sol", typed: "100" })
    // forward again: still the same choices
    expect(run([url("network"), url("address")], network)).toMatchObject({ step: "address", chain: "sol", typed: "100" })
  })

  it("once money is on its way, a Back closes the whole flow instead of stepping back", () => {
    const tracking = run([url("amount"), { type: "AMOUNT", value: "100" }, url("network"), url("address"), { type: "TRACKING" }])
    expect(tracking.step).toBe("tracking")
    expect(canGoBack(tracking.step)).toBe(false)
    // the deposit's own updates on the same entry keep it tracking
    expect(addFlowReducer(tracking, url("address"))).toBe(tracking)
    const popped = addFlowReducer(tracking, url("network"))
    expect(popped).toMatchObject({ closing: true, typed: null, chain: null })
    // and it stays closing until the sheet is gone
    expect(addFlowReducer(popped, url("amount")).closing).toBe(true)
    expect(addFlowReducer(popped, url(null))).toEqual(initialAddFlow)
  })

  it("TRACKING only applies on the address step", () => {
    expect(run([url("network"), { type: "TRACKING" }]).step).toBe("network")
  })

  it("an expired address: 'Get a new address' unlocks Back to the network, the network kept", () => {
    const tracking = run([url("network"), { type: "CHAIN", value: "base" }, url("address"), { type: "TRACKING" }])
    const s = run([{ type: "NEW_ADDRESS" }, url("network")], tracking)
    expect(s).toMatchObject({ step: "network", chain: "base", closing: false })
  })

  it("closing the flow (no ?sheet=add) forgets everything", () => {
    const s = run([url("amount"), { type: "AMOUNT", value: "42" }, url("network"), { type: "CHAIN", value: "arb" }, url(null)])
    expect(s).toEqual(initialAddFlow)
    expect(addFlowReducer(s, { type: "RESET" })).toEqual(initialAddFlow)
  })
})
