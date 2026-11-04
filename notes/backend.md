# Backend notes: wave 1 (B-01…B-09, X-05, X-08, X-09)

> **2026-11-04: Money-in details (`GET /api/pots/[pot]/deposits/[key]`, server/features/deposits.ts).** Members only
> (`isMember` before any read; stranger / left / unknown key / another Pot's key → the same 404; signed out 401;
> `private, no-store`). `key` = a contribution's NEAR tx hash or a pay-in ref. An add's source, in order: the
> `deposit_intent` the relay ADDED (`added_relay_id` → `relay_log.id` whose `outer_tx_hash` is the key), the deposit
> named in the relay's context (`feed_event.data.depositIntentId`), the Add sheet's `context.source`
> (`feed_event.data.potSource`), a faucet claim by the same user ≤ 10 min before (older adds = demo dollars), else
> "balance". **Writes (no migration):** `POST /api/relay` accepts `context.source` ("demo" | "pot_dollars"; sdk
> `RelayContext.source`) and after a recorded contribution merges `potSource` / `depositIntentId` (only the caller's own
> deposit for that Pot, only through the caller's own relay row) into the add's `feed_event.data` (`noteAddSource`, best
> effort). The 1Click poller keeps a trail in `deposit_intent.last_status` (`{status, at, seen: {STATUS: first-seen ISO},
> originTx: [hash]}`, `nextTrail`) and reads `swapDetails.originChainTxHashes`; `statusBody` adds
> `simulated.sentAt`. The feed adds members-only `addSources` (tx → kind, + coin/chain for another app). Real-mode
> receipts: the origin network's explorer (`lib/deposits.ts originTxUrl`, hash-checked) and
> `explorer.near-intents.org/transactions/<depositAddress>`; simulated rows get neither. Tests:
> `server/features/deposits.test.ts` (10). Frontend + open questions: notes/frontend.md 2026-11-04 "Money-in details".

> Written 2026-10-22 by the backend agent. Sources: plan/api-spec.md (primary), data-model.md, architecture.md, contracts-spec.md, review-security.md §7, implementation-plan B-01…B-09/X-05/X-08/X-09, kb/meta-tx-relayer.md, kb/accounts-onboarding.md, kb/near-auth.md, kb/backend-infra.md, notes/sdk.md.
> Reconciled with `@pot/sdk` 0.1.0 (wire types, delegate decoder/verifier, `RELAY_POLICY`, `kindsEqual`, `errorCodeFromText`, `buildCall`, Raw view types). `contracts/abi/pot_hub.json` and `notes/contracts.md` did not exist yet; method names and view JSON follow contracts-spec + `contracts/pot-hub/src` (read 00:30) via the sdk's `Raw*` types.

> **Rev 9 (2026-11-01, plan/decisions.md): removed, because nothing may act on chain without the person's own sign-in.**
> - **Routes:** `POST /api/session/dev` (B-04), `POST /api/demo/session` + `GET /api/demo/state` (X-08), `GET /api/cron/demo-pool`
>   (B-12; also its `vercel.json` cron). Their rows in the table below are history.
> - **Modules:** `server/features/{demo,demoPool,demoState,seed}.ts`, `devLogin`/`devSessionEnabled` (`session/service.ts`), the
>   `dev_session` PoP, the visitor cookie, `kickDemoPool`, the reconcile steps "DAO float top-ups for demo/reference Pots" and "demo
>   pool", the demo retention rows, `ipNet`/`ipNetHash` and the form-post CSRF mode (only the demo session used them).
> - **Relay (B-08):** no `{demo: {intent}}` bodies, no server-signed (`serverSigned`) path, no `visitor:`/`ipnet:` subjects,
>   `demo_yocto`/`demo_create`/`visitor_*`/`ipnet_lease`/`*_dev_accounts`/`topup_yocto` quotas. Step 7's device binding applies to
>   `near-auth`; `wallet` actors may use any full-access key of their account (checked on chain).
> - **Sessions:** `kind` is `near-auth | wallet` (`SessionCtx` lost `visitorHash`/`demo`); device re-login is NEAR Auth only. Push
>   subscriptions, the faucet and the 1Click simulator charge `user:`/`account:` subjects only ($500/day per person).
> - **Config/env:** `flags.devSession`, `flags.demo`, `demoReferencePot`; `FLAG_DEMO*`, `FLAG_DEV_SESSION`, `DEMO_REFERENCE_POT`,
>   `DEMO_POOL_TARGET`, `QUOTA_GLOBAL_DEMO_YOCTO`, `DEMO_PERSONA_KEY` (`loadKeys` takes `RELAYER_KEYS | TREASURY_KEYS`).
> - **DB:** `db/migrations/0001_remove_demo_and_dev_sessions.sql` deletes demo/dev sessions and users (nulling `relay_log.user_id`,
>   `telegram_chat.linked_by_user_id`, deleting their `deposit_intent` rows), drops `demo_pot`, `app_user.persona`, `pot.is_demo`,
>   `push_subscription.demo_pot_id`, `session.demo_pot_id`/`visitor_hash`, `relay_log.visitor_hash`, and adds CHECKs
>   `app_user_kind_ck`/`session_kind_ck` (`near-auth`, `wallet`). Tested on a populated copy and on the local dev DB (94 demo/dev users).
> - **Tests:** the live harness's `devUser` became `walletUsers` (throwaway 0-NEAR accounts from `e2e/testnet/accounts.ts`, signed in
>   through `walletLogin` with NEP-413); `relay.live` signs in the same way; `scripts/e2e-chain.ts` uses `POST /api/session/wallet`.
>   Unit tests that used the `dev` kind as "a device-bound user" use `near-auth`; the demo-only tests are gone (features, ops, notify,
>   routes, session); new ones: wallet actors in the pipeline, wallet users can't device-relogin, sponsor-low and bidi names on the
>   NEAR Auth path, the removed routes stay removed, migration 0001 refuses a `dev` user.

## Status

| Check | Result |
|---|---|
| `pnpm --filter web typecheck` (`next typegen && tsc`) | clean |
| `pnpm --filter web lint` | clean |
| `pnpm --filter web test` | 21 files passed, 1 skipped (live); backend: 8 files, 307 passed + 1 live skipped (unit + DB integration against `pot_test`) |
| root `pnpm typecheck` / `pnpm test` | clean / 584 passed, 9 skipped |
| **live testnet relay** (`LIVE_TESTNET=1 pnpm --filter web exec vitest run server/live`) | **passed** (see tx hashes below) |

## Layout (server code is `apps/web/server/**`, not `lib/server/**`)

```
apps/web/
  drizzle.config.ts            schema ./db/schema.ts → ./db/migrations (drizzle-kit 0.31.11)
  db/schema.ts                 all data-model §2 tables (MVP + Phase 2 shapes, Telegram included)
  db/migrations/0000_init.sql  generated; applied by CI (never from a Vercel build)
  db/client.ts                 lazy pg.Pool (max 5, idle 5 s) + attachDatabasePool; setDbForTests
  db/quota.ts                  atomic multi-counter charge (one tx, fixed lock order), adjust, read
  db/lease.ts                  pool claim (SKIP LOCKED, random), wait/poll, release, extend, named lease, ensurePoolRows
  db/alert.ts                  one alert per key per hour
  db/testing.ts                per-test-file schema in pot_test, built from the migration SQL
  server/config.ts             env → Config (cached; setConfigForTests)
  server/secrets.ts, quotas.ts, alerts.ts, log.ts (error_log), bot.ts (BotID hook), deps.ts (singletons + after())
  server/http/                 context.ts (Ctx, route() wrapper, CSRF/Origin, 16 KB, zod parse, ip/ipnet hashes), errors.ts, schemas.ts
  server/chain/                rpc.ts (failover), near.ts (views, send_tx, tx), hub.ts (hub/DAO/token views + TTL caches),
                               keys.ts, submitter.ts (key pool + timeout algorithm), outcome.ts (receipt tree), balance.ts
  server/relay/                decode.ts, policy.ts (R1-R11 + test rule), pipeline.ts (§3.2 steps 3-17), classify.ts (§3.4),
                               effects.ts (feed_event, pot cache, invite_meta), status.ts (GET /api/relay/[id]), types.ts
  server/session/              cookies.ts, pop.ts, idtoken.ts (jose RS256 + B-20 challenge/nonce), store.ts, onboard.ts, service.ts
  server/features/             faucet.ts, notes.ts, feed.ts, demo.ts (lease + demo intents), demoState.ts
  server/testing/              fakeChain.ts (programmable RpcClient + scripted Submitter + outcome builders), delegates.ts, env.ts
  server/scripts/testnet-setup.ts   throwaway testnet keys + post-create steps (prints public keys only)
  server/live/relay.live.test.ts    the live testnet test (env-gated)
```

## Routes

All are Node route handlers with `maxDuration` only (no other segment config). Every JSON response carries `requestId` (`req_` + ULID) and `x-request-id`, the static security headers and `Cache-Control: private, no-store` unless noted; demo responses add `x-pot-demo: 1`. Every non-GET route checks `Content-Type: application/json` and `Origin ∈ {NEXT_PUBLIC_APP_URL, https://$VERCEL_URL, https://$VERCEL_BRANCH_URL, https://$VERCEL_PROJECT_PRODUCTION_URL, http://localhost:3000 in dev}`; bodies are capped at 16 KB and parsed with zod `.strict()`.

| Route | Task | Status |
|---|---|---|
| `POST /api/relay` | B-03 (+B-05, B-08 demo intents, B-09) | ✅ full §3.2 pipeline; tested with fakes + **live** (test-allowlist rule) |
| `GET /api/relay/[relayId]` | B-09 | ✅ stored body; early `final:false` until after() stores the final; tx_status poll for rows in flight > 10 s |
| `GET /api/session` | B-07 | ✅ `{session|null}`, bumps last_seen ≤ 15 min, re-issues `pot_hint` |
| `POST /api/session` | B-07 (+B-20 nonce) | ✅ JWKS/RS256, iss/aud/azp/iat≤10 min/SUB_RE, challenge+nonce, PoP + used_proof, onboarding lease, MPC derive, create+register in parallel, resume, pending_device. Unit-tested with a local JWKS; **live NEAR Auth not run** |
| `GET /api/session/challenge` | B-20 | ✅ stateless MAC'd 32-byte challenge |
| `POST /api/session/device` | B-07 (K-2) | ✅ |
| `DELETE /api/session` | B-07 | ✅ revoke, clear cookies, optional push endpoint delete / forgetDevice |
| `POST /api/session/dev` | B-04 | ✅ 404 unless `FLAG_DEV_SESSION` && not production && testnet; one-FAK `u-<8>` account + token registration; **live** |
| `POST /api/faucet` | X-09 | ✅ treasury key pool, $50-$500, idempotent, per-account/IP/global caps, once-ever registration (`registration_used`); **live** |
| `POST /api/notes` | X-05 | ✅ members only, natural key, U-11 validator |
| `GET /api/pots/[pot]/feed` | X-05 | ✅ items, cursor, profiles gating (M-7), memo/decline display rules. Lazy reconcile = Phase 2 |
| `POST /api/demo/session` | X-08 | ✅ JSON + form (303), visitor cookie, SKIP LOCKED lease, persona switch, reset, shared fallback, BotID + 10/day per IPv4 or IPv6 /64 on NEW leases |
| `GET /api/demo/state` | X-08 | ✅ against mocks; needs the deployed hub + a reference Pot to be meaningful (wave 2) |
| `GET /api/health` | B-03 | ✅ minimal (relayer level, rpc, db, feature flags) |

### Relay pipeline as built (api-spec §3.2)
3 idempotency (user, key) + body hash → 4 decode (`@pot/sdk/sign` strict decoder; near-api-js `SCHEMA` decode kept only for the outer-tx object, must re-encode byte-identically) → 5 sender = session account → 6 static policy (§3.1, gas/deposit from `@pot/sdk` `RELAY_POLICY`; R10 → `method_not_allowed`; R12 AddKey → `action_not_allowed` in /api/relay) → 7 device-key binding (near-auth, dev) → 8 local signature (`verifySignedDelegate`) → 9 dedupe by `delegate_hash` → 10 chain reads (head window +10/+600, access key + FC-key rules, nonce > ak, < head·1e6, > in-flight max, Pot known/open, slug_taken, R9 id ≤ last, R11 pre-flight: exists, `get_proposal_subject` live, Active member, `kindsEqual`, open/not voted, Finalize only Failed or expired) → 11 sponsor health (cached ≤ 30 s; floor/critical/warn) → 12 quotas in one tx (burst/min, family/day, per-Pot, finalize per proposal, per-email create, global relays, `relay_yocto` global+user, `hub_yocto` user+global; demo: visitor + ipnet subjects and `demo_yocto` only) + `user_suspended` → (rev4 M-5: register unregistered close payees before a close approval/Finalize) → 13 relay_log `validated` (unique violation = concurrent duplicate → replay) → 14-15 lease a relayer key, sign, store outer hash before broadcast, `send_tx` EXECUTED_OPTIMISTIC, 25 s budget → 202 pending → 16 classify (§3.4), correct the yocto pre-charge to Σ tokens_burnt (+1 yocto), feed_event / pot / invite_meta → 17 after(): `sync` after every relayed vote and after a failed instant payout, `retry_payout` for payout_failed spends after a contribution (≤ 3/proposal/day), relayer balance alert.

Rejections after the decode are recorded as `relay_log.status = rejected` rows **without** the idempotency key and delegate hash, so a corrected retry under the same op id isn't blocked.

## Env vars (backend)

Already in `.env.example`: `NEXT_PUBLIC_NETWORK`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_HUB_ID`, `NEXT_PUBLIC_USDC_ID`, `NEXT_PUBLIC_RPC_URLS`, `NEXT_PUBLIC_TX_API`, `NEXT_PUBLIC_EXPLORER`, `NEXT_PUBLIC_NEAR_AUTH_DOMAIN`, `NEAR_AUTH_CLIENT_ID` (falls back to `NEXT_PUBLIC_NEAR_AUTH_CLIENT_ID`), `RELAYER_ACCOUNT_ID`, `TREASURY_ACCOUNT_ID`, `DEMO_REFERENCE_POT`, `DEMO_POOL_TARGET`, `MPC_SIGN_DEPOSIT_YOCTO`, `FLAG_DEV_SESSION`, `FLAG_DEMO`, `FLAG_NEAR_AUTH`, `QUOTA_*`, `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `DATABASE_URL_TEST`, secrets `RELAYER_KEYS`, `TREASURY_KEYS`, `DEMO_PERSONA_KEY`, `APP_HMAC_SECRET` (a fixed dev value is used only when `VERCEL_ENV` is unset), `FASTNEAR_API_KEY`, `BOTID_BYPASS_SECRET`, `ALERT_WEBHOOK_URL`, `VERCEL_ENV`, `VERCEL_URL`.

**New (please add to `.env.example`; I may not edit it):**

| Var | Default | Purpose |
|---|---|---|
| `HUB_ID` | `NEXT_PUBLIC_HUB_ID` | server-side hub id override |
| `USDC_ID` | `NEXT_PUBLIC_USDC_ID` | **configurable token** (the live test uses `wrap.testnet`) |
| `SERVER_RPC_URLS` | `NEXT_PUBLIC_RPC_URLS` | server RPC failover list (near.org refused at boot) |
| `RELAY_TEST_ALLOWLIST` | empty | `receiver:method:depositYocto[:maxTgas]`, test-only relay rules; **ignored on production and mainnet** |
| `RELAYER_FLOOR_NEAR` / `RELAYER_CRITICAL_NEAR` / `RELAYER_WARN_NEAR` | 1 / 2 / 5 | sponsor-health thresholds (api-spec §3.5) |
| `TOKEN_STORAGE_DEPOSIT_YOCTO` | 1250000000000000000000 | registration deposit |
| `NEAR_AUTH_JWKS_URL` | `<issuer>.well-known/jwks.json` | JWKS override |
| `NEAR_AUTH_REQUIRE_NONCE` | false (always true on production) | require the B-20 challenge |
| `MPC_CONTRACT_ID` / `FAST_AUTH_CONTRACT_ID` | `v1.signer-prod.testnet` / `fast-auth.testnet` | `derived_public_key` |
| `FLAG_BOTID` | false | turn on `checkBotId()` (needs `withBotId` + client init) |
| `LIVE_TESTNET` | unset | `1` runs `server/live/*.live.test.ts` |

## Testnet accounts and spend

Created with near-cli-rs 0.30.1 (`fund-myself` from `pot-funds-65k8.testnet`, legacy keychain) and the setup script; keys are in `apps/web/.keys/testnet.env` (gitignored by `.keys/`; never printed):
- `relay-dev.pot-funds-65k8.testnet`: 1 NEAR, 3 full-access pool keys (the relayer and parent of test users).
- `treasury-dev.pot-funds-65k8.testnet`: 0.2 NEAR, 1 key, 0.05 NEAR wrapped to wNEAR (the faucet's "token").
- 6 throwaway users `u-<8 random>.relay-dev.pot-funds-65k8.testnet` (0 NEAR, one FAK each), one per live run (3 of the 6 runs failed on test-side read lag / ordering bugs, since fixed).

Spend: the holding account went 28.0827 → 26.8684 NEAR (1.2143 moved: 1.2 funding + CLI gas). Actually consumed so far ≈ 0.07 NEAR (gas + 6 account creations + registrations); relay-dev holds ≈ 0.947 NEAR, treasury-dev ≈ 0.147 NEAR + ≈ 0.05 wNEAR. Well under the 3 NEAR budget. A live run costs ≈ 0.009 NEAR.

Live run tx hashes (2026-10-22, latest run; `https://testnet.nearblocks.io/txns/<hash>`):
- create account: `F2ckj1g89dtgW63nypqDMsypuixKRJrbFfoT6mxmQGNr`
- token registration: `6JPQ1mA5An8CwHXFQrDSPhT5gkepKrbA511EmptTBySo`
- faucet (treasury key pool): `9v4Ymo8SNAXJ5F1xRj4p73rovFnPDpiGzaVTt49Hx7wj`
- **relayed 1-yocto `ft_transfer` (success; user balance stays 0 NEAR)**: `iFCopKMuvMZ7YxDmt8SNW3t2w3zMGnLWMeL3xZAFQpo`
- relayed inner failure (`INSUFFICIENT_FUNDS` from the receipt scan, top-level `SuccessValue`): `GBkWMLFj9ERxzKEzmvuhkbo14B2yBtg1yRMNKrLMAaei`
- earlier passing run: relay `B1EjwKbyxVnh74G93Bbc6e3CY4kCR4yrUPRC5F9XNw7C`, inner failure `DTLZXBSE9Thrz1sxxfy5aNbDKqY7SAaExYv2qaZ9aauJ`

## Deviations from the spec

1. **Paths:** server code is `apps/web/server/**` and the DB layer `apps/web/db/**` (task brief), not `apps/web/lib/server/**` (api-spec §0.1, data-model §6). Migrations live in `apps/web/db/migrations`, not `apps/web/drizzle/`.
2. **Rejected relays** get a `relay_log` row with `reason`/`response` but no idempotency key or delegate hash (otherwise a re-signed retry under the same op id would hit `idempotency_conflict`, and a `nonce_pending` delegate retried after 2 s would be deduped to its rejection).
3. **`RelayOk.result` is `null`** for inner failures that have no typed result (the sdk type says non-null); R1 refunds return `{type: contribution, recorded: false}`. Test-allowlist relays return `{type: "test", method}`.
4. **Test-only relay rules** (`RELAY_TEST_ALLOWLIST`) match on receiver + method before the policy table, only off production and off mainnet. Used because the hub isn't deployed.
5. **Dev session repeat:** the same browser key again opens a new session for the existing dev account (`isNew: false`) instead of failing; the spec's type says `isNew: true`.
6. **Quota buckets:** "per hour" IP limits (session creations, challenge, device re-login) aren't separate hourly buckets: the quota table has day and minute buckets only. Account creation per IP is daily (3/day, as specced); the WAF rule covers hourly bursts. Not enforced at all yet: `ip_session_create`, challenge 60/hour, device re-login 30/hour.
7. **`POST /api/session` is not gated by `FLAG_NEAR_AUTH`**; production instead requires the B-20 challenge/nonce, and only `NEAR_AUTH_CLIENT_ID` is accepted as `aud`/`azp`.
8. **BotID** is a hook (`server/bot.ts`), off unless `FLAG_BOTID=true`: `withBotId` (next.config) and the client init belong to platform/frontend. Bypass header `x-pot-ci-bypass`.
9. **Demo intents** use `@pot/sdk` `ActionIntentWire` → `intentFromWire` → `buildCall`; the zod schema only checks `type`, the policy validates every field. Demo `create_pot` is allowed once per visitor per day (open question §9.2 #4).
10. **Shared demo Pot** sessions don't mark the `demo_pot` row leased (many visitors share it); a demo session on it lasts 2 h.
11. **`CLOSE_FAILED`** (sdk synthetic code) is used for a `propose_close` whose final value is `{ok:false}`; `RULES_<REASON>` for a rules proposal `{reason}`.

## Reconciliation (sdk / contracts)
- Adopted from `@pot/sdk`: `Api.*` wire types (Reason, REASON_HTTP_STATUS, RelayOk/Pending/Result, PotEvent, IntentType, FeedApiItem, Category), `decodeSignedDelegate`/`verifySignedDelegate`/`toNearActions` (`/sign`), `RELAY_POLICY`, `RESERVED_SLUGS`, `kindsEqual`, `errorCodeFromText`, `buildCall`/`intentFromWire`, `Raw*` view types. A test asserts that every `buildCall` intent (incl. create_pot with explicit nulls at 300 Tgas, rotate_invite, call votes at 300) passes the relayer policy with the right rule.
- Still local (no sdk equivalent or server-only): the failover RPC + submitter (the sdk's read client is browser-oriented; server needs send_tx/tx status/broadcast), the receipt-tree classifier, quotas, sessions.
- **When `contracts/abi/pot_hub.json` lands:** diff method/arg names against `server/relay/policy.ts` (R2-R9 key lists) and the event names in `relay/effects.ts`; confirm `get_proposal_subject` and `get_requests` shapes (two-phase probe).

## Pending for wave 2
- Live tests against the deployed preview hub: R1-R11 end to end, the two-phase `request_spend` timing (≤ 4 s early, ≤ 10 s final), `sync`/`retry_payout` follow-ups, close payee registration, `GET /api/demo/state` on a real reference Pot, demo intents with `DEMO_PERSONA_KEY`.
- B-07 against live NEAR Auth on `localhost:3000` (MPC `derived_public_key` on testnet, a real Auth0 token).
- `POST /api/devices` (B-13), pairing (B-15), wallet sessions (B-10), `PATCH /api/me` (X-05b), push + notifications (X-06: `notify()` calls belong in `followUps`), cron reconcile + retention (B-11), DAO float top-ups (demo/reference only), demo pool workflow + seeding script (B-08/B-12; `demoSession` takes a `refill` hook), lazy feed reconcile, `deposit_intent` ADDED on `context.depositIntentId`, `seed-db.ts` for lease rows (the submitter seeds pool rows from the loaded keys on first use instead).
- Hourly IP buckets (deviation 6) if the WAF rule isn't enough.
- `.env.example` additions above (owned by platform).

---

# Wave 2: live integration against the preview hub (2026-10-22)

> Deploy and env: **notes/deploy.md** (root `potprev.testnet`, hub `pots.potprev.testnet`, token `usdc.potprev.testnet`, relayer
> `users.potprev.testnet`). Everything below ran against those contracts.

## Status

| Check | Result |
|---|---|
| `LIVE_TESTNET=1 vitest run server/live/hub.live.test.ts` | **8/8 passed** (R1-R9, R11; two-phase timing; B-05 incl. after `retry_payout`; close + pro-rata) |
| `LIVE_TESTNET=1 vitest run server/live/demo.live.test.ts` | **4/4 passed** (seedDemoPot through the relayer, demo session lease + persona switch, demo intents $84 / $300 + approvals, reference refusal, `demoState`) |
| `scripts/run e2e-chain` against `next start` (HTTP, dev sessions) | **passed**, 19 txs, 146 s |
| root `pnpm typecheck` / `pnpm lint` / `pnpm test` | clean / clean / 607 passed, 21 skipped (live files gated) |

Measured two-phase `request_spend` (instant, $40-$84): first answer **2.7-3.1 s** (`final: false`), final payout **7.2-8.4 s**
(live test ×3, E2E: 2,845 ms / 7,492 ms over HTTP).

## Bugs found and fixed (each with a test)

1. **RPC tx errors lost their detail → InvalidNonce was never retried.** nearcore answers an invalid tx with `cause: {name:
   INVALID_TRANSACTION, info: {}}` and the detail in `data`; `classifyBodyError` kept `cause.info` (empty), so the submitter's
   `isNonceError` never matched and a stale/shared key nonce surfaced as `500 internal` (seen live: a seed contribution and a
   frontend dev login failed while a live test used the same key pool). Fix: `server/chain/rpc.ts` merges `data` into `info`;
   `submitter.ts` re-signs up to 3 times, above the error's `ak_nonce`. Tests: `chain.test.ts` (real error shape; repeated
   InvalidNonce → 3 re-signs past ak_nonce; a 4th surfaces).
2. **B-05 / contracts D7: no `sync` after a failed `retry_payout`.** The hub's `retried: true` is optimistic; a server retry (after a
   contribution) or a relayed R9 retry whose payout failed again left the hub at `approved`. Fix: `classify.ts`
   `retryPayoutFailed()` (token `ft_transfer` from the DAO failed, or a DAO receipt failed); `followUps` syncs after a relayed R9
   retry, `serverHubCall` after a server retry. Tests: 3 in `pipeline.test.ts`; live: the hub test forces a real payout failure
   (payee `storage_unregister`), sees the R9 retry fail (`RECEIVER_NOT_REGISTERED`), the follow-up `sync`, then the contribution-
   triggered server retry pay.
3. **The early `request_spend` answer could not meet ≤ 4 s (P-5a).** The probe waited for the proposal id, which the hub records 6
   blocks after inclusion (decision +1.2 s, proposal id +3.7 s, payout +5.0 s; per-receipt timing of tx `6xLFCZr6…`), so the first
   answer came at 5.2 s. Fix: for the **instant** path, answer at the hub's decision (record `checking` onwards, `proposalId: null`
   until known); the vote path still waits for the proposal id (the requester's own vote needs it). One RPC per poll, every 300 ms,
   from the request count read in the chain checks. Tests: 2 in `pipeline.test.ts`; live ≤ 4 s.
4. **`route()` swallowed Next's control-flow errors.** Under Cache Components `next build` prerenders GET handlers; reading
   `request.headers` throws Next's bail-out error, which `route()` caught, logged as `internal` (dev DB `error_log`: "Route
   /api/demo/state needs to bail out of prerendering…") and answered as a 500. Fix: `unstable_rethrow(e)` first. Now `/api/health`
   and `/api/demo/state` build as `ƒ` and answer 200. Tests: `routes.test.ts` (notFound rethrown; app errors still JSON).

## New code

- `server/features/seed.ts`: `seedDemoPot` (api-spec §5.2 steps 1-8, kinds reference/pool/shared, resumable from chain state),
  `seedPlan`, `seedInvite` (HMAC-derived invite seed, never stored), `treasuryTransfer`, `demoPotRows`.
- `server/features/demo.ts`: `personaRelay` (persona delegate signed with `DEMO_PERSONA_KEY` under the `demo_signer:{account}` lease,
  then the pipeline from step 4), shared by `demoRelay` and the seeder; `ensurePersonaUser` exported.
- `server/live/harness.ts` + `hub.live.test.ts` + `demo.live.test.ts` (gated by `LIVE_TESTNET=1` and the preview key files).
- Root `scripts/` (see notes/deploy.md): deploy, keys, env, seed-demo, invite, e2e-chain.

## Deviations (wave 2)

- **Early answer semantics (fix 3):** an instant early answer means "the Pot rules approved it"; the hub's post-checks (DAO balance,
  payee registration, DAO group, hub balance) can still refuse it, and the final body says so (`final: true`, `REFUSED_*`). The client
  must keep polling `GET /api/relay/[id]` after a `final: false` answer, as before. `proposalId` may be `null` in that answer.
- **Preview quotas** are raised for local runs through `QUOTA_*` in `.env.local` (pots/day, dev accounts per IP, faucet $ per IP).
- The reference personas keep their key on preview (step 9 is prod C-13).

## Still open

- Relayer `relay_yocto`/`hub_yocto` defaults are preview-sized; watch them when Playwright and live tests share a day.
- `logError` writes through `getDb()`, so errors inside live tests (own schema) land in the dev DB's `error_log` (or nowhere).

---

# Wave 3: backend hardening (frontend requests, B-11, B-12, X-06, B-19-lite)

> Written 2026-10-22 by the backend-hardening engineer. Testnet only, every chain-touching run under `scripts/with-testnet-lock.sh`.
> Deploy, keys, funding and env: notes/deploy.md (wave 3 sections).

## Status (actual output, end of wave)

| Check | Result |
|---|---|
| `pnpm typecheck` / `pnpm lint` (root) / `pnpm exec tsc -p scripts` | clean / clean (`lint-copy: 752 strings, 0 banned words`) / clean |
| `pnpm --filter web test` | `Test Files 34 passed \| 3 skipped (37)` · `Tests 628 passed \| 13 skipped (641)` (backend: +56 tests this wave) |
| live suite `LIVE_TESTNET=1 pnpm exec vitest run server/live` (lock) | `Test Files 3 passed (3)` · `Tests 13 passed (13)` · 199 s, on the new `*_LIVE` key pools |
| `scripts/run e2e-chain` against `next start` (lock) | `E2E PASSED in 132 s (19 txs)`; two-phase instant: first answer 2,765 ms, final 7,899 ms |
| B-12 `scripts/run demo-pool` (lock) | shared `lisbon-20261022` + 2 pool Pots in 156 s; later 3 more in 150 s; pool back at 3 ready |
| B-19-lite `scripts/run load-demo` (lock) | 30 spends, 24 paid, **0 5xx**, 6 × 429 `rate_limited` (burst trip, wanted); numbers below |
| B-11 `GET /api/cron/reconcile` on `next start` (lock) | `200` in 36.7 s, `errors: []`; relays `{checked 17, completed 15, lost 1, serverFailed 1}` (the rows a broken load-test build left `signed` were classified from chain), 23 Pots scanned, balances ok, no cap alerts, shared Pot kept, pool resumed `lisbon-c7vg` → 3 ready; `401` without the secret |

## Frontend requests (notes/frontend.md "Requests to backend")

| # | Request | Done |
|---|---|---|
| 1 | first delegate of a brand-new key rejected (`nonce ≥ final_head × 10⁶`) | `pipeline.ts` bounds the nonce by `max(final head, the optimistic access-key read's block) + 2` (× 10⁶); the runtime checks against the executing block. Test: a key added at optimistic H passes with final 3 blocks behind; beyond +2 still `too_large` |
| 2 | lost broadcasts `pending` forever | `server/relay/reconcile.ts`: once the **final** head is past the delegate's `max_block_height` and the sender's key nonce is still below the delegate's, nothing ran and nothing can → row `failed`, response **409 `expired` with `detail.cause: "lost_broadcast"`**, yocto pre-charge given back (once). `GET /api/relay/[id]` runs it (also on `validated` rows older than 30 s: a crash before broadcast); the cron runs it over every stale row (`reconcileStaleRelays`; landed ones are classified, stale server-signed rows failed). Nonce moved but hash unknown = `ambiguous`, left pending. Tests: 3 in `pipeline.test.ts` |
| 3 | feed `profiles` only for actors on the page | every member from `hub.get_members` is added (`feed.ts`); test |
| 4 | split the relayer key pool | `RELAYER_KEYS_LIVE` / `TREASURY_KEYS_LIVE` (4 + 2 new keys, on chain) used only by `server/live` (sliced per file); servers keep `RELAYER_KEYS` / `TREASURY_KEYS`. `scripts/run keys init-live` |
| 5 | pool refill | B-12 below |
| 6 | prerender error logs on `/api/demo/state`, `/api/health` | already fixed in wave 2 (`unstable_rethrow` in `route()`); verified this wave: `next build` log has no error/bail-out line and `error_log` has no row after 23:25 UTC (the last ones predate the fix) |
| 7 | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | in `.env.local` with the dev pair (frontend builds read it at build time) |
| 8 | push `data.proposalId` for close/rules | approval pushes carry `data: {type, url, pot, proposalId, subject: "spend"\|"close"\|"rules"}` and `navigate /p/<slug>?r=<id>`; `rules_change_proposed` now notifies (title = `rules.change.pending`) |
| 9 | feed `rule_change` / `close_requested` with `proposalId` + asker | already mapped; fixed the `rules_changed` actor (`by` is a mode string there, the member is `actor`); test over `applyHubEvents` → feed |
| 10 | R11 rules votes | already allowed (FunctionCall kinds at exactly 300 Tgas, `get_proposal_subject.live`, `sync` after every relayed vote); 2 policy rows added for a `set_rules` kind |

## B-11 ops

- `server/ops/balances.ts`: `checkBalances` (relayer `relayer_low`/`relayer_critical`, hub `hub_low` below `HUB_WARN_NEAR`, treasury
  `treasury_low` below $100k), `checkGlobalCaps` (every `global` daily counter; ≥ 80 % → `global_cap_near:<counter>`, `hub_yocto` →
  `hub_budget`), `hubAllowsCreate` (the pipeline refuses `create_pot` with 503 `sponsor_low` `{account: hub}` below `HUB_FLOOR_NEAR`) and
  `treasuryAllowsFaucet` (faucet 503 `treasury` below $1,000). Alerts dedupe 1/hour/key (`alert_state`), webhook or `level: alert` log.
- New global cap `global_topup_yocto` (2 NEAR prod / 0.5 preview) for DAO float top-ups.
- `GET /api/cron/reconcile` (`server/ops/reconcile.ts`, Bearer `CRON_SECRET`, `maxDuration 300`, lease `cron:reconcile` 15 min, every
  step time-boxed and logged): stale relays → lost/landed (above); open Pots (≤ 14 days of activity): expired vote requests → `sync`
  (→ the "expired" push), `payout_failed` → `retry_payout` when the DAO's USDC covers it (≤ 3/proposal/UTC day, shared with Finalize),
  missed "needs your approval" pushes re-sent (deduped); balances + caps; DAO float top-ups (demo/reference Pots only, ≤ 2 per DAO
  lifetime, lease `topup:{dao}`); demo (retire leases, shared Pot, refill with the budget left); retention (`server/ops/retention.ts`,
  data-model §4, batches of 5,000; `deposit_intent` left to the 1Click owner). A-17: running it twice has no double effects (tested).
- `apps/web/vercel.json`: `0 4 * * *` reconcile, `30 4 * * *` demo-pool. Not deployed.
- Not done: `hub_key_used` (FastNEAR Tx API scan of hub-signed txs since the last deploy) — needs `RELEASES.md`; noted for B-11 prod.

## B-12 demo pool

Not a Vercel Workflow: `workflow` 5.2.3 needs `withWorkflow(nextConfig)` (next.config is platform-owned) and a deployed world, and this
phase deploys nothing. Instead `server/features/demoPool.ts` (`refillDemoPool`, `ensureSharedPot`, `retireExpiredLeases`) runs from
`GET /api/cron/demo-pool` (its own 300 s budget), from the reconcile cron, from `scripts/run demo-pool`, and from `POST /api/demo/session`:
when a new lease leaves fewer than 3 ready, its `after()` fires the cron route (`kickDemoPool`, Bearer `CRON_SECRET`, abandoned after 3 s)
so the seed runs in its own invocation. Single-flight lease `refill_demo_pool` (10 min); ≤ 3 seeds per run; a seed only starts with
≥ 100 s of budget left; unfinished seeds are resumed first (`seedDemoPot` is resumable; seen live: `lisbon-j4b5` resumed from step 3
after its server was killed); a seed failing for > 1 h is marked `failed`; each seed pre-charges the persona onboarding (0.026 NEAR) to
`global/demo_yocto` and stops when the budget can't take a whole seed (≈ 0.12 NEAR). Shared Pot: `lisbon-<yyyymmdd>` once per UTC day,
`-<n>` reseed below $300 or not open, older shared rows retired. Expired pool leases retire and their demo push rows are deleted.

## X-06 notifications

- `POST/DELETE /api/push/subscription` (`server/notify/subscriptions.ts`): session with an active device (`device_not_registered`
  otherwise); demo only with `FLAG_DEMO_PUSH=true` on a **pool** lease (row keeps `demo_pot_id`); SSRF host allowlist (https only, no
  port/userinfo; `fcm.googleapis.com`, `*.push.apple.com`, `updates.push.services.mozilla.com`, `push.services.mozilla.com`,
  `*.notify.windows.com`) → `args_invalid`; `p256dh` 87 / `auth` 22 base64url; upsert by endpoint (moves users), ≤ 10 per user.
- `server/notify/payload.ts`: Declarative Web Push JSON (`web_push: 8030`, title, absolute `navigate`, `tag` = topic, `app_badge` in both
  places for approval/resolution only), ≤ 2,500 B enforced (body, then data, then title shortened). `topic()` = `r` + 20 base64url.
- `server/notify/webpush.ts`: `web-push` 3.6.7 encrypts (aes128gcm); sent with `fetch` (10 s timeout); VAPID header cached per push
  origin for 1 h; `getPushSender()` is null without the VAPID env (push off).
- `server/notify/notify.ts`: `notify()` fan-out (recipients per api-spec §6.1, `notification_log` claim-before-send dedupe, 25 at a
  time; 404/410 delete, 429 one retry after `Retry-After` ≤ 5 s, 5xx/network ≤ 2 jittered retries, 403 alert `push_vapid`), and
  `notifyFromEvents()` mapping trusted hub events: `contribution` → **money arrived** (members − contributor), `spend_requested`
  (vote) / `close_proposed` / `rules_change_proposed` → **needs your approval** (members − asker − voters), `proposal_synced`
  approved/rejected/expired (spend) → **approved** / not approved / expired (requester; amount from the hub's request record),
  `pot_closed` → **Pot closed** (every payee). Copy from `en.json` `notif.*`; no balances, account ids or hashes (tests assert it).
- Wired in `after()`: `followUps` (every relay outcome) and `serverHubCall` (the server's `sync`/`retry_payout` txs); `RelayDeps.push`.
- Tests: `server/notify/notify.test.ts` (15: payload, allowlist, storage rules, fan-out, event mapping) incl. the **integration test**: a
  local HTTP push service receives the real encrypted request, checks TTL/Urgency/Topic/`aes128gcm`/`vapid t=…, k=…`, decrypts it with
  the subscriber's keys (`http_ece`) and reads the payload; 410 deletes; 429 → one retry. Plus `pipeline.test.ts`: a contribution's
  `after()` pushes to the other member only, nothing inside the response.
- `en.json` (shared; minimal additive): `notif.close.body_plain`, `notif.closed.body_plain` (lock-screen-safe bodies without the refund).

## B-19-lite load test (10 concurrent demo sessions, instant spends, one pool Pot)

`scripts/run load-demo` (one visitor, 10 persona-switch sessions round-robin over maya/sam/leo; wave 1 = 10 spends at once, wave 2 = 20
at once) against `next start` whose `SERVER_RPC_URLS` starts with `scripts/rpc-429-stub.mjs` (answers 429 to everything).

What broke and was fixed:
1. **Relayer key contention → 503 `relayer_busy`** (run 1: 2 of 10). A key was leased until `EXECUTED_OPTIMISTIC` (≈ 8 s for a spend with
   its payout) while the early answer frees the next request at ≈ 3 s: 4 keys ≈ 0.5 tx/s. Now the submitter sends with
   `wait_until: INCLUDED`, records `lease.meta.lastNonce`, **releases the key**, then waits for the outcome with `tx` status (api-spec §3.3
   "upgrade path"); the next holder signs above `lastNonce` (a lagging node can't make it reuse a nonce). The real `INCLUDED` answer carries
   a *partial* tree (receipts `"Started"`), so only `final_execution_status ∈ {EXECUTED_OPTIMISTIC, EXECUTED, FINAL}` counts as an outcome
   (`isExecuted`, also in `txStatus`). Tests in `chain.test.ts`.
2. **Persona signer contention → 409 `nonce_pending`** (run 1: 4 of 10, wave 2: 16 of 20). The `demo_signer:{account}` lease waited 3 s.
   Now delegates for one persona queue up to 25 s, the lease is freed as soon as the chain shows the delegate's nonce (not when the relay
   returns), and the next delegate signs above the lease's `lastNonce` (run 2 showed `nonce_used` from a lagging RPC node without it).
3. Quotas worked as designed and got in the way of measuring: the per-IP-net `spend` family (30/day; every run is one IP) and the
   preview `global/demo_yocto` budget (1 NEAR/day, used up by seeding) — the measured run used `QUOTA_USER_SPEND=400` on the test server
   and `QUOTA_GLOBAL_DEMO_YOCTO=3 NEAR` (prod value) in `.env.local`.

Final run (after the fixes; 10 sessions, $3 instant spends):

| | n | p50 | p95 | max |
|---|---|---|---|---|
| demo session (persona switch) | 10 | 61 ms | 65 ms | 65 ms |
| wave 1 first answer (`final: false`) | 10 | 5,196 ms | 10,862 ms | 10,862 ms |
| wave 1 final (payout sent) | 10 | 10,555 ms | 15,826 ms | 15,826 ms |
| wave 2 first answer (14 admitted, 6 × 429 `rate_limited`) | 14 | 8,341 ms | 21,388 ms | 21,388 ms |
| wave 2 final | 14 | 13,278 ms | 25,916 ms | 25,916 ms |
| relayer key lease wait + sign | 24 | 81 ms | 105 ms | 111 ms |

0 × 5xx, 0 × `relayer_busy`, all 24 admitted spends paid; 881 server RPC calls hit the 429 stub and failed over with no visible error.
The tail is the per-persona queue (10 sessions share 3 personas; a persona signs one delegate per ≈ 1.5-3 s); an uncontended spend is
2.8-3.1 s first answer / 7.9-8.4 s final (e2e-chain, live suite). 10 *different* judges each lease their own Pot and don't queue.

## Deviations (wave 3)

- Cron follow-ups are keyed per run (`cron:<date>:<run id>`), not per day: a later run re-reads the chain, so a synced expiry is no
  longer open, and payout retries stay bounded by the ≤ 3/proposal/day quota.
- `rules_change_proposed` pushes reuse `rules.change.pending` + `notif.close.body_plain` (no `notif.rules.*` keys in ux-spec yet).
- Demo-push subscriptions need `FLAG_DEMO_PUSH=true` (off by default; R-15 decision at G4).
- 1Click `deposit_intent` retention and the `deposit_status` push are left to the integrations owner (`watchDeposit`).


---

# Comments on requests (2026-11-01)

- **Table** `request_comment` (**migration `db/migrations/0003_request_comment.sql`**, drizzle-kit generated, journal +
  snapshot): `id` bigserial, `pot_id` → pot, `request_id` (hub request id), `author_account`, `body`, `client_key`,
  `created_at`, `deleted_at`; index (pot, request, created_at); unique (author, client_key) where set; CHECK
  `request_comment_body_ck` (live: 1-280 chars; removed: `body = ''`). Off-chain only, no transactions.
  **Apply it to the local `pot` DB (and preview/prod) before running a build with this code**:
  `DATABASE_URL_UNPOOLED=postgres://pot:pot@localhost:54329/pot pnpm --filter web exec drizzle-kit migrate`. Without it
  the comment routes 500; the feed route survives (its `commentCounts` is caught and logged).
- **Routes** (`app/api/pots/[pot]/requests/[id]/comments/route.ts`, `…/comments/[commentId]/route.ts`; logic in
  `server/features/comments.ts`): `GET` (session; the last 200, oldest first, `profiles` for the authors), `POST`
  `{body, idempotencyKey?}` (CSRF/Origin, strict zod `commentPostReq`, active device; 201, a replay 200 `replayed`,
  another body under the same key 409 `idempotency_conflict`; the request must exist on the hub → else 404), `DELETE`
  (author only; someone else's or a missing one → 404 `not_found`; soft + idempotent). Every call checks membership
  with `isMember` (hub `get_members`, active only), like notes and the feed's member fields → 403 `not_a_member`.
  Text: `cleanComment` (`lib/comment-text.ts`): NFC, CRLF → LF, tabs → space, trailing spaces cut, ≤ 1 blank line,
  trimmed, 1-280 code points, no Cc but `\n`, no Cf but ZWJ/VS16 → 400 `bad_request {field: body, why}`. No HTML
  handling: stored verbatim, React escapes it. Quotas: `user_comment_burst` 10/min (→ 429 `rate_limited` +
  `retryAfterMs`) and `user_comments` 200/day (→ 429 `quota_exceeded {family: comments}`).
- **Feed:** members get `commentCounts` (request id → comments not removed). SDK types: `RequestComment`,
  `CommentsRes` (`hubRequestId`: `requestId` is the envelope's), `CommentPostReq/Res`, `CommentDeleteRes`,
  `FeedRes.commentCounts`, `QuotaFamily "comments"`, `NotificationType "comment"`, three `ApiRoutes` rows.
- **Push** (`notifyComment` in `server/notify/notify.ts`, in `after()` from the POST route, only with VAPID set): the
  requester gets "{name} commented on your request", earlier commenters "{name} also commented on {requester}'s
  request"; never the author, only active members (fresh `get_members`), only people with a push subscription (the
  existing preference: push on/off); body "{amount} for {reason} · {potName}" (never the comment text);
  `navigate /p/<slug>?r=<requestId>` with no `proposalId` (the SW leaves `?r=` alone); topic per request; deduped
  per comment and audience in `notification_log`.
- Tests: `server/features/comments.test.ts` (22: members only incl. joining, validation, delete-own-only + the DB
  CHECK, idempotency, burst/daily quotas, feed counts, onPosted recipients, push fan-out, route gates).


---

# Snap the receipt: POST /api/receipts/read (2026-11-01)

- **Route:** `app/api/receipts/read/route.ts`. Logic is in `server/features/receipts/{read,nearai}.ts`; the shared
  parse and normalize code is in `lib/receipt.ts`.
- **Request order:**
  1. `checkCsrf` (same-origin JSON)
  2. Feature off → 404 `not_found {cause: receipts_off}`
  3. `requireSession`, before any body is read
  4. The body is read as a **stream with a 2 MB cap** (413 `bad_request {field: body, cause: too_large}`), then the
     strict zod `{pot, mime: jpeg|png|webp, image: base64}`
  5. `resolvePotId` + `isMember` (hub `get_members`) → 403 `not_a_member`
  6. Quotas in one transaction: `user_receipt_burst` 5/min → 429 `rate_limited`; `user_receipts` 30/day → 429
     `quota_exceeded {family: receipts}`; `global_receipts` 2,000/day (prod) / 300 (preview) → 503
     `{cause: global_cap}`
  7. base64 + magic bytes + ≤ 1.5 MB decoded
  8. The reader
- **Errors:** provider timeout → 504 `service_unavailable {cause: receipts_timeout}`; 429/503 → 503
  `receipts_busy` (+ `retryAfterMs`); auth/other → 502 `receipts_provider`. An unreadable photo is a 200 with
  `result: {readable: false}`. `maxDuration` 35. No new sdk reasons: `detail.cause` carries the specifics, and
  `QuotaFamily` "receipts" isn't in the sdk union, because the sdk is another agent's area.
- **D-61 (no uploads):** the photo exists only in the request's memory. It is not in the DB, logs or disk.
  `ReceiptProviderError` messages carry the kind and status only. A test searches every text/json/bytea column of the
  test schema and every console line for the photo after successful, failed and crashing reads, and finds nothing.
  The note that travels with the request is merchant + day only. No image hash goes in the note: it's public, and it
  proves nothing to members who never see the photo.
- **Provider (verified 2026-11-01, no key on this machine):**
  - NEAR AI Cloud `https://cloud-api.near.ai/v1`, OpenAI-compatible, `Authorization: Bearer`.
  - Model `Qwen/Qwen3-VL-30B-A3B-Instruct`: `GET /v1/models` lists `owned_by nearai`, text+image,
    `structured_outputs`, 16k context, $0.15 / $0.55 per M tokens.
  - `GET /v1/attestation/report?model=…` answered without a key: `model_attestations` with `intel_quote`,
    `nvidia_payload`, ECDSA `signing_address`.
  - The request: `response_format: json_schema` (strict, `RECEIPT_JSON_SCHEMA`), the photo as an `image_url` data
    URL, `temperature 0`, `x-no-aliasing: true`, `accept-encoding: identity`.
  - **Proof:** after the completion, `GET /v1/signature/{id}?model=&signing_algo=ecdsa` is retried on 404 with a
    2.5 s budget. It is accepted only when `signature_kind` is `provider_tee` and the signed text equals
    `<model>:<sha256(our exact request bytes)>:<sha256(response bytes)>`. Then the response's `proof.verifyUrl` is
    `https://cloud.near.ai/verify?model=…#receipt=<base64url JSON>` (the Verification Center's reply receipt;
    fragment only) and `reply: true`. Otherwise it is the model-only link.
  - We don't verify the ECDSA signature or the quote ourselves: the Verification Center does that in the person's
    browser.
- **Env:**
  - `NEAR_AI_API_KEY` (server only; Vercel Sensitive)
  - `NEAR_AI_BASE_URL`, `NEAR_AI_RECEIPT_MODEL`, `NEAR_AI_RECEIPT_TIMEOUT_MS` (default 25 s)
  - `NEAR_AI_RECEIPTS_MODE=mock|off`: mock is the deterministic sample, refused on production
  - `LIVE_NEARAI`
  - All are in the root `.env.example`.
- **`GET /api/health`:** `features.receipts` is true with a key or with MOCK mode.
- **Tests:**
  - `server/features/receipts/nearai.test.ts` (21): mocked fetch for the request shape, the status → kind table,
    the timeout and abort, junk model output, and the proof binding (wrong bytes, a gateway signature or a broken
    body give a model-only link; 404 then OK).
  - `server/features/receipts/read.test.ts` (11, pot_test): readReceipt, image checks, the body cap, route gates +
    the MOCK end to end, quotas, the D-61 scan.
  - `nearai.live.test.ts`: opt-in with `LIVE_NEARAI=1` + a key. It reads `e2e/fixtures/receipts/receipt-pingo-doce.jpg`
    and expects $84.20 USD groceries. Not run: no key.

### 2026-11-01: receipt model switched to `z-ai/glm-5.3-flash`
- The first live run with the real key: `Qwen/Qwen3-VL-30B-A3B-Instruct` never answered (even a 5-token text prompt hung for 90 s), while the
  key worked on other models. Two other NEAR-hosted (`owned_by nearai`) image models answered in < 1 s.
- Live fixture read (`nearai.live.test.ts`): `z-ai/glm-5.3-flash` 6.0 s, `Qwen/Qwen3.8-27B` 15.7 s; both returned $84.20, Pingo Doce,
  groceries, 7 items, tax $4.82. The per-reply proof came back (`proof.reply: true`), so the "Check it yourself" link carries the receipt.
- Default is now `z-ai/glm-5.3-flash` (`NEAR_AI_DEFAULT_RECEIPT_MODEL`); override with `NEAR_AI_RECEIPT_MODEL`.

### 2026-11-01: receipts in another currency are converted (`server/features/fx.ts`)
- **What:** `POST /api/receipts/read` now also returns `fx` (`lib/receipt.ts` `ReceiptFx`): for a readable receipt
  with a total in a known currency other than USD, `{ok: true, from, amountCents, usdCents, rate, rateDate, source}`
  (`source`: `ecb` | `er` | `sample`), or `{ok: false, from, why: "unavailable" | "unsupported"}`. `null` for dollars,
  no currency, no total or unreadable (and from older servers; the client's `fxOf` checks the shape). The reading is
  never failed by the rate: a throwing converter gives `fx: null`.
- **Sources (verified 2026-11-01 with curl):**
  1. Frankfurter (ECB reference rates), `GET https://api.frankfurter.dev/v1/latest` →
     `{"amount":1.0,"base":"EUR","date":"2026-10-30","rates":{"USD":1.1172,…}}`, ~30 currencies, working days only.
     `api.frankfurter.app/latest` now 301s to it, so we call `.dev/v1` directly. One request gives every currency:
     dollars per X = `rates.USD / rates[X]` (EUR itself = `rates.USD`).
  2. Fallback, open.er-api.com (ExchangeRate-API's open endpoint), `GET https://open.er-api.com/v6/latest/USD` →
     `{"result":"success","base_code":"USD","time_last_update_unix":…,"rates":{…}}`, ~160 currencies, daily. Dollars
     per X = `1 / rates[X]`; the date is the UTC day of `time_last_update_unix`. Its terms ask for attribution: the
     sheet's source line says "Rate from exchangerate-api.com".
  - The ECB table is tried first; a currency it doesn't publish (or an ECB failure) goes to the fallback. Neither
    reachable → `unavailable`; reachable but no rate → `unsupported`.
- **Cache / limits:** one table per source in memory (per warm instance): 1 h on success, 1 min on failure (so a dead
  source can't add 3 s to every reading); one fetch in flight; `AbortSignal.timeout(3 s)` per fetch. No DB cache
  (two GETs an hour per instance is nothing; a cold instance pays ≤ ~50 ms). Failures log `fx_source_failed`
  (`source`, `why`: http status / shape / timeout / network), never a body.
- **Maths:** the rate is rounded to 6 significant digits and that same rate is shown and used; `usdCents` =
  cents × rate, **half up**, done in BigInt from the rate's decimal digits (`convertCents`), so 100 × 1.005 = 101,
  not the float's 100.4999…. A result over the keypad's $999,999.99 is `unsupported`.
- **Mode:** `POT_FX_MODE=live|mock|off`; unset = `mock` when the receipts reader is the mock, else `live`; `mock` is
  refused on production (falls back to live). Mock = `MOCK_USD_RATES` (EUR 1.0852, GBP, CHF, JPY, BRL, CAD) dated today,
  `source: "sample"`; the browser's mock reader uses the same table (`mockFx`) plus the fault hook
  `pot.mock.fail = receipt_rate` (no rate). Documented in the root `.env.example` (+ `LIVE_FX`).
- **Tests:** `server/features/fx.test.ts` (14, mocked fetch: ECB success, cross rates, half-up, the hour's cache and
  one fetch in flight, fallback on 503 / bad shape / network, a currency only the fallback has, both fail + the
  1-minute failure cache, unsupported, the 3 s timeout, USD / no currency / no total / unreadable pass through, parser
  shape checks, mock, off, mode); `read.test.ts` +2 (converted reading through `readReceipt`; no converter or a
  throwing one still returns the reading); `lib/receipt.test.ts` +3; `lib/client/receipts/read.test.ts` +2 (`fxOf`,
  mock rate + `receipt_rate` hook). Opt-in `server/features/fx.live.test.ts` (`LIVE_FX=1`), run once on 2026-11-01:
  ECB EUR→USD **1.1172** dated **2026-10-30** (a Friday; Nov 1 is a Sunday) → €42.50 ≈ **$47.48**; fallback 1.11662
  dated 2026-11-01 (€42.50 ≈ $47.46), AED 0.272294.

### 2026-11-02: receipt details saved with a spend, with a fingerprint on the request (no contract change)
- **What is saved (never the photo, D-61):** `lib/receipt-saved.ts` `SavedReceipt` v1 = what the person kept from
  "Scan receipt": `merchant`, `date`, `currency`, `totalCents`, `taxCents`, `tipCents`, `items[{name, qty, amountCents}]`,
  `fx` (`from`, `amountCents`, `usdCents`, `rate` as its shown decimal string, `rateDate`, `source`) or null, `proof`
  (`verifyUrl` incl. the `#receipt=` fragment, `reply`, `model`) or null, `source` (`near-ai` | `mock`), `readAt` (ISO
  ms) and a random 128-bit `nonce`. Strict zod (`savedReceiptSchema`, no extra keys) + `validateSavedReceipt` (strings
  must already be `cleanLine`d, real days not in the future, the conversion's arithmetic = `convertCents`, `rate` =
  `formatRate`, the proof link = `https://cloud.near.ai/verify?model=<model>[#receipt=<b64url>]` ≤ 4 KB, `readAt` within
  30 days, canonical form ≤ 16 KB). Same checks in the server, the mock world and the tests.
- **The fingerprint, on chain:** `canonicalJson` (keys sorted at every level, no whitespace, nulls kept, integer cents,
  the rate as a string) → SHA-256 → the first **16 hex chars** are appended to the spend's **`request_ref`**:
  `request_ref = <16-char OpKey><16 hex>` = **32 chars**, exactly the hub's `valid_request_ref` limit (8-32
  `[a-z0-9]`), so **no contract change**. The hub keeps it on the request (`get_requests` / `get_record` `request_ref`),
  in the DAO proposal's description (`Pot request #N: <category> (ref <32 chars>)`, also for instant spends, whose
  proposal the hub creates and approves) and in the `spend_requested` event. Anyone can read it there; the `nonce` stops
  the public fingerprint from confirming a guess of what was bought. `@pot/sdk`: `spendRef`, `opKeyOfRef`,
  `receiptFingerprintOfRef`, `isSpendRef`, `RECEIPT_FP_HEX` (validate.ts); the relay's idempotency key stays the OpKey
  (`opKeyOfRef`, in the sdk signer and `lib/client/live/signing.ts`, `near-connect/wallet.ts`).
- **Accepting the longer ref:** `SPEND_REF_RE` (`server/util/ids.ts`) in relay R3 (`request_ref`), the relay body's
  `requestRef` (`signedRelayReq`), and notes (`memo` / `link_label` stay keyed by the full on-chain ref); the sdk's
  `MockChain` too. A 16-char ref works as before. +16 bytes per request on the hub (its own request budget) and +16 in
  the proposal description (the hub's prepay is computed from the description's length).
- **Table** `spend_receipt` (migration **`0004_spend_receipt.sql`**, additive): PK (`pot_id`, `request_id`),
  `requester_account`, `data` jsonb, `fingerprint` (full SHA-256 hex, CHECK `^[0-9a-f]{64}$`), `created_at`, CHECK
  `octet_length(data::text) <= 20000`, FK `pot`.
- **Routes** `app/api/pots/[pot]/requests/[id]/receipt/route.ts` (`server/features/receipts/saved.ts`):
  - `POST` `{receipt}` (strict; body read as a stream, ≤ 24 KB): signed in with an active device, CSRF, a member
    (hub.get_members), the request exists (hub.get_requests; 404 `not_found` field `id` while the view lags, the client
    retries 1.5/3/5 s), **only its requester** (403 `action_not_allowed` `not_requester`), the request carries a
    fingerprint (422 `payload_mismatch` `no_fingerprint`) and the server's SHA-256 starts with it (422
    `payload_mismatch` `receipt_mismatch`), **once** (the same details replay 200; others 409 `idempotency_conflict`
    `already_saved`). Quotas `user_receipt_save_burst` 10/min, `user_receipt_saves` 60/day. 201 → `SpendReceiptRes`.
  - `GET`: members only → `{pot, hubRequestId, receipt, fingerprint, savedAt}`; 404 field `receipt` when none.
  - The feed adds **`receipts: string[]`** (hub request ids with saved details) for **everyone** (it only says one is
    attached: the public record's "Receipt attached"); never fails the feed. `Api.FeedRes.receipts` in the sdk.
- **Client two-phase** (`lib/client/actions.ts` requestSpend + `lib/client/receipts/saved.ts`): the details are fixed
  before sending (the sheet keeps `readAt` + `nonce` with the reading, `keptReceipt`), kept on the device in
  `localStorage['pot.receipts.pending.v1']` keyed by Pot + fingerprint, the request goes out with `spendRef(OpKey, fp)`,
  then `attachReceipt(slug, id)` posts them once the id is known (an instant spend's id comes from the relay's answer).
  A failure keeps them pending (toast "…weren't saved yet. Open the spend to try again.") and the details sheet retries;
  permanent errors (mismatch, not mine, bad body, not a member) drop them. Pay-by-link spends carry them the same way.
- **Tests:** `server/features/receipts/saved.test.ts` (20, private DB `pot_details`): save once/replay/key order, edits →
  `receipt_mismatch`, `no_fingerprint`, `not_requester`, `idempotency_conflict`, outsiders / unknown Pot / bad ids /
  missing request, 10 bad bodies (an image field, floats, control chars, 31 items, Feb 30, wrong arithmetic, a foreign
  proof link, a future reading…), the `{receipt}`-only body, burst + daily quotas, members read / visitors refused, the
  feed's public `receipts`. `lib/receipt-saved.test.ts` (35: canonical form, a pinned SHA-256 computed independently with
  node:crypto, stability across key orders, the 32-char ref, 25 refusals, size). `server/relay/policy.test.ts` +3 (R3 with
  a fingerprint; not hex; too short). `packages/pot-sdk/src/encoding.test.ts` +1.
- **Needs a testnet run (human OK):** `e2e/testnet/spend-details.testnet.ts` (written, not run; header has the command:
  private DB with 0004, `NEAR_AI_RECEIPTS_MODE=mock`). Apply **0004** to the local `pot` DB (and preview/prod Neon) before
  deploying this web build.

---

# Privacy audit 2026-11-02

**Rule:** anything that is not on the public ledger is visible to that Pot's **active members only**. On-ledger data
(amounts, times, member accounts, rules, the Pot's name and emoji, the spend's category, votes, request refs) is public
anyway. Membership is checked **on the server** on every call with `isMember` / `hub.get_members` (status `active`;
`joining` isn't in yet). There is no "leave" method in hub 1.1.0, so "left" means "no longer in `get_members`". The
hub reader caches `get_members` for 10 s per instance, so someone who leaves loses access within about 10 s. Every
failure to read the members fails closed: the reader is treated as not a member, or gets no names.

## What exists and who reads it

| Off-chain datum (table) | Where it's exposed | Who could read it before | Who reads it now |
|---|---|---|---|
| Display names (`app_user.display_name`) | feed `profiles` | members | members |
| | comments `profiles` | members | members |
| | `/api/me/activity` `profiles` | **the person, for every Pot they were ever in** | **the person, only for Pots they're still in** (fixed) |
| | `/j` invite landing | **link holders with an active `?i=`: every member's name and picture** | **link holders with an active `?i=`: the inviter's name only** (fixed) |
| | `/j` OG image | **anyone with the slug: initials of every member's chosen name** | **anyone: plain seats in join colours, no initials** (fixed) |
| | `/c` claim page, its OG image and metadata | anyone with the link's address: the requester's name while the link is open (`redact` hides it after) | unchanged (kept; see the open questions) |
| | push bodies | active members (recipients come from fresh `get_members`); the requester, payees at close | unchanged |
| | own session (`GET /api/session`, `pot_hint` cookie) | the person | the person |
| Chosen avatars (`app_user.avatar`) | feed / comments `profiles` | members | members |
| | `/j` landing | **active-invite holders** | nobody outside the Pot (fixed) |
| | mock `/p/<slug>/record` | **visitors (mock only)** | members (fixed: `visitorRow`) |
| Emails (`app_user.email`) | `emailHint` (masked) in your own session only | the person | the person (never in any Pot response; asserted by the tests) |
| Spend notes (`note` memo) | feed `memos` → the Pot, record, details sheet | members | members |
| | mock record | **visitors (mock only)** | members (fixed) |
| Decline reasons (`note` decline_reason) | feed `declineReasons` | members | members |
| "Send by link" labels (`note` link_label; called payment-link labels before 2026-11-03) | feed `linkLabels` | members | members (never on `/c`) |
| Who claimed a link (display name) | feed `linkClaimers`, `link_claimed` push to the requester | members | members (decision below) |
| Comments (`request_comment`) | `GET/POST/DELETE …/comments` | members (403 before any read) | members; someone who left can't read, post or remove even their own old comment |
| | feed `commentCounts` | members | members |
| Saved receipts (`spend_receipt`: merchant, items, proof) | `GET/POST …/receipt` | members (403 before the row is looked up, so the same answer whether or not one exists) | members |
| | feed `receipts` (ids with saved details) | anyone | anyone (decision below) |
| Receipt photo | never stored (D-61) | – | – |
| Activity history (`feed_event` + `relay_log` votes) | `/api/me/activity` | the person (their own rows) | the person; other people's names gated as above |
| Push subscriptions | `POST/DELETE /api/push/subscription` | the owner | the owner |
| Relay outcomes, 1Click deposits | `GET /api/relay/[id]`, `/api/oneclick/status*` | the owner (`user_id`) | the owner |
| Invite secret (`#secret`) | never sent to the server; `invite_meta` holds only the public key | – | – |
| Pay-in names and notes (`gift.display_name`, `gift.note`; gifts 2026-11-02, called "pay in" since 2026-11-03) | `GET /api/pots/[pot]/gifts` | – (new) | the Pot's active members (403 before any read) |
| | `GET /api/me/gifts`, `PATCH /api/gifts/[ref]` | – (new) | the giver, for their own gifts only (someone else's ref → 404) |
| | public page `/give/<slug>` (`GET /api/give/[slug]`) | – (new) | anyone, **only** for page gifts the giver marked "show my name" (`show_public`) and received; a gift without a name isn't listed; never a link gift's |
| | push (`gift_received`) | – (new) | members (minus the giver): the chosen name or "Someone", the amount ("Ana paid $25 into Lisbon Trip", or the gift wording for a gift-tone link/page); **never the note** |
| Pay-in links (`gift_link`: amount, the members' note for payers, the tone, uses, expiry) | `GET/POST /api/pots/[pot]/gift-links`, `DELETE …/[id]` | – (new) | members (who made it is in `createdBy`, members only) |
| | landing `/g/<slug>/<id>` (`GET /api/gift-links/[id]`) | – (new) | **whoever holds the link**: the Pot's name, emoji, status and member count (ledger), the link's amount and the link's own note (a member wrote it *for* the givers; shown only while the link works), whether the Pot takes money from outside, and the link's tone (payment/gift: words only). Never a member's or a giver's name |
| The public page's one-liner and tone (`gift_page.line`, `gift_page.tone`) | `/give/<slug>` | – (new) | anyone **while the page is on** (members wrote it for the public); off → not served |
| "Help us make Pot better" answers (`user_survey`: enum ids, version, context, build; onboarding 2026-11-02) | `GET/POST /api/me/survey` | – (new) | **the person, their own row only**; the Pot team through `scripts/run survey-report` (counts only). Never in a Pot response, feed, push or another person's answer; deleted with the person (cascade) |
| Top-up asks (`topup_request`: amount, the reason, due date, who was asked, progress) and nudges (`nudge`; "Ask for a top-up" 2026-11-03) | `GET/POST /api/pots/[pot]/topups`, `DELETE …/[id]`, `POST /api/nudges` | – (new) | the Pot's active members (403 before any read); cancel: the asker only |
| | `GET /api/me/topups` | – (new) | the person: asks in Pots they're **still** in (where they're asked and not done, plus their own); names of people in those Pots |
| | push (`topup_asked` with the reason, `topup_reminder`, `nudge`) | – (new) | active members asked, minus the asker / the nudged person only; amounts and names, the reason in the ask's push (see open question) |
| Money-in details (2026-11-04: an add's source, `feed_event.data.potSource` / `.depositIntentId`; the `deposit_intent` it came from: coin, network, amounts, times, origin tx; a pay-in's name, note, link and its maker; the top-up ask it answered) | `GET /api/pots/[pot]/deposits/[key]` (server/features/deposits.ts) | – (new; a `deposit_intent` was owner-only through `/api/oneclick/status*`) | **the Pot's active members** (`hub.get_members` before any row is read); a stranger, someone who **left**, an unknown key and another Pot's key all get the same **404**; signed out 401; `private, no-store`. Tested route-level in `server/features/deposits.test.ts` |
| | feed `addSources` (each add's kind, + coin and network for another app) | – (new) | members only (absent for others, like `memos`) |
| Pay-in amounts and sender accounts | the hub's `gift_received{pot,from,amount,ref}` event, the token transfer | – | **public on the ledger** anyway; the public page shows totals and opted-in givers only, never account ids |
| Goal "$X each" | the creator's device; the landing shows the default $150 | – | – |
| Error responses | `not_a_member` 403 / `not_signed_in` 401 / `pot_unknown` 404 | – | Pot existence and request ids are public, so a 403 only reveals public facts. **`POST /api/devices` returned the raw internal error text** (now `internal` with no message, logged instead; fixed) |
| Server logs (`console.error`, `error_log`, 14 days) | `route()`, after(), feed extras, notify, ops, cron | **values of a failed query: drizzle's `DrizzleQueryError` message carries `params:` (comment text, notes, receipt JSON, names, emails)** | SQL + cause only, values dropped (`server/util/errtext.ts` `errText` at every log site; fixed) |

## Decisions
- **The public record keeps "Receipt attached" for visitors** (feed `receipts`). This is an existence bit only, and
  the request's 32-character `request_ref` (its fingerprint) already says as much on the ledger. The details are
  members-only (`GET …/receipt`). Visitors on the record get chain-derived rows only: names from the account
  (`nameFromAccount`, else "A friend"), initials, the category word. The mock record now matches (`visitorRow` in
  `lib/client/record.ts`, used by `useMockRecord` for non-members).
- **Invite landing (`/j/<slug>?i=…`), "shared with people who have the invite link":** the Pot's name, emoji/cover,
  balance and goal, member count, the rules peek, and the **inviter's** chosen name and initials (active invite
  only). The other members appear as plain seats in their join colours, and the line reads "Maya and 2 others are
  in" (`landing.members.with`). The OG image reads only the ledger (it can't see `?i=`, so anyone with the slug could
  fetch it).
- **Claim page (`/c/<slug>/<id>`), "shared with people who have the link" ("Send by link"; a payment link before 2026-11-03):** the requester's chosen name
  (only while the link is open, `redact`), the amount, and the Pot's name and cover. Never the label, note, receipt
  or claimer.
- **Claimers and payees:** someone who picks up a Pot's "Send by link" link (or is paid directly) is shown to that Pot's
  members by their chosen Pot name. They took part in the Pot's money, mirroring the claim page showing them the
  requester's name. This is kept as is; see the open questions.

## Code
- `server/util/errtext.ts` (+ test). Applied in `http/context.ts route()`, `deps.ts defer`, `features/feed.ts`,
  `notify/{notify,webpush}.ts`, `ops/{reconcile,retention,goals,links}.ts`, `relay/pipeline.ts`,
  `features/oneclick/service.ts`, `features/devices/service.ts` (no raw message in the answer).
- `server/features/activity.ts`: `deps.hub`. Names only for Pots where the reader is an active member; the route
  passes `getHub()`.
- `server/deps.ts`: `setHubForTests` (route-level tests).
- `app/j/[slug]/invite-preview.ts`: `seats` + `inviterIsMember` replace `members`; no `displayProfiles` (removed
  from `app/_lib/chain.ts`). `getOgPreview` has no names or initials. `page.tsx` and `opengraph-image.tsx` follow.

## Tests
- `server/features/privacy.test.ts` (10, route-level against `pot_privacy`). Four readers on each route: member,
  never-member, left-member and signed-out. The routes: the feed, comments GET/POST/DELETE, receipt GET, notes POST,
  `/api/me/activity`, and the `route()` log line + `error_log` row. Off-chain data carries marker strings, and a
  non-member's body must contain none.
- `server/features/activity.test.ts` +1 (left / joining / unreadable hub → no names); `server/util/errtext.test.ts`
  (3); `app/j/[slug]/invite-preview.test.ts` (3).
- Already covered elsewhere: `POST …/receipt` for outsiders (`receipts/saved.test.ts`), `POST /api/receipts/read`
  for outsiders (`receipts/read.test.ts`).

## Open questions
1. **Names behind "public" addresses.** The claim page's requester name (while the link is open) and the invite
   landing's inviter name (with an active `?i=`) are served to whoever has the address. The address isn't secret:
   `/c/<slug>/<id>` uses public ids, and `?i=` is the invite's public key, which a determined person can read off
   the ledger. Gating them would need proof of the `#secret`, for example a signature made with the link or invite
   key, and link-preview cards would lose the name. Kept as is for now.
2. **Claimers and direct payees** who aren't members are named to the paying Pot (decision above). Revisit this if
   claimers should stay "someone".
3. **CDN caching of the feed.** A signed-out feed response is `public, s-maxage=5`. It holds no member data, but a
   member whose request reaches a cached copy would briefly see no names. This is a functional issue, not a leak.


---

# Gifts (2026-11-02)

Spec: `notes/gifts-plan.md` (approved). Server half only; the hub (1.2.0), the sdk and the relayer rule are other
agents' work. Everything is behind **`FLAG_GIFTS`** (`"true"`/`"1"` → on; unset → off): while off, every gifts route
answers **404 `not_found` `{cause: gifts_off_flag}`**, the resolvers return null and `validateGiftRef` says `unknown_ref`.

- **Tables** (migration **`db/migrations/0005_gifts.sql`**, drizzle-kit generated, journal + snapshot; additive):
  - `gift_link`: `id` (22-char base64url, CHECK), `pot_id` → pot, `created_by`, `amount` numeric(40,0) null (= giver
    chooses; CHECK > 0), `note` (1-140, CHECK), `reusable` (default true), `uses` (≥ 0), `expires_at` (now + 14 d, set by
    the code), `revoked_at`, `revoked_by`, `client_key`, `created_at`; index (pot, created_at); unique (created_by,
    client_key) where set.
  - `gift`: `ref` PK (CHECK `^g[0-9a-hjkmnp-tv-z]{23}$`), `pot_id` → pot, `link_id` → gift_link null (= the public page),
    `giver_account`, `giver_user_id` → app_user (set null), `display_name` (1-40), `note` (1-140), `show_public`,
    `amount` (> 0), `status` pending|received|failed (CHECK), `tx_hash`, `client_key`, `created_at`, `received_at`;
    indexes (pot, status, created_at), (giver, created_at), (link_id); unique (giver, client_key) where set.
  - `gift_page`: `pot_id` PK → pot, `on` (default false), `line` (1-100), `updated_by`, `updated_at`.
  - `feed_event.kind` gains `gift_received` (text column, no DDL; the relayer's feed rows).
  - **Apply 0005 before deploying a build with this code** (local `pot` DB, preview/prod Neon):
    `DATABASE_URL_UNPOOLED=postgres://pot:pot@localhost:54329/pot pnpm --filter web exec drizzle-kit migrate`.
- **Code:** `server/features/gifts/` — `core.ts` (flag, `GiftDeps`, quotas, Pot info, `takingOf`, shapes), `chain.ts`
  (`GiftChain`), `deps.ts` (`giftDeps()` singleton, `setGiftChainForTests`), `public.ts` (`resolveGiftLanding`,
  `resolveGiftPage`: also called by the server components `app/g/[slug]/[id]` and `app/give/[slug]`), `members.ts`,
  `giver.ts`, `validate.ts`, `received.ts`, `schemas.ts` (strict zod), `index.ts`. Wire types: `lib/gifts-api.ts`;
  rules and ids: `lib/gifts.ts`.
- **Routes** (Node, `maxDuration = 15`, `route()`; every write: CSRF/Origin + strict body + an active device):
  - members (hub `get_members`, active, every call, **403 `not_a_member` before any gift row is read**):
    `GET/POST /api/pots/[pot]/gift-links` (POST 201, a retry with the same `idempotencyKey` 200 `replayed`, another
    body 409 `idempotency_conflict`; `amount_too_low`/`amount_too_high`; `bad_request {field: note, why}`; `pot_closed`
    when the Pot isn't open), `DELETE /api/pots/[pot]/gift-links/[id]` (any member, idempotent; another Pot's link or
    none → 404 `{cause: link_unknown}`), `GET /api/pots/[pot]/gifts` (received gifts with names and notes, totals, the
    page), `PUT /api/pots/[pot]/gift-page` (`line` absent = keep, null/"" = remove; turning it on needs an open Pot).
  - public (`Cache-Control: private, no-store`; 120/min per IP): `GET /api/gift-links/[id]` (404 `{cause:
    link_unknown}`), `GET /api/give/[slug]` (404 `{cause: pot_unknown}`; page off → `{pot, page: {on: false, line:
    null}}` only).
  - the giver (signed in, any account): `POST /api/gifts` (201 `{gift: {ref, pot, amount, msg}}`, replay 200),
    `PATCH /api/gifts/[ref]` (own gifts; someone else's → 404), `GET /api/me/gifts` (own, newest first, ≤ 100; pending
    ones over a day old left out).
- **Starting a gift, in order:** exactly one of `linkId` / `page: true` (400 `{cause: link_or_page}`); name/note
  cleaned (400 `{field, why}`); replay by (giver, key); the link must be this Pot's (404 `{cause: link_unknown}`) and work
  (**409 `action_not_allowed`** `{cause: link_revoked | link_expired | link_used}`; a one-time link is used once a gift on
  it is received); a fixed amount must match (422 `args_invalid {cause: fixed_amount, amount}`); or the page must be on
  (404 `{cause: page_off}`); $1..$10,000 (422 `amount_too_low {min}` / `amount_too_high {max}`); the Pot takes gifts
  (409 `pot_closed`; 409 `action_not_allowed {cause: gifts_off | goal_collecting}`); a one-time link held by someone
  else's pending gift < 10 min old → 409 `{cause: link_used}` (the check + insert run under the link's row lock).
  `showPublic` is kept only for page gifts (forced false through a link; PATCH → 422 `args_invalid {cause: page_only}`).
- **Quotas** (the gifts' own table in `core.ts`, `QUOTA_<NAME>` overrides): `gifts_user_link` 20/day +
  `gifts_user_link_burst` 10/min; `gifts_user_start` 20/day + `gifts_user_start_burst` 10/min + `gifts_ip_start` 60/day
  + `gifts_pot_start` 200/day; `gifts_user_patch` 30/day; `gifts_user_page` 30/day; `gifts_ip_read` 120/min. Per-minute
  → 429 `rate_limited` (+ `retryAfterMs`), daily → 429 `quota_exceeded {family: "gifts"}`. (The relayer's own
  `user_gift` / `pot_gift` families are separate.)
- **For the relayer** (import from `server/features/gifts/validate` and `…/received` directly):
  - `validateGiftRef(db, {pot, ref, amount, sender?}, now?) → GiftRefCheck` (curried `giftRefValidator(db)(pot, ref,
    amount, sender?)`): pure DB. `unknown_ref` (bad format, no row, flag off) · `wrong_pot` · `wrong_amount` ·
    `wrong_sender` · `not_pending` (received, failed, or pending > 1 day) · `link_revoked` · `link_expired` ·
    `link_used` · `page_off` · else `{ok: true, linkId}`.
  - `onGiftReceived({db, hub, cfg, sender}, {pot, from, amount, ref, txHash?, at?})`: marks our row `received` once
    (only when pot **and** sender match; the event's amount is stored), bumps its link's `uses` once (same tx), then
    pushes (`NotifyEvent` `gift_received`, eventKey `gift:<pot>:<ref>`, deduped in `notification_log`): every active
    member but `from`; title `notif.gift.title` with the row's name, else the giver's Pot name, else
    `notif.gift.someone` (unknown or someone else's ref); body `notif.gift.body` (amount only, **never the note**);
    `/p/<slug>?sheet=gift&gift=<ref>`; topic per gift. `eventsToNotifications` also maps the hub event
    `gift_received{pot,from,amount,ref}`, so `notifyFromEvents` covers it (same eventKey, so never twice).
  - `markGiftFailed(db, ref)`: pending → failed.
- **Hub views (wired 2026-11-02, notes/contracts-gifts.md §11):** `giftsOf` reads hub 1.2.0 `get_gifts({pot})` through
  the sdk's parser (`parseGetGifts`: on/total/count + `refusal`), then `gifts_on`/`gifts_total`/`gifts_count` on `get_pot`;
  missing (a 1.1.0 hub) → null = unknown → treated as on, totals from our received rows. `goalCollecting` uses hub 1.1.0
  `get_goal` (fallback: `extras.goal` + `goal_state`). Cached 10 s per instance. **The relayer's hooks are wired** in
  `server/deps.ts` (`giftRelayHooks`), and `/api/relay` passes `ipHash`.
- **Tests** (private DB `pot_gifts`): `server/features/gifts/gifts.test.ts` (33: links + quotas, the page switch, every
  start rule incl. the reservation and idempotency, PATCH / my gifts, every `validateGiftRef` reason, `markGiftFailed`,
  `onGiftReceived` marks/uses once + push recipients/copy/no note + "Someone", the event mapping, resolvers, the
  GiftChain parsing, the DB CHECKs) and `routes.test.ts` (10, route-level: flag off, 401/403 gates incl. a member who
  left, CSRF/strict bodies, privacy markers on the landing, the page, members' list and `/api/me/gifts`, the public
  read limit).


---

# "Help us make Pot better": the optional first-run survey (2026-11-02)

The frontend side (the intro, when it shows, the flag) is in notes/frontend.md "Onboarding".

**Migration `0006_user_survey.sql`** (drizzle-kit generate; additive, no backfill). **Apply it before deploying this
build** (`migrate` from CI against `DATABASE_URL_UNPOOLED`, as for 0005). Table `user_survey`:
`user_id` uuid PK → `app_user.id` ON DELETE CASCADE · `version` smallint (1..100) · `answers` jsonb (an object,
≤ 2,000 bytes) · `context` text null (`created` | `joined` | `other`) · `app_version` text null (≤ 40; the deploy's
`VERCEL_GIT_COMMIT_SHA`, first 12) · `created_at`, `updated_at`. One row per person.

**Routes** (`app/api/me/survey/route.ts`, `server/features/survey.ts`):
- `POST /api/me/survey` `{version: 1, answers: {use?: UseOption[], today?: TodayOption, heard?: HeardOption}, context?}`
  → `{survey}`. Same-origin JSON (`checkCsrf`), zod strict (`surveyReq` in `server/http/schemas.ts`): enum ids only,
  `use` a non-empty set, at least one answer, `version` must be the current one, no unknown fields, never free text.
  Needs a session with an active device (`device_not_registered` 403 otherwise, like `PATCH /api/me`). Upsert on
  `user_id` (a second send replaces the first; `use` is stored in canonical order). Quotas: `user_survey_burst` 5/min
  → 429 `rate_limited`; `user_survey` 20/day → `quota_exceeded`.
- `GET /api/me/survey` → `{survey: SurveyWire | null}`: the caller's own row (the client prefills a replay with it).
- Definitions shared by browser, route and report: `lib/survey.ts` (`SURVEY_VERSION = 1`; a meaning change = a new
  version; the report groups by version).

**The team's view:** `scripts/run survey-report [--db <url>] [--json]` prints counts and shares per answer, overall,
by how people came in (`context`) and by sign-in kind (`app_user.kind`: `wallet` = has a NEAR wallet, our proxy for
crypto comfort, which isn't asked). Reads `DATABASE_URL` (env, else only that line of `apps/web/.env.local`; never the
keys file). Pure tallying in `lib/survey-report.ts`. Plain SQL alternative:
```sql
select a.o as use, count(*) from user_survey s, jsonb_array_elements_text(s.answers->'use') a(o) group by 1 order by 2 desc;
select answers->>'today' as today, count(*) from user_survey where answers ? 'today' group by 1 order by 2 desc;
select answers->>'heard' as heard, context, count(*) from user_survey where answers ? 'heard' group by 1, 2 order by 3 desc;
select u.kind, s.context, count(*) from user_survey s join app_user u on u.id = s.user_id group by 1, 2;
```

**Privacy:** row added to the audit table above. Survey answers are off-chain and visible to the person (their own) and
the Pot team only; "Who can see what" says so (`privacy.survey`). No answer identifies anyone by itself; the report
never prints accounts or per-person rows.

**Tests:** `server/features/survey.test.ts` (21, route level on a private schema): save + read back, canonical `use`,
partial answers, upsert (one row), 10 refusals (free text, unknown option/question/field/context, repeats, empty,
another version, a list for a single answer) + non-JSON, auth gates (signed out, pending device, wrong origin, wrong
content type), the 5/min burst (another person unaffected), GET returns only your own row, `private, no-store`,
cascade delete, the DB CHECKs, `appVersion`. `lib/survey-report.test.ts` (3).


---

# "Ask for a top-up" (2026-11-03)

The frontend side is in notes/frontend.md ("Ask for a top-up"). No contract change. **Migration
`0007_topup_request.sql`** (drizzle-kit generate; additive; new tables). **Apply it before deploying this build**
(`migrate` against `DATABASE_URL_UNPOOLED`). Applied so far only to the private `pot_topup`; not to the shared `pot`.

- **`topup_request`**:
  - Columns: `id` bigserial · `pot_id` → pot · `created_by` · `mode` each|total · `per_person` / `total` numeric (Micro;
    total ≥ per_person > 0) · `reason` (1-80, null = none) · `due_at` · `baselines` jsonb **array** `[{a: account, c:
    contributed}]` (who was asked, in join order) · `progress` jsonb `{account: added}` (frozen when it ends) ·
    `closed_at` + `close_cause` done|due · `cancelled_at` · `reminder_at` · `client_key` · `created_at`.
  - **Partial unique index `topup_request_open_uq` (pot) where open: one open ask per Pot.**
  - CHECKs: mode, amounts, reason, close/cause pairing, never closed and cancelled, json types.
- **`nudge`**: `pot_id`, `topup_id` (null = a plain nudge), sender, target (≠ sender, CHECK), `client_key`, `created_at`;
  index (pot, target, created_at). Retention deletes rows older than 30 days (`server/ops/retention.ts`).
- **Rules** (`lib/topups.ts`, shared with the mock):
  - Everyone active when asked is asked, the asker too.
  - A total is split equally, rounded up to the cent. Every part is $1-$10,000 (`amount_too_low/high`).
  - Due: 1 h-60 days ahead, default 7 days.
  - Progress = hub `get_members.contributed` now − baseline. A person who left drops out; one who joined later isn't asked.
  - **done** = everyone still in has added their part; **ended** = the due date passed; **cancelled** = by the asker.
- **Routes** (`server/features/topups.ts`). All are members-only (`get_members` active, every call, 403 `not_a_member`
  before any row is read). Writes need same-origin JSON + strict zod + an active device:
  - `GET /api/pots/[pot]/topups`: the open ask first (live progress, `nudgedAt` per person in the last 24 h), then the
    last 20.
  - `POST /api/pots/[pot]/topups` `{mode, amount, reason?, dueAt?, idempotencyKey}` → 201.
    - A retry with the same key: 200 `replayed`; another body under it: 409 `idempotency_conflict`.
    - 409 `pot_closed` when the Pot isn't open.
    - 409 `action_not_allowed {cause: alone}` (< 2 members) or `{cause: topup_open, id}`.
    - Quotas: `user_topup_burst` 5/min (429 `rate_limited`), `user_topups` 10/day (429 `quota_exceeded {family: topups}`).
  - `DELETE /api/pots/[pot]/topups/[id]`: the asker only (403 `{cause: not_asker}`); idempotent; an ended ask → 409
    `{cause: topup_ended}`.
  - `GET /api/me/topups`: `open` (where I'm asked and haven't added, in Pots I'm still in) + `mine` (asks I made,
    90 days) + `profiles`.
  - **`POST /api/nudges`** (api-spec §2.5, extended): `{pot, to: account | account[] (≤ 50), topup?, idempotencyKey}` →
    `{delivered: push|none, nudged, skipped: [{account, why: self|not_member|not_asked|done|too_soon}]}`.
    - **One per (Pot, target) per rolling 24 h whoever sends it**, checked under `pg_advisory_xact_lock` per Pot.
    - Nobody left: 429 `nudge_too_soon` (+ `retryAfterMs`) or 409 `{cause: nothing_to_nudge}`.
    - `user_nudges` 10 people/day per sender (`quota_exceeded {family: nudges}`).
    - An ended ask → 409 `{cause: topup_ended}`. A retried key replays.
  - sdk types: `NudgeReq.to` may be a list, `+ topup`; `NudgeRes.nudged/skipped`; `QuotaFamily` `topups` / `nudges`;
    `NotificationType "topup"`.
- **Ending:**
  - **Lazily** wherever it's read (GET, POST, cancel, nudge, /me): everyone added → `done`, its date passed → `due`, with
    `progress` frozen. Guarded on still being open.
  - **The cron** (`reconcile.ts` step 6, `reconcileTopups`) does the same for every open ask. One due within 36 h gets
    **one** reminder (`reminder_at` claimed first; `notification_log` dedupes too) to the people asked who haven't
    added, minus the asker.
- **Push** (`server/notify/notify.ts`). Only active members, deduped in `notification_log`:
  - `topup_asked` → everyone asked but the asker: "Maya asks everyone for $50 more" / "Hotel went up · Lisbon Trip"
    (no reason: "For Lisbon Trip. Tap to add yours."), opening the Pot. Key `topup:<pot>:<id>`.
  - `topup_reminder`: "Reminder: $50 for Lisbon Trip" / "Maya asked everyone to add it by Nov 10." (UTC date), opening
    the Add sheet for the ask.
  - `nudge` → the person only: "Sam nudged you" / "Add your $30 share to Lisbon Trip." (what's left), opening
    `?sheet=add&amount=30&topup=<id>`. A plain nudge says "Add money to Lisbon Trip when you can." Key
    `nudge:<pot>:<to>:<nudge id>`.
- **Tests** (`server/features/topups.test.ts`, 21, private schema on `pot_topup`): the lib rules, asking
  (baselines/order/push recipients, total split, members only incl. joining, every validation, closed Pot, a Pot of one,
  one-open + the DB index, idempotency, burst/daily), progress (only after the ask, done + frozen, leave/join), due /
  cancel / not-asker / ended, the DB CHECKs, nudges (skips, 24 h across senders, `nudgedAt`, replay, outsiders, ended,
  plain nudge, daily cap), `/api/me/topups` (incl. a member who left), the cron (reminder once, due, done), the push
  copy and recipients, and route-level gates with privacy markers. Four readers: member, left, never and signed out; the
  reason never reaches the last three.

# "Pay in": the tone of a pay-in link / page (2026-11-03). Apply migration `0008_payin_tone.sql` before deploying.

The UI renamed the money flows by direction (notes/frontend.md "Pay in"): a **pay-in link** / the **public page** is
how people outside the Pot pay in (internally still `gift_link`, `gift_page`, `gift`, the hub's `{"pot","gift"}`
message, `set_gifts`, `gift_received`, every route and URL unchanged; the contract ABI is untouched). The member who
makes a link (or turns the page on) picks its **tone**, `payment` (default) or `gift`, which only changes the words and
presets people see.
- **Migration `0008_payin_tone.sql`** (additive, off-chain only): `tone text NOT NULL` + CHECK `in ('payment','gift')` on
  `gift_link`, `gift_page` and `gift`. Each column is added with `DEFAULT 'gift'` (so **rows from before read as gifts**,
  the words they had), then the default becomes `'payment'`. Snapshot/journal regenerated with drizzle-kit (`0008`).
- **Wire** (`lib/gifts-api.ts`): `GiftLinkWire.tone`, `GiftLinkCreateReq.tone?` (default `payment`; part of the
  idempotency check, a retry with another tone → `idempotency_conflict`), `GiftLandingRes.link.tone`, `GiftPageWire.tone`
  (no row yet = `payment`), `GiftPagePutReq.tone?` (absent = keep), `GiftWire.tone`, `MyGiftWire.tone`. zod: `tone`
  is `z.enum(["payment","gift"])` on the link create and the page PUT (strict bodies otherwise unchanged).
- **A snapshot on the gift:** `startGift` copies the link's (or the page's) tone onto the `gift` row, so a later page
  change never rewrites old feed rows or pushes.
- **Push** (`gift_received`): a payment reads "Ana paid $25 into Lisbon Trip" / "From outside the Pot · Open Pot to
  see it." (`notif.payin.*`); a gift keeps "Ana sent Lisbon Trip a gift" / "$10 ☕ · …". A raw ref we didn't start →
  "Someone paid $X into …". Never the note (unchanged). `link_claimed` (Send by link) now reads "Your $30 link was
  picked up".
- **Privacy:** the audit table above names the tone (words only) as part of what a link holder / the page shows.
- **Tests:** `server/features/gifts/gifts.test.ts` (+1: the tone snapshot from link and page; tone on create/replay,
  page PUT keeps/sets the tone; push copy per tone; landing/page shapes). DB tests ran on a private `pot_payin`
  (migrated with `drizzle-kit migrate`, so `db.test.ts`'s migrator run is idempotent there).
