# Pot: API spec

> Owner: backend-architect. Written 2026-10-21 against [decisions.md](decisions.md) **Revision 2** (D-xx; §8 names are binding), [contracts-spec.md](contracts-spec.md) and [accounts-and-deploy.md](accounts-and-deploy.md). Read [architecture.md](architecture.md) first for the trust model and the sequence diagrams; the schema is in [data-model.md](data-model.md).
> Audience: P1, Cerasela and the Claude Code agents implementing `apps/web/app/api/**` from Nov 1. Client-side expectations come from [frontend-architecture.md](frontend-architecture.md) §13; §9.1 below lists where this spec matches or extends them.
> Markers: ⚠️ = assumption or unverified; ⓟ = a copy key proposed here or by the frontend that ux-spec doesn't have yet.
> **Rev 3 review (2026-10-21, [review.md](review.md)):** adds the preview-only dev session (`POST /api/session/dev`, session kind `dev`); fixes the route phases and owners (§0.6); a copy-key fallback for flows without their own `*.error.*` keys (§1.1); R2 bounds aligned with the contract and the UI; relayer alert thresholds derived from the MPC reserve (§3.5); the demo-session push option for R-15 (§2.6); README twins now use the D-61 numbers (§7.4).

> **Rev 4 security fixes (2026-10-21, [review-security.md](review-security.md) §7, decisions.md Revision 4):** R11 relays votes only on live, hub-tracked proposals for members of that Pot, at exactly 100 Tgas (Transfer, join) or 300 Tgas (`call`), with `Finalize` ≤ 3 per proposal per day; per-user daily NEAR budgets (`relay_yocto`, `hub_yocto`) and a global `hub_yocto` cap; invite links default to 7 days and 10 uses; the ID token's OIDC `nonce` is bound to the device key (`GET /api/session/challenge`); `pending_device` sessions are limited; the 1Click simulator is capped; demo leases get BotID and per-IP/64 limits, the reference Pot is read-only and the shared Pot can't be closed or have its rules changed; static security headers on every route; the MPC `sign` deposit is 1 yocto, so the relayer thresholds are 5/2 NEAR.
> **Rev 5 (2026-10-21, decisions.md Revision 5):** `withdraw_request` is Phase 3 and not built. Relayer rule R10, the `withdraw_request` intent, the `{type: withdraw}` result, `WITHDRAW_FAILED` and the hub's withdraw error codes are reserved for Phase 3; until then the relayer refuses the method with `method_not_allowed`.

## 0. Conventions

### 0.1 Runtime and files
- Every route is a Next.js 16.4.2 App Router route handler in `apps/web/app/api/**/route.ts` on the **Node.js runtime**, which is the only runtime in Next ≥ 16.3. **Do not export `runtime`, `dynamic` or `revalidate`**: with Cache Components on (D-43), route segment config other than `maxDuration` breaks the build ([frontend-stack.md](../kb/frontend-stack.md)). Set `export const maxDuration = <n>` per route as listed in §0.6.
- Server code lives under `apps/web/lib/server/**` with `import 'server-only'`. Shared wire types live in `@pot/sdk` (`types/api.ts`), so client and server compile against the same shapes.
- Validation uses zod 4.6 (D-40) on every body and query. Reject unknown fields (`.strict()`).
- DB: Drizzle 0.45.4 over `pg` with `attachDatabasePool` ([data-model.md](data-model.md) §6). Chain: near-api-js 7.3.1 behind one `FailoverRpcProvider` (FastNEAR, then dRPC; never `rpc.testnet.near.org`, D-32).

### 0.2 Auth modes

| Mode | Meaning |
|---|---|
| `none` | public |
| `session` | a valid session cookie of any kind (§4) |
| `session:near-auth`, `session:wallet`, `session:demo` | the session must be of that kind. A `dev` session (preview only) is device-bound like `near-auth` but has no MPC key, so it can't use the device routes (§2.2) |
| `cron` | `Authorization: Bearer $CRON_SECRET` |
| `telegram` | `X-Telegram-Bot-Api-Secret-Token: $TELEGRAM_WEBHOOK_SECRET` |

CSRF: every non-GET route except the Telegram webhook and the cron requires `Content-Type: application/json` and an `Origin` header equal to `NEXT_PUBLIC_APP_URL` (preview: the deployment's own origin). The session cookie is `SameSite=Lax`. The one exception is `POST /api/demo/session`, which also accepts a same-origin HTML form post (§2.7).

**Security headers (rev4, review-security M-3; all routes and pages, static so they work with Cache Components):** `Content-Security-Policy: frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'` (enforced: no page, the Approve sheet included, can be framed); `X-Frame-Options: DENY`; `X-Content-Type-Options: nosniff`; `Referrer-Policy: strict-origin-when-cross-origin` (`/j/*` keeps `same-origin`); `Permissions-Policy: camera=(), microphone=(), geolocation=()`; `Strict-Transport-Security: max-age=63072000`. A `script-src`/`connect-src` policy stays report-only (frontend-architecture §4.3), because a strict `connect-src` could break NEAR Connect wallets. Set in `next.config.ts` `headers()` ([frontend-architecture.md](frontend-architecture.md) §1.5); test W-08.

### 0.3 Envelope, ids and amounts

```ts
// @pot/sdk types/api.ts (wire types; all amounts are strings)
export type MicroStr = string            // USDC (test) base units, 6 decimals: /^(0|[1-9][0-9]{0,15})$/  ("150000000" = $150)
export type AccountId = string           // NEAR account id, 2-64 chars, /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/
export type DaoId = string               // `${slug}.${HUB_ID}` (D-02); the `pot` argument everywhere
export type PublicKeyStr = `ed25519:${string}`   // base58 body, 43-44 chars
export type IsoTime = string             // RFC 3339, UTC
export type OpKey = string               // client op id: 16 chars of lowercase Crockford base32, /^[0-9a-hjkmnp-tv-z]{16}$/
export type SessionKind = 'near-auth' | 'wallet' | 'demo' | 'dev'   // 'dev': preview and local only (§2.1, rev3)
export type Persona = 'maya' | 'sam' | 'leo'                       // D-02, D-61 Rev 1
export type Category = 'groceries' | 'food' | 'transport' | 'stay' | 'tickets' | 'other'   // ux-spec spend.reason.chips
export type AvatarTint = 'peach' | 'sand' | 'sage' | 'mist' | 'lilac' | 'rose'          // ux-spec §7.1 avatar tints
export type GradientId = string          // cover gradient token from the design system (D-61 Rev 1: emoji + gradient only)
export interface Pop { ts: number; sig: string }   // device-key proof: ts = Unix ms, sig = base64url Ed25519 signature (§4.2)

export interface Ok { ok: true; requestId: string; replayed?: true }
export interface Err {
  ok: false
  requestId: string
  reason: Reason                         // §1, stable snake_case
  retryAfterMs?: number
  txHash?: string                        // when something reached the chain
  detail?: Record<string, unknown>       // machine-readable extras (field, family, limit, resetsAt, cause, status…)
  message?: string                       // English, for logs and the Details sheet only; never shown as UX copy
}
```

- Every JSON response, success or error, includes `requestId` (`req_` + ULID) and the header `x-request-id` with the same value.
- Authenticated responses send `Cache-Control: private, no-store`. Demo-session responses also send `x-pot-demo: 1`.
- Request bodies are capped at 16 KB (`bad_request` above that).
- Amounts are integers in base units as strings. Times are ISO strings, except `Pop.ts` and NEAR fields such as `expires_at_ms`.

### 0.4 Idempotency
- Every side-effecting POST takes `idempotencyKey: OpKey` in the body (the frontend's op id, [frontend-architecture.md](frontend-architecture.md) §6.1). The server stores the response of the first request under `(user, route, idempotencyKey)`.
- The same key with the same body returns the stored response with `replayed: true` and the original HTTP status. The same key with a different body returns 409 `idempotency_conflict`.
- Routes without a key are idempotent by a natural key (noted per route).

### 0.5 Pagination
Cursor-based: `?before=<opaque cursor>&limit=<1..100>`; responses carry `nextCursor` when more rows exist.

### 0.6 Route index

Phase (rev3): 1 = MVP (freeze Nov 7), 2 = Phase 2 (feature freeze Nov 10), opt = optional, cut by default, prev = preview and local only. Task = the owning task in [implementation-plan.md](implementation-plan.md) §3.

| # | Route | Auth | Phase | Task | Purpose | `maxDuration` | Latency budget (p95) |
|---|---|---|---|---|---|---|---|
| 1 | `GET /api/session` | none (reads the cookie) | 1 | B-07 | Current session | 10 | 300 ms |
| 2 | `POST /api/session` | none | 1 | B-07 (nonce check: B-20, rev4) | NEAR Auth ID token + device PoP → session; creates the account on first login (§8) | 60 | 800 ms returning, 10 s new account |
| 2c | `GET /api/session/challenge` | none | 2 | B-20 (rev4) | A short-lived server challenge for the OIDC `nonce` that binds the ID token to the device key (§2.1) | 10 | 100 ms |
| 2b | `POST /api/session/dev` | none | prev | B-04 | Dev session: a 0-NEAR test account for a browser device key, no Auth0 (§2.1, rev3) | 30 | 10 s |
| 3 | `POST /api/session/device` | none | 1 | B-07 | Device-key re-login (K-2) | 15 | 800 ms |
| 4 | `POST /api/session/wallet` | none | 1 | B-10 | NEAR Connect NEP-413 → session (§8) | 15 | 800 ms |
| 5 | `DELETE /api/session` | session | 1 | B-07 | Logout | 10 | 300 ms |
| 6 | `PATCH /api/me` | session (not demo) | 2 | X-05b | Display name, tint, email opt-in | 10 | 300 ms |
| 7 | `POST /api/devices` | session:near-auth | 2 | B-13 | Relays the NEAR Auth-signed `AddKey` (§8) | 60 | 25 s |
| 8 | `POST /api/devices/pair` | session:near-auth | 2 | B-15 (only if the iOS spike fails) | Pair from Safari: start (D-21 fallback) | 10 | 500 ms |
| 9 | `GET /api/devices/pair/[id]` | session:near-auth | 2 | B-15 | Pairing status and code | 10 | 300 ms |
| 10 | `POST /api/devices/pair/[id]/complete` | session:near-auth | 2 | B-15 | Safari relays `AddKey(PWA key)` | 30 | 6 s |
| 11 | `POST /api/relay` | session | 1 | B-03 (+ B-05, B-06, B-08, B-09) | Relays a signed delegate, or a demo intent (§8) | 60 | 8 s (multi-hop) |
| 12 | `GET /api/relay/[relayId]` | session | 1 | B-09 (B-03 stores the rows it reads) | Outcome of a pending or past relay | 30 | 300 ms (+20 s when polling the chain) |
| 13 | `POST /api/tx/report` | session:wallet | opt | B-10 (if time) | Report a self-paid wallet tx | 30 | 2 s |
| 14 | `POST /api/faucet` | session | 1 | X-09 | Demo dollars (§8) | 30 | 6 s |
| 15 | `POST /api/notes` | session | 1 | X-05 | Off-chain memo or decline reason (§8 Rev 1) | 10 | 400 ms |
| 16 | `POST /api/nudges` | session | opt | B-18 | Nudge a member (§8 Rev 1) | 15 | 1.5 s |
| 17 | `GET /api/pots/[pot]/feed` | none or session | 1 | X-05 | Feed history + enrichment (§8) | 15 | 400 ms (1.5 s with lazy reconcile) |
| 18 | `GET /api/pots/meta` | none | 2 | X-05b | Emoji and gradient for Pot cards (until it lands, cards use the on-chain emoji and a gradient derived from the slug) | 10 | 200 ms |
| 19 | `PATCH /api/pots/[pot]/meta` | session (member) | opt | X-05b (if time) | Change emoji or gradient | 10 | 300 ms |
| 20 | `POST /api/push/subscription` | session (not demo, unless `FLAG_DEMO_PUSH`, §2.6) | 2 | X-06 | Store a push subscription (§8) | 10 | 300 ms |
| 21 | `DELETE /api/push/subscription` | session | 2 | X-06 | Remove it (§8) | 10 | 300 ms |
| 22 | `GET /api/oneclick/chains` | session | 2 | B-14 | Chain list with Shield status | 10 | 600 ms |
| 23 | `POST /api/oneclick/quote` | session | 2 | B-14 | Quote + deposit address (§8) | 30 | 1.5 s |
| 24 | `GET /api/oneclick/status/[id]` | session | 2 | B-14 | Deposit status (§8) | 15 | 300 ms (+1 s live) |
| 25 | `POST /api/oneclick/simulate` | session | 2 | B-14 | Testnet simulated send (§8) | 10 | 300 ms |
| 26 | `POST /api/demo/session` | none (BotID on new leases, rev4) | 1 | X-08 | Lease a demo Pot, switch persona, reset (§8) | 30 | 1 s |
| 27 | `GET /api/demo/state` | none | 1 | X-08 | Public JSON twin for judges | 15 | 500 ms (cached 5 s) |
| 28 | `POST /api/telegram/webhook` | telegram | opt | B-17 | Bot updates (§8) | 15 | 2 s |
| 29 | `POST /api/telegram/link` | session (not demo) | opt | B-17 | Group or DM link token | 10 | 300 ms |
| 30 | `GET /api/health` | none | 1 | B-03 | Banner health | 10 | 300 ms (cached 15 s) |
| 31 | `GET /api/cron/reconcile` | cron | 2 | B-11 | Daily safety net (§5.3) | 300 | — |

Workflows: `watchDeposit` (B-14), `refillDemoPool` + `seedDemoPot` (B-12; the seeding script that hand-runs the same steps is B-08).

Removed by Revision 1: `POST /api/requests/memo` (now `POST /api/notes`). Not built: cover uploads (emoji + gradient only).

## 1. Error taxonomy

### 1.1 Rules
- `reason` codes are stable snake_case strings. Never rename one; add new ones instead.
- **4xx means nothing was submitted to the chain and nothing was spent**, except where a row says "on chain" (then `txHash` is set).
- A relay that reached the chain returns **200** with `outcome: "inner_failed"`, the raw panic text in `error` and the parsed code in `errorCode` (§1.3), as the frontend expects ([frontend-architecture.md](frontend-architecture.md) §4.8). The relayer paid gas; the contract refused or refunded.
- The client maps `(reason or errorCode, flow)` to copy. `{flow}` is one of `add`, `spend`, `approve`, `create`, `close`, `setup`, `join`. Copy keys come from [ux-spec.md](ux-spec.md) §5; ⓟ marks a proposed key.
- **Rev 3: `{flow}.error.generic` and `{flow}.error.relayer` exist in ux-spec only for `add` and `spend`** (plus `approve.error.relayer`, `create.error.relayer`, `setup.error.relayer`). Every other flow uses these existing keys instead, so no new copy is needed:

  | Flow | for `{flow}.error.generic` | for `{flow}.error.relayer` |
  |---|---|---|
  | `approve` | `approve.error.vote_revert` | `approve.error.relayer` |
  | `create` | `create.error.relayer` | `create.error.relayer` |
  | `close` | `close.error` | `close.error` |
  | `setup` | `setup.error.relayer` | `setup.error.relayer` |
  | `join` | `setup.error.join` | `setup.error.relayer` |
  | anything else | `generic.error` | `relayer.down.banner` |

### 1.2 Reasons

| `reason` | HTTP | Retry | Meaning | UX copy key |
|---|---|---|---|---|
| `bad_request` | 400 | no | malformed JSON, failed schema, body > 16 KB (`detail.field`) | `generic.error` |
| `forbidden_origin` | 403 | no | `Origin` or content type check failed (§0.2) | `generic.error` |
| `not_signed_in` | 401 | after re-auth | no session, or it expired or was revoked | `session.expired` |
| `id_token_invalid` | 401 | re-login | ID token signature, `iss`, `aud`, `exp`, or `iat` older than 10 min; rev4: a `nonce` that isn't bound to this device key and challenge (`detail.cause: "nonce"`), or a challenge that is unknown, older than 10 min or reused | `auth.failed` |
| `device_proof_invalid` | 401 | re-sign | `pop` outside ±120 s, bad signature, or reused | `auth.failed` |
| `auth_unavailable` | 503 | `retryAfterMs` 5000 | JWKS fetch failed | `auth.service_down` |
| `onboarding_in_progress` | 409 | `retryAfterMs` 2000 | a concurrent first login holds the onboarding lease | `setup.slow` |
| `account_setup_failed` | 502 | yes (resumes) | account creation or USDC registration failed on chain (`txHash`) | `setup.error.relayer` |
| `device_not_registered` | 404 (403 for a `pending_device` session, rev4) | flow | the device is unknown or its key is no longer on the account; rev4: also a `pending_device` session (device not on chain yet) calling notes, nudges, faucet, push, `PATCH /api/me` or pairing | opens ConfirmStep (`confirm.title`) |
| `device_revoked` | 403 | flow | the device was signed out with "forget this device" | opens ConfirmStep |
| `wallet_signature_invalid` | 401 | no | NEP-413 signature, recipient, message or nonce check failed | `auth.failed` |
| `wallet_key_not_full_access` | 403 | no | the signing key is not a full-access key of the account | `auth.failed` (ⓟ `confirm.reconnect_wallet`) |
| `near_auth_token_invalid` | 401 | re-approve | signing JWT failed `iss`, `aud`, `azp`, `scope`, `sub` or signature checks | `confirm.failed` |
| `near_auth_token_expired` | 409 | re-approve | fewer than 15 s left on the 60 s signing JWT | `confirm.failed` |
| `payload_mismatch` | 422 | no | `fatxn` ≠ `signPayload`, or the delegate isn't exactly the allowed `AddKey` | `confirm.failed` |
| `mpc_busy` | 503 | `retryAfterMs` 5000 | no MPC slot free (rev4: the 1-yocto deposit needs no NEAR reserve, D-21) | `confirm.failed` |
| `mpc_sign_failed` | 502 | re-approve | `fast-auth.testnet.sign` returned null (guard or MPC failure), on chain | `confirm.failed` |
| `pairing_invalid` | 404 | no | unknown pairing, another user's, or already used | ⓟ `device.pair.invalid` |
| `pairing_expired` | 410 | restart | older than 10 min | ⓟ `device.pair.expired` |
| `bot_detected` | 403 | no | BotID verdict (account creation, `create_pot` relays, the faucet and, rev4, a new demo lease) | `generic.error` |
| `demo_forbidden` | 403 | no | not allowed in a demo session, or the persona isn't in that Pot; rev4: any demo intent naming the reference Pot, and close or rules changes in the shared Pot (§2.3); also any non-`near-auth` session (wallet, dev) on the device routes (§2.2) | `generic.error` |
| `proposal_not_tracked` | 403 | no | rev4: a vote or `Finalize` on a DAO proposal the hub didn't create, or one it no longer tracks as live (`get_proposal_subject`, §3.1 R11) | `generic.error` (the UI shows such proposals read-only) |
| `sender_mismatch` | 403 | flow | delegate `sender_id` ≠ the session account | needs_device (frontend §4.8) |
| `receiver_not_allowed` | 403 | no | receiver not in the §3.1 policy | `generic.error` (bug) |
| `method_not_allowed` | 403 | no | method not allowed for that receiver | `generic.error` (bug) |
| `action_not_allowed` | 403 | no | a non-FunctionCall action, or more than one action outside the invite pair | `generic.error` (bug) |
| `args_invalid` | 422 | no | args fail the §3.1 constraints (`detail.field`) | `{flow}.error.generic` |
| `deposit_cap` | 403 | no | deposit isn't exactly the allowed value | `generic.error` (bug) |
| `gas_cap` | 422 | no | gas outside the rule's range (`detail.min`, `detail.max`) | `generic.error` (bug) |
| `fc_key_deposit` | 403 | no | a function-call key can't attach the 1 yocto, or breaks FC key rules | `generic.error` (wallet: ⓟ `confirm.reconnect_wallet`) |
| `bad_signature` | 401 | flow | the local ed25519 check of the delegate failed | needs_device |
| `key_not_found` | 403 | flow | the signing key isn't on the sender account (also on chain: `AccessKeyNotFound`) | needs_device |
| `key_not_allowed` | 403 | flow | NEAR Auth session, but the delegate isn't signed by the session's device key | needs_device: re-bind with `POST /api/session/device` |
| `expired` | 409 | auto, once | `max_block_height ≤ head + 10`, or `DelegateActionExpired` on chain (`txHash`) | silent re-sign |
| `ttl_too_long` | 422 | auto, once | `max_block_height > head + 600` | silent re-sign with TTL 200 |
| `nonce_used` | 409 | auto, once | nonce ≤ the access key nonce, or `DelegateActionInvalidNonce` on chain (`txHash`) | silent re-sign |
| `nonce_pending` | 409 | `retryAfterMs` 2000 | a delegate with a nonce ≥ this one is still in flight for this key | silent |
| `pot_unknown` | 404 | no | no such Pot | `pot.not_found.title` / `.body` |
| `pot_closed` | 409 | no | `detail.status`: `closing` or `closed` | ⓟ `pot.closing` / `close.readonly` |
| `not_a_member` | 403 | no | the session account isn't a member | `pot.not_member.title` / `.body` |
| `slug_taken` | 409 | auto | `{slug}.pots.{root}` exists | silent: the client re-suffixes |
| `already_voted` | 409 | no | pre-flight: the account already voted on this proposal | `approve.already` |
| `proposal_not_open` | 409 | no | pre-flight: `detail.status` (`Approved`, `Rejected`, `Failed`, …), `detail.expired` | refetch → `approve.decided.*` / `approve.expired` |
| `idempotency_conflict` | 409 | no | same `idempotencyKey`, different body | `generic.error` |
| `note_exists` | 409 | no | a different text is already stored for this note | `generic.error` |
| `registration_used` | 409 | no | rev4: we already paid this account's USDC registration once, and it unregistered since (§2.4) | `generic.error` |
| `nudge_too_soon` | 429 | next window | this person was nudged in the last 24 h | ⓟ `members.nudge.too_soon` |
| `rate_limited` | 429 | `retryAfterMs` | burst limit (20 writes/min) | `relayer.cap` |
| `quota_exceeded` | 429 | next UTC day | `detail.family`, `detail.limit`, `detail.resetsAt`; rev4 families `budget` (per-user daily NEAR), `finalize` (≤ 3 per proposal per day), `lease` (per IPv4 address or IPv6 /64), `xc` (simulator caps) | `relayer.cap`; family `create` → `create.error.limit`; family `faucet` → ⓟ `faucet.limit` |
| `user_suspended` | 403 | next UTC day | more than 10 on-chain rejections today | `relayer.cap` |
| `chain_paused` | 409 | pick another chain | 1Click Shield incident or "Quoting for this pair is not available" | ⓟ `xc.network.paused` |
| `amount_too_low` | 422 | no | below the bridge minimum (`detail.minimum`) | ⓟ `xc.amount_too_low` |
| `amount_too_high` | 422 | no | rev4: a simulated quote or delivery above $500 (`detail.maximum`) | `generic.error` |
| `quote_failed` | 502 | yes | any other 1Click error (`detail.correlationId`) | ⓟ `xc.quote_failed` |
| `not_found` | 404 | no | unknown id | `generic.error` |
| `service_unavailable` | 503 | `retryAfterMs` | `detail.cause`: `rpc`, `db`, `relayer_busy`, `sponsor_low`, `global_cap`, `treasury`, `oneclick`, `maintenance` | `{flow}.error.relayer` + `relayer.down.banner`; `maintenance` → `maintenance` |
| `internal` | 500 | once | unexpected | `generic.error` |

Not an error: **202 `{ok: true, status: "pending", relayId, txHash}`**, returned when a relay's outcome is still unknown after 25 s. The client polls `GET /api/relay/[relayId]` and shows ⓟ `generic.checking`.

### 1.3 Contract errors (`inner_failed` → `errorCode`)

`errorCode` is the first `ERR_*` token found in the failed receipt's `ExecutionError` (after stripping control characters), or one of the synthetic codes below. Hub codes are owned by [contracts-spec.md](contracts-spec.md); the names here are the ones this spec expects (⚠️ S-3 in architecture §5).

| Panic substring | `errorCode` | Client copy |
|---|---|---|
| `ERR_ALREADY_VOTED` (Sputnik) | `ERR_ALREADY_VOTED` | `approve.already` |
| `ERR_PROPOSAL_NOT_READY_FOR_VOTE` (Sputnik) | same | refetch → `approve.decided.*` / `approve.expired` |
| `ERR_PERMISSION_DENIED` (Sputnik) | same | `pot.not_member.*` |
| `ERR_PROPOSAL_NOT_EXPIRED_OR_FAILED` (Finalize) | same | `generic.error` |
| `ERR_WRONG_KIND`, `ERR_MIN_BOND`, `ERR_NO_PROPOSAL` (Sputnik) | same | `generic.error` (bug: the pre-flight should catch them) |
| `is not registered` (NEP-141) | `RECEIVER_NOT_REGISTERED` | `{flow}.error.generic` |
| `doesn't have enough balance` (NEP-141) | `INSUFFICIENT_FUNDS` | `add.error.insufficient_own` |
| `Exceeded the prepaid gas` | `OUT_OF_GAS` | `{flow}.error.generic` (bug in gas defaults) |
| `ERR_POT_NOT_FOUND` (hub) | same | `pot.not_found.*` |
| `ERR_POT_NOT_OPEN` (hub: closing or closed) | same | ⓟ `pot.closing` / `close.readonly`; on the landing `invite.pot_closed` |
| `ERR_NOT_MEMBER` (hub) | same | `pot.not_member.*` |
| `ERR_PAUSED` (hub, owner kill switch) | same | `maintenance` |
| `ERR_HUB_LOW_BALANCE` (hub) | same | `{flow}.error.relayer` + `relayer.down.banner` (alert `hub_low`) |
| `ERR_INVITE_NOT_FOUND`, `ERR_INVITE_PK_INVALID`, `ERR_BAD_SIGNATURE` (hub) | same | `invite.invalid` |
| `ERR_INVITE_EXPIRED` (hub) | same | `invite.expired` |
| `ERR_INVITE_REVOKED` (hub) | same | `invite.replaced` |
| `ERR_INVITE_USED_UP` (hub) | same | `invite.used` |
| `ERR_ALREADY_MEMBER` (hub) | same | `invite.already_member` (treat as success) |
| `ERR_POT_FULL` (hub, 40 members, D-09) | same | ⓟ `invite.pot_full` |
| `ERR_TOO_MANY_POTS` (hub) | same | `generic.error` |
| `ERR_SLUG_TAKEN` (hub) | same | silent re-suffix |
| `ERR_SLUG_INVALID`, `ERR_SLUG_RESERVED`, `ERR_NAME_INVALID`, `ERR_EMOJI_INVALID`, `ERR_RULES_INVALID` (hub) | same | `create.error.name` (name or slug), else `generic.error` |
| `ERR_CREATOR_DAILY_LIMIT`, `ERR_GLOBAL_DAILY_LIMIT` (hub; the second is rev4) | same | `create.error.limit` |
| `ERR_DEPOSIT_REQUIRED` (hub, rev4: a direct call without `cost(op)` attached; our relayer never triggers it) | same | `generic.error` (bug in a wallet-paid path) |
| `ERR_RULES_PENDING` (hub, rev4) | same | `generic.error` (bug: the Rules tab hides "Suggest a change" while one is pending) |
| `ERR_CLOSE_COOLDOWN` (hub, rev4) | same | `close.error` |
| `ERR_TOO_MANY_PENDING`, `ERR_TOO_MANY_REQUESTS`, `ERR_TOO_MANY_INVITES` (hub) | same | `relayer.cap` |
| `ERR_BAD_AMOUNT`, `ERR_BAD_RECEIVER`, `ERR_BAD_REQUEST_REF` (hub) | same | `spend.error.generic` (bug: the relayer pre-checks these) |
| `ERR_POT_BUSY`, `ERR_PAYOUTS_PENDING`, `ERR_CLOSE_IN_PROGRESS`, `ERR_NO_CONTRIBUTIONS` (hub, `propose_close`) | same | `close.error` |
| `ERR_USE_PROPOSE_RULES` (hub) | same | bug: the client should call `propose_rules` |
| `ERR_UNKNOWN_PROPOSAL`, `ERR_NOT_RETRYABLE`, `ERR_USE_DAO_FINALIZE` (hub) | same | `generic.error` |
| `ERR_NOT_REQUESTER`, `ERR_UNKNOWN_REQUEST`, `ERR_NOT_WITHDRAWABLE` (hub, `withdraw_request`; Phase 3, not built, rev5) | same | `generic.error` |
| `ERR_WRONG_TOKEN`, `ERR_BAD_MSG`, `ERR_AMOUNT_TOO_LARGE` (hub, `ft_on_transfer`; the money is refunded) | same | `add.error.generic` |
| the hub returned the amount unused (no panic) | `CONTRIBUTION_REFUNDED` | `add.error.generic` |
| spend outcome `status: "refused"` (not a panic, [contracts-spec.md](contracts-spec.md) §3.4) | `REFUSED_` + the refusal in upper case | `REFUSED_INSUFFICIENT_BALANCE` → `preview.blocked.balance`; `REFUSED_NOT_IN_DAO_GROUP` → `pot.not_member.*`; `REFUSED_HUB_LOW_BALANCE` → `relayer.down.banner`; `REFUSED_POT_NOT_OPEN` → `close.readonly`; others (`payee_not_registered`, `dao_unavailable`, `add_failed`) → `spend.error.generic` |
| join outcome `ok: false` | `JOIN_FAILED` (`detail.reason`) | `setup.error.join` |
| create outcome `ok: false` (`dao_create_failed`) | `DAO_CREATE_FAILED` | `create.error.relayer` |
| `doesn't accept deposit`, `Failed to deserialize input from JSON.` (near-sdk) | `BAD_CALL` | `generic.error` (bug) |
| anything else | `UNKNOWN` | `{flow}.error.generic` |

## 2. Routes

Each route lists: auth, request/response types, validation (in order), errors, limits, idempotency, side effects and latency. Types not shown here are in §0.3. Sessions, cookies and proof formats are specified in §4.

### 2.1 Session

```ts
export interface SessionInfo {
  kind: SessionKind
  accountId: AccountId
  displayName: string
  avatarTint: AvatarTint
  emailHint?: string                         // "m•••@gmail.com" (landing.signed_in_as)
  expiresAt: IsoTime
  usdcRegistered: boolean
  device?: { publicKey: PublicKeyStr; status: 'active' | 'pending' }   // near-auth and dev
  mpcPublicKey?: PublicKeyStr                // near-auth only; the client needs it to build AddKey (frontend §4.4)
  demo?: { persona: Persona; potId: DaoId; slug: string; leaseExpiresAt: IsoTime; shared: boolean }
}
```

#### `GET /api/session`
- **Auth:** none; reads the session cookie if present.
- **Response 200:** `{ok: true, requestId, session: SessionInfo | null}`. A missing or dead session is `session: null`, not a 401.
- **Side effects:** bumps `session.last_seen_at` at most every 15 min; re-issues the `pot_hint` cookie if it is missing or stale.
- **Latency:** ≤ 300 ms (one indexed DB read).

#### `POST /api/session` (§8): NEAR Auth login, creates the account on first login (D-21)

```ts
interface SessionCreateReq {
  idToken: string                  // Auth0 ID token from the NEAR Auth login popup, ≤ 4 KB
  devicePublicKey: PublicKeyStr
  keyKind: 'webcrypto' | 'fallback'
  challenge?: string               // rev4 (B-20): from GET /api/session/challenge; required once B-20 ships (the ID token's nonce is bound to it)
  pop: Pop                         // over `pot-session-v1|${b64url(sha256(idToken))}|${ts}` (§4.2)
  displayName?: string             // optional first-run name, 1-40 chars
}
interface SessionCreateRes extends Ok {
  accountId: AccountId
  isNew: boolean
  deviceOnChain: boolean           // false → run the new-device flow (architecture 3.3)
  usdcRegistered: boolean
  mpcPublicKey: PublicKeyStr
  session: SessionInfo
  createTxHash?: string
}
```

Validation and steps, in order:
1. zod schema; `Origin` check.
2. Verify the ID token (§4.3). Failure → `id_token_invalid`; JWKS unreachable → `auth_unavailable`.
   - **Nonce binding (rev4, review-security M-1; B-20):** verify `challenge` (MAC, ≤ 10 min old) and insert `used_proof` (purpose `auth_challenge`, key `sha256(challenge)`), then require `idToken.nonce == base64url(sha256(rawPk(devicePublicKey) ‖ rawBytes(challenge)))`, where `rawPk` is the 32 public-key bytes and `rawBytes` the 32 decoded challenge bytes. Any mismatch → `id_token_invalid` (`detail.cause: "nonce"`). A token stolen from a log, a referrer or another device can't open a session for a different device key. It doesn't stop a malicious origin that shares our Auth0 client (it can fetch a challenge itself), which is why H-01 asks for a dedicated client and production accepts only its `aud` (§4.3).
3. Verify `pop` with `devicePublicKey` (§4.2) and insert `used_proof`. Failure → `device_proof_invalid`.
4. Look up `app_user` by `auth_sub`:
   - **found, `onboard_state = ready`:** `view_access_key(account, devicePublicKey)` → `deviceOnChain`. Insert the `device` row if new (status `active` if on chain, else `pending`). Create the session. **No tx.** Rev4: a session whose device is `pending` (not on chain) is a **`pending_device`** session: it may use GET routes, `POST /api/devices` and logout only; notes, nudges, faucet, push, `PATCH /api/me` and pairing → 403 `device_not_registered` (review-security M-1).
   - **display name (new users, rev3):** `displayName` if sent; else the ID token's `given_name`, else `name`, trimmed to 40 code points; else "Friend". It is never derived from the email. The user can change it later (`PATCH /api/me`, Phase 2).
   - **not found, or onboarding unfinished:** claim the onboarding lease (architecture 3.1), then:
     1. quotas: `global/accounts_created` (300/day prod, 50 preview), `ip/accounts_created` (3/day), burst;
     2. BotID `checkBotId()` (new accounts only) → `bot_detected`;
     3. derive `mpcPk` via `v1.signer-prod.testnet.derived_public_key` (D-21);
     4. pick `u-{8 random Crockford base32 chars}.{RELAYER_ACCOUNT_ID}`; `view_account` must be unknown (retry up to 3 draws);
     5. in parallel: `[CreateAccount, AddKey(mpcPk, FullAccess), AddKey(devicePk, FullAccess)]` and `usdc.storage_deposit({account_id, registration_only: true})` with 0.00125 NEAR, both signed by leased relayer keys, both `relay_log` rows (`op: create_account`, `storage_deposit`);
     6. wait for the creation tx at `EXECUTED_OPTIMISTIC`; let registration finish in `after()` if slower.
5. Set cookies (§4.1) and return.

| | |
|---|---|
| Errors | `id_token_invalid`, `device_proof_invalid`, `auth_unavailable`, `onboarding_in_progress`, `account_setup_failed`, `bot_detected`, `quota_exceeded` (family `accounts`), `rate_limited`, `service_unavailable` |
| Limits | WAF + `ip:{hash}` 10 session creations per hour; new accounts as in step 4.1 |
| Idempotency | natural: one account per `sub`; the onboarding state machine resumes from chain state. A retry needs a fresh `pop` (proofs are single-use) and, once B-20 ships, a fresh challenge and login |

#### `GET /api/session/challenge` (rev4; task B-20)

- **Auth:** none. **Response:** `{ok, requestId, challenge, expiresAt}`. `challenge` = base64url (no padding) of 32 bytes: an 8-byte big-endian Unix ms timestamp ‖ 16 random bytes ‖ the first 8 bytes of `HMAC-SHA256(APP_HMAC_SECRET, timestamp ‖ random)`. Stateless: nothing is stored until `POST /api/session` spends it (`used_proof`, single use, ≤ 10 min).
- **Client:** fetch it on idle together with the device key (frontend-architecture §4.3), so the login popup still opens synchronously inside the tap; compute `nonce = base64url(sha256(rawPk(devicePublicKey) ‖ rawBytes(challenge)))` and pass it to the direct `/authorize` call (frontend-architecture §4.4; auth0-spa-js overwrites a caller's `nonce`, review-security F-15).
- **Limits:** `ip:{hash}` 60/hour. **Cache:** `no-store`.
| Side effects | new users: 2 txs (≈ 0.0085 NEAR, [accounts-onboarding.md](../kb/accounts-onboarding.md)); rows in `app_user`, `device`, `session`, `relay_log`, `used_proof` |
| Latency | returning ≤ 800 ms; new account p50 ≈ 3-5 s, p95 ≤ 10 s (measured 3.8-7.9 s to FINAL for create + register) |

#### `POST /api/session/device`: device-key re-login (K-2)

```ts
interface DeviceLoginReq { accountId: AccountId; devicePublicKey: PublicKeyStr; pop: Pop }  // `pot-device-login-v1|${accountId}|${ts}`
interface DeviceLoginRes extends Ok { session: SessionInfo }
```
- **Validation:** `pop`; `device` row for `(account, key)` with status `active` (else `device_not_registered`; `revoked` → `device_revoked`); `view_access_key` is `FullAccess` (else mark the device `revoked`, return `device_not_registered`).
- **Limits:** `ip:{hash}` 30/hour; burst. **Latency:** ≤ 800 ms. **Side effects:** a new session row; cookies.

#### `POST /api/session/wallet` (§8): NEAR Connect NEP-413

```ts
interface WalletSessionReq {
  accountId: AccountId
  publicKey: PublicKeyStr
  signature: string                // base64, as returned by the wallet
  nonce: string                    // base64 of 32 bytes: u64 big-endian Unix ms ‖ 24 random bytes
  message: 'Sign in to Pot'
  recipient: string                // must equal the app host, e.g. "pot-team.vercel.app"
}
interface WalletSessionRes extends Ok { session: SessionInfo; isNew: boolean; usdcRegistered: boolean }
```
- **Validation:**
  1. nonce timestamp within 5 min of now; insert `used_proof` (purpose `wallet`, key = the nonce);
  2. rebuild the NEP-413 payload, hash and verify (§4.4) → `wallet_signature_invalid`;
  3. `view_access_key(accountId, publicKey)` must be `FullAccess` → `wallet_key_not_full_access`;
  4. reject every account under `<root>` (rev4: not just under `{RELAYER_ACCOUNT_ID}`; those are NEAR Auth accounts, personas or our own contracts, and the hub keeps a full-access key until Nov 12) → `bad_request`.
- **Side effects:** upsert `app_user (kind wallet)`, create a session; in `after()`, if `storage_balance_of(accountId)` is null, the relayer pays `storage_deposit` once per account ever (D-23; `relay_log` key `register:{account}`; counted in `global/registrations`, §3.5).
- **Limits:** `ip:{hash}` 20/hour. **Latency:** ≤ 800 ms.

#### `POST /api/session/dev`: preview-only test account (rev3; task B-04)

Exists so that gate G1 (Nov 3), gate G2 (Nov 5) and hallway round B (Nov 7) can run on a hosted preview, where NEAR Auth's shared client refuses the callback (D-22). It is a test convenience, not a login method: it never runs on production.

```ts
interface DevSessionReq {
  devicePublicKey: PublicKeyStr
  keyKind: 'webcrypto' | 'fallback'
  pop: Pop                         // `pot-dev-session-v1|${devicePublicKey}|${ts}` (§4.2)
  displayName: string              // 1-40 code points, e.g. "Leo" (hallway participants type a first name)
  idempotencyKey: OpKey
}
interface DevSessionRes extends Ok { accountId: AccountId; isNew: true; session: SessionInfo; createTxHash: string }
```
- **Guard:** answers **404 `not_found`** unless `FLAG_DEV_SESSION=true` **and** `VERCEL_ENV !== 'production'` **and** `NEXT_PUBLIC_NETWORK=testnet`. The production check doesn't depend on the flag.
- **Validation and steps:** zod + `Origin`; `pop` (insert `used_proof`, purpose `dev_session`); quotas: `global/dev_accounts` 20/day and `ip:{hash}` 10/day (a hallway session runs several phones on one network); then the new-account branch of `POST /api/session` without Auth0 and without the MPC key: `u-{8}.{RELAYER_ACCOUNT_ID}` with **one** full-access key (the device key), USDC registration in parallel, `app_user (kind dev, no auth_sub)`, `device` (active), `session (kind dev)`, cookies with `pot_hint.kind = "dev"`.
- **What a dev session can do:** everything a `near-auth` session can through `/api/relay` (the delegate must be signed by its device key, §3.2 step 7), `/api/faucet`, notes and push. It can't add a device (no MPC key: a new browser means a new test account) and `PATCH /api/me` isn't needed (the name is set here).
- **Errors:** `not_found`, `bad_request`, `device_proof_invalid`, `quota_exceeded` (family `accounts`), `rate_limited`, `account_setup_failed`, `service_unavailable`. **Latency:** p50 ≈ 3-5 s, p95 ≤ 10 s.

#### `DELETE /api/session`: logout

```ts
interface LogoutReq { pushEndpoint?: string; forgetDevice?: boolean }
// 200 { ok: true, requestId }
```
- Revokes the session row and clears `__Host-pot_session`, `pot_hint` and (for demo) `pot_demo_visitor`.
- `pushEndpoint` → deletes that subscription if it belongs to the user.
- `forgetDevice: true` → `device.status = revoked`, so device re-login refuses the key. The key stays on chain until a `DeleteKey` path exists (architecture Q-3); the client deletes its private half.

#### `PATCH /api/me`

```ts
interface ProfilePatch { displayName?: string; avatarTint?: AvatarTint; notifyEmail?: boolean }
interface ProfileRes extends Ok { profile: { displayName: string; avatarTint: AvatarTint; notifyEmail: boolean } }
```
- `displayName`: NFC, trimmed, 1-40 code points, no control characters and (rev4, review-security L-4) no Unicode format characters (Cf) except ZWJ U+200D and VS16 U+FE0F, so bidi overrides can't spoof names; the reserved words "Pot", "NEAR", "Support", "Admin" and "Team" can't be the whole name (impersonation in push titles). Rendered as plain text everywhere. The same rules apply to the `displayName` of `POST /api/session` and `POST /api/session/dev`.
- Demo sessions → `demo_forbidden`; `pending_device` sessions → `device_not_registered` (rev4). Re-issues `pot_hint`.

### 2.2 Devices

#### `POST /api/devices` (§8): relay the NEAR Auth-signed `AddKey` (D-21)

```ts
interface DevicesReq {
  guardId: 'jwt#https://login.testnet.fast-auth.com/'
  verifyPayload: string            // the 60 s signing JWT from the NEAR Auth approval popup, ≤ 7168 B
  signPayload: string              // base64 of the NEP-461-prefixed DelegateAction bytes the client built (≤ 1,400 B)
  devicePublicKey: PublicKeyStr    // the new key inside the AddKey
  keyKind: 'webcrypto' | 'fallback'
  pop: Pop                         // `pot-device-add-v1|${accountId}|${ts}`, signed by devicePublicKey
  idempotencyKey: OpKey
}
interface DevicesRes extends Ok {
  device: { publicKey: PublicKeyStr; status: 'active' }
  signTxHash?: string              // absent when the key was already on chain
  addKeyTxHash?: string
  executedAtBlock: number
}
```

Validation, in order (everything before step 8 is free):
1. Session kind `near-auth` (else `demo_forbidden`); idempotency lookup.
2. `pop` valid for `devicePublicKey`; insert `used_proof`.
3. Signing JWT (§4.3): RS256 via JWKS; `iss`; `aud` contains `auth0.jwt.fast-auth.testnet`; `azp` = `NEAR_AUTH_CLIENT_ID`; `scope` contains `transaction:sign`; `sub` = the session user's `auth_sub`; `exp − now ≥ 15 s`; `fatxn` (a byte array) equals `base64decode(signPayload)`. Failures → `near_auth_token_invalid` / `near_auth_token_expired` / `payload_mismatch`.
4. Bytes 0-3 are the NEP-461 prefix `6e 01 00 40`; `deserialize(SCHEMA.DelegateAction, bytes[4..])` re-encodes byte-identically.
5. The delegate: `sender_id = receiver_id = session account`; exactly one action, `AddKey(devicePublicKey, FullAccess)`; `public_key` = the user's stored `mpc_public_key`. Else `payload_mismatch`.
6. Chain: if `view_access_key(account, devicePublicKey)` already exists → mark the device active and return 200 without signing. Else `view_access_key(account, mpcPk)` must exist with `nonce < delegate.nonce` (`nonce_used`), and `head + 10 < max_block_height ≤ head + 600` (`expired` / `ttl_too_long`).
7. Quotas: family `devices` 5/user/day, `global/mpc_signs` 100/day, yocto pre-charge 0.005 NEAR.
7b. Rev4 (review-security L-7): recompute `v1.signer-prod.testnet.derived_public_key` for the JWT's `sub` (a free view) and require it to equal the stored `mpc_public_key` and the delegate's `public_key`; else `payload_mismatch` with nothing paid (guards against NEAR Auth's planned hashed-`sub` change).
8. Lease an MPC slot (`mpc_slot:0..1`) and a relayer key → `mpc_busy` if none is free. Rev4: no NEAR reserve per slot any more (the deposit is 1 yocto, D-21).
9. `fast-auth.testnet.sign({guard_id, verify_payload, sign_payload: number[], algorithm: "eddsa"})`, 300 Tgas, deposit `MPC_SIGN_DEPOSIT_YOCTO` = **1 yocto** (rev4, D-21: proven on testnet, tx `FzULQ33cjnR4HFc9iBGzR5V8oScLhJuUKAHqeixjFgLE`, and refunded on every path); wait `EXECUTED_OPTIMISTIC`, polling `tx_status` up to 30 s.
10. Parse `SuccessValue` → `{"scheme":"Ed25519","signature":[64 bytes]}`. `null` → `mpc_sign_failed` (with `txHash`).
11. Wrap into `SignedDelegate` and submit like any relay (policy row R12); classify (§3.4).
12. `device.status = active`, `session.device_id` = this device, re-issue `pot_hint`.

| | |
|---|---|
| Side effects | 2 txs (≈ 0.0045 NEAR for `sign` + ≈ 0.0001 for `AddKey`); `relay_log` rows `mpc_sign` and `add_key` |
| Latency | p50 ≈ 12-15 s (MPC ≈ 9 s, [near-auth.md](../kb/near-auth.md)), p95 ≤ 25 s |

#### `POST /api/devices/pair` (D-21 fallback "Pair from Safari", Phase 2)

```ts
interface PairStartReq { devicePublicKey: PublicKeyStr; keyKind: 'webcrypto' | 'fallback'; pop: Pop }   // `pot-device-pair-v1|${accountId}|${ts}`
interface PairStartRes extends Ok {
  pairingId: string                // 'pr_' + 20 Crockford base32 chars
  code: string                     // 6 digits, shown on both screens
  linkUrl: string                  // https://APP/link-device?p=<pairingId>
  safariUrl: string                // x-safari-https://APP_HOST/link-device?p=<pairingId>
  expiresAt: IsoTime               // now + 10 min
}
```
- **Auth:** `session:near-auth`: the PWA's session cookie, copied at install ([pwa-push.md](../kb/pwa-push.md)).
- **Validation:** `pop` for `devicePublicKey`; the key isn't already on the account; at most 1 open pairing per user (a new one cancels the old). Rev4 (review-security M-2): the session's bound device must be `active` **and** on chain (`view_access_key`); a `pending_device` session (e.g. one made from a replayed ID token) → `pairing_invalid`. The Safari page shows ⓟ `device.pair.warning` ("Only continue if you started this on this phone in the last 10 minutes").
- **Limits:** family `pairing` 3/user/day. **Side effects:** `device` row `pending`, `device_pairing` row.

#### `GET /api/devices/pair/[id]`
- **Auth:** `session:near-auth` of the **same user** as the pairing (either device). Another user → `pairing_invalid`.
- **Response:** `{ok, requestId, status: 'pending' | 'completed' | 'expired', code, keyFingerprint /* first 8 base58 chars */, expiresAt}`. The PWA polls it every 2 s.

#### `POST /api/devices/pair/[id]/complete` (Safari side)

```ts
interface PairCompleteReq { signedDelegate: string; idempotencyKey: OpKey }   // AddKey(pairing key, FullAccess) on the own account
interface PairCompleteRes extends Ok { device: { publicKey: PublicKeyStr; status: 'active' }; txHash: string; executedAtBlock: number }
```
- **Validation:** same user; pairing `pending` and not expired (`pairing_expired`); the decoded delegate has `sender = receiver = account` and exactly one `AddKey(pairing.device_pk, FullAccess)`; its signer is an **active device key of this user** (not the MPC key, not the new key) and, rev4, the device bound to the session that completes it (else `pairing_invalid`); then the usual signature, nonce and expiry checks (§3.2 steps 5-11). A "new device added" push to the user's other devices is deferred (review-security M-2; risk-register R-33).
- **Side effects:** one relayed `AddKey` (≈ 0.0001 NEAR); pairing `completed`; device `active`. **Latency:** ≤ 6 s.

### 2.3 Relay

#### `POST /api/relay` (§8): relay a signed delegate, or a demo intent

```ts
type IntentType = 'add_money' | 'request_spend' | 'vote' | 'join' | 'create_pot' | 'add_invite' | 'revoke_invite'
  | 'rotate_invite' | 'propose_close' | 'retry_payout' | 'set_rules' | 'propose_rules'   // rev5: 'withdraw_request' is Phase 3, not built

type RelayReq =
  | { signedDelegate: string         // base64(borsh(SignedDelegateAction)), no prefix; ≤ 4 KB decoded
      idempotencyKey: OpKey
      intent: IntentType             // advisory: must match the decoded call, else args_invalid
      requestRef?: OpKey             // request_spend only; must equal args.request_ref
      context?: RelayContext }
  | { demo: { intent: ActionIntentWire }   // demo sessions only: @pot/sdk ActionIntent with bigint → string
      idempotencyKey: OpKey
      context?: RelayContext }

interface RelayContext {
  depositIntentId?: string           // add_money after a 1Click deposit (marks deposit_intent ADDED)
  meta?: { gradient?: GradientId }   // create_pot only; stored off-chain on success (the emoji is a create_pot argument, on chain)
}

interface PotEvent {                 // parsed NEP-297 log, only from trusted executors (§3.4)
  standard: 'pot' | 'nep141'; version: string; event: string; data: unknown
  executor: AccountId; receiptId: string
}

type RelayResult =
  | { type: 'contribution'; recorded: boolean; amount: MicroStr; usedAmount: MicroStr }
  | { type: 'spend'; requestId: number; path: 'instant' | 'vote'; proposalId: number | null
      payout?: 'pending' | 'sent' | 'failed'; approvalsNeeded?: number }
  | { type: 'vote'; proposalId: number; action: 'VoteApprove' | 'VoteReject' | 'Finalize'
      proposalStatus: 'InProgress' | 'Approved' | 'Rejected' | 'Removed' | 'Expired' | 'Failed'
      payout?: 'sent' | 'failed' }
  | { type: 'join'; member: AccountId; status: 'active' | 'pending' }   // pending: the group must still approve
  | { type: 'create_pot'; potId: DaoId; slug: string }
  | { type: 'rules'; applied: boolean; proposalId?: number }
  | { type: 'close'; proposalId: number }
  | { type: 'invite'; added?: PublicKeyStr; revoked?: PublicKeyStr }
  // rev5: { type: 'withdraw'; proposalId: number } is Phase 3, not built
  | { type: 'maintenance'; proposalId: number; proposalStatus?: string }

interface RelayOk extends Ok {                       // HTTP 200
  relayId: string                                    // 'rl_' + ULID
  txHash: string
  receiptUrl: string                                 // https://testnet.nearblocks.io/txns/<txHash>
  outcome: 'success' | 'inner_failed'
  error?: string                                     // inner_failed: sanitized panic text
  errorCode?: string                                 // inner_failed: §1.3
  events: PotEvent[]
  executedAtBlock: number                            // highest block height among the receipts seen so far (architecture K-14)
  result: RelayResult
  final: boolean                                     // false only for the early request_spend response (D-07 Rev 2, §3.4)
}
interface RelayPending extends Ok { status: 'pending'; relayId: string; txHash: string }   // HTTP 202
// errors: Err with the reasons of §1.2 (4xx = nothing submitted, unless txHash is set)
```

- **Auth:** `session`. Demo bodies require `session:demo`; signed bodies are refused in demo sessions (`demo_forbidden`).
- **Validation and submission:** the full pipeline is §3.2; the per-method rules are §3.1; outcome classification is §3.4.
- **Demo intents:** the server checks, in this order (rev4): (1) the intent's `pot` is **not** the reference Pot (`DEMO_REFERENCE_POT`) → else `demo_forbidden`; this runs before every allowance, and the reference personas hold no key anyway (§7.2); (2) the `pot` is the session's leased Pot (or a Pot the persona created) and the persona is the actor; (3) in the **shared** Pot, `propose_close`, `propose_rules`, `set_rules` and any vote or `Finalize` on its close or rules proposals → `demo_forbidden` (review-security H-5). It builds the `CallSpec` with `@pot/sdk` `buildCall`, reads the nonce, signs with `DEMO_PERSONA_KEY` under the lease `demo_signer:{account}` (serializes nonces when several visitors share the fallback Pot), then runs §3.2 from step 4.
- **Idempotency:** `(user, idempotencyKey)` and `delegate_hash` (architecture §4.1).
- **Side effects:** one relayer tx; `relay_log`; `feed_event` rows for parsed hub events; `pot` cache updates (`pot_created`, `close_proposed`, `pot_closed`); `invite_meta` (`invite_added`, `invite_revoked`); `deposit_intent` → `ADDED`. In `after()`: notifications (§6); `sync(pot, proposal_id)` after **every** relayed DAO vote and whenever the receipt scan shows a failed payout (D-05 Rev 2, frontend A8); `retry_payout` for `payout_failed` spends after a contribution; the DAO float backstop; the relayer balance check.
- **Latency:** single hop p50 ≈ 2.5 s; `request_spend` answers early at ≈ 3 s (§3.4 two-phase) and its payout is final at ≈ 5-6 s ⚠️; `join` ≈ 4-5 s; `create_pot` ≤ 15 s p95 (P-2). After 25 s without an outcome → 202 `pending`.
- **The requester's own vote** (D-61 Rev 2): right after a vote-path `request_spend` returns its `proposalId`, the client relays `act_proposal(VoteApprove)` from the same key. This pair is normal traffic: it counts once against the `vote` family and never trips burst or abuse checks.

#### `GET /api/relay/[relayId]`
- **Auth:** `session`; only the relay's owner (else `not_found`).
- **Response:** the stored `RelayOk` or `Err`, or `RelayPending`. After an early `request_spend` response it returns that same `final: false` body until `after()` has stored the final result, then the final one. When a row has been `submitted` for more than 10 s, the handler polls `tx_status(outer_tx_hash)` for up to 20 s, then classifies and stores the result (architecture §4.1, timeout algorithm).

#### `POST /api/tx/report` (optional): a self-paid wallet tx

```ts
interface TxReportReq { txHash: string; idempotencyKey: OpKey }
interface TxReportRes extends Ok { accepted: boolean; events: PotEvent[] }
```
- **Auth:** `session:wallet`.
- **Validation:** `tx_status(txHash, sender = session account)` is final; the tx receiver is `usdc.{root}` (an `ft_transfer_call` to the hub), `pots.{root}` or a known DAO.
- **Side effects:** parses trusted events into `feed_event` (`source: report`) and runs the same notifications as a relay. No gas is spent. **Limits:** 50/user/day.

### 2.4 Faucet

#### `POST /api/faucet` (§8): demo dollars (D-11)

```ts
interface FaucetReq { amount?: MicroStr; idempotencyKey: OpKey }   // default "150000000" ($150); min "50000000" ($50, rev4); max "500000000"
interface FaucetRes extends Ok { txHash: string; amount: MicroStr; registeredNow: boolean; executedAtBlock: number }
```
- **Auth:** `session` (any kind; demo personas draw from the demo budget; rev4: not a `pending_device` session). Testnet only: `404 not_found` when `NEXT_PUBLIC_NETWORK=mainnet`.
- **Validation:** `amount` 50,000,000..500,000,000 (rev4: a $50 minimum claim, review-security L-6; a smaller shortfall gets $50). The Add sheet may call this as soon as it opens ([frontend-architecture.md](frontend-architecture.md) §5.5), so a duplicate open within the same minute reuses the earlier result for the same key.
- **Limits:** per account per UTC day: 5 claims and $500 (`faucet_usd` counter in base units); `ip:{hash}` $1,000/day; global $50,000/day prod, $5,000 preview → `quota_exceeded` with family `faucet`. Rev4: simulated 1Click deliveries count toward the same global `faucet_usd` cap (§2.7).
- **Steps:**
  1. `storage_balance_of(account)`; if null **and** we never registered this account before (`relay_log` key `register:{account}`), the relayer pays `storage_deposit` (0.00125 NEAR, `registeredNow: true`) and counts it in `global/registrations`; if we registered it before (the user `storage_unregister`ed to pocket the refund), 409 `registration_used` (rev4, review-security L-6);
  2. lease a treasury key; `usdc.ft_transfer({receiver_id: account, amount, memo: "Demo dollars (testnet)"})` with 1 yocto;
  3. wait `EXECUTED_OPTIMISTIC`; `relay_log` row (`op: faucet`, key `faucet:{user}:{idempotencyKey}`).
- **Errors:** `quota_exceeded`, `rate_limited`, `service_unavailable` (`cause: treasury` raises the `treasury_low` alert).
- **Latency:** ≈ 2.5 s, ≤ 6 s p95 (+2.5 s when registration is needed).
- The faucet never contributes for the user: a treasury `ft_transfer_call` would attribute the money to the treasury.

### 2.5 Pots: notes, nudges, feed, metadata

#### `POST /api/notes` (§8 Rev 1): off-chain text (D-07)

```ts
interface NoteReq {
  kind: 'memo' | 'decline_reason'
  pot: DaoId
  ref: string        // memo: the request_ref (OpKey) of the spend; decline_reason: the DAO proposal id as a decimal string
  text: string       // 1-140 code points after NFC + trim; no control characters; rev4: no Unicode Cf except ZWJ U+200D and VS16 U+FE0F
  idempotencyKey?: OpKey
}
interface NoteRes extends Ok { note: { kind: NoteReq['kind']; pot: DaoId; ref: string; createdAt: IsoTime } }
```
- **Auth:** `session` (rev4: not `pending_device` → `device_not_registered`), and the account must be a member of `pot` (hub `get_members` at `optimistic`, cached 10 s) → `not_a_member`.
- **Order:** the client posts a memo **before** relaying `request_spend` with the same `request_ref`, so the feed shows the text as soon as the request lands. A decline reason is posted after the `VoteReject` relay.
- **Natural key:** `(pot, kind, ref, author)`. The same text → 200 `replayed`; a different text → 409 `note_exists`.
- **Display rule** (feed, §2.5): a memo shows only if its author is the on-chain requester of that `request_ref`; a decline reason only if its author's vote on that proposal is `Reject`. Unmatched memos are deleted after 24 h by the cron.
- **Limits:** family `notes` 60/user/day. **Latency:** ≤ 400 ms. Memo text never goes on chain (the on-chain description carries only the category and the request ref, D-07).

#### `POST /api/nudges` (§8 Rev 1, Phase 2)

> Built 2026-11-03 with "Ask for a top-up", extended: `to` may list several people and `topup` names the ask. Push
> only; no email. See notes/backend.md "Ask for a top-up".

```ts
interface NudgeReq { pot: DaoId; to: AccountId; idempotencyKey: OpKey }
interface NudgeRes extends Ok { delivered: 'push' | 'email' | 'none' }
```
- **Auth:** `session` (not demo). Sender and target are both members and different.
- **Limits:** 1 nudge per (Pot, target) per rolling 24 h, whoever sends it (`nudge_too_soon`); 10 per sender per day.
- **Side effects:** a `nudge` notification (§6): push "{name} nudged you", navigate `/p/<slug>?sheet=add`; email only if the target has no live push subscription and opted in.

#### `GET /api/pots/[pot]/feed` (§8)

`[pot]` is a slug or a DAO id. Query: `before?` (cursor), `limit?` (1-100, default 50).

```ts
interface FeedRes extends Ok {
  pot: { potId: DaoId; slug: string; name: string; emoji?: string; gradient?: GradientId; isDemo: boolean }
  items: FeedApiItem[]                                            // newest first
  profiles: Record<AccountId, { name: string; tint: AvatarTint; avatarUrl?: null }>
  memos?: Record<string /* requestRef */, string>                 // members only
  declineReasons?: Record<string /* proposalId */, Record<AccountId, string>>   // members only
  nextCursor?: string
  syncedAt: IsoTime
}
interface FeedApiItem {
  key: string          // identity keys of frontend §3.6: contribution:<txHash> | request:<proposalId> | join:<account> | rules:<txHash> | closed:<dao>
  type: 'joined' | 'contribution' | 'request' | 'rule_change' | 'close_requested' | 'closed'
  actor: AccountId
  at: IsoTime          // block timestamp
  txHash?: string
  amount?: MicroStr
  proposalId?: number
  requestRef?: string
  category?: Category
  path?: 'instant' | 'vote'
  receiver?: AccountId
  payoutFailed?: boolean
}
```
- **Auth:** none or `session`. Members (and the demo persona of that Pot) also get `memos` and `declineReasons`. Everyone gets items: they mirror public on-chain data. Rev4 (review-security M-7): `profiles` (display names) go only to members and demo sessions; anonymous reads of demo Pots keep them, anonymous reads of other Pots get `profiles: {}` (architecture §2.5).
- **Source:** `feed_event` rows (written from relay outcomes, tx reports and reconciliation). Live statuses, votes and k-of-n come from the client's own chain reads; the client merges them (frontend §3.6).
- **Lazy reconcile:** rev4 (review-security L-8): only for member or demo requests, and an unknown slug is cached as not found for 60 s, so anonymous GETs can't make us spend RPC calls and `sync` txs. At most once per 10 s per Pot (lease `reconcile:{dao}`): read the DAO's `get_last_proposal_id`; for ids above `pot.last_proposal_id`, fetch `get_proposals` and the hub's `get_requests`, then insert missing `request` items (`source: reconcile`) and queue missed `approval_needed` notifications in `after()`. For open vote-path proposals that left `InProgress`, call `sync` in `after()`.
- **Cache:** `private, no-store` for members; `public, s-maxage=5, stale-while-revalidate=30` for anonymous reads of demo Pots.
- **Latency:** ≤ 400 ms; ≤ 1.5 s when the lazy reconcile runs.

#### `GET /api/pots/meta?pots=<slug|dao>,…` (Phase 2, X-05b, rev3)
- Until it lands (Nov 9), Pot cards use the on-chain `emoji` from `get_pots_of` and a gradient derived from the slug on the client.
- **Auth:** none. Up to 50 Pots per call. **Cache:** `public, s-maxage=60`.
- **Response:** `{ok, requestId, pots: Record<DaoId, {slug, name, emoji?, gradient?, isDemo}>}` for the Pots home cards.

#### `PATCH /api/pots/[pot]/meta` (optional, X-05b if time)
- `{emoji?: string /* one grapheme */, gradient?: GradientId}`; any member; 10/user/day.

### 2.6 Push subscriptions (§8)

#### `POST /api/push/subscription`

```ts
interface PushSubReq {
  subscription: { endpoint: string; expirationTime: number | null; keys: { p256dh: string; auth: string } }   // PushSubscription.toJSON()
  standalone: boolean                       // display-mode standalone when subscribing
  platform?: 'ios' | 'android' | 'desktop' | 'other'
}
interface PushSubRes extends Ok { subscriptionId: string }
```
- **Auth:** `session`, not demo (`demo_forbidden`), not `pending_device` (`device_not_registered`, rev4).
  - **R-15 option (rev3; decided at G4 on Nov 8, default on behind a flag):** with `FLAG_DEMO_PUSH=true` (testnet only, never with real users' data) a demo session in a **pool** lease may subscribe. The row stores `demo_pot_id`, so fan-out reaches only that lease's persona, and the cron deletes it when the lease is retired. Demo sessions on the shared Pot stay refused, because many visitors share its personas. This is what lets the video show P-10 on an installed iPhone without H-01.
- **Validation:**
  - `endpoint` is `https:` and its host matches the allowlist `fcm.googleapis.com`, `*.push.apple.com`, `updates.push.services.mozilla.com`, `push.services.mozilla.com`, `*.notify.windows.com`. Anything else → `args_invalid`. This is an SSRF guard: the server POSTs to this URL (architecture K-9).
  - `p256dh` is 87 base64url chars and `auth` is 22.
- **Side effects:** upsert by `endpoint`. An endpoint already stored for another user moves to this user (a shared device). At most 10 per user; the oldest is evicted.

#### `DELETE /api/push/subscription`
- `{endpoint: string}` → deletes it if it belongs to the session user. Always 200 (no enumeration).

### 2.7 1Click: any-chain deposits (§8, Phase 2, D-50)

Mode: `simulated` on testnet (labeled, "DO NOT SEND"); `real` only in the mainnet clip build (`ONECLICK_MODE=real`). Both return the same shapes ([intents-1click.md](../kb/intents-1click.md) "Testnet: simulated deposit").

```ts
type XcChain = 'base' | 'arb' | 'sol' | 'eth'
type OneClickStatus = 'PENDING_DEPOSIT' | 'KNOWN_DEPOSIT_TX' | 'PROCESSING' | 'SUCCESS' | 'INCOMPLETE_DEPOSIT' | 'REFUNDED' | 'FAILED'
type DepositStatus = OneClickStatus | 'EXPIRED' | 'ADDED' | 'STUCK'
```

#### `GET /api/oneclick/chains`
- **Response:** `{ok, requestId, mode, chains: {id: XcChain; label: string; status: 'ok' | 'paused' | 'slower'; minAmount: MicroStr; typicalSeconds: number}[]}`.
- Paused = an active Shield incident with `scopeType: "chain"` for that chain (cached 60 s, fail open, [intents-1click.md](../kb/intents-1click.md) snippet 3). Ethereum is always marked `slower` (D-50). `typicalSeconds` = measured p50: Arbitrum 18, Base 29, Solana 42, Ethereum 84.

#### `POST /api/oneclick/quote` (§8)

```ts
interface QuoteReq { pot: DaoId; chain: XcChain; amount: MicroStr; dry?: boolean; idempotencyKey: OpKey }
interface QuoteRes extends Ok {
  mode: 'real' | 'simulated'
  depositIntentId?: string                // absent when dry
  quote: { amountIn: MicroStr; minAmountIn: MicroStr; amountOut: MicroStr; minAmountOut: MicroStr
           timeEstimateSec: number; refundFee: MicroStr; withdrawFee: MicroStr }
  depositAddress?: string                 // absent when dry
  depositMemo?: string
  deadline?: IsoTime                      // request deadline = now + 2 h; the QR expires here
  qrText?: string                         // real: the plain address; simulated: "POT TESTNET DEMO - DO NOT SEND FUNDS"
  correlationId?: string
}
```
- **Auth:** `session`, and a member of `pot` (`not_a_member`).
- **Request to 1Click (real mode):** `POST /v0/quote` with `dry`, `swapType: FLEX_INPUT`, `slippageTolerance: 100`, `originAsset` = the allow-listed USDC id for `chain`, `depositType: ORIGIN_CHAIN`, `destinationAsset` = NEAR USDC, `amount`, `recipient` = the member's account, `recipientType: DESTINATION_CHAIN`, `refundTo` = the member's account, `refundType: INTENTS`, `deadline` = now + 2 h, `referral: "pot"` (D-50). `X-API-Key` only if `ONECLICK_API_KEY` is set; on a 401, alert and retry once without the key. Success is HTTP **201**. Verify with `verifyQuoteSignature` before using the quote.
- **Errors:** `chain_paused` (Shield or "Quoting for this pair is not available"), `amount_too_low` (`detail.minimum` parsed from "try at least N"), `amount_too_high` (rev4: simulated mode only, `amount` > 500,000,000 = $500), `quote_failed` (`detail.correlationId`), `quota_exceeded` (family `xc`: 20 quotes/user/day, 5 open intents/user).
- **Side effects (non-dry):** `deposit_intent` row (`PENDING_DEPOSIT`, the signed quote kept as the transaction record), `start(watchDeposit, [id])` (§5.1).
- **Latency:** p50 ≈ 0.4 s (dry quote p50 377 ms, measured), ≤ 1.5 s.

#### `GET /api/oneclick/status/[id]` (§8)

```ts
interface DepositStatusRes extends Ok {
  mode: 'real' | 'simulated'
  status: DepositStatus
  step: 1 | 2 | 3 | 4 | 5              // D-50 stepper: waiting, spotted, converting, arrived, added
  depositedAmount?: MicroStr; amountOut?: MicroStr; refundedAmount?: MicroStr
  refundReason?: string | null          // NO_LIQUIDITY | PARTIAL_DEPOSIT | AMOUNT_LESS_THAN_MIN_AMOUNT_OUT | …
  destinationTxHash?: string            // NEAR delivery tx (testnet: the simulator's real tx)
  explorerUrl?: string                  // explorer.near-intents.org/transactions/<address> (real) or nearblocks (simulated)
  deadline: IsoTime
  updatedAt: IsoTime
  processingSince?: IsoTime             // the UI shows "Taking longer" 5 min after this (D-50)
}
```
- **Auth:** the owner only (`not_found` otherwise). If the row was polled more than 5 s ago and isn't terminal, fetch live (`GET /v0/status?depositAddress=`, or the simulator profile), update the row, then answer.
- **Latency:** ≤ 300 ms from the DB, ≤ 1.3 s with a live fetch.

#### `POST /api/oneclick/simulate` (§8, testnet only)

```ts
interface SimulateReq {
  depositIntentId: string
  scenario?: 'ok' | 'partial' | 'no_liquidity' | 'failed' | 'slow' | 'expired'   // default 'ok'
  amount?: MicroStr                     // what "arrives"; default = the quote amount
  idempotencyKey: OpKey
}
interface SimulateRes extends Ok { startedAt: IsoTime; profile: { pendingSec: number; processingSec: number } }
```
- **Auth:** the owner; `mode` must be `simulated` (else `demo_forbidden`).
- **Caps (rev4, review-security H-3):** `amount` ≤ min(the quote amount, 500,000,000) → else 422 `amount_too_high`. Simulated deliveries per session subject (`user:{id}`, or `visitor:{hash}` for demo sessions) per UTC day ≤ $500 (`xc_sim_usd`); **demo sessions ≤ $150**, so a judge can run the stepper once with a $150 share. Every delivery also counts toward the global `faucet_usd` cap ($50,000 prod, $5,000 preview), which is the treasury's daily outflow limit. Over a cap → 429 `quota_exceeded`, family `xc`. Before this, one anonymous demo visitor could move the whole $1M hot treasury.
- **Profiles** (measured totals ± 20 % jitter, [intents-1click.md](../kb/intents-1click.md)): Arbitrum 6 s pending + 12 s processing; Base 17 + 12; Solana 30 + 12; Ethereum 72 + 12. `slow` keeps PROCESSING for 6 min; `partial` delivers 120 of 150 → `INCOMPLETE_DEPOSIT`, then `REFUNDED` (`PARTIAL_DEPOSIT`) 60 s after a shortened deadline; `failed` → FAILED after 30 s with `refundedAmount 0`.
- At `SUCCESS` the workflow sends real "USDC (test)" from the treasury to the member (plus `storage_deposit` if unregistered, mirroring 1Click) and stores that tx hash.

### 2.8 Demo (§8, D-33)

#### `POST /api/demo/session` (§8)
- **Request:** JSON `{persona?: Persona, reset?: boolean}`, or an HTML form (`application/x-www-form-urlencoded`: `persona=maya`, `reset=1`) from `/demo`.
- **Response:**
  - `Accept: text/html` (form post) → **303** `Location: /p/<slug>`;
  - JSON → `{ok, requestId, session: SessionInfo, lease: {potId, slug, expiresAt, shared: boolean}}`.
- **Auth:** none. Same-origin or direct navigation only: reject when `Sec-Fetch-Site` is `cross-site`, or when an `Origin` header is present and foreign (login-CSRF guard).
- **Bot check (rev4, review-security H-5):** when the request would take a **new** lease (no active lease for this visitor, or `reset`), the route runs BotID `checkBotId()` first. The `/demo` page submits its persona forms with `fetch` when JavaScript runs, so BotID's client signal is attached (⚠️ verify on Nov 6 that BotID covers this call). A request without it (a plain no-JS form post, curl) gets no lease: an HTML form → **303** to `/demo?ro=1`, which shows the read-only snapshot and the JSON twins (§7.1); JSON → 403 `bot_detected`. A persona switch inside an existing lease skips the check. Preview accepts the CI bypass header (`x-pot-ci-bypass`); production accepts only the nightly job's separate bypass secret (architecture §4.5).
- **Steps:**
  1. Read the `pot_demo_visitor` cookie (create one if missing: `v1.<random>.<hmac>`, 7 days).
  2. `reset` → mark the visitor's current lease `retired`.
  3. Reuse the visitor's active lease, or lease a `ready` pool Pot (§7.3). With an empty pool, use the shared Pot (`shared: true`). Rev4: if the shared Pot's balance is below $300 or it isn't Open, start a fresh `seedDemoPot` (kind `shared`) and switch the `demo_pot` pointer once it is ready; until then the current one keeps serving.
  4. Create a `session` of kind `demo` for `persona` (default `maya`) of that Pot; the lease lasts 2 h, extended on activity up to 8 h.
  5. Set `__Host-pot_session`, `pot_hint` (with `persona` and `leasedPot`) and the visitor cookie.
  6. If fewer than 3 Pots are `ready`, `start(refillDemoPool)`.
- **Limits (rev4):** new leases per `ipnet:{hash}` 10/day, where the net is the IPv4 address or the IPv6 **/64** prefix (IPv6 rotation inside one /64 no longer gets fresh leases); 10 resets per visitor per day; demo budget (§3.5). Over a limit → 429 `quota_exceeded` (family `lease`); a form post gets 303 to `/demo?ro=1` instead.
- A real (non-demo) session in the same browser is replaced; the `/demo` page warns first when `pot_hint.kind` isn't `demo`.

#### `GET /api/demo/state`: the JSON twin for judges

```ts
interface DemoStateRes extends Ok {
  network: 'testnet'; hubId: AccountId; usdcId: AccountId
  reference: DemoPotPublic                // permanent, never leased (architecture K-7); stable ids for the README
  shared?: DemoPotPublic                  // tonight's shared fallback Pot
  pool: { ready: number; leased: number; target: number }
  commands: { getPolicy: string; getPot: string; listKeys: string }   // ready-to-run near-cli-rs 0.30.1 view commands
}
interface DemoPotPublic {
  potId: DaoId; slug: string; name: string; balance: MicroStr
  members: { account: AccountId; name: string; contributed: MicroStr }[]
  requests: { proposalId: number; requester: AccountId; amount: MicroStr; category: Category; status: string }[]
  explorerUrl: string                     // https://testnet.nearblocks.io/address/<dao>
}
```
- **Auth:** none. **Cache:** `public, s-maxage=5`. **CORS:** `Access-Control-Allow-Origin: *`.

### 2.9 Telegram (§8, Phase 2, first to cut, D-51)

#### `POST /api/telegram/webhook` (§8)
- **Auth:** `telegram`. grammY 1.46.0 `webhookCallback(bot, "std/http", {secretToken})` ([notifications.md](../kb/notifications.md) N4).
- **Handles:** `/start <token>` in a DM (links `telegram_user`) or in a group (links `telegram_chat` to the token's Pot); `/newpot` (replies with a `url` button to `/pots?sheet=create`); `my_chat_member` (sets `telegram_chat.active`); `migrate_to_chat_id`.
- **Rules:** dedupe on `update_id`; always answer 200 within 10 s; never add a Mini App surface.

#### `POST /api/telegram/link`
- `{kind: 'group', pot: DaoId} | {kind: 'user'}` → `{ok, requestId, url /* t.me/<bot>?startgroup=<token> or ?start=<token> */, expiresAt}`.
- The token is single-use, 15 min, 32 base64url chars; only its sha256 is stored. A group link requires membership of `pot`.

### 2.10 Operations

#### `GET /api/health`
- **Auth:** none. **Cache:** `public, s-maxage=15`.
- **Response:** `{ok, requestId, network, version, relayer: 'ok' | 'low' | 'critical', rpc: 'ok' | 'degraded' | 'down', db: 'ok' | 'down', features: {nearAuth: boolean, oneClick: 'off' | 'simulated' | 'real', push: boolean, email: boolean, telegram: boolean}}`.
- The client shows `relayer.down.banner` when `relayer` is `critical` or `rpc` is `down`.

#### `GET /api/cron/reconcile`
- **Auth:** `cron`. Vercel cron, production only: `0 4 * * *` on Hobby, `*/1 * * * *` on Pro ([backend-infra.md](../kb/backend-infra.md) snippet 1). The steps are in §5.3.

## 3. Relayer policy (D-24)

### 3.1 Policy table

Applies to every delegate that reaches `/api/relay` (and to R12 via the device routes). `{HUB}` = `pots.{root}`, `{USDC}` = `usdc.{root}`. A Pot is "known" when its DAO id is in the `pot` table or `hub.get_pot` returns it (then it is cached). Gas is per action, in Tgas. Quotas are per user per UTC day unless marked "/Pot". Default gas = what the client sends ([frontend-architecture.md](frontend-architecture.md) §1.4).

| Rule | Receiver | Methods | Argument constraints | Deposit | Gas min-max | Quota | Default gas |
|---|---|---|---|---|---|---|---|
| R1 | `{USDC}` | `ft_transfer_call` | `receiver_id == {HUB}`; `amount` 1..10,000,000,000 ($10,000); `msg` parses to exactly `{"pot": <known, open DaoId>}`; `memo` absent | **exactly 1 yocto** | 100-150 (D-06: below 35 the money silently bounces) | contribute 20; 200/Pot | 100 |
| R2 | `{HUB}` | `create_pot` | `slug` `^[a-z0-9]+(-[a-z0-9]+)*$`, 2-32 chars, not in the reserved list of [contracts-spec.md](contracts-spec.md) §3.2, `{slug}.{HUB}` doesn't exist (`slug_taken`); `name` 2-40 code points after trim, no control characters (the UI rule `create.error.name`; the hub allows up to 48); `preset` ∈ `trip`, `club`, `team`, `custom`, and `custom` needs non-null `rules` (rev3; the MVP UI only sends `trip`); `rules` null or within the bounds below; `invite_pk` optional ed25519; `emoji` optional (1-16 bytes, no ASCII letters, digits or control chars); `float` optional (the hub clamps it; demo seeding passes `min_dao_float`) | 0 | 150-300 | create 3 (+3 per verified email; 20/day global) | 300 |
| R3 | `{HUB}` | `request_spend` | `pot` known and open; `amount` 1..10,000,000,000; `receiver_id` valid account id; `category` ∈ Category; `request_ref` is an OpKey (and equals the body's `requestRef`) | 0 | 100-150 | spend 30; 100/Pot | 150 |
| R4 | `{HUB}` | `join` | `pot` known and open; `invite_pk` = `"ed25519:"` + base58; `signature` = standard base64 with padding of 64 bytes (88 chars) over `pot-join:v1:<dao_id>:<joiner>` ([contracts-spec.md](contracts-spec.md) §3.7) | 0 | 100-150 | join 10 | 100 |
| R5 | `{HUB}` | `add_invite`, `revoke_invite`; or the pair `[revoke_invite, add_invite]` on the same `pot` (rotate) | `pot` known; `invite_pk` ed25519; rev4: `expires_at_ms` null (the hub applies 7 days) or in (now, now + 30 days]; `max_uses` null (the hub applies 10) or 1..40 (review-security H-1) | 0 | 10-50 each; ≤ 100 total | invite 20 | 30 each |
| R6 | `{HUB}` | `set_rules` | `pot` known and open; rules bounds; the hub checks "sole member" | 0 | 10-50 | rules 10 | 30 |
| R7 | `{HUB}` | `propose_rules` (D-07b) | as R6 | 0 | 80-150 | rules 10 | 100 |
| R8 | `{HUB}` | `propose_close` | `pot` known and open | 0 | 150-300 | close 3; 3/Pot | 150 |
| R9 | `{HUB}` | `retry_payout`, `sync` (both callable by anyone, D-05 Rev 2) | `pot` known; `proposal_id` ≤ the DAO's last id; rev4: `retry_payout` shares R11's ≤ 3 per proposal per UTC day | 0 | `retry_payout` 80-150; `sync` 50-150 | maintenance 20 | 100 / 50 |
| R10 | `{HUB}` | `withdraw_request`: **Phase 3, not built** (rev5, D-07). The relayer refuses it with `method_not_allowed`; the number stays reserved | — | — | — | — | — |
| R11 | a known DAO (`*.{HUB}`) | `act_proposal` | `action` ∈ `VoteApprove`, `VoteReject`, `Finalize`; `id` u64; `proposal` present and deep-equal to `get_proposal(id).kind` (D-05); `memo` **absent** (it would be logged publicly); rev4 (review-security H-2): `id` is **hub-tracked and live**: `hub.get_proposal_subject(pot, id)` is non-null with `live: true` (cached 60 s, read at `optimistic` on a miss), else 403 `proposal_not_tracked`; the sender is an Active member of that Pot (`hub.get_members`, cached 10 s), else 403 `not_a_member`; for a close's deciding vote or a `Finalize`, the relayer first registers any unregistered payee (registration-only `storage_deposit`, M-5) | 0 | rev4: **exactly 100** for `Transfer` and `AddMemberToRole` kinds; **exactly 300** for `FunctionCall` kinds (close, rules; D-09 Rev 2: up to 40 payouts), every action | vote 100; 500/Pot; rev4: `Finalize` ≤ 3 per proposal per UTC day (`proposal:{dao}:{id}` / `finalize`, shared with `retry_payout`) | 100 (Transfer, join), 300 (close, rules) |
| R12 | the sender's own account | `AddKey(pk, FullAccess)`, the only action | only through `/api/devices` (signer = the user's MPC key, `pk` = the PoP'd device key) or `/api/devices/pair/[id]/complete` (signer = an active device key, `pk` = the pairing key); at most 6 device keys per account (zero-balance limit: 770 B ≈ 8 full-access keys, [accounts-onboarding.md](../kb/accounts-onboarding.md)) | n/a | n/a | devices 5, pairing 3 | — |
| — | anything else | — | — | — | — | — | `receiver_not_allowed` |

General rules:
- Exactly one action per delegate, always a `FunctionCall`, except R5's rotate pair and R12. `DelegateV2` and nested delegates are rejected by borsh decoding ([meta-tx-relayer.md](../kb/meta-tx-relayer.md)).
- **Never relay a deposit to the hub** (rev4). Since the hub sponsors only calls whose signer is in `config.relayers` (contracts-spec §3.0), relayed hub calls carry 0; a delegate that attaches anything to a hub method → `deposit_cap`. Relayer quotas protect relayer NEAR; the hub protects its own NEAR on chain (contracts-spec INV-18).
- **Member-created DAO proposals** are never relayed: not their creation (D-07b) and, since rev4, not votes or `Finalize` on them (R11). Members with a wallet can still vote on them with their own gas; the app shows them read-only (frontend-architecture §5.4).
- Args must be UTF-8 JSON objects, ≤ 2 KB per action. Unknown fields → `args_invalid` (contracts reject them anyway).
- **Rules bounds** (R2, R6, R7; the `Rules` fields of [contracts-spec.md](contracts-spec.md) §3.8): `instant_cap` 0..1,000,000,000 ($1,000); `member_budget` 0..100,000,000,000; `instant_payees` ∈ the contract's enum; `payee_allowlist` ≤ 10 accounts (the hub's `MAX_ALLOWLIST`, rev3; was 20), empty when `instant_payees` is `members`; serialized rules ≤ 1 KB. The hub's `validate_rules` is the real check.
- **R11 pre-flight** (one `get_proposal` view, ≈ 60 ms, plus the cached `get_proposal_subject` and `get_members` reads of rev4; saves 0.0003 NEAR per avoidable failure):
  - the proposal must exist (`not_found`);
  - rev4: hub-tracked and live, and the sender a member (see R11);
  - `VoteApprove`/`VoteReject`: status `InProgress` and `now ≤ submission_time + proposal_period`, else `proposal_not_open` with `detail.status` and `detail.expired`; `votes[sender]` absent, else `already_voted`;
  - `Finalize`: status `Failed`, or `InProgress` past expiry; else `proposal_not_open`.

### 3.2 Validation order

Cheapest and stateless first; no write happens before step 10, and nothing is signed before step 12.

1. **Envelope:** JSON ≤ 16 KB, zod schema, `Origin`. → `bad_request`, `forbidden_origin`
2. **Session:** cookie → session row (kind, user, device). → `not_signed_in`; demo/signed body mismatch → `demo_forbidden`
3. **Idempotency:** `relay_log` by `(user_id, idempotency_key)`. Found → return the stored response (or `RelayPending`); a different body hash → `idempotency_conflict`.
4. **Decode:** base64 → `deserialize(SCHEMA.SignedDelegate)` (borsh 2.0.0); re-encode must be byte-identical (rejects non-canonical encodings); compute `delegate_hash`. → `bad_request`
5. **Identity:** `delegate.sender_id == session.accountId` → `sender_mismatch`.
6. **Static policy** (§3.1, no I/O): action types and count, receiver, method, exact deposit, gas range, args. → `action_not_allowed`, `receiver_not_allowed`, `method_not_allowed`, `deposit_cap`, `gas_cap`, `args_invalid`. The `intent` field must match the decoded method (`args_invalid`).
7. **Key binding:** for `near-auth` and `dev` sessions, `delegate.public_key == session.device.public_key` (status `active`) → `key_not_allowed`. Wallet sessions: any key (checked in step 9). Demo: the server signed it.
8. **Signature:** `ed25519.verify(sig, sha256(NEP-461 prefix ‖ borsh(DelegateAction)), public_key)` → `bad_signature`.
9. **Dedupe by bytes:** `delegate_hash` already in `relay_log` → return that row's response.
10. **Chain reads** (FastNEAR → dRPC, in parallel):
    - `block(final)` → head: require `head + 10 < max_block_height ≤ head + 600` → `expired` / `ttl_too_long`;
    - `view_access_key(sender, public_key)` at `optimistic` → `key_not_found`; for a function-call key: one action, 0 deposit, matching receiver and method → `fc_key_deposit` / `key_not_allowed`;
    - `delegate.nonce > access_key.nonce` → `nonce_used`; `delegate.nonce < head × 10⁶` → `bad_request`; `delegate.nonce >` the highest nonce among this key's in-flight `relay_log` rows → `nonce_pending`;
    - context: Pot known and open (cache or `hub.get_pot`) → `pot_unknown`, `pot_closed`; for R11, the pre-flight view plus (rev4) `get_proposal_subject` and membership → `proposal_not_tracked`, `not_a_member`.
11. **Sponsor health:** the cached relayer balance (≤ 30 s old) is above the floor for this op (§3.5) → `service_unavailable` with `cause: sponsor_low`.
12. **Quotas** (one DB transaction, all or nothing): burst `user:{id}` 20/min, family per day, per Pot per day, `global` count, `global` yocto pre-charge (§3.5); rev4: the per-user daily budgets `user:{id}`/`relay_yocto` and `user:{id}`/`hub_yocto`, the global `hub_yocto`, and `Finalize` per proposal. → `rate_limited`, `quota_exceeded` (family `budget` for the per-user NEAR budgets), `service_unavailable` with `cause: global_cap`; more than 10 on-chain rejections today → `user_suspended`.
13. **Record:** insert `relay_log` (status `validated`). A unique violation means a concurrent duplicate: poll that row for up to 10 s and return its result.
14. **Lease** a relayer key (§3.3) → `service_unavailable` with `cause: relayer_busy`.
15. **Sign** the outer tx `{signer: users.{root}, receiver: sender_id, actions: [SignedDelegate]}`; store `outer_tx_hash`, status `signed`; broadcast and wait `EXECUTED_OPTIMISTIC` (25 s budget, then the timeout algorithm of architecture §4.1). For `request_spend`, race this wait with the early-response probe (§3.4).
16. **Classify** (§3.4); update `relay_log`; adjust the yocto quota to the actual cost; insert `feed_event` rows; release the lease; respond.
17. **`after()`:** for the early `request_spend` response, keep waiting for the full tree and store the final result; notifications; `sync` after every relayed DAO vote and after a failed payout (D-05 Rev 2); `retry_payout`; DAO float backstop; relayer balance check.

### 3.3 Key pool

| Item | Design |
|---|---|
| Keys | N full-access keys on `users.{root}` (prod N = 8, preview N = 4), added once by the deploy script in one tx (4 keys ≈ 0.0004 NEAR, [meta-tx-relayer.md](../kb/meta-tx-relayer.md)). Secrets in `RELAYER_KEYS`. Full access is required: the outer tx carries a `Delegate` action, `CreateAccount` needs the parent, and `fast-auth.testnet.sign` attaches a deposit |
| Leases | one row per key in `lease` (`relayer_key:0` … `relayer_key:7`, `meta.publicKey`). A request leases one key for the whole tx (sign → outcome), 30 s TTL (60 s for MPC). Claim SQL in [data-model.md](data-model.md) §3.2 (`FOR UPDATE SKIP LOCKED`, random order). No free key within 3 s (poll every 150 ms) → 503 `relayer_busy` |
| Nonces | after leasing, read `view_access_key(users.{root}, pk)` at `optimistic` and use `nonce + 1`. On `InvalidNonce`, re-read and retry once. Because one key serves one tx at a time, no nonce is ever shared across instances; this replaces near-api-js's in-process `NonceManager`, which can't coordinate separate Fluid instances (7.6 s vs 2.6 s, [meta-tx RESULTS](../spikes/meta-tx/RESULTS.md) 3d) |
| Throughput | ≈ N / 3 s ≈ 2.5 tx/s with 8 keys holding each lease ≈ 3 s. Upgrade path if needed: release the lease right after broadcast and keep `last_nonce` in the lease row |
| Prepay float | receipt gas is bought at 10× the gas price, so each in-flight 300 Tgas tx locks ≈ 0.3 NEAR until refunds land after FINAL ([meta-tx-relayer.md](../kb/meta-tx-relayer.md) gotcha 8). Counted in the balance floor (§3.5) |
| Other signers | `treasury_key:0..2` (`TREASURY_KEYS`, faucet and simulator delivery); `demo_signer:{account}` serializes delegates signed with `DEMO_PERSONA_KEY`; `mpc_slot:0..1` limits concurrent MPC signs |
| What the pool signs | relayed delegates; account creation and USDC registration; `fast-auth.testnet.sign`; DAO float top-ups (`Transfer`); `sync` and `retry_payout` calls |

### 3.4 Receipt scanning and outcome mapping

```ts
// lib/server/relay/classify.ts (sketch)
function classify(o: FinalExecutionOutcome, call: DecodedCall): Classified {
  // 1. Delegate-level failure: the top-level status shows it; nothing inside ran.
  if ('Failure' in o.status) return delegateFailure(o.status.Failure)        // → 409 expired | nonce_used, 403 key_not_found ... (+ txHash)
  // 2. Trusted events only: EVENT_JSON logs from receipts executed by the hub ("pot") or the token ("nep141").
  const events = o.receipts_outcome.flatMap(r =>
    r.outcome.logs.filter(l => l.startsWith('EVENT_JSON:'))
      .map(l => ({ ...JSON.parse(l.slice(11)), executor: r.outcome.executor_id, receiptId: r.id }))
      .filter(e => (e.executor === HUB && e.standard === 'pot') || (e.executor === USDC && e.standard === 'nep141')))
  // 3. The first failed receipt, if any (the top-level SuccessValue("") hides it).
  const failed = o.receipts_outcome.find(r => 'Failure' in r.outcome.status)
  // 4. Method-specific interpretation (table below); executedAtBlock = max block height of all receipts.
  return interpret(call, events, failed, o)
}
```

**Final value of a hub call.** The relayed tx's top-level status is the delegate's `SuccessValue("")`, so the hub's return value must be found in the tree: start at the receipt in which the hub executes the delegated method, and while its status is `SuccessReceiptId(id)`, follow `id`. The first `SuccessValue` reached is the chain's final value (`SpendOutcome`, `JoinOutcome`, `CreatePotOutcome`, `RulesOutcome`, [contracts-spec.md](contracts-spec.md) §3).

**Two-phase response for `request_spend`** (D-07 Rev 2). While `send_tx` waits for `EXECUTED_OPTIMISTIC`, the handler polls the hub's `get_requests(pot, newest page)` at `optimistic` finality every 500 ms for this `request_ref`:
- As soon as the record carries a `proposal_id` (status `approving`, `approved` or `pending`; block B4 ≈ 3 s in contracts-spec §3.4), it answers 200 with `final: false`, `result: {type: spend, path, proposalId, payout: "pending"}` and stores that response.
- `after()` keeps waiting for the full tree, classifies it with the table below, stores the final `RelayOk` (`final: true`) in `relay_log`, and calls `sync` if the payout failed. `GET /api/relay/[relayId]` returns it; the client polls that route every 1 s for up to 15 s to show "Sent" or the payout-failed state.
- If the full tree finishes first (a refusal at the pre-check, or a fast chain), the one response is already `final: true`.

| Call | Success when | Result | Otherwise |
|---|---|---|---|
| `ft_transfer_call` | a `contribution` event for (pot, sender, amount) **and** the token chain's final value (the `ft_resolve_transfer` return, found with the same algorithm starting at the `{USDC}` receipt) is `used == amount` | `{type: contribution, recorded: true}` | `used == "0"` → `inner_failed`, `errorCode: CONTRIBUTION_REFUNDED` (or the hub's ERR code); the money is back in the member's account (D-06) |
| `request_spend` | the final value is a `SpendOutcome` with `status` ≠ `refused` | `{type: spend, requestId, path, proposalId, approvalsNeeded}`. `payout`: `sent` when the `{USDC}` `ft_transfer` receipt whose predecessor is the DAO succeeded; `failed` when it failed (then `after()` calls `sync`); `pending` in the early response | `status: refused` → `inner_failed`, `errorCode: REFUSED_<REFUSAL>`; hub panic → `inner_failed` with the ERR code |
| `act_proposal` | no failed DAO receipt | `{type: vote, proposalStatus}` from `get_proposal(id)` read right after; `payout` from the `{USDC}` receipts whose predecessor is the DAO. Always followed by `sync` in `after()` (D-05 Rev 2) | `inner_failed` with `ERR_ALREADY_VOTED`, `ERR_PROPOSAL_NOT_READY_FOR_VOTE`, … |
| `join` | final value `{ok: true, status}` | `{type: join, status: active}` with `member_joined`; `status: pending` when the group must still approve (`sync` activates it later) | `{ok: false}` → `inner_failed`, `JOIN_FAILED`; a panic → the invite ERR code |
| `create_pot` | final value `CreatePotOutcome {ok: true}` and `pot_created` | `{type: create_pot, potId, slug}` | `{ok: false, reason: dao_create_failed}` → `inner_failed`, `DAO_CREATE_FAILED` (the float went back to the hub); a panic → its ERR code |
| `set_rules` / `propose_rules` | `rules_changed` (applied), or `rules_change_proposed` with a proposal id | `{type: rules, applied, proposalId?}` | `inner_failed` |
| `propose_close` | `close_proposed` event | `{type: close, proposalId}` | `inner_failed` |
| `add_invite` / `revoke_invite` | `invite_added` / `invite_revoked` events | `{type: invite}` | `inner_failed` |
| `retry_payout`, `sync` | no failed receipt | `{type: maintenance}` with the final value's statuses | `inner_failed` |
| `withdraw_request` (Phase 3, not built, rev5) | final value `{withdrawn: true}` and `spend_withdrawn` | `{type: withdraw}` | `{withdrawn: false, reason}` → `inner_failed`, `WITHDRAW_FAILED` (`already_decided`, `has_votes`, `remove_failed`) |
| `AddKey` (R12) | no failed receipt | device active | `inner_failed` → 502 `account_setup_failed` (device routes) |

Delegate-level failures map to: `DelegateActionExpired` → `expired`; `DelegateActionInvalidNonce` → `nonce_used`; `DelegateActionAccessKeyError(AccessKeyNotFound)` and `AccountDoesNotExist` → `key_not_found`; `…(DepositWithFunctionCall)` → `fc_key_deposit`; `DelegateActionInvalidSignature` → `bad_signature`; anything else → `internal`. Each one costs ≈ 0.000082 NEAR and counts toward `user_suspended`.

`executedAtBlock`: collect the distinct `block_hash` values of `transaction_outcome` and `receipts_outcome`, resolve heights with parallel `block` calls (cached by hash), take the maximum. If a lookup fails, use the optimistic head read just after the outcome (an upper bound).

### 3.5 Global caps, budgets and balance alerts

**Daily caps** (UTC; env-overridable via `QUOTA_*`):

| Counter (`subject`, `action`) | Prod | Preview | Hit → |
|---|---|---|---|
| `global`, `relay_yocto`: gas + deposits paid by `users.{root}` (pre-charged by estimate, then corrected to actual) | 5 NEAR | 1 NEAR | 503 `global_cap`, alert |
| `user:{id}`, `relay_yocto` (rev4, review-security H-2): the same, per user | 0.2 NEAR | 0.1 NEAR | 429 `quota_exceeded` (family `budget`); trips long before the global cap |
| `global`, `hub_yocto` (rev4, C-1): the **hub's** estimated sponsored spend for relayed ops (estimates below; the hub's own on-chain caps are the real bound) | 5 NEAR | 1 NEAR | 503 `global_cap`, alert |
| `user:{id}`, `hub_yocto` (rev4) | 0.3 NEAR (3 Pot creations + normal use) | 0.15 NEAR | 429 `quota_exceeded` (family `budget`) |
| `global`, `topup_yocto`: DAO float top-ups (rev4: demo and reference Pots only, ≤ 2 per DAO lifetime) | 2 NEAR | 0.5 NEAR | top-ups pause, alert |
| `global`, `demo_yocto`: demo seeding and persona relays, **incl. the hub's float and prepay estimates** (rev4, H-5) | 3 NEAR | 1 NEAR | pool refill pauses; leases fall back to the shared Pot |
| `global`, `accounts_created` | 300 | 50 | `quota_exceeded` (family `accounts`) |
| `global`, `registrations` (rev4, L-6): USDC registrations the relayer pays (wallet users, faucet) | 200 | 50 | `quota_exceeded` (family `accounts`) |
| `global`, `dev_accounts` (rev3) | — (the route is off) | 20 | `quota_exceeded` (family `accounts`) |
| `global`, `pots_created` | 20 | 10 | `quota_exceeded` (family `create`) |
| `global`, `mpc_signs` | 100 | 20 | `quota_exceeded` (family `devices`) |
| `global`, `faucet_usd` | $50,000 | $5,000 | `quota_exceeded` (family `faucet`) |
| `global`, `relays` | 20,000 | 2,000 | 503 `global_cap` |

Pre-charge estimates (yocto, corrected after the outcome): `ft_transfer_call` 0.0012 NEAR · `request_spend` 0.003 · `act_proposal` 0.001 on a Transfer, **0.03 on a `FunctionCall` kind and for every `Finalize`** (rev4: up to 300 Tgas can burn) + the follow-up `sync` 0.0006 · `join` 0.0025 · `create_pot` 0.005 · hub maintenance and invites 0.002 · account creation 0.0075 + registration 0.00145 · MPC sign 0.005 (the 1-yocto deposit is refunded) · rejected delegate 0.000082. The actual cost = Σ `tokens_burnt` + deposits not refunded (the 1 yocto, storage deposits).

`hub_yocto` estimates per relayed op (rev4; contracts-spec §8.4, float 0.05): `create_pot` 0.061 · `join` 0.009 · `request_spend` 0.0085 instant, 0.011 vote · `add_invite` 0.0015 · `propose_rules` 0.01 · `propose_close` 0.008 + 0.0025·n. Demo relays count against `visitor:{hash}` and `ipnet:{hash}` quotas and draw from `demo_yocto` only, never from `relay_yocto` or `hub_yocto`, so abuse elsewhere can't block judges (and the reverse).

**Balance thresholds**, checked in `after()` at most once a minute per instance, plus by the cron:

| Account | Measure | Warn (`alert_state` key) | Critical → behaviour |
|---|---|---|---|
| `users.{root}` | available = balance − storage | **5 NEAR** (`relayer_low` = critical + 3 NEAR; a human tops up to 15 NEAR, the hot cap in [accounts-and-deploy.md](accounts-and-deploy.md) §1.5 and §2.4). Rev 4: the MPC `sign` deposit is 1 yocto (D-21), so no MPC reserve is added any more (Rev 3 had 9 NEAR with a 4 NEAR reserve) | **critical** = 2 NEAR → `relayer_critical`: refuse `create_pot`, faucet registrations, demo seeding and MPC signs (503 `sponsor_low`); keep contributions, spends and votes. < 1 NEAR → refuse everything. So warn/critical = 5/2 NEAR |
| `pots.{root}` (hub) | available | < 5 NEAR (`hub_low`, [contracts-spec.md](contracts-spec.md) §3.11); rev4: also `hub_budget` when `global/hub_yocto` passes 80 % | the hub itself panics `ERR_HUB_LOW_BALANCE` below its reserve; the relayer pre-refuses `create_pot` below 1 NEAR |
| `treasury.{root}` (hot) | `ft_balance_of` | < $100,000 (`treasury_low`; a human refills it from the cold `reserve.{root}`) | < $1,000 → faucet and simulator off |
| each DAO | `get_available_amount()` | backstop only, since every hub-created proposal prepays its storage (D-05 Rev 2): below 0.02 NEAR → send 0.05 NEAR from the relayer, at most once an hour per DAO (lease `topup:{dao}`). Rev4 (review-security M-4): **demo and reference Pots only**, at most 2 top-ups per DAO lifetime; user Pots are never refilled (a majority could withdraw the float and get it refilled forever) | — |

Alerts go to `ALERT_WEBHOOK_URL`, deduped to at most one per hour per key (architecture §4.4).

## 4. Sessions

### 4.1 Cookies

| Cookie | Value | Attributes | Purpose |
|---|---|---|---|
| `__Host-pot_session` (`pot_session` on `http://localhost:3000`, where `Secure` and `__Host-` aren't usable) | base64url of 32 random bytes. The DB stores only `sha256(value)` as `session.id_hash` | `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000` | authorizes every API call |
| `pot_hint` | base64url(JSON `SessionHint`), ≤ 1 KB: `{accountId, kind, displayName, emailHint?, persona?, leasedPot?, devicePublicKey?}` | `Secure; SameSite=Lax; Path=/; Max-Age=2592000`, **readable by JS** | lets app shells stay static ([frontend-architecture.md](frontend-architecture.md) §2.1). Display and routing only: the server never reads it for authorization. Contains no secrets |
| `pot_demo_visitor` | `v1.<16 random bytes b64url>.<HMAC(APP_HMAC_SECRET)>` | `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800` | keeps a judge's demo lease across persona switches |

Login cookies survive an iOS Home Screen install (iOS 17.2+ copies them; IndexedDB isn't copied, [pwa-push.md](../kb/pwa-push.md)), which is why the session is a persistent cookie and not storage.

### 4.2 Lifetime, binding, logout and proofs

A `dev` session (preview only, rev3) behaves like `near-auth` in this table (device re-login included), except that it is created by `POST /api/session/dev` and can't move to a new device (no MPC key).

| | near-auth | wallet | demo |
|---|---|---|---|
| Created by | `POST /api/session` or `POST /api/session/device` | `POST /api/session/wallet` | `POST /api/demo/session` |
| Lifetime | 30 days absolute, 14 days idle (`last_seen_at` bumped at most every 15 min) | same | the lease: 2 h, extended on activity up to 8 h |
| Bound to | one `device` row (`session.device_id`); `/api/relay` requires the delegate's key to be that device's key (`key_not_allowed`) | the account; the chain checks the key | a persona of one leased Pot |
| Rebind | `POST /api/devices` or pairing → the session moves to the new device | — | persona switch = a new session row |
| Logout | `DELETE /api/session` (§2.1): revoke the row, clear cookies, optionally drop the push endpoint and revoke the device | same | same; the lease is kept until it expires or a reset |

**Proof-of-possession** (`pop`) for device keys:
- The message is UTF-8 text with `|` separators. It is signed with Ed25519 **directly over those bytes** (WebCrypto `sign('Ed25519', key, bytes)`; the fallback uses `@noble/curves`). `sig` is base64url without padding; `ts` is Unix ms.

| Purpose | Message |
|---|---|
| session (NEAR Auth login) | `pot-session-v1\|{b64url(sha256(idToken))}\|{ts}` (matches [frontend-architecture.md](frontend-architecture.md) §4.3) |
| device re-login | `pot-device-login-v1\|{accountId}\|{ts}` |
| adding a device via NEAR Auth | `pot-device-add-v1\|{accountId}\|{ts}` |
| pairing start | `pot-device-pair-v1\|{accountId}\|{ts}` |
| dev session (preview only, rev3) | `pot-dev-session-v1\|{devicePublicKey}\|{ts}` |

- The server accepts `|now − ts| ≤ 120 s` and inserts `used_proof(hash = sha256(purpose ‖ publicKey ‖ ts))`. A duplicate → `device_proof_invalid`. Safari's Ed25519 signatures are randomized, so the replay key is never the signature itself.

### 4.3 Auth0 token verification

**ID token** (`POST /api/session`), with `jose` `createRemoteJWKSet` + `jwtVerify` (⚠️ pin the version on Nov 1):

| Check | Value (testnet) |
|---|---|
| JWKS | `https://login.testnet.fast-auth.com/.well-known/jwks.json` (RS256 keys `LNPfzjbR4nX1k3LLOiCkm`, `UCoJR8zvMKACwbQxLOlro` today; let jose cache and refresh them) |
| `alg` | `RS256` only |
| `iss` | `https://login.testnet.fast-auth.com/` (with the trailing slash) |
| `aud` | `NEAR_AUTH_CLIENT_ID`. Rev4 (review-security M-1): production accepts **only a Pot-dedicated client id** (H-01's preferred outcome). If H-01 ends with our origin whitelisted on the shared client `np8paqIpMWmNbzT4xAvOOapZBjsOpptl`, production may accept it only once the nonce binding (B-20) is live, and the residual (another origin on that client can mint tokens for our challenge) is accepted for testnet only (risk-register R-36). Localhost uses the shared client |
| `azp` | if present, equals the same client id |
| `nonce` | rev4 (B-20): `base64url(sha256(rawPk(devicePublicKey) ‖ rawBytes(challenge)))` for a challenge from `GET /api/session/challenge` that is ≤ 10 min old and unused (§2.1) |
| `exp` / `iat` | not expired (60 s clock tolerance); `iat` at most 10 min old (`maxTokenAge`), so leaked old tokens can't create accounts |
| `sub` | must match the `SUB_RE` regex below: a known connection prefix, no `#`, ≤ 256 chars ([near-auth.md](../kb/near-auth.md)). The `auth0` prefix covers email+password and passkeys |
| `email`, `email_verified` | optional; `email_hash = sha256(lowercase(email))` feeds the per-email Pot quota only when verified |
| Never | store the token, log it, or accept `alg: none`/HS256/PS256: `jose` gets `{algorithms: ['RS256']}` explicitly, because the tenant's discovery advertises HS256, RS256 and PS256 (review-security F-13) |

```ts
const SUB_RE = /^(google-oauth2|auth0)\|[^#\s]{1,240}$/   // e.g. "google-oauth2|1234", "auth0|abcd"
```

Mainnet (Phase 3): issuer `https://login.auth.near.org/`, our own client id. The MPC path and `domain_id` stay as in D-21.

**Signing JWT** (`POST /api/devices`): the same JWKS and issuer; `aud` contains `auth0.jwt.fast-auth.testnet`; `azp` = the client id; `scope` contains `transaction:sign`; `sub` = the session's `auth_sub`; `exp − now ≥ 15 s` (it lives 60 s); `fatxn` (number array) equals the delegate bytes; the token is ≤ 7,168 B ([near-auth.md](../kb/near-auth.md) signing flow).

### 4.4 NEAR Connect sessions (NEP-413)

- **Signed payload** (NEP-413 📄; ⚠️ verify the byte layout against a wallet on day 2): `sha256( u32_le(2³¹ + 413) ‖ borsh({message: string, nonce: [u8; 32], recipient: string, callbackUrl: Option<string> = None}) )`, Ed25519 under `publicKey`.
- **Fields:** `message = "Sign in to Pot"`; `recipient` = the app host; `nonce` = 8-byte big-endian Unix ms followed by 24 random bytes (5-minute window, single use).
- **Key check:** `view_access_key(accountId, publicKey)` must be `FullAccess`; a function-call key can't attach the 1 yocto contributions need ([near-connect.md](../kb/near-connect.md)).

How wallet sessions differ from NEAR Auth sessions:

| | NEAR Auth | NEAR Connect |
|---|---|---|
| Account | `u-{id}.users.{root}`, created by us with 0 NEAR | the user's own account |
| Device binding | yes | no: any full-access key; wallets choose nonce and expiry, the relayer validates |
| Gasless | always | only wallets with `signDelegateActions` (testnet: Meteor, Intear, Ledger, NEAR CLI); others pay their own gas and may call `/api/tx/report` |
| New device | MPC `AddKey` or pairing | reconnect the wallet |
| USDC registration | at onboarding | once, on the first session (D-23) |
| Email notifications | if the ID token had a verified email | none (no email known) |

## 5. Workflows (Vercel Workflow `workflow` 5.2.3, D-30)

Conventions: `'use workflow'` orchestrators call `'use step'` functions (retried on throw; ⚠️ check the `FatalError` export on Nov 1). Every step re-reads its DB row first and is idempotent. Runs are pinned to the deployment that started them, so after a rollback, cancel stale runs ([backend-infra.md](../kb/backend-infra.md) gotchas). Events: a step ≈ 3, a sleep ≈ 2.

### 5.1 `watchDeposit(depositIntentId)` (1Click status poller, D-50)

| Phase | Condition | Poll every | Notes |
|---|---|---|---|
| A | `PENDING_DEPOSIT`, first 10 min | 15 s | the client also polls every 3 s while the stepper is open |
| B | `PENDING_DEPOSIT`, 10 min → deadline (2 h) | 5 min | most abandoned quotes end here cheaply |
| C | `KNOWN_DEPOSIT_TX` or `PROCESSING` | 5 s for 2 min, then 15 s up to 10 min, then 60 s | "Taking longer" is UI-side at `processingSince + 5 min` |
| D | `INCOMPLETE_DEPOSIT` | 60 s until the deadline, then 30 s up to deadline + 30 min | refunds land 8-87 s after the deadline ([intents-1click.md](../kb/intents-1click.md)) |

- **Skip rule:** if `last_polled_at` is less than 10 s old (the client polled), sleep without calling 1Click.
- **Terminal:**
  - `SUCCESS` → (simulator: deliver test USDC from the treasury) → notify `deposit_status` (arrived) → end;
  - `REFUNDED`, `FAILED` → notify → end;
  - `PENDING_DEPOSIT` at deadline + 10 min → `EXPIRED`, no push → end;
  - still not terminal at deadline + 30 min → `STUCK`, alert `workflow_stuck`, notify the support copy → end.
- **Errors:** HTTP 429 → sleep 30 s; 404 right after creation → retry for 2 min; 401 with a key → alert and retry without it.
- **Budget:** ≤ ~70 polls ≈ 350 events per abandoned quote and ≈ 40-60 per normal deposit, inside Hobby's 50,000 events/month for hackathon volume.

```ts
export async function watchDeposit(id: string) {
  'use workflow'
  for (;;) {
    const s = await pollDeposit(id)                 // step: skip rule, GET /v0/status or simulator, DB update, returns {status, phase}
    if (s.terminal) { await notifyDeposit(id, s.status); return s.status }   // step: §6 deposit_status
    await sleep(nextDelay(s))                       // phase table above
  }
}
```

The simulator variant computes `status` from `sim_started_at` and the chain profile (§2.7), so it uses one sleep until the scheduled SUCCESS plus one delivery step (≈ 15 events).

### 5.2 `refillDemoPool()` and `seedDemoPot(demoPotId)` (D-33)

- **`refillDemoPool`:** reads `ready` + `seeding` counts. While `ready + seeding < DEMO_POOL_TARGET` (6), with at most 3 seeded per run and `demo_yocto` budget left, it inserts `demo_pot` rows and runs `seedDemoPot` for each. A single-flight lease `refill_demo_pool` (10 min) prevents parallel refills. Started by `/api/demo/session` when fewer than 3 are ready, and by the cron.
- **`seedDemoPot`:** each step checks `demo_pot.seed_step` and the chain first, so a retry resumes safely.

| Step | Action | Signed by |
|---|---|---|
| 1 | create `maya-<k>`, `sam-<k>`, `leo-<k>` under `users.{root}`, each with `AddKey(DEMO_PERSONA_KEY, FullAccess)`; insert `app_user (kind demo)` rows with names and tints | relayer pool |
| 2 | `usdc.storage_deposit` for the three personas | relayer pool |
| 3 | treasury `ft_transfer` $150 to each persona | treasury pool |
| 4 | Maya `create_pot({slug: "lisbon-<k>", name: "Lisbon Trip", preset: "trip", rules: null, invite_pk, emoji: "🇵🇹", float: min_dao_float})`; the invite seed is derived as `HMAC(APP_HMAC_SECRET, demoPotId)` and never stored | persona key → relay pipeline |
| 5 | Sam `join` (signature over `pot-join:v1:<dao>:<sam account>`), then Sam `ft_transfer_call` $150 | persona key |
| 6 | Maya `ft_transfer_call` $150 | persona key |
| 7 | Leo `join`, then Leo `ft_transfer_call` $150 → $450, 3 members (D-61 Rev 1: the README's seeded state) | persona key |
| 8 | `state = ready`, `seeded_at = now()` | — |

Cost ≈ 3 × 0.0085 (personas) + ≈ 0.013 (gas) + ≈ 0.079 from the hub (the 0.05 float, registration, state and the two joins' storage) ≈ **0.12 NEAR per Pot** ([contracts-spec.md](contracts-spec.md) §8.4; rev3, was "≈ 0.1", which left out the joins), close to D-33's ≈ 0.1 budget.

**Kinds** (rev3, D-33; rev4 changes marked): `seedDemoPot` takes `kind`:
- `pool` (default) creates fresh `maya-<k>`, `sam-<k>`, `leo-<k>` and the slug `lisbon-<k>`;
- `shared` (the 04:00 UTC cron, and rev4's reseed when the shared Pot drops below $300 or isn't Open) creates **fresh** `maya-<k>`, `sam-<k>`, `leo-<k>` like `pool` (rev4: it no longer reuses the fixed personas, which now belong to the reference Pot only) with the slug `lisbon-<yyyymmdd>` (a reseed adds `-<n>`);
- `reference` runs once per environment (B-08 on Nov 6) with the fixed `maya`, `sam`, `leo` personas and the slug `lisbon-trip`, and is never leased. Rev4 step 9 (review-security H-5): once steps 1-8 are checked, each reference persona signs a delegate `DeleteKey(<its only key>)` that the relayer pool submits (a server-internal step, never reachable through `/api/relay`). The personas then hold no key, so nobody, the server included, can ever act in the reference Pot again; `list-keys` on them shows an empty table.

Every persona action in steps 4-7 goes through the relay pipeline, so the relayer is the signer and the hub sponsors it (contracts-spec §3.0). Only the CLI fallback ([accounts-and-deploy.md](accounts-and-deploy.md) §3.8), where personas sign their own txs, attaches the hub's cost as a deposit.

### 5.3 Reconciliation cron (`GET /api/cron/reconcile`; daily on Hobby, every minute on Pro)

Single-flight lease `cron:reconcile` (15 min); each step is time-boxed and logged to `error_log` on failure.
1. **Open Pots:** for each Pot with activity in the last 14 days, run the lazy reconcile of §2.5 (new proposals, transitions, `sync`, missed `approval_needed`).
2. **Expiries:** vote-path proposals past `submission_time + proposal_period` that are still `InProgress` → `sync` (the hub records them as expired) → `request_resolved` (expired) to the requester.
3. **Failed payouts:** `retry_payout` where the DAO's USDC balance now covers the amount.
4. **Deposits:** non-terminal `deposit_intent` rows without a live workflow run → restart `watchDeposit`.
5. **Floats and balances:** DAO top-ups (§3.5, demo and reference Pots only); relayer, hub and treasury alerts. Rev4 (review-security H-4): query the FastNEAR Tx API for txs signed by `pots.{root}` (and, until Nov 2, `usdc.{root}`) since the last deploy recorded in `RELEASES.md`; any unplanned one → alert `hub_key_used`.
6. **Demo:** refill the pool; retire leases past `lease_until`; at 04:00 UTC (the daily run) create tonight's shared Pot `lisbon-<yyyymmdd>` (a fresh `seedDemoPot` with `kind: shared`) and point the shared pointer (`demo_pot` row) at it (D-33 fallback). Nothing on chain is "reset": old shared Pots stay as they are.
7. **Retention** deletes ([data-model.md](data-model.md) §4).

## 6. Notifications (D-51, P-10)

### 6.1 Events → recipients → channels

Fan-out runs in `after()` (architecture 3.14), deduped by `notification_log (event_key, user_id, channel)`. Push copy comes from the same `en.json` as the UI via `t('notif.*')` (frontend A7); the strings are ux-spec §5.15, and the `notif.*` ids are ⓟ.

| Event | Trigger | Recipients | Push: TTL / urgency / topic | `navigate` | Email | Telegram (P2) |
|---|---|---|---|---|---|---|
| `approval_needed` | `spend_requested` with `path: vote`, `close_proposed`, or `rules_change_proposed` (relay outcome or reconcile) | members who haven't voted, minus the requester | until `submission_time + proposal_period` (60 s - 7 days) / `high` / `topic(pot, pid)` | `/p/<slug>?r=<pid>` | only with no live push subscription, a verified email, opt-in and Resend configured | group post with a `url` button |
| `request_resolved` | a `proposal_synced` event (from the server's `sync`) or a vote outcome moves a proposal to Approved, Rejected, Expired or Failed; also an instant spend whose payout failed | the requester (close: every member) | 24 h / `normal` / the same topic, which replaces the approval push | `/p/<slug>` | no | `editMessageText` on the original post |
| `money_arrived` | a `contribution` event | members except the contributor | 6 h / `low` / `topic(pot, "c")`, so only the latest shows | `/p/<slug>` | no | optional |
| `member_joined` | `member_joined` | rev4 (review-security H-1): **every member** except the joiner, so a leaked link is noticed and anyone can make a new one (was: the creator and the inviter) | 24 h / `low` | `/p/<slug>?tab=members` | no | optional |
| `deposit_status` | `watchDeposit` terminal states and SUCCESS | the depositor | 24 h / `high` | SUCCESS: `/p/<slug>?sheet=add&src=xc&d=<id>`; others: `/p/<slug>` | yes (money) | no |
| `pot_closed` | `pot_closed` | all members | 24 h / `normal` | `/p/<slug>` | yes | post |
| `nudge` | `POST /api/nudges` | the target | 24 h / `normal` | `/p/<slug>?sheet=add` | fallback as for approvals | no |
| auto-approved spend | `spend_auto_approved` | nobody (feed only: too noisy) | — | — | — | optional digest line |

- `topic(pot, x)` = `"r" + base64url(sha256(pot + ":" + x))[0..20]`: 21 URL-safe characters, under Apple's 32-char limit ([notifications.md](../kb/notifications.md) N2).
- Event keys: `approval_needed:{dao}:{pid}`, `resolved:{dao}:{pid}:{status}`, `contribution:{txHash}`, `joined:{dao}:{account}`, `deposit:{intentId}:{status}`, `closed:{dao}`, `nudge:{dao}:{to}:{utc_date}`.
- Bodies never contain Pot balances, account ids or tx hashes (architecture Q-5).
- Web Push: `web-push` 3.6.7, VAPID subject `mailto:`; cache the VAPID `Authorization` header per push-service origin for at least 1 hour (Apple). Options: `TTL` (always set; the default is 28 days), `urgency`, `topic`, `timeout: 10000`. Responses: 404/410 → delete the subscription; 429 → honour `Retry-After` once; 413 → bug, log; 5xx → ≤ 2 retries.

### 6.2 Payload format (Declarative Web Push JSON, D-42, D-51)

```json
{
  "web_push": 8030,
  "notification": {
    "title": "Maya needs your OK",
    "body": "$300 for Boat trip · Lisbon Trip",
    "navigate": "https://pot-team.vercel.app/p/lisbon-trip-7f3a?r=12",
    "lang": "en-US", "dir": "ltr",
    "tag": "rG7kQ2xV9pL0aZt4bWm1c",
    "silent": false,
    "app_badge": 2,
    "data": { "type": "approval_needed", "pot": "lisbon-trip-7f3a.pots.<root>", "proposalId": 12 }
  },
  "app_badge": 2,
  "mutable": false
}
```

- **Required:** a non-empty `title` and an absolute `https` `navigate`. `tag` = the topic. The SW validates that `data.url`/`navigate` is same-origin ([frontend-architecture.md](frontend-architecture.md) §8.2).
- `app_badge` = the user's open approvals: `approval_needed` rows without a matching `resolved` row. It is sent in both places (WebKit moved it to the top level in May 2025) and only with `approval_needed` and `request_resolved`.
- `JSON.stringify(payload)` must be ≤ 2,500 bytes, checked before sending: Firefox Android's bridge caps at 2,641 B ([notifications.md](../kb/notifications.md)).

### 6.3 Email and Telegram
- **Email** (only after H-07): `resend` 6.34.1 with `react-email` 6.11.3 templates; from `Pot <alerts@notify.<domain>>`; subject = the push title; `idempotencyKey = event_key + ":" + userId`; a `global/email` counter capped at 90/day (Resend Free allows 100/day, counting recipients). Plain content, no click tracking, links to the same `navigate` URLs.
- **Telegram** (Phase 2, first to cut): a plain bot, never a Mini App ([notifications.md](../kb/notifications.md) N4). Group posts for `approval_needed` with an "Approve in Pot →" `url` button; the `message_id` goes in `telegram_post` and is edited on resolution; ≤ 20 posts/min per group. Rev4: messages are sent with **no `parse_mode`** (user text such as display names is never interpreted as markup).

## 7. Demo mode (D-22a, D-33, D-63)

### 7.1 Guarantees for AI judges
1. `GET /demo` returns server-rendered HTML that names the product, says "Demo · test money on NEAR testnet" and explains that the server signs for the personas. It lists "What to try" as the README's steps, shows a live snapshot of the **reference Pot** (name, $ balance, members with amounts put in, the last 5 activity lines as plain text), and has one `<form method="post" action="/api/demo/session">` per offered persona (Maya and Leo; Sam is reachable through the banner's switch, ux-spec §4.19; rev3). It works with no JavaScript and no login.
2. A form post from a browser running JavaScript leases a Pot and returns **303** to `/p/<slug>`. That page is an app shell that needs JavaScript (frontend §0 row 1), so a client without JS reads the data from `/demo`'s snapshot and the JSON twins instead. Rev4 (BotID on new leases, §2.8): a no-JS form post or curl gets **303** to `/demo?ro=1` (read-only snapshot and twins) instead of a lease; it could not have used the leased Pot without JavaScript anyway.
3. Every UI step has a non-UI twin: `GET /api/demo/state` (JSON), `GET /api/pots/<dao>/feed` (JSON), `near … as-read-only` view commands (exact strings in `commands`), and nearblocks links.
4. Judges never collide: each visitor gets their own pool Pot; if the pool is empty they share the nightly Pot, and the page says so.
5. Everything is labeled: `demo.banner` on every page, `x-pot-demo: 1` on every response, persona names in the hint cookie.
6. Nothing a judge does can change the reference Pot, so the README's CLI twins stay deterministic. Rev4: the API refuses it first (§2.3), and its personas hold no key after seeding (§5.2 step 9), so nobody can change it at all.
7. Rev4: nobody can close the nightly shared Pot or change its rules (§2.3), and it is reseeded when it drops below $300, so a visitor who empties it can't break the README steps for the next judge.

### 7.2 Pots and personas

| Pot | Slug and DAO | Personas | Who can act | Lifetime |
|---|---|---|---|---|
| Reference | `lisbon-trip.pots.{root}` (`DEMO_REFERENCE_POT`) | `maya`, `sam`, `leo` `.users.{root}` | **nobody** (rev4): demo intents targeting it → `demo_forbidden`, checked first, and its personas' only key is deleted after seeding (§5.2 step 9), so it is read-only on chain | permanent; seeded once by the deploy script to the D-61 state ($450, 3 members) |
| Pool | `lisbon-<k>.pots.{root}` (`<k>` = 4 chars of `[a-z0-9]`) | `maya-<k>`, `sam-<k>`, `leo-<k>` `.users.{root}` | the leasing visitor | leased up to 8 h, then retired (never reused) |
| Shared (fallback) | `lisbon-<yyyymmdd>.pots.{root}` | rev4: fresh `maya-<k>`, `sam-<k>`, `leo-<k>` `.users.{root}` per shared Pot | anyone, when the pool is empty; rev4: no close and no rules changes (`demo_forbidden`); reseeded when below $300 or not Open | one per day, created by the 04:00 UTC cron run; a `demo_pot` row points to it, not an env var (architecture Q-9) |

Pool and shared personas sign with `DEMO_PERSONA_KEY` (architecture §2.3); the reference personas hold no key after seeding (rev4). Persona display names are Maya, Sam and Leo with fixed tints.

### 7.3 Lease, switch, reset
- **Lease (SQL in [data-model.md](data-model.md) §3.2):** `UPDATE demo_pot SET state = 'leased', leased_to = $visitor, lease_until = now() + interval '2 hours' WHERE id = (SELECT id FROM demo_pot WHERE state = 'ready' AND kind = 'pool' ORDER BY seeded_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING …`.
- **Switch persona:** `POST /api/demo/session {persona}` with an active lease creates a new demo session for the same Pot.
- **Reset:** `{reset: true}` retires the current lease and leases a fresh Pot. Nothing on chain is undone.
- **Expiry:** activity extends `lease_until` up to 8 h after `leased_at`. The cron retires expired leases.

### 7.4 README "do X → see Y" twins (draft; the README owns the final text)

Rev 3: the final steps are J-1…J-8 in [submission-plan.md](submission-plan.md) §1.2, with the D-61 numbers ($84 instant, then $300 by vote). This table is the API's part of them.

| Do | See (UI) | Non-UI twin |
|---|---|---|
| Open `/demo`, tap "Try as Maya" | Lisbon Trip with $450 and 3 members | `curl -s https://<app>/api/demo/state \| jq .reference` |
| Spend → Reimburse me → $84 → Groceries → Get $84 back | "Approved by Pot rules", then "$84 sent to you" and a receipt; the Pot shows $366 | the receipt link (testnet nearblocks) |
| Spend $300 → "Ask the group" ("1 of 2": Maya's own approval counts); Switch to Leo; approve | "This needs 2 of 3 approvals", then "Approved"; the Pot shows $66 | `curl -s https://<app>/api/pots/<dao>/feed` |
| Read the rules on chain | the "On-chain rules" panel (D-52) | `near contract call-function as-read-only lisbon-trip.pots.<root> get_policy json-args {} network-config testnet now` |
| Check that nobody can change the hub's code | — | `near account list-keys pots.<root> network-config testnet now` shows no full-access key after Nov 12 (D-13) |

### 7.5 Demo limits
Rev 4 (review-security H-5): BotID on every new lease (§2.8); new leases per `ipnet:{hash}` (IPv4 address or IPv6 /64) 10/day; 10 resets per visitor per day. Demo relays use the normal quota table with `visitor:{hash}` **and** `ipnet:{hash}` in place of `user:{id}` (many visitors can act as the same persona in the shared Pot, and a cleared cookie no longer resets the quota), plus `global/demo_yocto` (3 NEAR/day, now including the hub's float and prepay estimates). The pool target is 6 ready Pots with refills of up to 3 per run. Simulated 1Click deliveries ≤ $150 per demo visitor per day (§2.7).

## 8. Acceptance criteria (API level, tied to P-1…P-11)

Each line is checkable by a test (near-workspaces for contract paths, Playwright two-context runs on testnet per D-65, or a scripted `curl` + RPC check).

| Feature | Criteria |
|---|---|
| **P-1 Login** | (a) `POST /api/session` for a new `sub` creates `u-*.users.{root}` with **exactly two full-access keys** (MPC + device), **0 NEAR**, registered on USDC; server time p95 ≤ 10 s. (b) Returning user: ≤ 800 ms and no new `relay_log` row. (c) Replaying an identical body → `device_proof_invalid`. (d) Cookie deleted but device key kept → `POST /api/session/device` restores the session with no popup. (e) New device → `POST /api/devices` adds the key, p95 ≤ 25 s. (f) NEAR Connect: a Meteor or Intear session relays a contribution gaslessly. (g) No seed phrase anywhere |
| **P-2 Sponsored creation** | (a) One relayed `create_pot` → `pot_created` within 15 s p95. (b) The creator's NEAR balance is unchanged. (c) `get_policy` on the new DAO shows `member` + `rulebot` roles, `proposal_bond "0"`, `quorum "1"` (D-04). (d) The 4th creation in a UTC day → `quota_exceeded` with family `create`, and no tx |
| **P-3 Invite and join** | (a) The link `/j/<slug>?i=<pk>#<secret>` works for several joiners (D-08; rev4: by default for 7 days and 10 joins). (b) No server log or DB row ever contains the fragment. (c) A relayed `join` → `member_joined`, and the DAO's member group contains the joiner. (d) An expired or revoked invite → `inner_failed` with `ERR_INVITE_EXPIRED` / `ERR_INVITE_REVOKED`, shown as `invite.expired` / `invite.replaced` |
| **P-4 Add money** | (a) A relayed `ft_transfer_call` → `contribution` event, `result.recorded: true`, and the DAO's USDC balance grows by the amount. (b) A second browser's `final` views reach `executedAtBlock` within 5 s of finality (D-32). (c) A hub refusal → `inner_failed` with `CONTRIBUTION_REFUNDED` and the member's balance unchanged |
| **P-5 Auto-approved spend** | (a) One relay → an early 200 with `path: "instant"` within 4 s p95 ("Approved by Pot rules", D-07 Rev 2), then `GET /api/relay/[relayId]` → `final: true`, `payout: "sent"`, `spend_auto_approved`, receiver balance + amount, within 10 s p95. (b) An amount over the instant limit → `spend_requested` with `path: "vote"` and no rulebot vote. (c) A forced payout failure → `spend_payout_failed`, then `retry_payout` → `Approved` |
| **P-6 Group vote** | (a) A relayed `VoteApprove` reaching the majority returns `proposalStatus: "Approved"` and the payout state. (b) The server then calls `sync` (a `relay_log` row with `op: sync`). (c) A declining majority → `Rejected` and a `request_resolved` push to the requester. (d) A second vote by the same member → `already_voted` with no tx |
| **P-7 Any-chain deposit** | (a) Testnet: a simulated quote has 1Click's shapes, `qrText` "DO NOT SEND", and statuses follow the chain profile. (b) SUCCESS → a `deposit_status` push whose `navigate` opens the Add sheet; one tap → `deposit_intent.status = ADDED`. (c) The workflow ends at a terminal state and spends ≤ 400 events per intent. (d) Mainnet clip: `verifyQuoteSignature` passes and the `FLEX_INPUT` body matches D-50 |
| **P-8 Rules editor** | (a) Sole member: `set_rules` → `rules_changed`. (b) Several members: `propose_rules` → a DAO `FunctionCall` proposal for `set_rules`; a majority approval (votes at 300 Tgas) → `rules_changed`. (c) No member-created DAO `add_proposal` is ever relayed (D-07b) |
| **P-9 Close** | (a) `propose_close` → `close_proposed`; while it is open, contributions and spends → `pot_closed` with `status: "closing"`. (b) The final vote (300 Tgas, D-09 Rev 2) executes every transfer atomically, for up to 40 members; Σ payouts = the DAO balance before close, and the DAO's USDC balance ends at 0. (c) After the server's `sync` → `pot_closed`; push (and email, if configured) to every member |
| **P-10 Notifications** | (a) `approval_needed` reaches members who haven't voted within 5 s of the relay response. (b) Every payload is ≤ 2,500 B with an absolute https `navigate` URL as in frontend §8.2. (c) 404/410 deletes the subscription. (d) The email fallback fires only without a live push subscription. (e) Running the reconcile twice sends nothing twice |
| **P-11 Trezu visibility** | (a) Testnet shows no Trezu link (D-52); explorer links are present. (b) `GET /api/demo/state` → `commands.getPolicy` is a working `near … get_policy` command for the reference Pot |
| **Relayer safety** | Each vector is refused **before submission** (no outer tx hash, `relay_log.status = rejected`): deposit > 1 yocto → `deposit_cap`; `near_deposit` or any unlisted method → `method_not_allowed`; `ft_transfer_call` to a non-hub receiver → `args_invalid`; 300 Tgas `ft_transfer_call` → `gas_cap`; stale `max_block_height` → `expired`; replayed delegate → `nonce_used` or the stored replay; tampered bytes → `bad_signature`; a function-call key attaching 1 yocto → `fc_key_deposit`; an unknown receiver → `receiver_not_allowed`; two delegates for one key in flight → `nonce_pending`. Rev4: a vote on a member-created DAO proposal → `proposal_not_tracked`; a vote by a non-member → `not_a_member`; 300 Tgas on a Transfer vote → `gas_cap`; a 4th `Finalize` on one proposal in a UTC day → `quota_exceeded` (family `finalize`); any deposit on a hub method → `deposit_cap` |

## 9. Alignment, open questions, objections

### 9.1 Alignment with [frontend-architecture.md](frontend-architecture.md) §13

| # | Frontend expectation | This spec |
|---|---|---|
| A1 | `POST /api/relay` bodies and `RelayOk` / `RelayRejected` | ✅ Same bodies. `RelayOk` adds `relayId`, `receiptUrl`, `errorCode` and a typed `result`. Errors are `Err` with `reason`. **Extra reasons** the client should map: `key_not_allowed` (→ needs_device, rebind), `action_not_allowed`, `args_invalid`, `ttl_too_long`, `nonce_pending`, `already_voted`, `proposal_not_open`, `pot_closed`, `pot_unknown`, `not_a_member`, `slug_taken`, `user_suspended`, `idempotency_conflict`, `demo_forbidden`, `service_unavailable` (with `detail.cause`). **New:** 202 `{status: "pending", relayId}` → poll `GET /api/relay/[relayId]`; `final: false` on the early `request_spend` response (D-07 Rev 2) → poll the same route for the payout |
| A2 | `pot_hint` cookie; `POST /api/session` `{idToken, devicePublicKey, pop:{ts,sig}}` → `{accountId, isNew, deviceOnChain}` | ✅ Plus a required `keyKind`, an optional `displayName`; the response adds `mpcPublicKey`, `usdcRegistered`, `session`. `pot_hint` adds `devicePublicKey`; `persona` is `maya`, `sam` or `leo` (Rev 1) |
| A3 | `POST /api/devices` `{guardId, verifyPayload, signPayload, devicePublicKey}` | Δ Also requires `pop` (`pot-device-add-v1`), `keyKind` and `idempotencyKey`. `signPayload` is **base64** |
| A4 | feed shape | ✅ Plus `declineReasons`, `nextCursor`, `syncedAt`, and `gradient` and `isDemo` on `pot` |
| A5 | `POST /api/demo/session` form + JSON, `{persona, reset}` | ✅ |
| A6 | faucet idempotent, daily cap, callable when the sheet opens | ✅ |
| A7 | push `navigate` URLs, `t('notif.*')` | ✅ The `notif.*` ids still need adding to `en.json` (ⓟ) |
| A8 | the relayer calls `sync` after a final vote | Δ After **every** relayed vote and after a failed payout (D-05 Rev 2); `sync` accepts any caller (architecture S-1). frontend-architecture A8 now says the same (rev3) |
| A9, A10 | contracts-spec items | → [contracts-spec.md](contracts-spec.md) |
| A11 | gas caps ≥ frontend defaults; `rotate_invite` as one 2-call delegate | ✅ R5 allows the pair. Δ **Approvals and Finalize on `FunctionCall` proposals (close and rules) must carry exactly 300 Tgas** (D-09 Rev 2); the frontend's 200 for close votes would get `gas_cap`. Transfer votes stay at 100 |
| A12 | `invite_meta` written from `create_pot` / `add_invite` | ✅ From the `invite_added` events ([data-model.md](data-model.md)) |

### 9.2 Open questions
1. **NEP-413 bytes** (§4.4): verify the payload layout against Meteor and Intear on day 2.
2. **Library pins** to add on Nov 1: `jose`, `botid`, `ulid`, `@noble/curves` (the frontend already pins 2.2.0).
3. **Contracts:** resolved by [contracts-spec.md](contracts-spec.md) (architecture §5). Still to calibrate on Nov 3: the gas and storage numbers it marks ⚠️, and whether polling `get_requests` for the early response is fast enough or `get_request(pot, request_id)` needs the id from a log line.
4. **Demo Pot creation:** allowed now (1 per visitor per day, counted in the demo budget). Keep it, or hide "Start a Pot" in demo sessions? Default: keep it (phase0-checklist §5 #19; Cerasela by Oct 25). Rev4: review-security H-5 recommends hiding it (each demo creation costs the hub ≈ 0.06 NEAR and counts toward the on-chain sponsored-Pot cap); if kept, the 1-per-day quota is keyed by visitor **and** `ipnet`, so clearing the cookie doesn't reset it.
5. ~~**`withdraw_request`** (Phase 2): copy keys for the requester's button exist (`approve.withdraw*`); the API only needs R10.~~ Resolved (decisions.md Revision 5): Phase 3, not built. R10 stays reserved, and ux-spec keeps the `approve.withdraw*` keys marked Phase 3.

### 9.3 Objections
See [architecture.md](architecture.md) §7: O-1 (the MPC `sign` deposit and the 2 NEAR reserve per slot, D-21) is **resolved in Revision 4**: a 1-yocto `sign` is proven on chain, so the deposit is 1 yocto and there is no reserve. O-2 was withdrawn after Revision 2. Nothing else in this spec departs from decisions.md (Revision 5).
