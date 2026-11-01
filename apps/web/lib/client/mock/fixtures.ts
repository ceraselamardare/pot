// Isomorphic mock fixtures: the D-61 demo cast (Maya, Sam, Leo) and two Pots. Pure data, safe to import from
// server components (/j, /demo) and the client mock world alike.
//  - lisbon-trip: the README's seeded state, right after Leo joined: $450 of $450, 3 members (D-61).
//  - porto-weekend: Maya + Sam, $300 of $450, with a live invite. The invite-landing story (F1) runs here,
//    because Leo is already in Lisbon Trip in the seeded state.
// TODO(F-03): replace with `@pot/sdk/testing` fixtures + MockChain once exported (notes/frontend.md).
import type { Category } from "./types"

// "alex" is a guest outside every seeded Pot (pay by link: the person who claims a payment link)
export type PersonaId = "maya" | "sam" | "leo" | "alex"
export const PERSONAS: readonly PersonaId[] = ["maya", "sam", "leo", "alex"]

export interface PersonRec {
  id: string
  name: string
  emailHint: string
  /** the Pot account id, shown only in You → Advanced */
  account: string
}

export const PEOPLE: Record<PersonaId, PersonRec> = {
  maya: { id: "maya", name: "Maya", emailHint: "m•••@gmail.com", account: "maya-4f2a.users.pots.testnet" },
  sam: { id: "sam", name: "Sam", emailHint: "s•••@gmail.com", account: "sam-91c3.users.pots.testnet" },
  leo: { id: "leo", name: "Leo", emailHint: "l•••@gmail.com", account: "leo-7d0e.users.pots.testnet" },
  alex: { id: "alex", name: "Alex", emailHint: "a•••@gmail.com", account: "alex-2b9e.users.pots.testnet" },
}

/** Non-secret invite public key (`?i=`) and its 32-byte secret (`#fragment`) for the porto-weekend fixture. */
// Deterministic fixture keys (seed byte i = (i·salt + 5) & 0xff), like @pot/sdk/testing's LISBON.inviteSeed.
// Never real secrets.
export const PORTO_INVITE = {
  pk: "ed25519:BYQrv4recka1ASkHNkAiZ4ZTSoAjp91824cnR15bRmok",
  secret: "BRAbJjE8R1JdaHN-iZSfqrXAy9bh7PcCDRgjLjlET1o",
} as const

export const LISBON_INVITE = {
  pk: "ed25519:9rmPM1dbRBn6A5L6fPUVMQwfPE6WxKVLnza4tLSiDcxK",
  secret: "BSI_XHmWs9DtCidEYX6buNXyDyxJZoOgvdr3FDFOa4g",
} as const

/**
 * Pay-by-link keys for the "Surf Camp" showcase links (#111 claimed, #112 returned, #113 open) and its old invite.
 * Same deterministic shape as the invite fixtures (salts 13, 17, 19, 23). Never real secrets: #113's secret is how
 * the mock e2e claims a seeded link.
 */
export const SURF_LINKS = {
  claimed: { pk: "ed25519:fj3kMmw2m69nMpMngG6MqU6CWExvm74eRNPejDR378H", secret: "BRIfLDlGU2BteoeUoa67yNXi7_wJFiMwPUpXZHF-i5g" },
  returned: { pk: "ed25519:9mkfsLAmKxof7fUkEvEZQaeQAGyWy9p87sXcBBdTcShN", secret: "BRYnOElaa3yNnq_A0eLzBBUmN0hZanuMna6_0OHyAxQ" },
  open: { pk: "ed25519:G9DJRZhLqukq24wAghXoKd61wrqhKJJf9KRYCbmjMxQe", secret: "BRgrPlFkd4qdsMPW6fwPIjVIW26BlKe6zeDzBhksP1I" },
  invite: { pk: "ed25519:BAypqF3EUDiC7oeXcohUGTY3bvpZdhda4zLcUBA51poY", secret: "BRwzSmF4j6a91OsCGTBHXnWMo7rR6P8WLURbcomgt84" },
} as const

export const DAY = 86_400_000
export const HOUR = 3_600_000
export const MIN = 60_000

export const COVERS = 6

export const CATEGORIES: readonly Category[] = ["groceries", "food", "transport", "stay", "tickets", "other"]
