# Pot: data model

> Owner: backend-architect. Written 2026-10-21 against [decisions.md](decisions.md) Revision 2 (D-31: Neon Postgres Free + Drizzle `0.45.4` pinned + `pg`). Companion docs: [architecture.md](architecture.md), [api-spec.md](api-spec.md).
> Markers: ⚠️ = assumption or unverified, to confirm on Nov 1.
> **Rev 3 review (2026-10-21, [review.md](review.md)):** session kind `dev` (preview-only dev session, api-spec §2.1); proof purpose `dev_session`; preset `custom`; `push_subscription.demo_pot_id` for the R-15 option; the demo Pot kinds follow D-33 Rev 3 (§8 Q3 closed).
> **Rev 4 security fixes (2026-10-21, [review-security.md](review-security.md) §7):** proof purpose `auth_challenge` (the OIDC nonce challenge, single use); quota subjects `ipnet:{hmac}` (IPv4 address or IPv6 /64) and `proposal:{dao}:{id}`, and the counters `hub_yocto`, `finalize`, `xc_sim_usd`, `registrations`; invite expiry and max uses always set; shared demo Pots get fresh personas and the reference personas hold no key; no schema change otherwise (a `pending_device` session is a session whose `device.status` is `pending`).

## 0. Principles

1. **The chain is the source of truth** for money, members, rules, proposals and votes (D-31). Every DB column about those is a cache that can be rebuilt from chain views and tx outcomes, and every screen that shows money reads the chain directly (D-32).
2. **The DB owns only what the chain can't hold:** identity links (Auth0 `sub` ↔ account), sessions and devices, display names, off-chain text (memos, decline reasons), notification state, quotas, leases, the relay log, deposit intents and the demo pool.
3. **No secrets in the DB.** No private keys of any kind, no invite secrets, no Auth0 tokens (§7). Session cookies, IPs and link tokens are stored only as hashes.
4. **Small and cheap.** Neon Free gives 1 GB and 100 CU-hours per month and scales to zero after 5 min ([backend-infra.md](../kb/backend-infra.md) R4). Nothing polls the DB on a timer; clients poll the chain.

## 1. Tables at a glance

| Table | Owns or caches | Rows come from | Retention (§4) |
|---|---|---|---|
| `app_user` | owns: `sub` ↔ account link, email, display name, tint, onboarding state | `/api/session*`, demo seeding | until deleted by hand |
| `device` | owns: device public keys and their status | sessions, `/api/devices`, pairing | until deleted by hand |
| `device_pairing` | owns: short-lived pairing codes (D-21 fallback) | `/api/devices/pair` | 7 days after expiry |
| `session` | owns: session rows (cookie hash only) | `/api/session*`, `/api/demo/session` | expiry + 30 days |
| `used_proof` | owns: replay guard for device proofs and NEP-413 nonces | session and device routes | 1 day |
| `pot` | **caches** name, emoji, preset, creator, status, last proposal id; **owns** the cover gradient (D-61 Rev 1) | `create_pot` outcomes, `hub.get_pot`, reconcile | forever |
| `invite_meta` | **caches** `invite_added` / `invite_revoked` events (public keys only) | relay outcomes | forever |
| `note` | owns: memos and decline reasons (D-07: never on chain) | `POST /api/notes` | while the Pot exists; unmatched memos 24 h |
| `relay_log` | owns: every tx a server key signed or relayed, with its outcome | relayer, faucet, onboarding, workflows | 90 days |
| `feed_event` | **caches** parsed hub events and proposal transitions | relay outcomes, tx reports, reconcile | forever (rebuildable) |
| `quota_usage` | owns: counters for quotas and caps | every write route | day buckets 35 days, minute buckets 1 day |
| `lease` | owns: key leases and single-flight locks | relayer, workflows, cron | fixed rows |
| `alert_state` | owns: alert dedupe | alerts | forever |
| `error_log` | owns: errors kept past Hobby's 1 h log window | all routes | 14 days |
| `deposit_intent` | owns: 1Click (or simulator) quotes and their status (the transaction record) | `/api/oneclick/*`, `watchDeposit` | kept; raw status payload cleared 24 h after terminal |
| `push_subscription` | owns: Web Push endpoints and keys | `/api/push/subscription` | until 404/410, logout or stale |
| `notification_log` | owns: per-event, per-user, per-channel dedupe | fan-out | 30 days |
| `telegram_user`, `telegram_chat`, `tg_link_token`, `telegram_post` | owns: Telegram links (Phase 2) | webhook, link route | link tokens 1 day after expiry |
| `demo_pot` | owns: the demo pool, shared and reference Pots | refill workflow, cron, seeds | retired rows 7 days |

Not in the DB (read from chain when needed): balances, contributions, members, rules, requests, proposals, votes, access keys and nonces.

## 2. Drizzle schema sketch

File: `apps/web/lib/server/db/schema.ts`. Pinned `drizzle-orm@0.45.4` + `drizzle-kit@0.31.11` + `pg@8.23.1` ([backend-infra.md](../kb/backend-infra.md) R4). Use only 0.45 APIs: table extras return an **array**, and the v1-only `defineRelations` / RQB v2 don't exist in 0.45 (use plain joins or `relations()` from 0.45 if needed). This is a sketch: names, types, keys and indexes are the contract; column order and helper names are free.

### 2.1 Helpers and identity

```ts
import { sql } from 'drizzle-orm'
import {
  pgTable, text, uuid, boolean, integer, smallint, bigint, bigserial, numeric, timestamp, jsonb,
  primaryKey, index, uniqueIndex, check,
} from 'drizzle-orm/pg-core'

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })
const createdAt = () => ts('created_at').notNull().defaultNow()
const u128 = (name: string) => numeric(name, { precision: 40, scale: 0 })   // USDC base units or yocto; a string in TS
const SESSION_KINDS = ['near-auth', 'wallet', 'demo', 'dev'] as const   // 'dev': preview-only test accounts (api-spec §2.1, rev3)
const TINTS = ['peach', 'sand', 'sage', 'mist', 'lilac', 'rose'] as const
const PERSONAS = ['maya', 'sam', 'leo'] as const

export const appUser = pgTable('app_user', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind', { enum: SESSION_KINDS }).notNull(),
  authSub: text('auth_sub'),                               // near-auth only: the Auth0 sub (e.g. "google-oauth2|…")
  nearAccount: text('near_account').notNull(),             // u-xxxxxxxx.users.<root>, a wallet account, or a persona
  mpcPublicKey: text('mpc_public_key'),                    // near-auth only: derived MPC key (public, D-21)
  email: text('email'),                                    // near-auth only, from the ID token; for email notifications
  emailVerified: boolean('email_verified').notNull().default(false),
  emailHash: text('email_hash'),                           // hex sha256(lower(email)): per-email Pot quota
  displayName: text('display_name').notNull(),
  avatarTint: text('avatar_tint', { enum: TINTS }).notNull(),
  notifyEmail: boolean('notify_email').notNull().default(true),
  persona: text('persona', { enum: PERSONAS }),            // demo only
  onboardState: text('onboard_state', { enum: ['creating', 'ready', 'failed'] }).notNull().default('ready'),
  onboardLeaseUntil: ts('onboard_lease_until'),            // single-flight account creation (architecture 3.1)
  usdcRegistered: boolean('usdc_registered').notNull().default(false),
  createdAt: createdAt(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('app_user_auth_sub_uq').on(t.authSub),       // NULLs don't collide
  uniqueIndex('app_user_near_account_uq').on(t.nearAccount),
  index('app_user_email_hash_idx').on(t.emailHash),
  check('app_user_sub_ck', sql`(${t.kind} = 'near-auth') = (${t.authSub} is not null)`),
  check('app_user_name_ck', sql`char_length(${t.displayName}) between 1 and 40`),
])

export const device = pgTable('device', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => appUser.id, { onDelete: 'cascade' }),
  publicKey: text('public_key').notNull(),                 // "ed25519:…"; the private half never leaves the browser
  keyKind: text('key_kind', { enum: ['webcrypto', 'fallback'] }).notNull(),
  status: text('status', { enum: ['pending', 'active', 'revoked'] }).notNull(),
  addedVia: text('added_via', { enum: ['onboarding', 'near_auth', 'pairing'] }),
  addKeyTxHash: text('add_key_tx_hash'),
  userAgent: text('user_agent'),
  createdAt: createdAt(),
  activatedAt: ts('activated_at'),
  lastUsedAt: ts('last_used_at'),
  revokedAt: ts('revoked_at'),
}, (t) => [
  uniqueIndex('device_public_key_uq').on(t.publicKey),
  index('device_user_idx').on(t.userId, t.status),
])

export const devicePairing = pgTable('device_pairing', {
  id: text('id').primaryKey(),                             // 'pr_' + 20 Crockford base32 chars
  userId: uuid('user_id').notNull().references(() => appUser.id, { onDelete: 'cascade' }),
  deviceId: uuid('device_id').notNull().references(() => device.id, { onDelete: 'cascade' }),
  code: text('code').notNull(),                            // 6 digits; a comparison code shown on both devices, not a secret
  status: text('status', { enum: ['pending', 'completed', 'expired', 'cancelled'] }).notNull().default('pending'),
  expiresAt: ts('expires_at').notNull(),                   // created_at + 10 min
  completedAt: ts('completed_at'),
  relayId: text('relay_id'),                               // relay_log.id of the AddKey
  createdAt: createdAt(),
}, (t) => [index('device_pairing_user_idx').on(t.userId, t.status)])

export const session = pgTable('session', {
  idHash: text('id_hash').primaryKey(),                    // hex sha256(cookie value); the cookie itself is never stored
  userId: uuid('user_id').notNull().references(() => appUser.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: SESSION_KINDS }).notNull(),
  deviceId: uuid('device_id').references(() => device.id), // near-auth: the bound device (api-spec §4.2)
  demoPotId: uuid('demo_pot_id').references(() => demoPot.id),
  visitorHash: text('visitor_hash'),                       // demo: hash of the pot_demo_visitor id
  ipHash: text('ip_hash'),                                 // HMAC(APP_HMAC_SECRET, utc_date) of the IP
  userAgent: text('user_agent'),
  createdAt: createdAt(),
  expiresAt: ts('expires_at').notNull(),                   // absolute (30 days; demo: lease)
  idleExpiresAt: ts('idle_expires_at').notNull(),          // 14 days after last_seen_at
  lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
  revokedAt: ts('revoked_at'),
}, (t) => [
  index('session_user_idx').on(t.userId),
  index('session_expires_idx').on(t.expiresAt),
])

export const usedProof = pgTable('used_proof', {
  hash: text('hash').primaryKey(),                         // sha256(purpose|publicKey|ts), or sha256('wallet'|nonce)
  purpose: text('purpose', { enum: ['session', 'device_login', 'device_add', 'device_pair', 'wallet', 'dev_session', 'auth_challenge'] }).notNull(),   // rev4: auth_challenge = sha256(challenge), api-spec §2.1
  usedAt: ts('used_at').notNull().defaultNow(),
}, (t) => [index('used_proof_used_at_idx').on(t.usedAt)])
```

### 2.2 Pots, invites, notes

```ts
export const pot = pgTable('pot', {
  daoId: text('dao_id').primaryKey(),                      // `${slug}.pots.<root>`
  slug: text('slug').notNull(),
  hubId: text('hub_id').notNull(),                         // pots.<root> (prod and preview hubs differ, D-02)
  name: text('name').notNull(),                            // cache of hub get_pot
  emoji: text('emoji'),                                    // cache: create_pot's on-chain emoji argument (contracts-spec §3.2)
  gradient: text('gradient'),                              // owned here (covers are emoji + gradient, D-61 Rev 1; the gradient is off chain)
  preset: text('preset', { enum: ['trip', 'club', 'team', 'custom'] }).notNull(),   // = the hub's Preset enum (rev3: + custom)
  creatorAccount: text('creator_account').notNull(),
  status: text('status', { enum: ['open', 'closing', 'closed'] }).notNull().default('open'),   // cache
  isDemo: boolean('is_demo').notNull().default(false),
  createdTxHash: text('created_tx_hash'),
  lastProposalId: bigint('last_proposal_id', { mode: 'number' }),   // reconcile watermark: DAO get_last_proposal_id last seen
  lastSyncedAt: ts('last_synced_at'),
  lastActivityAt: ts('last_activity_at'),
  closedAt: ts('closed_at'),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('pot_hub_slug_uq').on(t.hubId, t.slug),
  index('pot_status_activity_idx').on(t.status, t.lastActivityAt),
])

export const inviteMeta = pgTable('invite_meta', {
  potId: text('pot_id').notNull().references(() => pot.daoId),
  invitePk: text('invite_pk').notNull(),                   // public key only; the secret lives in the link fragment (D-08)
  createdBy: text('created_by').notNull(),                 // account id from the invite_added event (for "{inviter} invited you")
  expiresAtMs: bigint('expires_at_ms', { mode: 'number' }),   // rev4: always set by the hub (default now + 7 d, at most 30 d)
  maxUses: integer('max_uses'),                                // rev4: always set (default 10, at most 40)
  createdTxHash: text('created_tx_hash'),
  createdAt: createdAt(),
  revokedAt: ts('revoked_at'),
}, (t) => [primaryKey({ columns: [t.potId, t.invitePk] })])

export const note = pgTable('note', {
  potId: text('pot_id').notNull().references(() => pot.daoId),
  kind: text('kind', { enum: ['memo', 'decline_reason'] }).notNull(),
  ref: text('ref').notNull(),                              // memo: request_ref (OpKey); decline_reason: DAO proposal id
  authorAccount: text('author_account').notNull(),
  text: text('text').notNull(),
  createdAt: createdAt(),
  matchedAt: ts('matched_at'),                             // memo: set once the on-chain request with this ref and requester = author is seen
}, (t) => [
  primaryKey({ columns: [t.potId, t.kind, t.ref, t.authorAccount] }),
  check('note_text_len_ck', sql`char_length(${t.text}) between 1 and 140`),
])
```

### 2.3 Relay log, feed cache, quotas, leases, alerts, errors

```ts
export const relayLog = pgTable('relay_log', {
  id: text('id').primaryKey(),                             // 'rl_' + ULID (= relayId in the API)
  requestId: text('request_id').notNull(),
  userId: uuid('user_id').references(() => appUser.id),    // null for server-initiated ops
  visitorHash: text('visitor_hash'),                       // demo relays
  idempotencyKey: text('idempotency_key'),                 // client OpKey, or a deterministic server key ('sync:{dao}:{pid}', 'topup:{dao}:{yyyymmddhh}', …)
  bodyHash: text('body_hash'),                             // sha256 of the request body, for idempotency_conflict
  op: text('op', { enum: ['relay', 'create_account', 'storage_deposit', 'mpc_sign', 'add_key', 'faucet', 'sync',
    'retry_payout', 'dao_topup', 'demo_seed', 'sim_delivery', 'report'] }).notNull(),
  intent: text('intent'),                                  // IntentType for relays
  senderId: text('sender_id'),                             // delegate sender, or the signer of a server tx
  receiverId: text('receiver_id').notNull(),
  methods: text('methods').array(),                        // e.g. {ft_transfer_call}
  potId: text('pot_id'),                                   // DAO id; no FK, because create_pot rows exist before the pot row
  delegateHash: text('delegate_hash'),                     // sha256 of the signed delegate bytes
  delegatePublicKey: text('delegate_public_key'),
  delegateNonce: numeric('delegate_nonce', { precision: 20, scale: 0 }),   // u64
  maxBlockHeight: bigint('max_block_height', { mode: 'number' }),
  relayerKey: text('relayer_key'),                         // public key of the pool key that signed (never the secret)
  outerTxHash: text('outer_tx_hash'),
  status: text('status', { enum: ['validated', 'signed', 'submitted', 'executed', 'failed', 'rejected', 'pending'] }).notNull(),
  outcome: text('outcome', { enum: ['success', 'inner_failed', 'delegate_failed'] }),
  reason: text('reason'),                                  // api-spec §1.2 reason when rejected or failed
  errorCode: text('error_code'),                           // api-spec §1.3
  errorText: text('error_text'),                           // sanitized panic text, ≤ 2 KB
  result: jsonb('result'),                                 // RelayResult
  events: jsonb('events'),                                 // PotEvent[]
  response: jsonb('response'),                             // the exact JSON body returned, replayed for the same key (dropped after 7 days)
  httpStatus: smallint('http_status'),
  executedAtBlock: bigint('executed_at_block', { mode: 'number' }),
  estYocto: u128('est_yocto'),                             // quota pre-charge
  costYocto: u128('cost_yocto'),                           // actual: Σ tokens_burnt + deposits not refunded
  gasBurnt: numeric('gas_burnt', { precision: 20, scale: 0 }),
  createdAt: createdAt(),
  submittedAt: ts('submitted_at'),
  finishedAt: ts('finished_at'),
}, (t) => [
  uniqueIndex('relay_log_user_key_uq').on(t.userId, t.idempotencyKey).where(sql`${t.userId} is not null`),
  uniqueIndex('relay_log_server_key_uq').on(t.op, t.idempotencyKey).where(sql`${t.userId} is null`),
  uniqueIndex('relay_log_delegate_uq').on(t.delegateHash),
  uniqueIndex('relay_log_tx_uq').on(t.outerTxHash),
  index('relay_log_inflight_idx').on(t.senderId, t.delegatePublicKey)
    .where(sql`${t.status} in ('validated', 'signed', 'submitted', 'pending')`),   // nonce_pending check
  index('relay_log_pot_idx').on(t.potId, t.createdAt),
  index('relay_log_user_idx').on(t.userId, t.createdAt),
  index('relay_log_created_idx').on(t.createdAt),
])

export const feedEvent = pgTable('feed_event', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  potId: text('pot_id').notNull().references(() => pot.daoId),
  kind: text('kind', { enum: ['pot_created', 'member_joined', 'contribution', 'spend_requested', 'spend_auto_approved',
    'spend_payout_failed', 'rules_changed', 'rules_change_proposed', 'invite_added', 'invite_revoked', 'close_proposed',
    'pot_closed', 'spend_withdrawn' /* rev5: Phase 3, not built */, 'proposal_synced', 'proposal_status'] }).notNull(),
                                                           // hub events (contracts-spec §5) + DAO status transitions seen by reconcile
  key: text('key').notNull(),                              // frontend identity key: contribution:<txHash>, request:<pid>, join:<account>, rules:<txHash>, closed:<dao>
  actor: text('actor'),
  subject: text('subject'),                                // receiver, joiner, …
  amount: u128('amount'),
  proposalId: bigint('proposal_id', { mode: 'number' }),
  requestRef: text('request_ref'),
  category: text('category'),
  path: text('path', { enum: ['instant', 'vote'] }),
  status: text('status'),                                  // proposal_status rows: Approved | Rejected | Expired | Failed
  txHash: text('tx_hash'),
  receiptId: text('receipt_id').notNull(),                 // synthetic for reconcile rows: 'proposal:{dao}:{pid}:{status}'
  eventIndex: smallint('event_index').notNull(),
  blockHeight: bigint('block_height', { mode: 'number' }),
  at: ts('at').notNull(),                                  // block timestamp
  data: jsonb('data').notNull(),                           // the raw event data
  source: text('source', { enum: ['relay', 'reconcile', 'report', 'seed'] }).notNull(),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('feed_event_receipt_uq').on(t.receiptId, t.eventIndex),   // relay and reconcile can't double-insert
  index('feed_event_pot_at_idx').on(t.potId, t.at),
])

export const quotaUsage = pgTable('quota_usage', {
  subject: text('subject').notNull(),                      // 'user:{uuid}' | 'visitor:{hash}' | 'email:{sha256}' | 'ip:{hmac}' | 'ipnet:{hmac}' (rev4: IPv4 address or IPv6 /64)
                                                           // | 'pot:{dao}' | 'proposal:{dao}:{id}' (rev4) | 'account:{id}' | 'global'
  action: text('action').notNull(),                        // a family ('contribute', 'spend', …) or a counter ('relay_yocto', 'burst', …;
                                                           // rev4: 'hub_yocto', 'finalize', 'lease', 'xc_sim_usd', 'registrations')
  periodStart: ts('period_start').notNull(),               // UTC day start, or minute start for burst counters
  n: u128('n').notNull().default('0'),                     // a count, yocto or USDC base units
}, (t) => [primaryKey({ columns: [t.subject, t.action, t.periodStart] })])

export const lease = pgTable('lease', {
  name: text('name').primaryKey(),                         // 'relayer_key:0', 'treasury_key:2', 'mpc_slot:1', 'demo_signer:{account}',
                                                           // 'reconcile:{dao}', 'topup:{dao}', 'cron:reconcile', 'refill_demo_pool'
  holder: text('holder'),                                  // requestId or workflow run id
  until: ts('until'),
  meta: jsonb('meta'),                                     // e.g. { publicKey } for pool keys; never secret material
})

export const alertState = pgTable('alert_state', {
  key: text('key').primaryKey(),                           // 'relayer_low', 'hub_low', 'treasury_low', 'global_cap_hit', rev4: 'hub_budget', 'hub_key_used', …
  lastSentAt: ts('last_sent_at').notNull(),
})

export const errorLog = pgTable('error_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  at: ts('at').notNull().defaultNow(),
  requestId: text('request_id'),
  route: text('route').notNull(),
  reason: text('reason'),
  userId: uuid('user_id'),
  relayId: text('relay_id'),
  detail: jsonb('detail'),                                 // redacted: no tokens, emails, cookies or push keys
}, (t) => [index('error_log_at_idx').on(t.at)])
```

### 2.4 Deposits, notifications, Telegram, demo

```ts
const XC_STATUS = ['PENDING_DEPOSIT', 'KNOWN_DEPOSIT_TX', 'PROCESSING', 'SUCCESS', 'INCOMPLETE_DEPOSIT',
  'REFUNDED', 'FAILED', 'EXPIRED', 'ADDED', 'STUCK'] as const

export const depositIntent = pgTable('deposit_intent', {
  id: text('id').primaryKey(),                             // 'dep_' + ULID (the ?d= in deep links)
  userId: uuid('user_id').notNull().references(() => appUser.id),
  potId: text('pot_id').notNull().references(() => pot.daoId),
  idempotencyKey: text('idempotency_key').notNull(),
  mode: text('mode', { enum: ['real', 'simulated'] }).notNull(),
  chain: text('chain', { enum: ['base', 'arb', 'sol', 'eth'] }).notNull(),
  recipient: text('recipient').notNull(),                  // the member's NEAR account (= refundTo, D-50)
  amountIn: u128('amount_in').notNull(),
  minAmountIn: u128('min_amount_in'),
  amountOutQuoted: u128('amount_out_quoted'),
  depositAddress: text('deposit_address').notNull(),       // simulated: 'SIMULATED-base-xxxxxxxx'
  depositMemo: text('deposit_memo'),
  correlationId: text('correlation_id'),
  quoteSignature: text('quote_signature'),
  quote: jsonb('quote').notNull(),                         // the signed quote response, kept as the transaction record
  deadline: ts('deadline').notNull(),
  status: text('status', { enum: XC_STATUS }).notNull(),
  lastStatus: jsonb('last_status'),                        // last /v0/status body; cleared 24 h after a terminal state (1Click ToS §4.1(e))
  depositedAmount: u128('deposited_amount'),
  amountOut: u128('amount_out'),
  refundedAmount: u128('refunded_amount'),
  refundReason: text('refund_reason'),
  destinationTxHash: text('destination_tx_hash'),
  processingSince: ts('processing_since'),
  lastPolledAt: ts('last_polled_at'),
  workflowRunId: text('workflow_run_id'),
  simScenario: text('sim_scenario'),
  simStartedAt: ts('sim_started_at'),
  addedRelayId: text('added_relay_id'),
  addedAt: ts('added_at'),
  createdAt: createdAt(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('deposit_intent_address_uq').on(t.depositAddress),
  uniqueIndex('deposit_intent_user_key_uq').on(t.userId, t.idempotencyKey),
  index('deposit_intent_open_idx').on(t.status)
    .where(sql`${t.status} in ('PENDING_DEPOSIT', 'KNOWN_DEPOSIT_TX', 'PROCESSING', 'INCOMPLETE_DEPOSIT')`),
])

export const pushSubscription = pgTable('push_subscription', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => appUser.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull(),                    // host on the push-service allowlist (api-spec §2.6)
  p256dh: text('p256dh').notNull(),                        // sensitive: never logged
  auth: text('auth').notNull(),                            // sensitive: never logged
  expirationTime: ts('expiration_time'),
  standalone: boolean('standalone').notNull().default(false),
  platform: text('platform'),
  demoPotId: uuid('demo_pot_id').references(() => demoPot.id, { onDelete: 'cascade' }),   // R-15 option (rev3): demo-session subscriptions are scoped to one pool lease
  createdAt: createdAt(),
  lastOkAt: ts('last_ok_at'),
  failCount: integer('fail_count').notNull().default(0),
}, (t) => [
  uniqueIndex('push_subscription_endpoint_uq').on(t.endpoint),
  index('push_subscription_user_idx').on(t.userId),
])

export const notificationLog = pgTable('notification_log', {
  eventKey: text('event_key').notNull(),                   // api-spec §6.1 event keys
  userId: uuid('user_id').notNull().references(() => appUser.id, { onDelete: 'cascade' }),
  channel: text('channel', { enum: ['push', 'email', 'telegram'] }).notNull(),
  status: text('status', { enum: ['queued', 'sent', 'failed', 'skipped'] }).notNull().default('queued'),
  sentAt: ts('sent_at'),
  detail: jsonb('detail'),                                 // HTTP status, provider id; never the payload
  createdAt: createdAt(),
}, (t) => [
  primaryKey({ columns: [t.eventKey, t.userId, t.channel] }),   // INSERT … ON CONFLICT DO NOTHING = dedupe
  index('notification_log_created_idx').on(t.createdAt),
])

// Telegram (Phase 2, first to cut; shapes from notifications.md N5). Chat ids fit in 52 bits → mode 'number' is safe.
export const telegramUser = pgTable('telegram_user', {
  userId: uuid('user_id').primaryKey().references(() => appUser.id, { onDelete: 'cascade' }),
  tgUserId: bigint('tg_user_id', { mode: 'number' }).notNull().unique(),
  linkedAt: ts('linked_at').notNull().defaultNow(),
})
export const telegramChat = pgTable('telegram_chat', {
  chatId: bigint('chat_id', { mode: 'number' }).primaryKey(),
  potId: text('pot_id').notNull().references(() => pot.daoId),
  linkedByUserId: uuid('linked_by_user_id').references(() => appUser.id),
  active: boolean('active').notNull().default(true),
  linkedAt: ts('linked_at').notNull().defaultNow(),
}, (t) => [index('telegram_chat_pot_idx').on(t.potId)])
export const tgLinkToken = pgTable('tg_link_token', {
  tokenHash: text('token_hash').primaryKey(),              // sha256 of the deep-link token
  kind: text('kind', { enum: ['user', 'group'] }).notNull(),
  userId: uuid('user_id').notNull().references(() => appUser.id, { onDelete: 'cascade' }),
  potId: text('pot_id').references(() => pot.daoId),
  expiresAt: ts('expires_at').notNull(),
  usedAt: ts('used_at'),
})
export const telegramPost = pgTable('telegram_post', {
  potId: text('pot_id').notNull().references(() => pot.daoId),
  proposalId: bigint('proposal_id', { mode: 'number' }).notNull(),
  chatId: bigint('chat_id', { mode: 'number' }).notNull(),
  messageId: bigint('message_id', { mode: 'number' }).notNull(),
}, (t) => [primaryKey({ columns: [t.potId, t.proposalId, t.chatId] })])

export const demoPot = pgTable('demo_pot', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind', { enum: ['pool', 'shared', 'reference'] }).notNull(),
  slug: text('slug').notNull(),                            // pool: lisbon-<k> | shared: lisbon-<yyyymmdd> | reference: lisbon-trip
  potId: text('pot_id'),                                   // DAO id once created
  personas: jsonb('personas').notNull(),                   // { maya: 'maya-a1b2.users.<root>', sam: …, leo: … }: account ids only, never keys
                                                           // (rev4: shared Pots get fresh personas too; the reference uses maya/sam/leo.users.<root>, keyless after seeding)
  state: text('state', { enum: ['seeding', 'ready', 'leased', 'retired', 'failed'] }).notNull(),
  seedStep: smallint('seed_step').notNull().default(0),    // checkpoint for idempotent seeding (api-spec §5.2)
  seedError: text('seed_error'),
  leasedTo: text('leased_to'),                             // visitor hash
  leasedAt: ts('leased_at'),
  leaseUntil: ts('lease_until'),
  seededAt: ts('seeded_at'),
  retiredAt: ts('retired_at'),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('demo_pot_slug_uq').on(t.slug),
  index('demo_pot_lease_idx').on(t.kind, t.state, t.seededAt),
])
```

## 3. Atomic SQL patterns

Run these through Drizzle's `db.execute(sql…)` tagged template (or `tx.execute` inside `db.transaction`). The quota and alert patterns were tested on Postgres 18.4: 20 concurrent callers against a limit of 3 → exactly 3 succeed ([backend-infra.md](../kb/backend-infra.md) snippets 5 and 6). The DB session time zone is UTC (the Neon default).

### 3.1 Quotas: check and increment

```sql
-- One statement per counter. All of a request's counters run in ONE transaction:
-- if any statement returns no row → ROLLBACK (nothing is consumed) → 429 quota_exceeded / rate_limited.
INSERT INTO quota_usage (subject, action, period_start, n)
VALUES ($1, $2,
        date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc',   -- UTC day bucket; burst counters use date_trunc('minute', now())
        $3)                                                               -- $3 = increment (1, or a yocto / base-unit estimate)
ON CONFLICT (subject, action, period_start)
DO UPDATE SET n = quota_usage.n + EXCLUDED.n
WHERE quota_usage.n + EXCLUDED.n <= $4                                    -- $4 = limit
RETURNING n;
```

```sql
-- Correct a yocto pre-charge to the actual cost after the outcome (no limit check; delta may be negative).
-- rev4: run it for the global row and for the user's (or visitor's) own 'relay_yocto' row.
UPDATE quota_usage SET n = n + $delta
WHERE subject IN ('global', $subject) AND action = 'relay_yocto'
  AND period_start = date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc';
```

Counter names (subject × action) are listed in [api-spec.md](api-spec.md) §3.1 (families) and §3.5 (global caps).

### 3.2 Leases

```sql
-- Claim one free member of a pool ('relayer_key', 'treasury_key', 'mpc_slot'); no row → busy.
UPDATE lease SET holder = $holder, until = now() + make_interval(secs => $ttl)
WHERE name = (
  SELECT name FROM lease
  WHERE starts_with(name, $pool || ':')            -- not LIKE: '_' is a LIKE wildcard
    AND (until IS NULL OR until < now())
  ORDER BY random() LIMIT 1
  FOR UPDATE SKIP LOCKED)
RETURNING name, meta;

-- Release (only by the holder).
UPDATE lease SET holder = NULL, until = NULL WHERE name = $name AND holder = $holder;

-- Single-flight named lease ('cron:reconcile', 'refill_demo_pool', 'reconcile:{dao}', 'topup:{dao}', 'demo_signer:{account}').
INSERT INTO lease (name, holder, until) VALUES ($name, $holder, now() + make_interval(secs => $ttl))
ON CONFLICT (name) DO UPDATE SET holder = EXCLUDED.holder, until = EXCLUDED.until
WHERE lease.until IS NULL OR lease.until < now()
RETURNING name;                                    -- no row → someone else holds it
```

### 3.3 Onboarding lease and demo lease

```sql
-- First login: one request at a time creates the account (architecture 3.1).
UPDATE app_user SET onboard_lease_until = now() + interval '30 seconds'
WHERE id = $1 AND onboard_state <> 'ready'
  AND (onboard_lease_until IS NULL OR onboard_lease_until < now())
RETURNING id;

-- Lease a ready pool Pot for a visitor (api-spec §7.3).
UPDATE demo_pot
SET state = 'leased', leased_to = $visitor, leased_at = now(), lease_until = now() + interval '2 hours'
WHERE id = (SELECT id FROM demo_pot
            WHERE kind = 'pool' AND state = 'ready'
            ORDER BY seeded_at LIMIT 1
            FOR UPDATE SKIP LOCKED)
RETURNING id, slug, pot_id, personas;
```

### 3.4 Alert dedupe and notification dedupe

```sql
-- At most one alert per key per hour.
INSERT INTO alert_state (key, last_sent_at) VALUES ($1, now())
ON CONFLICT (key) DO UPDATE SET last_sent_at = now()
WHERE alert_state.last_sent_at < now() - interval '1 hour'
RETURNING 'send';

-- Claim a notification before sending it; only returned rows get sent.
INSERT INTO notification_log (event_key, user_id, channel)
SELECT $event_key, u, $channel FROM unnest($user_ids::uuid[]) AS u
ON CONFLICT DO NOTHING
RETURNING user_id;
```

### 3.5 Relay-log helpers

```sql
-- nonce_pending check (api-spec §3.2 step 10): highest in-flight nonce for this account and key.
SELECT max(delegate_nonce) FROM relay_log
WHERE sender_id = $1 AND delegate_public_key = $2
  AND status IN ('validated', 'signed', 'submitted', 'pending');

-- user_suspended check: on-chain rejections today.
SELECT count(*) FROM relay_log
WHERE user_id = $1 AND created_at >= date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc'
  AND outcome = 'delegate_failed';
```

## 4. Retention

The daily cron runs these deletes in batches of 5,000 rows ([api-spec.md](api-spec.md) §5.3 step 7).

| Table | Rule |
|---|---|
| `session` | delete 30 days after `expires_at`, or 30 days after `revoked_at` |
| `used_proof` | delete after 1 day |
| `device_pairing` | delete 7 days after `expires_at` |
| `relay_log` | delete after 90 days; set `response` to null after 7 days |
| `feed_event` | keep (a cache, small, rebuildable) |
| `quota_usage` | delete day buckets after 35 days, minute buckets after 1 day |
| `alert_state`, `lease` | keep (fixed small sets) |
| `error_log` | delete after 14 days |
| `deposit_intent` | keep as transaction history; set `last_status` to null 24 h after a terminal state (1Click ToS §4.1(e) allows transaction records shown to users, [intents-1click.md](../kb/intents-1click.md)) |
| `push_subscription` | delete on 404/410, on logout with that endpoint, or when `expiration_time` has passed and `last_ok_at` is older than 60 days; demo rows (`demo_pot_id` set) when that lease is retired |
| `notification_log` | delete after 30 days |
| `note` | keep while the Pot exists; delete memos with `matched_at` still null after 24 h |
| `tg_link_token` | delete 1 day after `expires_at` |
| `demo_pot` | delete `retired` rows after 7 days (the on-chain Pots remain) |
| `app_user`, `device` | keep; deletion by hand on request (testnet only) |

## 5. Seed data

`scripts/seed-db.ts` uses idempotent upserts and runs after migrations in each environment. It reads env for public values only; it never writes a secret to the DB.

| What | Rows |
|---|---|
| Relayer pool | `lease` rows `relayer_key:0` … `relayer_key:{N-1}`, with `meta.publicKey` derived from `RELAYER_KEYS` at seed time (N = 8 prod, 4 preview) |
| Treasury pool | `treasury_key:0..2` from `TREASURY_KEYS` |
| MPC slots | `mpc_slot:0`, `mpc_slot:1` |
| Fixed personas | `app_user` rows (kind `demo`) for `maya.users.{root}`, `sam.users.{root}`, `leo.users.{root}`: display names Maya, Sam, Leo; tints peach, sage, mist; `usdc_registered: true`. Rev4: these are the reference Pot's members only, and they hold no key after seeding (api-spec §5.2 step 9) |
| Reference Pot | a `pot` row for `lisbon-trip.pots.{root}` (Lisbon Trip, 🇵🇹, Trip, `is_demo`), a `demo_pot` row (kind `reference`, state `ready`, never leased) and its `invite_meta` row. The Pot itself is created on chain by B-08's seeding script with `--kind reference` (rev3; it runs through the relay, so these rows and its `feed_event` rows come from the relay outcomes), or by the CLI runbook in [accounts-and-deploy.md](accounts-and-deploy.md) §3.8 as the fallback, after which this script backfills the rows and `feed_event` rows with `source: seed` ($450 from Maya, Sam and Leo, no spends) |
| Pool and shared Pots | none: the refill workflow and the cron create them |
| Test fixtures | not in the DB: `@pot/sdk/testing` provides the Lisbon Trip cast for unit tests and `MockChain` ([frontend-architecture.md](frontend-architecture.md) §1.4) |

## 6. Migrations and the runtime client

- **Generate:** `pnpm db:generate` (`drizzle-kit generate`, works offline) writes SQL into `apps/web/drizzle/`. Commit it and review the SQL in the PR.
- **Apply:** `pnpm db:migrate` (`drizzle-kit migrate`) runs from GitHub Actions only: on pushes to `main` against production's `DATABASE_URL_UNPOOLED`, and on PRs against the `preview` branch. Never from a Vercel build: without per-PR Neon branches, a preview build would migrate a shared DB ([backend-infra.md](../kb/backend-infra.md) R4).
- **Never** run `drizzle-kit push` against production.
- **Expand → deploy → contract:** add nullable columns or new tables first, deploy code that uses them, and drop old ones in a later migration. Vercel deploys and migrations aren't atomic.

```ts
// apps/web/drizzle.config.ts
import { defineConfig } from 'drizzle-kit'
export default defineConfig({
  schema: './lib/server/db/schema.ts', out: './drizzle', dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED! }, strict: true, verbose: true,
})

// apps/web/lib/server/db/client.ts
import 'server-only'
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { attachDatabasePool } from '@vercel/functions'   // 3.10.2: accepts pg.Pool (postgres.js throws)
import * as schema from './schema'
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, idleTimeoutMillis: 5_000 })
attachDatabasePool(pool)
export const db = drizzle(pool, { schema })
```

- Pooled `DATABASE_URL` (PgBouncer) at runtime; keep the pool small ("avoid max pool size of 1"; short idle timeout).
- Transaction-mode pooling forbids session-level advisory locks, hence the `lease` table.
- Local development uses the Neon `dev` branch.

## 7. Never stored

| Never in the DB | Where it lives instead |
|---|---|
| Invite secrets or invite private keys | the link fragment and the creator's IndexedDB (D-08); the DB holds public keys only (`invite_meta`) |
| Device private keys (WebCrypto or fallback) | the user's browser, IndexedDB (D-21) |
| Relayer, treasury and demo persona keys | Vercel Secret env vars `RELAYER_KEYS`, `TREASURY_KEYS`, `DEMO_PERSONA_KEY` (D-22, D-24); `lease.meta` holds public keys only |
| Hub, token, root, reserve and recovery keys | rev4: the key-custody account only (a separate macOS user, a Ledger, or the vault with import-on-demand), never the OS user that runs agents ([accounts-and-deploy.md](accounts-and-deploy.md) §1.5); the token's key is deleted on Nov 2 and the hub's on Nov 12 (D-13) |
| Auth0 ID tokens and NEAR Auth signing JWTs | verified in memory, then dropped. Only `sub`, `email`, `email_verified` and hashes are kept |
| Session cookie values, IPs, Telegram link tokens | hashes only (`session.id_hash`, `ip_hash`, `tg_link_token.token_hash`) |
| NEP-413 signatures and device proofs | verified, then dropped; `used_proof` keeps a hash for replay protection |
| Memo text on chain | memos and decline reasons stay off chain in `note` (D-07) |
| Push payload text | only event keys and delivery status (`notification_log`) |
| Raw 1Click status payloads beyond 24 h after a terminal state | cleared from `deposit_intent.last_status` (§4) |

## 8. Open questions
1. **Gradient:** the emoji is on chain (`create_pot` argument); the gradient is not. Keep it in `pot.gradient` (set from the create relay's `meta.gradient`), or derive it from the slug on the client and drop the column? Rev 3 default (Cerasela decides by Oct 25): ux-spec's Create step has no gradient picker, so the client derives the gradient from the slug and sends no `meta.gradient`; the nullable column stays for a later picker.
2. **Hub events** are fixed by [contracts-spec.md](contracts-spec.md) §5; `feed_event.data` keeps each event's full payload, so new fields need no migration.
3. ~~Reference vs shared demo Pot.~~ Resolved (decisions.md D-33 Rev 3): the pointer lives in `demo_pot`, and accounts-and-deploy.md no longer repoints an env var.
4. **Neon preview branching:** one shared `preview` branch (the default here) or per-PR branches (≤ 10 on the Free plan, deleted when the PR closes)? Default: one shared branch (P1 confirms on Nov 1, in X-01).
