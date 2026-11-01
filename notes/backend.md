# Backend notes: wave 1 (B-01…B-09, X-05, X-08, X-09)

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
