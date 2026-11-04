// Add money as a typed reducer (ux-spec §4.7-4.8; notes/frontend.md "Back in multi-step sheets").
// Steps: amount (the Add sheet's two steps: "How much?", then "How do you want to add it?" at &step=source) →
// network → coin (any coin, 2026-11-04: "Which coin are you sending?" + the live quote) → address (+ QR) → tracking
// (the DepositStepper).
// The step itself lives in the URL (?sheet=add[&step=source][&src=xc[&net=<chain>][&d=<id>]]), one history entry per step, so the in-sheet
// [Back] and the browser's Back are the same move. This reducer keeps what the person chose across those moves
// (the amount, the source, the network, the coin) and knows where Back goes from each step.
// No Back once a transfer is on its way: from "tracking" a browser Back closes the whole flow instead.
import type { XcChain, XcCoin } from "@/lib/deposit/types"

/** Where the money comes from: "xc" = another app or exchange (its [Continue] goes on to the deposit's network step). */
export type AddSource = "demo" | "pot_dollars" | "xc"
/** ?sheet=add&step=source: the Add sheet's step 2 "How do you want to add it?" */
export const ADD_SOURCE_STEP = "source"
/** The step the URL shows ("tracking" is the address entry once money is on its way). */
export type AddStep = "amount" | "network" | "coin" | "address" | "tracking"
/** The URL's step: no tracking there, it's the address entry with a deposit that's moving. */
export type UrlStep = Exclude<AddStep, "tracking">

export interface AddFlowState {
  /** null: the flow is closed */
  step: AddStep | null
  /** the keypad as typed; null = not touched (the sheet shows the prefill / what's left of the share) */
  typed: string | null
  source: AddSource
  /** the network picked on the network step; null = the first open one */
  chain: XcChain | null
  /** the coin picked on the coin step; null = the network's first open one */
  coin: XcCoin | null
  /** a Back out of a transfer on its way: the sheet closes the whole flow */
  closing: boolean
}

export type AddFlowEvent =
  /** the URL moved (Back, browser Back, a step forward, a deep link); null = no add sheet */
  | { type: "URL"; step: UrlStep | null }
  | { type: "AMOUNT"; value: string }
  | { type: "SOURCE"; value: AddSource }
  | { type: "CHAIN"; value: XcChain }
  | { type: "COIN"; value: XcCoin }
  /** the deposit on the address step left "waiting for you to send" (Simulate sending, or it was already moving) */
  | { type: "TRACKING" }
  /** an expired address: [Get a new address] goes back to the network step */
  | { type: "NEW_ADDRESS" }
  | { type: "RESET" }

export const initialAddFlow: AddFlowState = { step: null, typed: null, source: "demo", chain: null, coin: null, closing: false }

/** Where [Back] goes from each step; null = no Back (the first step, or money on its way). */
export const BACK_TO: Record<AddStep, AddStep | null> = {
  amount: null,
  network: "amount",
  coin: "network",
  address: "coin",
  tracking: null,
}

export const canGoBack = (step: AddStep | null): boolean => step !== null && BACK_TO[step] !== null

/** The step a URL shows. */
export function urlStep(p: { sheet: string | null; src: string | null; d: string | null; net?: string | null }): UrlStep | null {
  if (p.sheet !== "add") return null
  if (p.src !== "xc") return "amount"
  return p.d ? "address" : p.net ? "coin" : "network"
}

/** The previous step's URL, from this one (what [Back] replaces the entry with on a deep link). */
export function previousParams(step: AddStep): ((p: URLSearchParams) => void) | null {
  // the network's Back is the Add sheet's step 2 (where "Another app or exchange" was chosen)
  if (step === "network")
    return (p) => {
      p.delete("src")
      p.delete("net")
      p.delete("d")
      p.set("step", ADD_SOURCE_STEP)
    }
  if (step === "coin") return (p) => p.delete("net")
  // the address's Back is the coin step (an older link without &net= lands on the network step instead)
  if (step === "address") return (p) => p.delete("d")
  return null
}

export function addFlowReducer(s: AddFlowState, e: AddFlowEvent): AddFlowState {
  switch (e.type) {
    case "RESET":
      return initialAddFlow
    case "URL":
      if (e.step === null) return initialAddFlow
      // the same entry (a re-render, the deposit's own updates): a moving transfer stays "tracking"
      if (s.step === "tracking" && e.step === "address") return s
      // Back out of a transfer on its way: no stepping back into it, the whole flow closes (values are dropped)
      if (s.step === "tracking") return { ...initialAddFlow, step: e.step, closing: true }
      if (s.closing) return s
      // Back from the network step: "Another app or exchange" is still the choice (also after a deep link to it)
      if (s.step === "network" && e.step === "amount") return { ...s, step: e.step, source: "xc" }
      return { ...s, step: e.step }
    case "AMOUNT":
      return { ...s, typed: e.value }
    case "SOURCE":
      return { ...s, source: e.value }
    case "CHAIN":
      // another network: its coins differ, so the coin is chosen again
      return { ...s, chain: e.value, coin: s.chain === e.value ? s.coin : null }
    case "COIN":
      return { ...s, coin: e.value }
    case "TRACKING":
      return s.step === "address" ? { ...s, step: "tracking" } : s
    case "NEW_ADDRESS":
      return s.step === "tracking" ? { ...s, step: "address" } : s
  }
}
