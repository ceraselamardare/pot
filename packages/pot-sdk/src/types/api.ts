// API wire types (X-04): every route of plan/api-spec.md, shared by apps/web route handlers and
// clients. All amounts are strings, ids are plain strings (JSON), times are ISO strings except
// `Pop.ts` and NEAR fields such as `expires_at_ms`. Import from "@pot/sdk/api" (or `Api.*` from
// "@pot/sdk"). Sections follow api-spec §0-§2; `ApiRoutes` at the end maps each route to its types.

import type { ActionIntentType } from "./intents.ts"

// ---------------------------------------------------------------- §0.3 envelope, ids, amounts

/** USDC (test) base units, 6 decimals: /^(0|[1-9][0-9]{0,15})$/ ("150000000" = $150). */
export type MicroStr = string
/** NEAR account id, 2-64 chars. */
export type AccountId = string
/** `${slug}.${HUB_ID}` (D-02); the `pot` argument everywhere. */
export type DaoId = string
/** base58 body, 43-44 chars. */
export type PublicKeyStr = `ed25519:${string}`
/** RFC 3339, UTC. */
export type IsoTime = string
/** Client op id: 16 chars of lowercase Crockford base32, /^[0-9a-hjkmnp-tv-z]{16}$/. */
export type OpKey = string
export type SessionKind = "near-auth" | "wallet"
export type Category = "groceries" | "food" | "transport" | "stay" | "tickets" | "other"
export type AvatarTint = "peach" | "sand" | "sage" | "mist" | "lilac" | "rose"
/** A brand avatar (apps/web/public/avatars/<id>.svg, brand/avatars/README.md). null/absent = initials. */
export type AvatarId = "pot-01" | "pot-02" | "pot-03" | "pot-04" | "pot-05" | "pot-06" | "pot-07" | "pot-08" | "pot-09" | "pot-10"
/** Cover gradient token from the design system (D-61: emoji + gradient only). */
export type GradientId = string
/** Device-key proof: ts = Unix ms, sig = base64url Ed25519 signature (§4.2). */
export interface Pop {
  ts: number
  sig: string
}

export const OP_KEY_RE = /^[0-9a-hjkmnp-tv-z]{16}$/
export const MICRO_STR_WIRE_RE = /^(0|[1-9][0-9]{0,15})$/

export interface Ok {
  ok: true
  requestId: string
  replayed?: true
}

/** §1.2 reasons (stable snake_case; never renamed). */
export type Reason =
  | "bad_request"
  | "forbidden_origin"
  | "not_signed_in"
  | "id_token_invalid"
  | "device_proof_invalid"
  | "auth_unavailable"
  | "onboarding_in_progress"
  | "account_setup_failed"
  | "device_not_registered"
  | "device_revoked"
  | "wallet_signature_invalid"
  | "wallet_key_not_full_access"
  | "near_auth_token_invalid"
  | "near_auth_token_expired"
  | "payload_mismatch"
  | "mpc_busy"
  | "mpc_sign_failed"
  | "pairing_invalid"
  | "pairing_expired"
  | "bot_detected"
  | "demo_forbidden"
  | "proposal_not_tracked"
  | "sender_mismatch"
  | "receiver_not_allowed"
  | "method_not_allowed"
  | "action_not_allowed"
  | "args_invalid"
  | "deposit_cap"
  | "gas_cap"
  | "fc_key_deposit"
  | "bad_signature"
  | "key_not_found"
  | "key_not_allowed"
  | "expired"
  | "ttl_too_long"
  | "nonce_used"
  | "nonce_pending"
  | "pot_unknown"
  | "pot_closed"
  | "not_a_member"
  /** hub 1.2.0: this gift can't be sent now (detail.why: gifts_off · paused · pot_not_open · goal_collecting · goal_missed · hub_not_ready · a gift-link reason) */
  | "gifts_unavailable"
  | "slug_taken"
  | "already_voted"
  | "proposal_not_open"
  | "idempotency_conflict"
  | "note_exists"
  | "registration_used"
  | "nudge_too_soon"
  | "rate_limited"
  | "quota_exceeded"
  | "user_suspended"
  | "chain_paused"
  | "amount_too_low"
  | "amount_too_high"
  | "quote_failed"
  | "not_found"
  | "service_unavailable"
  | "internal"

export const REASONS: readonly Reason[] = [
  "bad_request", "forbidden_origin", "not_signed_in", "id_token_invalid", "device_proof_invalid", "auth_unavailable",
  "onboarding_in_progress", "account_setup_failed", "device_not_registered", "device_revoked", "wallet_signature_invalid",
  "wallet_key_not_full_access", "near_auth_token_invalid", "near_auth_token_expired", "payload_mismatch", "mpc_busy",
  "mpc_sign_failed", "pairing_invalid", "pairing_expired", "bot_detected", "demo_forbidden", "proposal_not_tracked",
  "sender_mismatch", "receiver_not_allowed", "method_not_allowed", "action_not_allowed", "args_invalid", "deposit_cap",
  "gas_cap", "fc_key_deposit", "bad_signature", "key_not_found", "key_not_allowed", "expired", "ttl_too_long", "nonce_used",
  "nonce_pending", "pot_unknown", "pot_closed", "not_a_member", "gifts_unavailable", "slug_taken", "already_voted", "proposal_not_open",
  "idempotency_conflict", "note_exists", "registration_used", "nudge_too_soon", "rate_limited", "quota_exceeded",
  "user_suspended", "chain_paused", "amount_too_low", "amount_too_high", "quote_failed", "not_found",
  "service_unavailable", "internal",
]

/** Default HTTP status per reason (api-spec §1.2). */
export const REASON_HTTP_STATUS: Readonly<Record<Reason, number>> = {
  bad_request: 400, forbidden_origin: 403, not_signed_in: 401, id_token_invalid: 401, device_proof_invalid: 401,
  auth_unavailable: 503, onboarding_in_progress: 409, account_setup_failed: 502, device_not_registered: 404,
  device_revoked: 403, wallet_signature_invalid: 401, wallet_key_not_full_access: 403, near_auth_token_invalid: 401,
  near_auth_token_expired: 409, payload_mismatch: 422, mpc_busy: 503, mpc_sign_failed: 502, pairing_invalid: 404,
  pairing_expired: 410, bot_detected: 403, demo_forbidden: 403, proposal_not_tracked: 403, sender_mismatch: 403,
  receiver_not_allowed: 403, method_not_allowed: 403, action_not_allowed: 403, args_invalid: 422, deposit_cap: 403,
  gas_cap: 422, fc_key_deposit: 403, bad_signature: 401, key_not_found: 403, key_not_allowed: 403, expired: 409,
  ttl_too_long: 422, nonce_used: 409, nonce_pending: 409, pot_unknown: 404, pot_closed: 409, not_a_member: 403,
  gifts_unavailable: 409,
  slug_taken: 409, already_voted: 409, proposal_not_open: 409, idempotency_conflict: 409, note_exists: 409,
  registration_used: 409, nudge_too_soon: 429, rate_limited: 429, quota_exceeded: 429, user_suspended: 403,
  chain_paused: 409, amount_too_low: 422, amount_too_high: 422, quote_failed: 502, not_found: 404,
  service_unavailable: 503, internal: 500,
}

export type QuotaFamily =
  | "accounts"
  | "create"
  | "contribute"
  | "spend"
  | "join"
  | "invite"
  | "rules"
  | "close"
  | "maintenance"
  | "vote"
  | "devices"
  | "pairing"
  | "faucet"
  | "notes"
  | "comments"
  /** "Ask for a top-up" (2026-11-03): asks per user per day; nudges per sender per day */
  | "topups"
  | "nudges"
  | "xc"
  | "budget"
  | "finalize"
  | "lease"

export type ServiceUnavailableCause = "rpc" | "db" | "relayer_busy" | "sponsor_low" | "global_cap" | "treasury" | "oneclick" | "maintenance"

export interface Err {
  ok: false
  requestId: string
  reason: Reason
  retryAfterMs?: number
  /** When something reached the chain. */
  txHash?: string
  /** Machine-readable extras (field, family, limit, resetsAt, cause, status…). */
  detail?: Record<string, unknown>
  /** English, for logs and the Details sheet only; never shown as UX copy. */
  message?: string
}

export type ApiResult<T extends Ok> = T | Err

// ---------------------------------------------------------------- §4.1 cookies

/** The non-httpOnly `pot_hint` cookie (base64url JSON, ≤ 1 KB). Display and routing only. */
export interface SessionHint {
  accountId: AccountId
  kind: SessionKind
  displayName: string
  emailHint?: string
  devicePublicKey?: PublicKeyStr
}

// ---------------------------------------------------------------- §2.1 session

export interface SessionInfo {
  kind: SessionKind
  accountId: AccountId
  displayName: string
  avatarTint: AvatarTint
  /** the chosen brand avatar; null = initials */
  avatar?: AvatarId | null
  /** "m•••@gmail.com" (landing.signed_in_as) */
  emailHint?: string
  expiresAt: IsoTime
  usdcRegistered: boolean
  /** near-auth only */
  device?: { publicKey: PublicKeyStr; status: "active" | "pending" }
  /** near-auth only; the client needs it to build AddKey (frontend §4.4) */
  mpcPublicKey?: PublicKeyStr
}

/** GET /api/session */
export interface SessionGetRes extends Ok {
  session: SessionInfo | null
}

/** POST /api/session */
export interface SessionCreateReq {
  /** Auth0 ID token from the NEAR Auth login, ≤ 4 KB */
  idToken: string
  devicePublicKey: PublicKeyStr
  keyKind: "webcrypto" | "fallback"
  /** rev4 (B-20): from GET /api/session/challenge; required once B-20 ships */
  challenge?: string
  /** over `pot-session-v1|${b64url(sha256(idToken))}|${ts}` (§4.2) */
  pop: Pop
  /** optional first-run name, 1-40 chars */
  displayName?: string
}
export interface SessionCreateRes extends Ok {
  accountId: AccountId
  isNew: boolean
  /** false → run the new-device flow (architecture 3.3) */
  deviceOnChain: boolean
  usdcRegistered: boolean
  mpcPublicKey: PublicKeyStr
  session: SessionInfo
  createTxHash?: string
}

/** GET /api/session/challenge (rev4) */
export interface SessionChallengeRes extends Ok {
  /** base64url (no padding) of 32 bytes: ts(8, BE ms) ‖ random(16) ‖ HMAC(8) */
  challenge: string
  expiresAt: IsoTime
}

/** POST /api/session/device: device-key re-login (K-2) */
export interface DeviceLoginReq {
  accountId: AccountId
  devicePublicKey: PublicKeyStr
  /** `pot-device-login-v1|${accountId}|${ts}` */
  pop: Pop
}
export interface DeviceLoginRes extends Ok {
  session: SessionInfo
}

/** POST /api/session/wallet: NEAR Connect NEP-413 */
export interface WalletSessionReq {
  accountId: AccountId
  publicKey: PublicKeyStr
  /** base64, as returned by the wallet */
  signature: string
  /** base64 of 32 bytes: u64 big-endian Unix ms ‖ 24 random bytes */
  nonce: string
  message: "Sign in to Pot"
  /** must equal the app host, e.g. "pot-team.vercel.app" */
  recipient: string
}
export interface WalletSessionRes extends Ok {
  session: SessionInfo
  isNew: boolean
  usdcRegistered: boolean
}

/** DELETE /api/session → 200 Ok */
export interface LogoutReq {
  pushEndpoint?: string
  forgetDevice?: boolean
}
export type LogoutRes = Ok

/** PATCH /api/me */
export interface ProfilePatch {
  displayName?: string
  avatarTint?: AvatarTint
  notifyEmail?: boolean
  /** a brand avatar, or null to go back to initials (the only field the route accepts so far) */
  avatar?: AvatarId | null
}
export interface ProfileRes extends Ok {
  profile: { displayName: string; avatarTint: AvatarTint; notifyEmail: boolean; avatar: AvatarId | null }
}

// ---------------------------------------------------------------- §2.2 devices

/** POST /api/devices: relay the NEAR Auth-signed AddKey (D-21) */
export interface DevicesReq {
  guardId: "jwt#https://login.testnet.fast-auth.com/"
  /** the 60 s signing JWT from the NEAR Auth approval popup, ≤ 7168 B */
  verifyPayload: string
  /** base64 of the NEP-461-prefixed DelegateAction bytes the client built (≤ 1,400 B) */
  signPayload: string
  /** the new key inside the AddKey */
  devicePublicKey: PublicKeyStr
  keyKind: "webcrypto" | "fallback"
  /** `pot-device-add-v1|${accountId}|${ts}`, signed by devicePublicKey */
  pop: Pop
  idempotencyKey: OpKey
}
export interface DevicesRes extends Ok {
  device: { publicKey: PublicKeyStr; status: "active" }
  /** absent when the key was already on chain */
  signTxHash?: string
  addKeyTxHash?: string
  executedAtBlock: number
}

/** POST /api/devices/pair (D-21 fallback "Pair from Safari", Phase 2) */
export interface PairStartReq {
  devicePublicKey: PublicKeyStr
  keyKind: "webcrypto" | "fallback"
  /** `pot-device-pair-v1|${accountId}|${ts}` */
  pop: Pop
}
export interface PairStartRes extends Ok {
  /** 'pr_' + 20 Crockford base32 chars */
  pairingId: string
  /** 6 digits, shown on both screens */
  code: string
  linkUrl: string
  safariUrl: string
  /** now + 10 min */
  expiresAt: IsoTime
}

/** GET /api/devices/pair/[id] */
export interface PairStatusRes extends Ok {
  status: "pending" | "completed" | "expired"
  code: string
  /** first 8 base58 chars */
  keyFingerprint: string
  expiresAt: IsoTime
}

/** POST /api/devices/pair/[id]/complete (Safari side) */
export interface PairCompleteReq {
  /** AddKey(pairing key, FullAccess) on the own account */
  signedDelegate: string
  idempotencyKey: OpKey
}
export interface PairCompleteRes extends Ok {
  device: { publicKey: PublicKeyStr; status: "active" }
  txHash: string
  executedAtBlock: number
}

// ---------------------------------------------------------------- §2.3 relay

/** rev5: 'withdraw_request' is Phase 3, not built. `add_device_key` goes through /api/devices. */
export type IntentType = Exclude<ActionIntentType, "add_device_key">
export const RELAY_INTENT_TYPES: readonly IntentType[] = [
  "add_money",
  "request_spend",
  "vote",
  "join",
  "create_pot",
  "add_invite",
  "revoke_invite",
  "rotate_invite",
  "propose_close",
  "retry_payout",
  "set_rules",
  "propose_rules",
  "ok_request",
  "claim_link",
  "reclaim_link",
  "refund_unfunded",
  "send_gift",
  "set_gifts",
]

export interface RelayContext {
  /** add_money after a 1Click deposit (marks deposit_intent ADDED) */
  depositIntentId?: string
  /** add_money: where the money came from, as the person picked it (web: the money-in details) */
  source?: "demo" | "pot_dollars"
  /** create_pot only; stored off-chain on success (the emoji is a create_pot argument, on chain) */
  meta?: { gradient?: GradientId }
}

export interface RelaySignedReq {
  /** base64(borsh(SignedDelegateAction)), no prefix; ≤ 4 KB decoded */
  signedDelegate: string
  idempotencyKey: OpKey
  /** advisory: must match the decoded call, else args_invalid */
  intent: IntentType
  /** request_spend only; must equal args.request_ref (an OpKey, + a 16-hex receipt fingerprint when one is attached) */
  requestRef?: string
  context?: RelayContext
}
/** POST /api/relay */
export type RelayReq = RelaySignedReq

/** A parsed NEP-297 log, only from trusted executors (§3.4). */
export interface PotEvent {
  standard: "pot" | "nep141"
  version: string
  event: string
  data: unknown
  executor: AccountId
  receiptId: string
}

export type DaoProposalStatus = "InProgress" | "Approved" | "Rejected" | "Removed" | "Expired" | "Failed"

export type RelayResult =
  | { type: "contribution"; recorded: boolean; amount: MicroStr; usedAmount: MicroStr }
  | {
      type: "spend"
      requestId: number
      path: "instant" | "vote"
      proposalId: number | null
      payout?: "pending" | "sent" | "failed"
      approvalsNeeded?: number
    }
  | {
      type: "vote"
      proposalId: number
      action: "VoteApprove" | "VoteReject" | "Finalize"
      proposalStatus: DaoProposalStatus
      payout?: "sent" | "failed"
    }
  /** pending: the group must still approve */
  | { type: "join"; member: AccountId; status: "active" | "pending" }
  | { type: "create_pot"; potId: DaoId; slug: string }
  | { type: "rules"; applied: boolean; proposalId?: number }
  | { type: "close"; proposalId: number }
  | { type: "invite"; added?: PublicKeyStr; revoked?: PublicKeyStr }
  | { type: "maintenance"; proposalId: number; proposalStatus?: string }
  /** hub 1.1.0 ok_request: approved = the hub approved on this OK (the payout may still fail, D7) */
  | { type: "ok"; requestId: number; proposalId: number | null; approved: boolean; status: string; reason?: string }
  /** hub 1.1.0 claim_link / reclaim_link */
  | { type: "link"; requestId: number; ok: boolean; status: string; receiverId?: AccountId; reason?: string }
  /** hub 1.2.0 send_gift: recorded = the gift reached the Pot (else the token refunded the giver) */
  | { type: "gift"; recorded: boolean; amount: MicroStr; usedAmount: MicroStr; giftRef: string; giftsTotal?: MicroStr }
  /** hub 1.2.0 set_gifts */
  | { type: "gifts"; on: boolean; changed: boolean }

/** HTTP 200 */
export interface RelayOk extends Ok {
  /** 'rl_' + ULID */
  relayId: string
  txHash: string
  /** https://testnet.nearblocks.io/txns/<txHash> */
  receiptUrl: string
  outcome: "success" | "inner_failed"
  /** inner_failed: sanitized panic text */
  error?: string
  /** inner_failed: §1.3 */
  errorCode?: string
  events: PotEvent[]
  /** highest block height among the receipts seen so far (architecture K-14) */
  executedAtBlock: number
  result: RelayResult
  /** false only for the early request_spend response (D-07 Rev 2, §3.4) */
  final: boolean
}
/** HTTP 202: outcome unknown after 25 s; poll GET /api/relay/[relayId] */
export interface RelayPending extends Ok {
  status: "pending"
  relayId: string
  txHash: string
}
export type RelayRes = RelayOk | RelayPending | Err

/** POST /api/tx/report (optional): a self-paid wallet tx */
export interface TxReportReq {
  txHash: string
  idempotencyKey: OpKey
}
export interface TxReportRes extends Ok {
  accepted: boolean
  events: PotEvent[]
}

// ---------------------------------------------------------------- §2.4 faucet

/** POST /api/faucet: default "150000000" ($150); min "50000000" ($50, rev4); max "500000000" */
export interface FaucetReq {
  amount?: MicroStr
  idempotencyKey: OpKey
}
export interface FaucetRes extends Ok {
  txHash: string
  amount: MicroStr
  registeredNow: boolean
  executedAtBlock: number
}
export const FAUCET_LIMITS = { defaultAmount: "150000000", minAmount: "50000000", maxAmount: "500000000" } as const

// ---------------------------------------------------------------- §2.5 notes, nudges, feed, meta

/** POST /api/notes: off-chain text (D-07) */
export interface NoteReq {
  kind: "memo" | "decline_reason"
  pot: DaoId
  /** memo: the request_ref (OpKey) of the spend; decline_reason: the DAO proposal id as a decimal string */
  ref: string
  /** 1-140 code points after NFC + trim; no control characters; no Unicode Cf except ZWJ / VS16 */
  text: string
  idempotencyKey?: OpKey
}
export interface NoteRes extends Ok {
  note: { kind: NoteReq["kind"]; pot: DaoId; ref: string; createdAt: IsoTime }
}

/**
 * POST /api/nudges (built 2026-11-03 with "Ask for a top-up"; apps/web/lib/topups-api.ts): `to` may list several
 * people; `topup` names the ask it's about. 1 per (Pot, target) per rolling 24 h, whoever sends it; 10 per sender a day.
 */
export interface NudgeReq {
  pot: DaoId
  to: AccountId | AccountId[]
  topup?: string
  idempotencyKey: OpKey
}
export interface NudgeRes extends Ok {
  delivered: "push" | "email" | "none"
  nudged: AccountId[]
  skipped: { account: AccountId; why: "too_soon" | "done" | "not_asked" | "not_member" | "self" }[]
}

/** GET /api/pots/[pot]/feed query ([pot] is a slug or a DAO id) */
export interface FeedQuery {
  before?: string
  /** 1-100, default 50 */
  limit?: number
}
export type FeedItemType = "joined" | "contribution" | "request" | "rule_change" | "close_requested" | "closed"
export interface FeedApiItem {
  /** contribution:<txHash> | request:<proposalId> | join:<account> | rules:<txHash> | closed:<dao> */
  key: string
  type: FeedItemType
  actor: AccountId
  /** block timestamp */
  at: IsoTime
  txHash?: string
  amount?: MicroStr
  proposalId?: number
  requestRef?: string
  category?: Category
  path?: "instant" | "vote"
  receiver?: AccountId
  payoutFailed?: boolean
}
export interface FeedRes extends Ok {
  pot: { potId: DaoId; slug: string; name: string; emoji?: string; gradient?: GradientId }
  /** newest first */
  items: FeedApiItem[]
  /** members only (rev4 M-7); others get {} */
  profiles: Record<AccountId, { name: string; tint: AvatarTint; avatarUrl?: null; avatar?: AvatarId | null }>
  /** requestRef → text; members only */
  memos?: Record<string, string>
  /** proposalId → account → text; members only */
  declineReasons?: Record<string, Record<AccountId, string>>
  /** hub request id (decimal string) → comments not removed; members only, requests with ≥ 1 comment */
  commentCounts?: Record<string, number>
  /** hub request ids (decimal strings) that have saved receipt details (web: spend_receipt). Everyone gets it: it only
   *  says a receipt is attached (the details are members only, GET /api/pots/[pot]/requests/[id]/receipt). */
  receipts?: string[]
  /** contribution tx hash → where the money came from (members only; web: the money-in rows and details) */
  addSources?: Record<string, { kind: "demo" | "pot_dollars" | "xc"; coin?: string; chain?: string }>
  nextCursor?: string
  syncedAt: IsoTime
}

// ---------------------------------------------------------------- comments on requests (off-chain)

/** One comment in a request's thread. A removed one keeps its place with `body: null`, `deleted: true`. */
export interface RequestComment {
  /** decimal string (bigserial) */
  id: string
  author: AccountId
  /** 1-280 code points after NFC + trim; null once removed */
  body: string | null
  createdAt: IsoTime
  deleted: boolean
}
/** GET /api/pots/[pot]/requests/[id]/comments: members only; oldest first (newest at the bottom), the last 200 */
export interface CommentsRes extends Ok {
  pot: DaoId
  /** the hub's request id (the envelope's `requestId` is the API request's id) */
  hubRequestId: number
  comments: RequestComment[]
  /** display names and avatars of the authors */
  profiles: Record<AccountId, { name: string; avatar?: AvatarId | null }>
}
/** POST /api/pots/[pot]/requests/[id]/comments */
export interface CommentPostReq {
  /** 1-280 code points after NFC + trim; line breaks allowed (≤ 2 in a row), no other control characters */
  body: string
  /** the composer's op id: a retried send with the same key returns the first comment (replayed) */
  idempotencyKey?: OpKey
}
export interface CommentPostRes extends Ok {
  comment: RequestComment
}
/** DELETE /api/pots/[pot]/requests/[id]/comments/[commentId]: the author only; soft (idempotent) */
export interface CommentDeleteRes extends Ok {
  comment: RequestComment
}

export interface PotMeta {
  slug: string
  name: string
  emoji?: string
  gradient?: GradientId
}
/** GET /api/pots/meta?pots=<slug|dao>,… (≤ 50) */
export interface PotsMetaQuery {
  pots: string
}
export interface PotsMetaRes extends Ok {
  pots: Record<DaoId, PotMeta>
}
/** PATCH /api/pots/[pot]/meta (optional) */
export interface PotMetaPatch {
  /** one grapheme */
  emoji?: string
  gradient?: GradientId
}
export interface PotMetaRes extends Ok {
  pot: DaoId
  meta: PotMeta
}

// ---------------------------------------------------------------- §2.6 push

export interface PushSubscriptionJson {
  endpoint: string
  expirationTime: number | null
  keys: { p256dh: string; auth: string }
}
/** POST /api/push/subscription */
export interface PushSubReq {
  subscription: PushSubscriptionJson
  /** display-mode standalone when subscribing */
  standalone: boolean
  platform?: "ios" | "android" | "desktop" | "other"
}
export interface PushSubRes extends Ok {
  subscriptionId: string
}
/** DELETE /api/push/subscription → always 200 */
export interface PushUnsubReq {
  endpoint: string
}
export type PushUnsubRes = Ok

/** §6.2 Declarative Web Push payload (≤ 2,500 bytes as JSON). */
export type NotificationType = "approval_needed" | "request_resolved" | "money_arrived" | "member_joined" | "deposit_status" | "pot_closed" | "nudge" | "comment" | "trust_up" | "goal" | "topup"
export interface PushPayload {
  web_push: 8030
  notification: {
    title: string
    body?: string
    /** absolute https, same origin */
    navigate: string
    lang?: string
    dir?: "ltr" | "rtl" | "auto"
    /** = the topic */
    tag?: string
    silent?: boolean
    app_badge?: number
    data?: { type: NotificationType; pot?: DaoId; proposalId?: number; [k: string]: unknown }
  }
  app_badge?: number
  mutable?: boolean
}

// ---------------------------------------------------------------- §2.7 1Click (Phase 2)

/** Origin networks (apps/web server/features/oneclick/origins.ts is the curated config, 2026-11-04). */
export type XcChain = "base" | "arb" | "sol" | "eth" | "pol" | "op" | "avax" | "sui" | "aptos" | "ton" | "tron" | "xrp" | "btc" | "doge" | "zec"
/** Coins a person can send (stablecoins 1:1; others are converted at the live quote) */
export type XcCoin = "USDC" | "USDT" | "ETH" | "SOL" | "POL" | "AVAX" | "SUI" | "APT" | "TON" | "XRP" | "BTC" | "DOGE" | "ZEC"
export type XcSpeed = "fast" | "slower" | "slow"
export type OneClickStatus = "PENDING_DEPOSIT" | "KNOWN_DEPOSIT_TX" | "PROCESSING" | "SUCCESS" | "INCOMPLETE_DEPOSIT" | "REFUNDED" | "FAILED"
export type DepositStatus = OneClickStatus | "EXPIRED" | "ADDED" | "STUCK"
export type OneClickMode = "real" | "simulated"

/** GET /api/oneclick/chains */
export interface OneClickChainsRes extends Ok {
  mode: OneClickMode
  chains: {
    id: XcChain
    label: string
    /** "slower" = not under a minute (`speed` says how slow) */
    status: "ok" | "paused" | "slower"
    speed: XcSpeed
    /** the smallest amount offered on this network right now, USD micro */
    minAmount: MicroStr
    typicalSeconds: number
    coins: { coin: XcCoin; name: string; stable: boolean; decimals: number; status: "ok" | "unavailable"; minAmount: MicroStr }[]
  }[]
}

/** POST /api/oneclick/price: the coin step's live dry quote (no Pot) */
export interface PriceReq {
  chain: XcChain
  coin?: XcCoin
  /** USD micro to add */
  amount: MicroStr
}
export interface PriceRes extends Ok {
  mode: OneClickMode
  chain: XcChain
  coin: XcCoin
  decimals: number
  stable: boolean
  usdTarget: MicroStr
  /** FLEX_INPUT tolerance: 100 bps for stablecoins, 300 for other coins */
  slippageBps: number
  quote: QuoteRes["quote"]
  quotedAt: IsoTime
  correlationId?: string
}

/** POST /api/oneclick/quote */
export interface QuoteReq {
  pot: DaoId
  chain: XcChain
  /** absent = USDC where the network has it */
  coin?: XcCoin
  /** USD micro to add */
  amount: MicroStr
  dry?: boolean
  idempotencyKey: OpKey
}
export interface QuoteRes extends Ok {
  mode: OneClickMode
  /** absent when dry */
  depositIntentId?: string
  coin?: XcCoin
  decimals?: number
  stable?: boolean
  usdTarget?: MicroStr
  /** amountIn / minAmountIn / refundFee in the coin's base units; amountOut / minAmountOut / withdrawFee USD micro */
  quote: {
    amountIn: MicroStr
    minAmountIn: MicroStr
    amountOut: MicroStr
    minAmountOut: MicroStr
    timeEstimateSec: number
    refundFee: MicroStr
    withdrawFee: MicroStr
  }
  /** absent when dry */
  depositAddress?: string
  depositMemo?: string
  /** request deadline = now + 2 h; the QR expires here */
  deadline?: IsoTime
  /** real: the plain address; simulated: "POT TESTNET DEMO - DO NOT SEND FUNDS" */
  qrText?: string
  correlationId?: string
}

/** GET /api/oneclick/status/[id] */
export interface DepositStatusRes extends Ok {
  mode: OneClickMode
  chain?: XcChain
  coin?: XcCoin
  decimals?: number
  stable?: boolean
  /** what the person asked to add, USD micro */
  usdTarget?: MicroStr
  status: DepositStatus
  /** D-50 stepper: waiting, spotted, converting, arrived, added */
  step: 1 | 2 | 3 | 4 | 5
  depositedAmount?: MicroStr
  amountOut?: MicroStr
  refundedAmount?: MicroStr
  /** NO_LIQUIDITY | PARTIAL_DEPOSIT | AMOUNT_LESS_THAN_MIN_AMOUNT_OUT | … */
  refundReason?: string | null
  destinationTxHash?: string
  explorerUrl?: string
  deadline: IsoTime
  updatedAt: IsoTime
  /** the UI shows "Taking longer" 5 min after this (D-50) */
  processingSince?: IsoTime
}

/** POST /api/oneclick/simulate (testnet only) */
export interface SimulateReq {
  depositIntentId: string
  /** default 'ok' */
  scenario?: "ok" | "partial" | "no_liquidity" | "failed" | "slow" | "expired"
  /** what "arrives", in the coin's base units; default = the quote amount */
  amount?: MicroStr
  idempotencyKey: OpKey
}
export interface SimulateRes extends Ok {
  startedAt: IsoTime
  profile: { pendingSec: number; processingSec: number }
}

// ---------------------------------------------------------------- §2.9 Telegram (Phase 2)

/** POST /api/telegram/webhook: the body is a Telegram `Update` (grammY); always 200. */
export type TelegramWebhookReq = Record<string, unknown>
export type TelegramWebhookRes = Ok

/** POST /api/telegram/link */
export type TelegramLinkReq = { kind: "group"; pot: DaoId } | { kind: "user" }
export interface TelegramLinkRes extends Ok {
  /** t.me/<bot>?startgroup=<token> or ?start=<token> */
  url: string
  expiresAt: IsoTime
}

// ---------------------------------------------------------------- §2.10 operations

/** GET /api/health */
export interface HealthRes extends Ok {
  network: "testnet" | "mainnet"
  version: string
  relayer: "ok" | "low" | "critical"
  rpc: "ok" | "degraded" | "down"
  db: "ok" | "down"
  features: { nearAuth: boolean; oneClick: "off" | "simulated" | "real"; push: boolean; email: boolean; telegram: boolean }
}

/** GET /api/cron/reconcile (cron auth). api-spec §5.3 lists the steps but no body; this is a summary. */
export interface CronReconcileRes extends Ok {
  steps: { name: string; ok: boolean; count?: number; error?: string }[]
}

// ---------------------------------------------------------------- route map

type Route<Req, Res> = { req: Req; res: Res }

/** Every route → request body (or query) and success body. Errors are always `Err`. */
export interface ApiRoutes {
  "GET /api/session": Route<void, SessionGetRes>
  "POST /api/session": Route<SessionCreateReq, SessionCreateRes>
  "GET /api/session/challenge": Route<void, SessionChallengeRes>
  "POST /api/session/device": Route<DeviceLoginReq, DeviceLoginRes>
  "POST /api/session/wallet": Route<WalletSessionReq, WalletSessionRes>
  "DELETE /api/session": Route<LogoutReq, LogoutRes>
  "PATCH /api/me": Route<ProfilePatch, ProfileRes>
  "POST /api/devices": Route<DevicesReq, DevicesRes>
  "POST /api/devices/pair": Route<PairStartReq, PairStartRes>
  "GET /api/devices/pair/[id]": Route<void, PairStatusRes>
  "POST /api/devices/pair/[id]/complete": Route<PairCompleteReq, PairCompleteRes>
  "POST /api/relay": Route<RelayReq, RelayOk | RelayPending>
  "GET /api/relay/[relayId]": Route<void, RelayOk | RelayPending>
  "POST /api/tx/report": Route<TxReportReq, TxReportRes>
  "POST /api/faucet": Route<FaucetReq, FaucetRes>
  "POST /api/notes": Route<NoteReq, NoteRes>
  "POST /api/nudges": Route<NudgeReq, NudgeRes>
  "GET /api/pots/[pot]/feed": Route<FeedQuery, FeedRes>
  "GET /api/pots/[pot]/requests/[id]/comments": Route<void, CommentsRes>
  "POST /api/pots/[pot]/requests/[id]/comments": Route<CommentPostReq, CommentPostRes>
  "DELETE /api/pots/[pot]/requests/[id]/comments/[commentId]": Route<void, CommentDeleteRes>
  "GET /api/pots/meta": Route<PotsMetaQuery, PotsMetaRes>
  "PATCH /api/pots/[pot]/meta": Route<PotMetaPatch, PotMetaRes>
  "POST /api/push/subscription": Route<PushSubReq, PushSubRes>
  "DELETE /api/push/subscription": Route<PushUnsubReq, PushUnsubRes>
  "GET /api/oneclick/chains": Route<void, OneClickChainsRes>
  "POST /api/oneclick/quote": Route<QuoteReq, QuoteRes>
  "POST /api/oneclick/price": Route<PriceReq, PriceRes>
  "GET /api/oneclick/status/[id]": Route<void, DepositStatusRes>
  "POST /api/oneclick/simulate": Route<SimulateReq, SimulateRes>
  "POST /api/telegram/webhook": Route<TelegramWebhookReq, TelegramWebhookRes>
  "POST /api/telegram/link": Route<TelegramLinkReq, TelegramLinkRes>
  "GET /api/health": Route<void, HealthRes>
  "GET /api/cron/reconcile": Route<void, CronReconcileRes>
}
export type ApiRouteKey = keyof ApiRoutes
export type ApiReq<K extends ApiRouteKey> = ApiRoutes[K]["req"]
export type ApiRes<K extends ApiRouteKey> = ApiRoutes[K]["res"]

export const isErr = (r: { ok: boolean }): r is Err => r.ok === false
export const isRelayPending = (r: RelayRes): r is RelayPending => r.ok && "status" in r && r.status === "pending"
