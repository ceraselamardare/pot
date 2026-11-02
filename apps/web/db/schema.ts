// Drizzle 0.45.4 schema for Pot (plan/data-model.md §2). Only 0.45 APIs: table extras return an array;
// no defineRelations / RQB v2. The chain is the source of truth: every column about money, members, rules,
// proposals or votes is a cache. No secrets are ever stored here (data-model §7).
import { sql } from "drizzle-orm"
import {
  bigint,
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" })
const createdAt = () => ts("created_at").notNull().defaultNow()
/** USDC base units or yocto; a string in TS. */
const u128 = (name: string) => numeric(name, { precision: 40, scale: 0 })

export const SESSION_KINDS = ["near-auth", "wallet"] as const
export const TINTS = ["peach", "sand", "sage", "mist", "lilac", "rose"] as const
export const PROOF_PURPOSES = [
  "session",
  "device_login",
  "device_add",
  "device_pair",
  "wallet",
  "auth_challenge",
] as const
export const RELAY_OPS = [
  "relay",
  // pay by link: the daily job's reclaim_link of an expired link (server-signed; text column, no migration)
  "reclaim_link",
  "create_account",
  "storage_deposit",
  "mpc_sign",
  "add_key",
  "faucet",
  "sync",
  "retry_payout",
  "dao_topup",
  "sim_delivery",
  "report",
  // hub 1.1.0: the cron's all-or-nothing goal refunds (server/ops/goals.ts)
  "refund_unfunded",
] as const
export const RELAY_STATUSES = ["validated", "signed", "submitted", "executed", "failed", "rejected", "pending"] as const
export const FEED_KINDS = [
  "pot_created",
  "member_joined",
  "contribution",
  "spend_requested",
  "spend_auto_approved",
  "spend_payout_failed",
  "rules_changed",
  "rules_change_proposed",
  "invite_added",
  "invite_revoked",
  "close_proposed",
  "pot_closed",
  "spend_withdrawn",
  "proposal_synced",
  "proposal_status",
  // pay by link (hub 1.1.0): the feed route reads link_claimed for "Claimed by …"; text column, no migration
  "link_funded",
  "link_claimed",
  "link_returned",
  "link_voided",
  // gifts (hub 1.2.0, notes/gifts-plan.md): the hub's gift_received event; text column, no migration
  "gift_received",
] as const

// ---------------------------------------------------------------------------------------------
// 2.1 Identity
// ---------------------------------------------------------------------------------------------

export const appUser = pgTable(
  "app_user",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind", { enum: SESSION_KINDS }).notNull(),
    authSub: text("auth_sub"),
    nearAccount: text("near_account").notNull(),
    mpcPublicKey: text("mpc_public_key"),
    email: text("email"),
    emailVerified: boolean("email_verified").notNull().default(false),
    emailHash: text("email_hash"),
    displayName: text("display_name").notNull(),
    avatarTint: text("avatar_tint", { enum: TINTS }).notNull(),
    /** brand avatar id (pot-01..pot-10) or null for initials (PATCH /api/me) */
    avatar: text("avatar"),
    notifyEmail: boolean("notify_email").notNull().default(true),
    onboardState: text("onboard_state", { enum: ["creating", "ready", "failed"] }).notNull().default("ready"),
    onboardLeaseUntil: ts("onboard_lease_until"),
    usdcRegistered: boolean("usdc_registered").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("app_user_auth_sub_uq").on(t.authSub),
    uniqueIndex("app_user_near_account_uq").on(t.nearAccount),
    index("app_user_email_hash_idx").on(t.emailHash),
    check("app_user_sub_ck", sql`(${t.kind} = 'near-auth') = (${t.authSub} is not null)`),
    // Rev 9: only real sign-ins (NEAR Auth, NEAR wallets); the demo/dev kinds are gone
    check("app_user_kind_ck", sql`${t.kind} in ('near-auth', 'wallet')`),
    check("app_user_name_ck", sql`char_length(${t.displayName}) between 1 and 40`),
    check("app_user_avatar_ck", sql`${t.avatar} is null or ${t.avatar} ~ '^pot-(0[1-9]|10)$'`),
  ],
)

export const device = pgTable(
  "device",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    publicKey: text("public_key").notNull(),
    keyKind: text("key_kind", { enum: ["webcrypto", "fallback"] }).notNull(),
    status: text("status", { enum: ["pending", "active", "revoked"] }).notNull(),
    addedVia: text("added_via", { enum: ["onboarding", "near_auth", "pairing"] }),
    addKeyTxHash: text("add_key_tx_hash"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    activatedAt: ts("activated_at"),
    lastUsedAt: ts("last_used_at"),
    revokedAt: ts("revoked_at"),
  },
  (t) => [uniqueIndex("device_public_key_uq").on(t.publicKey), index("device_user_idx").on(t.userId, t.status)],
)

export const devicePairing = pgTable(
  "device_pairing",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => device.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    status: text("status", { enum: ["pending", "completed", "expired", "cancelled"] })
      .notNull()
      .default("pending"),
    expiresAt: ts("expires_at").notNull(),
    completedAt: ts("completed_at"),
    relayId: text("relay_id"),
    createdAt: createdAt(),
  },
  (t) => [index("device_pairing_user_idx").on(t.userId, t.status)],
)

export const session = pgTable(
  "session",
  {
    idHash: text("id_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: SESSION_KINDS }).notNull(),
    deviceId: uuid("device_id").references(() => device.id),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    expiresAt: ts("expires_at").notNull(),
    idleExpiresAt: ts("idle_expires_at").notNull(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
    revokedAt: ts("revoked_at"),
  },
  (t) => [
    index("session_user_idx").on(t.userId),
    index("session_expires_idx").on(t.expiresAt),
    check("session_kind_ck", sql`${t.kind} in ('near-auth', 'wallet')`),
  ],
)

export const usedProof = pgTable(
  "used_proof",
  {
    hash: text("hash").primaryKey(),
    purpose: text("purpose", { enum: PROOF_PURPOSES }).notNull(),
    usedAt: ts("used_at").notNull().defaultNow(),
  },
  (t) => [index("used_proof_used_at_idx").on(t.usedAt)],
)

// ---------------------------------------------------------------------------------------------
// 2.2 Pots, invites, notes
// ---------------------------------------------------------------------------------------------

export const pot = pgTable(
  "pot",
  {
    daoId: text("dao_id").primaryKey(),
    slug: text("slug").notNull(),
    hubId: text("hub_id").notNull(),
    name: text("name").notNull(),
    emoji: text("emoji"),
    gradient: text("gradient"),
    preset: text("preset", { enum: ["trip", "club", "team", "custom"] }).notNull(),
    creatorAccount: text("creator_account").notNull(),
    status: text("status", { enum: ["open", "closing", "closed"] })
      .notNull()
      .default("open"),
    createdTxHash: text("created_tx_hash"),
    lastProposalId: bigint("last_proposal_id", { mode: "number" }),
    lastSyncedAt: ts("last_synced_at"),
    lastActivityAt: ts("last_activity_at"),
    closedAt: ts("closed_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("pot_hub_slug_uq").on(t.hubId, t.slug),
    index("pot_status_activity_idx").on(t.status, t.lastActivityAt),
  ],
)

export const inviteMeta = pgTable(
  "invite_meta",
  {
    potId: text("pot_id")
      .notNull()
      .references(() => pot.daoId),
    invitePk: text("invite_pk").notNull(),
    createdBy: text("created_by").notNull(),
    expiresAtMs: bigint("expires_at_ms", { mode: "number" }),
    maxUses: integer("max_uses"),
    createdTxHash: text("created_tx_hash"),
    createdAt: createdAt(),
    revokedAt: ts("revoked_at"),
  },
  (t) => [primaryKey({ columns: [t.potId, t.invitePk] })],
)

export const note = pgTable(
  "note",
  {
    potId: text("pot_id")
      .notNull()
      .references(() => pot.daoId),
    // link_label (pay by link, hub 1.1.0): who a payment link is for, keyed by its request_ref like a memo
    kind: text("kind", { enum: ["memo", "decline_reason", "link_label"] }).notNull(),
    ref: text("ref").notNull(),
    authorAccount: text("author_account").notNull(),
    text: text("text").notNull(),
    createdAt: createdAt(),
    matchedAt: ts("matched_at"),
  },
  (t) => [
    primaryKey({ columns: [t.potId, t.kind, t.ref, t.authorAccount] }),
    check("note_text_len_ck", sql`char_length(${t.text}) between 1 and 140`),
  ],
)

/**
 * Comments on a spend request (off-chain, never on chain): a short thread per (Pot, hub request id) so the group
 * can talk about a spend inside Pot. Members only (checked against hub.get_members on every call). A delete is
 * soft: `deleted_at` is set and the body is wiped (''), so the thread keeps a "Comment removed" line.
 * `client_key` (the composer's op id) makes a retried send idempotent per author.
 */
export const requestComment = pgTable(
  "request_comment",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    potId: text("pot_id")
      .notNull()
      .references(() => pot.daoId),
    requestId: bigint("request_id", { mode: "number" }).notNull(),
    authorAccount: text("author_account").notNull(),
    body: text("body").notNull(),
    clientKey: text("client_key"),
    createdAt: createdAt(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [
    index("request_comment_thread_idx").on(t.potId, t.requestId, t.createdAt),
    uniqueIndex("request_comment_client_key_uq").on(t.authorAccount, t.clientKey).where(sql`${t.clientKey} is not null`),
    check(
      "request_comment_body_ck",
      sql`(${t.deletedAt} is null and char_length(${t.body}) between 1 and 280) or (${t.deletedAt} is not null and ${t.body} = '')`,
    ),
  ],
)

/**
 * The receipt details saved with a spend (never the photo, D-61): what the person confirmed from "Scan receipt"
 * (lib/receipt-saved.ts SavedReceipt) for one (Pot, hub request id). Written once, by the request's own requester,
 * after the request exists; the server checks that the SHA-256 of the canonical JSON starts with the 16 hex chars the
 * request carries in its request_ref (the fingerprint), so an edit after the fact can't go unnoticed. Members read the
 * details; anyone can see that a spend has one (the feed's `receipts`).
 */
export const spendReceipt = pgTable(
  "spend_receipt",
  {
    potId: text("pot_id")
      .notNull()
      .references(() => pot.daoId),
    requestId: bigint("request_id", { mode: "number" }).notNull(),
    requesterAccount: text("requester_account").notNull(),
    /** the SavedReceipt as validated (key order is irrelevant: the fingerprint is over its canonical JSON) */
    data: jsonb("data").notNull(),
    /** full SHA-256 hex of the canonical JSON */
    fingerprint: text("fingerprint").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.potId, t.requestId] }),
    check("spend_receipt_fingerprint_ck", sql`${t.fingerprint} ~ '^[0-9a-f]{64}$'`),
    check("spend_receipt_size_ck", sql`octet_length(${t.data}::text) <= 20000`),
  ],
)

/**
 * Gifts (notes/gifts-plan.md, hub 1.2.0): a private gift link a member shares (`/g/<slug>/<id>`). Enforced by our
 * server, never on chain: the relayer's pre-flight (server/features/gifts validateGiftRef) refuses a gift through a
 * revoked, expired or used-up link. `amount` null = the giver chooses; `note` is the members' words for the givers
 * (public to whoever holds the link). `client_key` makes a retried create idempotent per member.
 */
export const giftLink = pgTable(
  "gift_link",
  {
    /** 128 random bits, base64url (22 chars; lib/gifts.ts newGiftLinkId) */
    id: text("id").primaryKey(),
    potId: text("pot_id")
      .notNull()
      .references(() => pot.daoId),
    createdBy: text("created_by").notNull(),
    amount: u128("amount"),
    note: text("note"),
    reusable: boolean("reusable").notNull().default(true),
    uses: integer("uses").notNull().default(0),
    expiresAt: ts("expires_at").notNull(),
    revokedAt: ts("revoked_at"),
    revokedBy: text("revoked_by"),
    clientKey: text("client_key"),
    createdAt: createdAt(),
  },
  (t) => [
    index("gift_link_pot_idx").on(t.potId, t.createdAt),
    uniqueIndex("gift_link_client_key_uq").on(t.createdBy, t.clientKey).where(sql`${t.clientKey} is not null`),
    check("gift_link_id_ck", sql`${t.id} ~ '^[A-Za-z0-9_-]{22}$'`),
    check("gift_link_note_ck", sql`${t.note} is null or char_length(${t.note}) between 1 and 140`),
    check("gift_link_amount_ck", sql`${t.amount} is null or ${t.amount} > 0`),
    check("gift_link_uses_ck", sql`${t.uses} >= 0`),
  ],
)

/**
 * A gift our server started (POST /api/gifts), keyed by the ref the giver's ft_transfer_call carries
 * (`{"pot":…,"gift":"<ref>"}`). `pending` until the hub's `gift_received` event names the ref (onGiftReceived), or
 * `failed` when the transfer failed; a pending row older than a day is ignored by everything. `link_id` null = the
 * public gift page. The name and note are the giver's: members (and the giver) read them; the public page shows them
 * only with `show_public` (page gifts only).
 */
export const gift = pgTable(
  "gift",
  {
    ref: text("ref").primaryKey(),
    potId: text("pot_id")
      .notNull()
      .references(() => pot.daoId),
    linkId: text("link_id").references(() => giftLink.id),
    giverAccount: text("giver_account").notNull(),
    giverUserId: uuid("giver_user_id").references(() => appUser.id, { onDelete: "set null" }),
    displayName: text("display_name"),
    note: text("note"),
    showPublic: boolean("show_public").notNull().default(false),
    amount: u128("amount").notNull(),
    status: text("status", { enum: ["pending", "received", "failed"] })
      .notNull()
      .default("pending"),
    txHash: text("tx_hash"),
    clientKey: text("client_key"),
    createdAt: createdAt(),
    receivedAt: ts("received_at"),
  },
  (t) => [
    index("gift_pot_status_idx").on(t.potId, t.status, t.createdAt),
    index("gift_giver_idx").on(t.giverAccount, t.createdAt),
    index("gift_link_idx").on(t.linkId),
    uniqueIndex("gift_client_key_uq").on(t.giverAccount, t.clientKey).where(sql`${t.clientKey} is not null`),
    check("gift_ref_ck", sql`${t.ref} ~ '^g[0-9a-hjkmnp-tv-z]{23}$'`),
    check("gift_status_ck", sql`${t.status} in ('pending', 'received', 'failed')`),
    check("gift_name_ck", sql`${t.displayName} is null or char_length(${t.displayName}) between 1 and 40`),
    check("gift_note_ck", sql`${t.note} is null or char_length(${t.note}) between 1 and 140`),
    check("gift_amount_ck", sql`${t.amount} > 0`),
  ],
)

/** The Pot's public gift page (`/give/<slug>`): off until a member turns it on; `line` = the members' one-liner. */
export const giftPage = pgTable(
  "gift_page",
  {
    potId: text("pot_id")
      .primaryKey()
      .references(() => pot.daoId),
    on: boolean("on").notNull().default(false),
    line: text("line"),
    updatedBy: text("updated_by"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [check("gift_page_line_ck", sql`${t.line} is null or char_length(${t.line}) between 1 and 100`)],
)

// ---------------------------------------------------------------------------------------------
// 2.3 Relay log, feed cache, quotas, leases, alerts, errors
// ---------------------------------------------------------------------------------------------

export const relayLog = pgTable(
  "relay_log",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id").notNull(),
    userId: uuid("user_id").references(() => appUser.id),
    idempotencyKey: text("idempotency_key"),
    bodyHash: text("body_hash"),
    op: text("op", { enum: RELAY_OPS }).notNull(),
    intent: text("intent"),
    senderId: text("sender_id"),
    receiverId: text("receiver_id").notNull(),
    methods: text("methods").array(),
    potId: text("pot_id"),
    delegateHash: text("delegate_hash"),
    delegatePublicKey: text("delegate_public_key"),
    delegateNonce: numeric("delegate_nonce", { precision: 20, scale: 0 }),
    maxBlockHeight: bigint("max_block_height", { mode: "number" }),
    relayerKey: text("relayer_key"),
    outerTxHash: text("outer_tx_hash"),
    status: text("status", { enum: RELAY_STATUSES }).notNull(),
    outcome: text("outcome", { enum: ["success", "inner_failed", "delegate_failed"] }),
    reason: text("reason"),
    errorCode: text("error_code"),
    errorText: text("error_text"),
    result: jsonb("result"),
    events: jsonb("events"),
    response: jsonb("response"),
    httpStatus: smallint("http_status"),
    executedAtBlock: bigint("executed_at_block", { mode: "number" }),
    estYocto: u128("est_yocto"),
    costYocto: u128("cost_yocto"),
    gasBurnt: numeric("gas_burnt", { precision: 20, scale: 0 }),
    createdAt: createdAt(),
    submittedAt: ts("submitted_at"),
    finishedAt: ts("finished_at"),
  },
  (t) => [
    uniqueIndex("relay_log_user_key_uq").on(t.userId, t.idempotencyKey).where(sql`${t.userId} is not null`),
    uniqueIndex("relay_log_server_key_uq").on(t.op, t.idempotencyKey).where(sql`${t.userId} is null`),
    uniqueIndex("relay_log_delegate_uq").on(t.delegateHash),
    uniqueIndex("relay_log_tx_uq").on(t.outerTxHash),
    index("relay_log_inflight_idx")
      .on(t.senderId, t.delegatePublicKey)
      .where(sql`${t.status} in ('validated', 'signed', 'submitted', 'pending')`),
    index("relay_log_pot_idx").on(t.potId, t.createdAt),
    index("relay_log_user_idx").on(t.userId, t.createdAt),
    index("relay_log_created_idx").on(t.createdAt),
  ],
)

export const feedEvent = pgTable(
  "feed_event",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    potId: text("pot_id")
      .notNull()
      .references(() => pot.daoId),
    kind: text("kind", { enum: FEED_KINDS }).notNull(),
    key: text("key").notNull(),
    actor: text("actor"),
    subject: text("subject"),
    amount: u128("amount"),
    proposalId: bigint("proposal_id", { mode: "number" }),
    requestRef: text("request_ref"),
    category: text("category"),
    path: text("path", { enum: ["instant", "vote"] }),
    status: text("status"),
    txHash: text("tx_hash"),
    receiptId: text("receipt_id").notNull(),
    eventIndex: smallint("event_index").notNull(),
    blockHeight: bigint("block_height", { mode: "number" }),
    at: ts("at").notNull(),
    data: jsonb("data").notNull(),
    source: text("source", { enum: ["relay", "reconcile", "report", "seed"] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("feed_event_receipt_uq").on(t.receiptId, t.eventIndex),
    index("feed_event_pot_at_idx").on(t.potId, t.at),
  ],
)

export const quotaUsage = pgTable(
  "quota_usage",
  {
    subject: text("subject").notNull(),
    action: text("action").notNull(),
    periodStart: ts("period_start").notNull(),
    n: u128("n").notNull().default("0"),
  },
  (t) => [primaryKey({ columns: [t.subject, t.action, t.periodStart] })],
)

export const lease = pgTable("lease", {
  name: text("name").primaryKey(),
  holder: text("holder"),
  until: ts("until"),
  meta: jsonb("meta"),
})

export const alertState = pgTable("alert_state", {
  key: text("key").primaryKey(),
  lastSentAt: ts("last_sent_at").notNull(),
})

export const errorLog = pgTable(
  "error_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    at: ts("at").notNull().defaultNow(),
    requestId: text("request_id"),
    route: text("route").notNull(),
    reason: text("reason"),
    userId: uuid("user_id"),
    relayId: text("relay_id"),
    detail: jsonb("detail"),
  },
  (t) => [index("error_log_at_idx").on(t.at)],
)

// ---------------------------------------------------------------------------------------------
// 2.4 Deposits, notifications, Telegram
// ---------------------------------------------------------------------------------------------

const XC_STATUS = [
  "PENDING_DEPOSIT",
  "KNOWN_DEPOSIT_TX",
  "PROCESSING",
  "SUCCESS",
  "INCOMPLETE_DEPOSIT",
  "REFUNDED",
  "FAILED",
  "EXPIRED",
  "ADDED",
  "STUCK",
] as const

export const depositIntent = pgTable(
  "deposit_intent",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id),
    potId: text("pot_id")
      .notNull()
      .references(() => pot.daoId),
    idempotencyKey: text("idempotency_key").notNull(),
    mode: text("mode", { enum: ["real", "simulated"] }).notNull(),
    chain: text("chain", { enum: ["base", "arb", "sol", "eth"] }).notNull(),
    recipient: text("recipient").notNull(),
    amountIn: u128("amount_in").notNull(),
    minAmountIn: u128("min_amount_in"),
    amountOutQuoted: u128("amount_out_quoted"),
    depositAddress: text("deposit_address").notNull(),
    depositMemo: text("deposit_memo"),
    correlationId: text("correlation_id"),
    quoteSignature: text("quote_signature"),
    quote: jsonb("quote").notNull(),
    deadline: ts("deadline").notNull(),
    status: text("status", { enum: XC_STATUS }).notNull(),
    lastStatus: jsonb("last_status"),
    depositedAmount: u128("deposited_amount"),
    amountOut: u128("amount_out"),
    refundedAmount: u128("refunded_amount"),
    refundReason: text("refund_reason"),
    destinationTxHash: text("destination_tx_hash"),
    processingSince: ts("processing_since"),
    lastPolledAt: ts("last_polled_at"),
    workflowRunId: text("workflow_run_id"),
    simScenario: text("sim_scenario"),
    simStartedAt: ts("sim_started_at"),
    addedRelayId: text("added_relay_id"),
    addedAt: ts("added_at"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("deposit_intent_address_uq").on(t.depositAddress),
    uniqueIndex("deposit_intent_user_key_uq").on(t.userId, t.idempotencyKey),
    index("deposit_intent_open_idx")
      .on(t.status)
      .where(sql`${t.status} in ('PENDING_DEPOSIT', 'KNOWN_DEPOSIT_TX', 'PROCESSING', 'INCOMPLETE_DEPOSIT')`),
  ],
)

export const pushSubscription = pgTable(
  "push_subscription",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    expirationTime: ts("expiration_time"),
    standalone: boolean("standalone").notNull().default(false),
    platform: text("platform"),
    createdAt: createdAt(),
    lastOkAt: ts("last_ok_at"),
    failCount: integer("fail_count").notNull().default(0),
  },
  (t) => [
    uniqueIndex("push_subscription_endpoint_uq").on(t.endpoint),
    index("push_subscription_user_idx").on(t.userId),
  ],
)

export const notificationLog = pgTable(
  "notification_log",
  {
    eventKey: text("event_key").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    channel: text("channel", { enum: ["push", "email", "telegram"] }).notNull(),
    status: text("status", { enum: ["queued", "sent", "failed", "skipped"] })
      .notNull()
      .default("queued"),
    sentAt: ts("sent_at"),
    detail: jsonb("detail"),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.eventKey, t.userId, t.channel] }),
    index("notification_log_created_idx").on(t.createdAt),
  ],
)

export const telegramUser = pgTable("telegram_user", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => appUser.id, { onDelete: "cascade" }),
  tgUserId: bigint("tg_user_id", { mode: "number" }).notNull().unique(),
  linkedAt: ts("linked_at").notNull().defaultNow(),
})

export const telegramChat = pgTable(
  "telegram_chat",
  {
    chatId: bigint("chat_id", { mode: "number" }).primaryKey(),
    potId: text("pot_id")
      .notNull()
      .references(() => pot.daoId),
    linkedByUserId: uuid("linked_by_user_id").references(() => appUser.id),
    active: boolean("active").notNull().default(true),
    linkedAt: ts("linked_at").notNull().defaultNow(),
  },
  (t) => [index("telegram_chat_pot_idx").on(t.potId)],
)

export const tgLinkToken = pgTable("tg_link_token", {
  tokenHash: text("token_hash").primaryKey(),
  kind: text("kind", { enum: ["user", "group"] }).notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => appUser.id, { onDelete: "cascade" }),
  potId: text("pot_id").references(() => pot.daoId),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
})

export const telegramPost = pgTable(
  "telegram_post",
  {
    potId: text("pot_id")
      .notNull()
      .references(() => pot.daoId),
    proposalId: bigint("proposal_id", { mode: "number" }).notNull(),
    chatId: bigint("chat_id", { mode: "number" }).notNull(),
    messageId: bigint("message_id", { mode: "number" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.potId, t.proposalId, t.chatId] })],
)

/**
 * "Help us make Pot better" (first-run onboarding, 2026-11-02): one row per person, upserted by
 * POST /api/me/survey. Answers are enum ids only (lib/survey.ts, versioned; zod in server/http/schemas.ts), never
 * free text. **Read by the Pot team only** (scripts/survey-report.ts prints counts); never shown to a Pot or
 * another person, and no route returns anyone else's row. Deleted with the person (cascade).
 */
export const userSurvey = pgTable(
  "user_survey",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => appUser.id, { onDelete: "cascade" }),
    version: smallint("version").notNull(),
    answers: jsonb("answers").notNull(),
    /** how they came in: created | joined | other (from the flow, not asked) */
    context: text("context"),
    /** the build that saved it (the deploy's short commit, when known) */
    appVersion: text("app_version"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("user_survey_version_ck", sql`${t.version} between 1 and 100`),
    check("user_survey_context_ck", sql`${t.context} is null or ${t.context} in ('created', 'joined', 'other')`),
    check("user_survey_answers_ck", sql`jsonb_typeof(${t.answers}) = 'object' and octet_length(${t.answers}::text) <= 2000`),
    check("user_survey_app_version_ck", sql`${t.appVersion} is null or char_length(${t.appVersion}) <= 40`),
  ],
)
