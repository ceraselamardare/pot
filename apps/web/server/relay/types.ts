// Relay wire types come from @pot/sdk/api (X-04). The backend adds two things the wire file doesn't have:
// the test-only `{type: "test"}` result (RELAY_TEST_ALLOWLIST, never on production) and `result: null`
// for inner failures that carry no typed result.
import type * as Api from "@pot/sdk/api"
import { RELAY_INTENT_TYPES } from "@pot/sdk/api"

export type IntentType = Api.IntentType
export const INTENTS = RELAY_INTENT_TYPES as readonly [IntentType, ...IntentType[]]
export type Category = Api.Category
export const CATEGORIES: readonly Category[] = ["groceries", "food", "transport", "stay", "tickets", "other"]
export type PotEvent = Api.PotEvent
export type ProposalStatus = Api.DaoProposalStatus
export type RelayResult = Api.RelayResult | { type: "test"; method: string }
export type RelayOk = Omit<Api.RelayOk, "result"> & { result: RelayResult | null }
export type RelayPending = Api.RelayPending

export type Family =
  | "contribute"
  | "create"
  | "spend"
  | "join"
  | "invite"
  | "rules"
  | "close"
  | "maintenance"
  | "vote"
  | "test"
