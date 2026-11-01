// The /demo explainer's dataset generator (plan/design-direction/05 §7). Node/scripts only: it
// signs with near-api-js (through ../sign) and reads real-chains.json. The web app imports only the
// types (`@pot/sdk/demo` → types.ts) and the committed JSON.
export * from "./types.ts"
export * from "./generate.ts"
export * from "./prepay.ts"
export * from "./real.ts"
export { EventQueue, realTx } from "./receipts.ts"
