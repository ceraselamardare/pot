# Backend infrastructure: Vercel, background work, DB/ORM, NEAR data access, feed, CI, abuse controls
> Owner: infra. Last verified: 2026-10-21. Legend: ✅ verified · 📄 docs-only · ⚠️ unverified/conflicting

Scope:
- **Here:** where server code runs, how it does background work, how it reads NEAR state, the DB, CI, and abuse/key-custody controls.
- **Elsewhere:**
  - NEP-366 internals, account creation and costs: [meta-tx-relayer.md](meta-tx-relayer.md), [accounts-onboarding.md](accounts-onboarding.md) (relayer).
  - The 1Click API itself: [intents-1click.md](intents-1click.md) (intents).
  - Push, email and Telegram: [notifications.md](notifications.md).

Measurements were taken on 2026-10-21 from a laptop behind Cloudflare POP `OTP` (Bucharest). Latency from a Vercel `iad1` function will differ. Throwaway scripts are in the session scratchpad `infra/` (`rpc_bench.mjs`, `rpc_lag.mjs`, `neardata_lag.mjs`, `nd_limit.sh`, `nd_filter.mjs`, `fn_limit*.mjs`, `fn_sustained.mjs`, `txapi_fresh.mjs`, `txapi_lag.mjs`, `dao_views.mjs`, `failover_test.mjs`, `schema_test.sql`, `quota_test.sql`).

## TL;DR
1. **No always-on worker and no indexer for the MVP.**
   - Every Pot write goes through our relayer, so `/api/relay` sees each tx outcome. It writes the receipt and feed row and fires notifications on the spot.
   - Clients read chain state with direct view calls, polling every 2–3 s while a Pot is on screen.
   - Measured: a block becomes **final ≈ 2.0 s (p50) / 2.4 s (p95) after its timestamp**, and view calls take **50–110 ms**. So other members see a change **≤ ~3.3 s after finality** with a 3 s poll. **P-4 (≤ 5 s) ✅ feasible.**
2. **Background work on Vercel without a worker:**
   - **1Click status polling** → Vercel **Workflow** (GA 2026-04-16, all plans; `sleep()` costs no compute; ~5 billable events per poll; Hobby includes 50k events/month).
   - **Notification fan-out** → Next 16 `after()` in the triggering request.
   - **Reconciliation** → cron. Hobby allows **one run per day** (±59 min), Pro allows one per minute.
   - Vercel **Queues** (beta) and **Daemons** (public beta since 2026-10-15, production-only, Docker amd64) exist but are not needed.
3. **RPC:**
   - **Never use `rpc.testnet.near.org`.** It is deprecated and every call took **+3.05 s** (min 3,047 ms over 30 calls) ✅.
   - Use **`rpc.testnet.fastnear.com`** (p50 58–89 ms) with **`near-testnet.drpc.org`** as failover (p50 50–62 ms). near-api-js 7.3.1 `FailoverRpcProvider` switches providers on HTTP 429 ✅.
   - FastNEAR's free tier is per-IP and keyless.
     - Measured sustained: **120 req/min for 2 min: no 429**. At 240 req/min: **429 after 159 calls in 40 s** (≈ 200 in the trailing minute). After a burst my IP was penalised to ~1 call per 30 s for a while.
     - One browser polling every 3 s is far below this. **Vercel functions share egress IPs**, so server-side reads need a FastNEAR key (Dev $69/month, 10M req) or must fail over.
   - **FastNEAR Transactions API (`tx.test.fastnear.com`) works keyless on testnet with CORS.** It indexes txs **2.8–4.8 s after the block timestamp** (≈ 1–3 s after finality) ✅. That gives full account history (hashes + receipts + logs) for any DAO/Rulebot account without running an indexer.
4. **No free real-time block stream on testnet in Oct 2026:**
   - neardata's public tier enforces **30 blocks/min per IP** (429 after 32) ✅, while testnet produces **~107 blocks/min** (560 ms blocks) ✅.
   - **NEAR Lake stopped writing on 2026-03-24** 📄.
   - The **Intear Events API is retired**; its replacement is FT-only 📄 (events-v3 returns 521 ✅).
   - The **NearBlocks testnet API is 24 days stale** (last block 2026-09-27T03:13Z) ✅, although testnet.nearblocks.io tx pages still render new txs ✅.
   - → Defer any indexer to Phase 2. Feed = views + our relay log + the FastNEAR Tx API for cross-app history.
5. **Hobby vs Pro is a real decision:**
   - Hobby is "non-commercial, personal use".
   - **Private repos under a GitHub org cannot deploy to Hobby**, and only the Hobby owner's commits deploy.
   - Hobby limits: cron once per day, one region, one WAF rate-limit rule, 1 hour of logs, and a 30-day pause if any quota is exceeded.
   - Pro costs $20/dev seat/month. A **Pro trial lasts 14 days** (one per user, $20 credit). Started Nov 1, it ends Nov 15, **before judging (Nov 16–18)**.
   - The design below runs on Hobby. Pro only adds minute crons and logs.
6. **DB: Neon (Vercel-native, Free, `iad1`) + Drizzle `0.45.4` (pinned) + `pg` + `attachDatabasePool`** ✅.
   - **Avoid unpinned Prisma:** `npm i prisma` now installs the **Prisma 8 RC CLI**, which has no `generate`/`migrate dev` ✅.
   - Off-chain we need: auth mapping, onboarding state, push subscriptions, deposit intents, quota counters, relay log (receipts/idempotency), Telegram links and Pot display metadata.
7. **Key custody:**
   - For the hackathon, store relayer and funder keys as Vercel **Secret** env vars (write-only after save), use separate Preview vs Production keys, keep a small hot float, and enforce a daily spend circuit breaker.
   - **Vercel KMS can't hold NEAR keys** (RS/PS/ES only, beta) 📄.
   - **AWS KMS supports Ed25519 since 2025-11-07** ($1/key/month + $0.15/10k signs) and can be reached keylessly via Vercel OIDC. That's the Phase 3 path.
8. **Abuse controls:**
   - Vercel WAF rate limit (Hobby: 1 rule, IP/JA4 keys, 10 s–10 min window).
   - `@vercel/firewall` `checkRateLimit(id, { rateLimitKey: userId })`.
   - Postgres daily caps (atomic upsert, ✅ concurrency-tested).
   - **BotID Basic** (free, all plans) on onboarding/create. It flags Playwright, so add a CI bypass.
   - Inline low-balance alert after each relay (no cron needed).
9. **CI:**
   - Pin `runs-on: ubuntu-24.04` x64. `ubuntu-latest` moves to 26.04 between **2026-10-19 and 2026-11-19** ✅, and the sandbox binary needs glibc 2.39 (Ubuntu 22.04 fails).
   - Pre-download the sandbox and set `NEAR_SANDBOX_BIN_PATH`. Install cargo-near 0.22.0 via its installer.
   - Run Playwright on `deployment_status` with Vercel **Protection Bypass for Automation** (all plans).
   - A private repo can exceed GitHub Free's 2,000 min/month; a public repo is free.

## Plan check
| Claim in the original plan | Verdict |
|---|---|
| Part A: "Next.js route handlers plus one worker replace NestJS" | ❌ **Corrected:** route handlers ✅, but **no always-on worker is needed** for the MVP. Workflow (1Click polling), `after()` (fan-out) and cron (reconcile) cover it on Vercel. If a worker becomes necessary (Phase 2 block-stream watcher), use **Vercel Daemons** (beta, prod-only) or Railway ($5/month Hobby) / Fly ($2.19/month 256 MB). |
| C6: "indexer: Rulebot/DAO events → Postgres feed cache"; C7 day 6 "Indexer + feed API" | ❌ **Defer.** The free block sources can't follow testnet (neardata 30 blocks/min vs ~107 produced), Lake is dead, Intear Events is retired, and the NearBlocks testnet API is stale. **MVP feed = chain views (DAO `get_proposals`, Rulebot `get_state`) + `relay_log` rows written from tx outcomes + FastNEAR Tx API account history** (keyless on testnet, CORS ok, ~1–3 s after finality ✅). Day 6 becomes "feed from views + relay outcomes + Tx API" (≈ half a day). |
| Part A: "Postgres + Prisma, Vercel" | ⚠️ **Postgres ✅ (Neon). ORM → Drizzle recommended.** Prisma 7.10.1 works on Next 16.4.2, but `prisma@latest` is the 8.0.0-rc.24 CLI with no `generate`; the docs default to v8; a v7 function bundle is 6.96 MB vs 2.13 MB for Drizzle. If the team insists on Prisma, pin `prisma@7.10.1` and `@prisma/client@7.10.1` and set `PRISMA_HIDE_UPDATE_MESSAGE=1`. |
| C6: "/api/oneclick … status polling" + C5 "You can close this screen. We'll notify you." | ✅ Via a **Workflow** started when the deposit address is issued. It polls `/v0/status` with backoff, updates `deposit_intent` and notifies on terminal status. It runs on Hobby. C7 day 8's "status worker" = this workflow. |
| C6: "/api/relay NEP-366 relayer, allowlist: pot-factory, rulebot.*, usdc" | ⚠️ **Probably incomplete.** P-6 group votes (and P-8/P-9 member proposals) call `act_proposal`/`add_proposal` on the **DAO account** (`<slug>.sputnikv2.testnet`), which is not in the list, unless votes are routed through Rulebot. The allowlist should be "accounts created by our pot-factory (looked up in `pot`) + exact method lists". The usdc entry must be limited to `ft_transfer_call` with `receiver_id` = a known Rulebot, plus `storage_deposit`. → relayer, sputnik. |
| C6 data model "user(near_account, auth_sub, email, push_sub, tg_chat_id) … Chain state is the source of truth." | ⚠️ **Mostly right, needs fixes:** push subscriptions need their own table (many per user), `tg_chat_id` belongs to a Pot, and add `quota_usage`, `relay_log` and `alert_state` (schema tested ✅ below). Balances, contributions, proposals and votes stay on chain. |
| C9: "Relayer abuse → receiver/method allowlist, per-user daily cap, alert under 5 NEAR" | ✅ All three work on Hobby without a cron. Add a **global daily spend cap**, BotID on onboarding/creation, and separate Preview/Production relayer accounts. |
| C5: "creation sponsored by pot-factory, limited to 3 Pots per verified email per day" | ✅ Enforceable with `quota_usage` (subject `email:<sha256>`), tested atomic under 20 concurrent requests ✅. **Needs a verified-email claim from NEAR Auth on the server** → auth. |
| P-4: "balance updates within 5 s of finality" | ✅ Feasible: final p50 1,984 ms / p95 2,379 ms after the block timestamp, view RTT ~55 ms, 3 s poll → ≤ ~3.3 s after finality. |
| C8 step 2: "receipt link to testnet nearblocks" | ✅ `https://testnet.nearblocks.io/txns/<hash>` rendered a 2-minute-old tx ("Success", nft_transfer) on 2026-10-21, even though `api-testnet.nearblocks.io` is stale. Keep the links, but don't use the NearBlocks *API* for testnet data. |
| C8: "Playwright… via a labeled demo login that signs with server-held testnet keys"; "Demo keys live only in hosting environment variables" | ✅ Store them as Vercel **Secret** env vars (write-only, redacted in build logs if ≥ 32 chars). Give Preview its own demo accounts. E2E against previews needs Protection Bypass for Automation (all plans) and a BotID bypass. |
| Part A: pin near-api-js on Nov 1 | ✅ near-api-js **7.3.1** (2026-08-12) ships `JsonRpcProvider({url, headers}, {retries, wait, backoff})`, `FailoverRpcProvider`, `MultiKeySigner` and a nonce manager. **There is no default RPC URL**, so you must pass one ✅. |
| C2/C6: Telegram bot, web push, email under `/api/notify` | ✅ See [notifications.md](notifications.md). Next ≥ 16.3 has no edge runtime, so everything runs on Node 📄. |

## Reference

### R1. Vercel platform facts (Oct 2026)
| Capability | Hobby | Pro | Status |
|---|---|---|---|
| Plan terms | free; "non-commercial, personal use only" (fair-use) | $20 per developer seat/month; **14-day trial, one per user, $20 credit, then reverts to Hobby without a card** | 📄 |
| Git collaboration | **cannot deploy from a private repo in a GitHub org**; only the Hobby owner's commits deploy (private repos); "Collaboration is free for public repositories". Commits *authored* by Claude Code / Cursor Agent can deploy without a seat (changelog 2025-06-06) ⚠️ co-author trailers unclear | team members (auto-add committers) | 📄 |
| Function max duration (Node, Fluid) | 300 s default = max | 300 s default, **800 s** max, 1,800 s beta | 📄 |
| Memory / CPU | 2 GB / 1 vCPU | up to 4 GB / 2 vCPU | 📄 |
| Included compute | **4 active CPU-h, 360 GB-h memory, 1M invocations / month**; over the limit → feature paused until 30 days pass | on-demand: iad1 $0.128/CPU-h, $0.0106/GB-h; $0.60 per 1M invocations | 📄 |
| Regions for functions | 1 (default `iad1`) | up to 5 | 📄 |
| Cron Jobs | 100/project; **once per day; fires anywhere in the hour (±59 min)**; a more frequent schedule fails deployment | once per minute, per-minute precision | 📄 |
| Cron semantics (all plans) | GET to the **production** URL; `Authorization: Bearer $CRON_SECRET`; **no retries**; "can occasionally invoke the same scheduled run more than once"; may overlap; does not follow redirects; UTC | same | 📄 |
| Workflows (`workflow` 5.2.3) | **GA 2026-04-16**; 50,000 events + 1 GB written / month included; no Data Retained on Hobby | $0.02 per 1k events; $0.50/GB written; $0.50/GB-month retained | 📄 ✅ (npm) |
| Workflow limits | no max run or sleep duration; 25,000 events/run; 10,000 steps/run; 50 MB payload; replay must be < 240 s; runs pinned to the deployment and region; API 50k req/min Hobby (500k Pro) | | 📄 |
| Queues (`@vercel/queue` 0.8.0) | **beta**; 1M ops/month included; trigger `experimentalTriggers: [{type:"queue/v2beta", topic}]` | regional pricing | 📄 ✅ |
| Queue limits | TTL 60 s–7 d (default 24 h); delay ≤ 7 d; visibility ≤ 60 min; ≤ 10 msgs/receive; ≤ 100 MB message, metered per 4 KiB; at-least-once | | 📄 |
| Daemons (always-on containers) | **public beta 2026-10-15**; production only; Dockerfile; Linux amd64; 1–2 GiB; **10 active CPU-h/month** per team, then stopped until the next month; no preview, no inbound traffic, no subfolder root dir | billed for active CPU + provisioned memory; quota 16 vCPU / 32 GiB concurrent | 📄 |
| WebSockets in Functions | GA 2026-10-20 ("same limits and pricing as other Function invocations") | same | 📄 |
| KMS (`@vercel/kms` 0.3.5) | beta; 5,000 signs/month free; RS256/384/512, PS*, ES* only; **no Ed25519/secp256k1 documented** ⚠️ (an SDK test fixture mentions "EdDSA") | $0.03 (RS256/PS256) – $0.15 (others) per 10k ops | 📄 ✅ |
| WAF rate limiting | **1 rule/project** (3 custom rules total); keys IP or JA4; fixed window 10 s–10 min; 1M allowed requests included; counters are per region | 40 rules; usage-based | 📄 |
| BotID | Basic: free | Deep Analysis $1 per 1k `checkBotId()` | 📄 |
| Env vars | **Config** (readable) vs **Secret** (write-only after save; Secrets ≥ 32 chars are redacted from build logs); per-environment values; optional "Separate Production Secret Values" policy | same | 📄 |
| Runtime logs | 1 hour | 1 day | 📄 |
| Deployments/day | 100 | 6,000 | 📄 |
| Edge runtime | **Next.js ≥ 16.3 no longer supports `runtime='edge'`** → Node everywhere | same | 📄 |

Alternatives if a separate always-on worker is ever needed 📄:
- **Railway:** Hobby $5/month including $5 of usage; ≈ $20/vCPU-month, $10/GB-month.
- **Fly.io:** no free tier for new orgs; shared-cpu-1x 256 MB costs $2.19/month.
- **Render:** the free tier covers web services only (they sleep after 15 min); background workers are paid.

### R2. Recommended architecture (MVP, Hobby-compatible)
```
Browser PWA ──(direct JSON-RPC view calls, 2–3 s poll while visible; FastNEAR → dRPC failover)──► NEAR testnet
   │  sign SignedDelegate (NEAR Auth)            ▲ send_tx / view
   ▼                                              │
Vercel (Next.js 16 route handlers, Node, Fluid, region iad1)
   /api/onboard      session → BotID → quotas → create+fund account, usdc storage_deposit (idempotent per auth_sub)
   /api/relay        session → decode SignedDelegate → allowlist (DB: our pots) → quotas → sign outer tx
                     → send_tx (wait_until EXECUTED_OPTIMISTIC|FINAL) → relay_log(tx_hash, outcome events)
                     → after(): notifications fan-out, low-balance check
   /api/oneclick/*   quote (JWT Secret) → deposit_intent → start(watchDeposit) ; deposit/submit passthrough
   /api/push/*, /api/telegram (webhook), /api/pots/[slug]/feed (DB receipts + lazy reconcile)
   /api/cron/reconcile   Hobby: daily safety net ; Pro: */1 (optional)
   Workflows:  watchDeposit(depositAddress)  — poll 1Click status with backoff, ≤ 30 min, then notify
Neon Postgres (iad1, pooled DATABASE_URL via pg Pool + attachDatabasePool)
(no indexer, no worker)
```

**Region: keep `iad1`, the Vercel default.**
- Neon's iad1 = `aws-us-east-1`, and Vercel recommends co-locating with the DB 📄.
- Workflow 4.x runs live in iad1 📄.
- FastNEAR and dRPC sit behind anycast Cloudflare (`cf-ray` seen) ✅, so RPC from iad1 should stay ~tens of ms ⚠️ (not measured from iad1).
- EU users pay ~+90 ms per API round-trip ⚠️. That is negligible next to the 1–3 s chain latency.
- Pick `fra1` + Neon `fra1` only if the demo audience is clearly EU and the team accepts Workflow ≥ 5 multi-region pinning.

**Rate-limit store: don't add Redis.**
- Quotas live in Postgres (atomic upsert, Snippet 5) and bursts are handled by the Vercel WAF / `@vercel/firewall`.
- If a sliding window is ever needed: `@upstash/ratelimit` 2.2.0 + Upstash Redis Free (500K commands/month, 250 MB, 10 GB bandwidth, 1 database) 📄 via the Marketplace.

**Feed, MVP design:**

| Source | Covers | Latency |
|---|---|---|
| Our own relay outcome (`relay_log` + parsed NEP-297/FT events) | everything users do through Pot: contributions, requests, votes, joins, closes | **immediate** for the actor (optimistic UI) and the server (notifications) |
| Client view polling: DAO `get_last_proposal_id` → `get_proposals({from_index, limit})`; Rulebot `get_state` (+ an activity view, if contracts add one) | the current truth incl. actions **not** via our relayer (Trezu, wallets) | ≤ poll interval (2–3 s) + RTT after finality (with `finality: "final"`) |
| **FastNEAR Tx API history**: `POST tx.test.fastnear.com/v0/account {account_id: <dao_id or rulebot_id>, desc: true, limit: 20}` → new hashes → `POST /v0/transactions {tx_hashes}` (actions, receipts, logs) | timeline items + **receipt links** for any actor (incl. Trezu/wallet votes) | ✅ indexed 2.8–4.8 s after block timestamp (n=3, 1 s polls) |
| Lazy reconcile on `/api/pots/[slug]/feed` (compare chain `last_proposal_id` vs DB) + daily/minutely cron | notifications for actions not via the relayer | on next read, or ≤ 1 min with a Pro cron |

DAO view sizes ✅ (via dRPC on spike DAO `potspike-dao-svuw.sputnikv2.testnet`):

| Call | Latency | Size |
|---|---|---|
| `get_last_proposal_id` | 70 ms | — |
| `get_proposals({from_index, limit:3})` | 63 ms | 1,215 B |
| `sputnikv2.testnet get_number_daos` | 94 ms | → 5319 |
| `get_daos({from_index, limit:40})` | 105 ms | — |

A proposal JSON carries `id, proposer, description, kind{Transfer{token_id, receiver_id, amount, msg}}, status, vote_counts{role:[yes,no,remove]}, votes{account: "Approve"|"Reject"}, submission_time (ns)`. It does **not** carry tx hashes. Receipts come from `relay_log` (own actions, instant) or the FastNEAR Tx API (any actor, ~1–3 s after finality).

**Phase 2 option (only if cross-app activity matters):** a block-stream watcher (neardata `GET /v0/block/{h}` long-poll with a FastNEAR key) as a Vercel Daemon or on Railway/Fly.
- It filters receipts whose `receiver_id` ∈ {our DAOs, `*.rulebot.pot-<team>.testnet`, usdc}. JSON path ✅ (scanned 25 testnet blocks: 21 receipts, 8 matched `wrap.testnet|*.sputnikv2.testnet|v1.signer-prod.testnet`): `block.shards[].receipt_execution_outcomes[]` → `.receipt.{receiver_id, predecessor_id, receipt_id}`, `.receipt.receipt.Action.actions[].FunctionCall.{method_name, deposit}`, `.execution_outcome.outcome.{logs[], status}`, `.tx_hash`.
- Cheaper alternative: poll the FastNEAR Tx API `/v0/account` per active Pot account (≈ 1–3 s after finality). That needs no block stream and no worker.
- It sees final blocks ~1.7 s (p50) after the block timestamp ✅, i.e. essentially at finality ⚠️ (inferred from the long-poll returning as soon as the block is final).
- ⚠️ Estimated cost: FastNEAR plan ≥ $69/month + Daemon about 6–7 active CPU-h/month (Hobby quota 10) or ≈ $8–9/month on Pro.

### R3. NEAR testnet data access (measured 2026-10-21)
**Chain:** testnet nearcore `2.14.0-rc.5`, protocol 87 (latest 88), **10 shards**, head ≈ 274.09M ✅.
- Block interval p50 **560 ms** (n=14) ✅. NearBlocks stats `avg_block_time` = 0.645 s.
- **Optimistic head first seen p50 813 ms / p95 1,089 ms, final p50 1,984 ms / p95 2,379 ms after the block timestamp** (dRPC, 150 ms poll, n=20 each) ✅. So finality ≈ +1.2 s after optimistic.

**JSON-RPC endpoints** (n=5–6 per method; methods: `status`, `block` final, `view_account` and `call_function ft_metadata` on `wrap.testnet`, `get_number_daos` on `sputnikv2.testnet`):

| Endpoint | p50 | p95 | Status / limits |
|---|---|---|---|
| `https://rpc.testnet.fastnear.com` | **58–89 ms** | ≤ 234 ms | ✅ works. Public tier is per-IP, keyless, undocumented. After a 15-min cooldown, sustained **20 / 60 / 120 req/min passed (3 / 3 / 2 min, no 429)**; at **240 req/min → 429 after 159 calls in 40 s** (≈ 200 calls in the trailing 60 s) ✅. Error: `HTTP 429 {"code":-429,"message":"Rate limits exceeded. For higher rate limits get a subscription at https://fastnear.com"}`, `retry-after: 0`. After an earlier burst (~300 calls in ~10 min) the IP was penalised to ~1 call per 30 s for several minutes ✅. CORS `*` ✅ |
| `https://test.rpc.fastnear.com` | 57–130 ms | ≤ 292 ms | ✅ (listed in NEAR docs) |
| `https://archival-rpc.testnet.fastnear.com` | 173 ms (1 call) | | ✅ |
| `https://near-testnet.drpc.org` | **50–62 ms** | ≤ 375 ms | ✅ 400 sequential calls in 22.9 s with **no 429**. CORS echoes the origin ✅. Free tier ⚠️ "210M CU / 30 days", per-IP CU/min cap (docs via search only) |
| `https://rpc.testnet.near.org` | **3,051–3,101 ms** | ≤ 3,116 ms | ❌ deprecated (NEAR blog 2025-05-19: "permanent minimal rate limits"); **every call +3.05 s** ✅ (HTTP 200 at ~20 calls/min); under more load it answers `-429 "THIS ENDPOINT IS DEPRECATED"` (relayer KB); same node key as FastNEAR (`ed25519:B87Qq…`) ✅ |
| `https://archival-rpc.testnet.near.org` | 3,256 ms | | ❌ same |
| `https://testnet-rpc.intea.rs` | — | — | ❌ HTTP 502 on every call (~2.2 s) ✅ |
| `https://free.rpc.fastnear.com` | — | — | ⚠️ this is **mainnet** (`UNKNOWN_ACCOUNT` for testnet ids) ✅ |

**FastNEAR REST** `https://test.api.fastnear.com` ✅:
- `/status` → `{"version":"0.10.1","sync_latency_sec":2.0,…}`.
- `/v1/account/{id}/ft` → `{account_id, tokens:[{contract_id, last_update_block_height, balance}]}`.
- `/v1/account/{id}/full` → `{pools, tokens, nfts, state:{balance, locked, storage_bytes}}`.
- Also `/nft`, `/staking`, `/v1/ft/{token}/top`.
- Latency 110–260 ms. CORS echoes the origin.
- ⚠️ FT lists only contain token contracts the indexer has seen for that account, so use RPC `ft_balance_of` for exact numbers.

**Transactions API** `https://tx.test.fastnear.com` ✅ (testnet; worked **without a key** on 2026-10-21, although the docs say "Send your FastNear API key with every request" ⚠️ that may be enforced later):

| Endpoint | Request | Response / latency |
|---|---|---|
| `POST /v0/account` | `{account_id, desc?, limit?, resume_token?, from_tx_block_height?, to_tx_block_height?, is_receiver?, is_predecessor?, is_signer?, is_function_call?, is_event_log?, is_success?, …}` | `{account_txs:[{account_id, transaction_hash, tx_block_height, tx_block_timestamp, tx_index, is_signer, is_delegated_signer, is_real_signer, is_any_signer, is_predecessor, is_explicit_refund_to, is_receiver, is_real_receiver, is_function_call, is_action_arg, is_event_log, is_success}], resume_token, txs_count}`; 156–428 ms ✅. The spike DAO `potspike-dao-svuw.sputnikv2.testnet` returned `txs_count: 87` |
| `POST /v0/transactions` | `{tx_hashes:[…full base58 hashes…]}` | `{transactions:[{transaction:{signer_id, public_key, nonce, receiver_id, actions:[{FunctionCall:{method_name, args(base64), gas, deposit}}], priority_fee, signature, hash}, execution_outcome, receipts:[{receipt, execution_outcome}], data_receipts}]}`; 129–165 ms, 5.6 KB for a 4-receipt `act_proposal` ✅. A truncated hash → HTTP 400 ✅ |
| `POST /v0/receipt`, `/v0/block`, `/v0/blocks` | 📄 | |

- **Indexing lag** ✅: a tx taken from the newest final block appeared in `/v0/transactions` **2.8 s, 3.6 s and 4.8 s after its block timestamp** (n=3, 1 s polls), i.e. ≈ 1–3 s after finality.
- **CORS:** a preflight from an arbitrary origin returns 200 with the origin echoed (`POST, GET`) ✅, so browsers can call it directly.
- **Transfers API is mainnet-only** 📄.

**FastNEAR plans** 📄 (fastnear.com):
- Dev **$69/month (10M RPC req)**, Pro $199 (36M), Business $499 (100M).
- One key works for RPC + REST + neardata + tx, sent as `Authorization: Bearer` or `?apiKey=`.
- **Browser keys** (origin-restricted, with a per-key rate cap) are a **paid-plan** feature. A 429 to a browser may arrive **without CORS headers** and surface as a generic network error 📄.

**neardata** `https://testnet.neardata.xyz` ✅:
- Endpoints: `GET /v0/last_block/final` (302 → `/v0/block/{h}`), `/v0/last_block/optimistic` (→ `/v0/block_opt/{h}`), `/v0/block/{h}/headers`, `/v0/block/{h}/chunk/{shard}`, `/v0/block/{h}/shard/{shard}`, `/v0/first_block`.
- A request for the next height **long-polls** until it exists. Each receipt outcome includes its `tx_hash`.
- A final block (~32 KB) arrives **p50 1,746 ms after its timestamp** (n=15) ✅.
- **Public limit:** the homepage says "180 requests per minute per IP", but the server enforces **`429 {"error":"rate-limit exceeded of 30 blocks per minute"}` after 32 sequential blocks**, and while limited also rejects `/headers` and `last_block` redirects ✅. Testnet makes ~107 blocks/min, so the free tier cannot follow the head.

**NearBlocks** ✅📄:
- `https://api-testnet.nearblocks.io/v1/…` answers in 85–440 ms, but **`/v1/blocks/latest` = 270,420,307 @ 2026-09-27T03:13Z** (≈ 3.67M blocks / 24 days behind) and `/v1/txns/<new hash>` → `{"txns":[]}`. The mainnet API is current.
- Free plan: 6 calls/min, 333/day, 10k/month, "Personal Use", attribution. Paid plans from $67.15/month (190 calls/min).
- The website `testnet.nearblocks.io/txns/<hash>` **does** render fresh txs.

**NEAR Lake** 📄: "As of **March 24, 2026**, NEAR Lake (AWS S3 buckets) has stopped indexing new blocks". The recommended replacement is neardata.

**Intear** 📄✅:
- "The Intear API replaces the Events API (`wss://ws-events-v3.intear.tech`, `https://events-v3.intear.tech`)". The new API is FT prices/trades/transfers only ("the Intear API is about fungible tokens"), with no NEP-297 or receipt streams and no testnet mention.
- `events-v3.intear.tech` → HTTP 521 ✅.

**near-api-js 7.3.1 provider behaviour** ✅ (read in `lib/index.js`):
- `fetchJsonRpc` throws `ProviderError(cause=429)` for HTTP 429 and **does not retry it**.
- It retries 500/503/408 and fetch failures up to 10× with ~0 ms starting delay (×1.5), unless `RequestOptions {retries, wait, backoff}` override that.
- `FailoverRpcProvider.withBackoff` catches any non-`AccountDoesNotExist` error, logs it with `console.error`, and **switches to the next provider (sticky)**.
- `sendJsonRpc` also throws `parseRpcError(response.error)` when an **HTTP 200 body carries a JSON-RPC `error`**. Per [meta-tx-relayer.md](meta-tx-relayer.md), FastNEAR sometimes sends its `{"code":-429}` that way. So failover also triggers on that path ✅ (code read).
- A slow-but-successful endpoint (near.org's +3 s) **never triggers failover**, so don't list it.

### R4. Database
**Is a DB needed?** Yes, but small. The chain stays the source of truth for balances, contributions, members, rules, proposals and votes. Off-chain data:

| Table | Why it can't live on chain |
|---|---|
| `app_user(auth_sub UNIQUE, near_account UNIQUE, email_hash, email_verified, onboard_state)` | the chain doesn't know OAuth/email identities; onboarding must be idempotent per `auth_sub` |
| `pot(slug, dao_id, rulebot_id, preset, name, emoji, cover_url, created_by)` | the relayer allowlist needs "accounts our factory created"; display metadata (unless contracts store it) |
| `deposit_intent(deposit_address UNIQUE, correlation_id, amounts, status, workflow_run_id, deadline)` | 1Click state machine and notifications (→ intents) |
| `quota_usage(subject, action, day, n)` | per-user / per-email / global caps (atomic upsert below) |
| `relay_log(idem_key UNIQUE, user_id, pot_slug, receiver_id, method, tx_hash, status, gas_burnt_yocto)` | idempotent relays, receipt links, spend ledger, feed rows |
| `push_subscription`, `telegram_user`, `telegram_chat`, `tg_link_token`, `notification_log` | delivery state (see notifications.md N5) |
| `alert_state(key, last_sent_at)` | alert dedupe |
| invites: store **nothing secret**. Put the invite secret in the URL fragment (`/j/<slug>#<secret>`) so the server never sees it, and keep only the hash on chain (Rulebot) | ⚠️ product/contracts decision |

**Provider: Neon via Vercel Marketplace (native, billed by Vercel), Free plan, region `iad1` (`aws-us-east-1`)** 📄:
- Free plan: 100 projects, **100 CU-h/project**, up to 2 CU, **1 GB storage/project** (20 GB total), 5 GB egress, scale to zero after 5 min (can't be disabled), cold start "typically… a few hundred milliseconds", 10 branches/project.
- Env vars: **`DATABASE_URL`** (pooled, PgBouncer `-pooler` host), **`DATABASE_URL_UNPOOLED`** (direct; use it for migrations), `PG*`, plus legacy `POSTGRES_*`.
- Optional copy-on-write **branch per Preview deployment**. Branches are only cleaned up when deployments expire, which collides with the 10-branch cap.
- Paid "Launch" tier: $0.106/CU-h, $0.35/GB-month, no minimum.

Other options:
- **Prisma Postgres:** native; Free 200k ops/month, 2 GB, 50 DBs, no backups; injects only the **direct** URL; one DB shared by all environments. Open issue #30275: the pooler stalls the first query after ~15 min idle on Vercel + Next 16.1.
- **Supabase:** native; Free 2 projects, 500 MB; **pauses after 1 week of inactivity**.
- **AWS Aurora:** native install but AWS billing; ~15 s resume from auto-pause.
- **Nile:** only fra1 and pdx1.

**ORM: Drizzle** ✅ (subagent test: Next 16.4.2 + Turbopack build/start OK):
- Versions: `drizzle-orm` **0.45.4** (latest; v1 is `1.0.0-rc.4`, not stable) + `drizzle-kit` **0.31.11** + `pg` 8.23.1 + `@vercel/functions` 3.10.2.
- **Pin the exact versions and forbid v1-only APIs.** `defineRelations` (RQB v2) is `undefined` in 0.45.4, while the docs already show v2.
- `drizzle-kit generate` works offline (6 tables in ~1 s). Commit the SQL migrations.
- Run `drizzle-kit migrate` against `DATABASE_URL_UNPOOLED` from CI on `main`, or in the build only when Neon preview branching is on (otherwise preview builds would migrate prod).

**Prisma, if chosen anyway:**
- `prisma@latest` = **8.0.0-rc.24**: `prisma generate` → "No command registered for `generate`" (exit 2) ✅. `@prisma/client@latest` = 7.10.1 ✅. v7 is supported for 18 months after v8 GA ("expected in October 2026").
- v7 needs a driver adapter (`@prisma/adapter-pg` 7.10.1), the `prisma-client` generator with an `output`, `prisma.config.ts` (use `process.env.DATABASE_URL ?? ""`, otherwise `postinstall` fails without the env), `postinstall: prisma generate`, and `PRISMA_HIDE_UPDATE_MESSAGE=1` (the CLI banner tells agents to upgrade to v8).
- `prisma+postgres://accelerate…` URLs retire **2026-12-01**.

**Pooling on Fluid** 📄✅:
- `attachDatabasePool(pool)` from `@vercel/functions` 3.10.2 keeps the instance alive just long enough to close idle clients. It accepts a `pg.Pool` and the Neon serverless Pool. **postgres.js throws "Unsupported database pool type"** ✅.
- Vercel: "Use a relatively short idle timeout (e.g., 5 seconds)", "Avoid max pool size of 1".
- Neon: "With Vercel Fluid, we recommend… a standard Postgres TCP connection… and a connection pool". Keep the pool small on top of PgBouncer.

### R5. Background jobs on Vercel
**A. 1Click status ("You can close this screen. We'll notify you.")**
- Per [intents-1click.md](intents-1click.md): 1Click has **no webhooks**, so polling is required. The anonymous status budget is ~1,200 req/min per IP, and a 5 s poll ≈ 12 req/min per active deposit.
  - ⚠️ From Vercel that per-IP budget is shared with other tenants. Send the JWT on status calls if the intents KB confirms it raises limits.
- Start a Workflow when the deposit address is issued (or when the user taps "I've sent it").
- Each poll is a step plus a sleep: 3 + 2 = **5 events** 📄 ("a step that succeeds… contributes three events… a sleep contributes two").
- Backoff 5 s → 60 s, ≤ 30 min → ~10–40 polls ≈ 50–200 events per deposit. Hobby's 50k events → **≥ 250 deposits/month free**.
- On a terminal status (`SUCCESS`/`REFUNDED`/`FAILED`/`INCOMPLETE_DEPOSIT`), update `deposit_intent` and notify. After 20 min silent, send "Taking longer than usual".
- The client also polls `/api/oneclick/status` while the screen is open (cheap; same row).
- Alternatives:
  - Queues: self-re-enqueue with `delaySeconds` (beta).
  - Pro cron each minute scanning `deposit_intent where status not terminal` (simple, but Pro-only).
- ⚠️ "On `SUCCESS` auto 'Add to Pot'" (P-7) still needs a **user signature**. The server can only notify "Your $150 arrived. Tap to add it to Lisbon Trip" (consistent with C6 "Finish adding $150"). A pre-signed delegate held server-side would avoid the tap, but nonce/expiry and exact-amount problems make it risky → relayer/intents.

**B. Notification fan-out:** `after()` in `/api/relay` (and in workflow steps). It is bounded by the function's `maxDuration` and not durable; good enough because the notification log dedupes and the reconcile path catches misses.

**C. Reconcile and safety nets:**
- `/api/cron/reconcile` (Hobby: daily; Pro: every minute) re-checks open `deposit_intent`s, compares each active Pot's `get_last_proposal_id` with the DB, and re-sends missed `approval_needed` notifications.
- Must be idempotent (cron can double-fire) and guarded with `CRON_SECRET`.

**D. What would force a worker:** sub-minute server-side reaction to on-chain events that did **not** go through our relayer. That means cross-app activity, e.g. a Trezu vote that must push-notify within seconds. That is not in the MVP.

### R6. Security and abuse controls
**Relayer key custody options:**

| Option | Fits NEAR keys? | Cost | Verdict |
|---|---|---|---|
| Vercel **Secret** env var (`RELAYER_KEYS` = comma-separated `ed25519:` keys for `MultiKeySigner`) | yes | free | **MVP.** Write-only in the UI, but readable by any deployed code. Use **separate Preview/Production accounts and keys** (enable "Separate Production Secret Values"), don't add prod keys to Development, and keep a small float |
| Vercel KMS | ❌ no Ed25519/secp256k1 in docs (RS/PS/ES) | 5k free, then $0.15/10k | not usable ⚠️ |
| **AWS KMS** `ECC_NIST_EDWARDS25519` (`ED25519_SHA_512`, MessageType RAW) via Vercel OIDC (`@vercel/oidc-aws-credentials-provider`, no static AWS keys) | ✅ Ed25519 since 2025-11-07; secp256k1 (`ECC_SECG_P256K1`) for years | $1/key/month + $0.15/10k signs (asymmetric ops excluded from the free tier) | Phase 3 / mainnet. Implement a near-api-js `Signer` whose `signBytes` calls KMS `Sign` on the 32-byte tx hash ⚠️ untested |
| GCP Cloud KMS `EC_SIGN_ED25519` | ✅ 📄 | similar | alternative |

**Relay endpoint checklist** (enforce server-side, in order):
1. Session valid. `delegate.sender_id` equals the session user's `near_account`.
2. Decoded `SignedDelegate` (→ relayer for the decode).
3. `receiver_id` ∈ {pot-factory, `pot.rulebot_id`/`pot.dao_id` rows from **our DB**, usdc}.
4. Every action is a `FunctionCall` with (receiver, method) in an exact allowlist, deposit ≤ 1 yocto (or exactly what the method needs), and gas ≤ cap.
5. For usdc `ft_transfer_call`, the args' `receiver_id` must be a known Rulebot.
6. `max_block_height` ≤ now + N.
7. Quotas: `quota_usage` for `user:<id>/relay` (e.g. 100/day) **and** `global/yocto_spent` (e.g. 3 NEAR/day testnet) **before** signing.
8. `relay_log` `idem_key` unique, so a retried request doesn't double-submit.
9. After sending: record `gas_burnt`. In `after()`, call `viewAccount(relayer)` and, if below 5 NEAR, alert once per hour (`alert_state` upsert, tested ✅).

**Sponsored account and Pot creation abuse:**
- One account per `auth_sub` (unique) and per verified email per day.
- 3 Pots per verified email per day (`email:<sha256(lower(email))>`).
- WAF rule on `/api/onboard|/api/pots` (IP, e.g. 10/10 min).
- BotID Basic `checkBotId()` on both routes.
- Global daily caps on accounts created and NEAR spent (circuit breaker returning "We couldn't send this right now. Nothing was charged.").
- Fund new accounts with the minimum (plan: 0.05 NEAR + storage). Keep the funder's float small and top it up manually.

**Secrets inventory** (all Vercel **Secret**, separate per environment): `RELAYER_KEYS`, `FUNDER_KEY` (if separate), `DEMO_*_KEY` (testnet demo users, C8), `ONECLICK_JWT`, `FASTNEAR_API_KEY` (if bought), `DATABASE_URL`/`_UNPOOLED` (injected by Neon), `VAPID_PRIVATE_KEY`, `RESEND_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `CRON_SECRET`, the session/JWT secret. Public: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `NEXT_PUBLIC_RPC_URLS`.

### R7. CI (GitHub Actions)
| Topic | Fact | Status |
|---|---|---|
| Billing (private repos) | Free 2,000 min/month (Pro/Team 3,000); public repos free on standard runners; usage blocked at the quota without a payment method | 📄 |
| Prices (Jan 1 2026 cut shipped) | Linux x64 2-core $0.006/min, Linux arm64 2-core $0.005, Windows $0.010, macOS $0.062; per job rounded up to whole minutes; the **self-hosted $0.002/min fee was postponed** | 📄 |
| Limits | 20 concurrent jobs (Free); 6 h/job; cache 10 GB/repo, evicted after 7 days unused (over-10 GB pay-as-you-go needs Pro/Team/Ent); artifacts 90 d default | 📄 |
| arm64 runners | public repos GA 2025-08-07 (4 vCPU); **private repos since 2026-01-29 (2 vCPU)**; `ubuntu-24.04-arm` image has **no Chrome/Chromium** | 📄 ✅ |
| `ubuntu-latest` | → **Ubuntu 26.04 between 2026-10-19 and 2026-11-19** (runner-images #14748). Pin `ubuntu-24.04` | ✅ |
| Sandbox | `near-workspaces` 0.23.0 (MSRV 1.93; 0.24.0-rc.2 exists), `near-sandbox` 0.3.16 → nearcore **2.13.4** by default; binary from `s3-us-west-1…/build.nearprotocol.com/nearcore/{Linux-x86_64,Linux-aarch64,Darwin-arm64}/<ver>/near-sandbox.tar.gz` (35 MB x64; download 6–8 s); **needs glibc 2.39** (Ubuntu 24.04 ok, 22.04 fails); `NEAR_SANDBOX_BIN_PATH` skips the build-time download; `NEAR_RPC_TIMEOUT_SECS` (default 10 s) | ✅ |
| Sandbox flakiness | port races fixed (0.3.3); retry corruption fixed (0.3.6); **`NEAR_SANDBOX_BIN_PATH` mutated process-wide (#86, fix merged 2026-10-20, unreleased)**; init errors surface as timeouts (#87, open) → raise `NEAR_RPC_TIMEOUT_SECS` to 60, `--test-threads=2` | 📄 |
| x64 vs arm64 | use **x64 `ubuntu-24.04`**: arm64 is untested upstream, has no Chrome, and fails opaquely; arm64 only as a non-blocking job | ⚠️ inference |
| Rust | pin an exact toolchain in `rust-toolchain.toml` (cargo-near 0.22.0 template: `1.93.0` + `wasm32-unknown-unknown`; confirm with contracts); stable is 1.99.1 and **1.100.0 lands 2026-11-12** mid-hackathon; near-sdk ≥ 5.28 declares `min_protocol_version` 84, which lifts cargo-near's historical 1.86 ceiling | ✅ |
| Tools | `actions-rust-lang/setup-rust-toolchain@v2` (default `build-warnings: deny`, set `""`), `Swatinem/rust-cache@v2` (2.9.3), cargo-near **v0.22.0 via `cargo-near-installer.sh`** (taiki-e has no cargo-near entry and falls back to binstall/source) | ✅ |
| Playwright vs preview | `on: deployment_status` with `state=='success'`; URL = `environment_url` → `target_url`; **Vercel Authentication protects previews by default; Protection Bypass for Automation is on all plans** (`x-vercel-protection-bypass` header or query + `x-vercel-set-bypass-cookie`); prefer setting the cookie once over `extraHTTPHeaders`, which also go to RPC/wallet origins → CORS failures ⚠️ | 📄 |
| Playwright | `@playwright/test` 1.64.1; image `mcr.microsoft.com/playwright:v1.64.1-noble`; devices `iPhone 17` (webkit) and `Pixel 10`; WebKit-on-Linux is only a proxy for iOS Safari | ✅ 📄 |
| Minutes estimate | ~15 min/run (contracts ~5 warm / 12–18 cold, web ~4, e2e ~6) × 10 runs/day × 14 d ≈ **2,100–2,200 min** > Free's 2,000 → make the repo public, path-filter jobs, `cancel-in-progress`, Chromium-only on PRs (≈ 1,500) | ⚠️ estimate |

## Snippets
**1. `vercel.json` (Hobby-safe)** — untested:
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["iad1"],
  "crons": [{ "path": "/api/cron/reconcile", "schedule": "0 4 * * *" }]
}
```
On Pro, change the schedule to `"*/1 * * * *"`. Never set Hobby crons more often than daily, or the **deploy fails**.

**2. RPC providers (server)** — ✅ tested with near-api-js 7.3.1 (failover from a dead host to dRPC; viewAccount 101 ms, callFunction 67–70 ms):
```ts
import { JsonRpcProvider, FailoverRpcProvider } from 'near-api-js';
const auth = process.env.FASTNEAR_API_KEY ? { Authorization: `Bearer ${process.env.FASTNEAR_API_KEY}` } : undefined;
export const rpc = new FailoverRpcProvider([
  new JsonRpcProvider({ url: 'https://rpc.testnet.fastnear.com', headers: auth }, { retries: 2, wait: 200, backoff: 2 }),
  new JsonRpcProvider({ url: 'https://near-testnet.drpc.org' }, { retries: 2, wait: 200, backoff: 2 }),
]);
// rpc.viewAccount({ accountId, blockQuery: { finality: 'final' } })
// rpc.callFunction({ contractId, method: 'get_state', args: {}, blockQuery: { finality: 'final' } })
```

**3. Client polling (browser)** — untested sketch (→ web). Direct RPC, no Vercel invocations:
```ts
useQuery({
  queryKey: ['pot', slug, 'state'],
  queryFn: () => view(rulebotId, 'get_state', {}, 'final'),   // tiny fetch wrapper with [fastnear, drpc] failover
  refetchInterval: (q) => (document.visibilityState === 'visible' ? 3000 : false),
  refetchOnWindowFocus: true,
});
// After a user's own relayed action: invalidate ['pot', slug] immediately (outcome already known).
```

**4. 1Click watcher Workflow** — untested sketch. API names are from the docs (`'use workflow'`, `'use step'`, `sleep`, `start`):
```ts
// app/workflows/watch-deposit.ts
import { sleep } from 'workflow';
export async function watchDeposit(depositAddress: string) {
  'use workflow';
  const delays = ['5s','5s','10s','10s','15s','20s','30s','30s','60s'];
  for (let i = 0; i < 40; i++) {
    const s = await checkStatus(depositAddress);          // step: GET 1Click /v0/status, update deposit_intent
    if (['SUCCESS','REFUNDED','FAILED','INCOMPLETE_DEPOSIT'].includes(s)) { await notifyDeposit(depositAddress, s); return s; }
    if (i === 20) await notifyDeposit(depositAddress, 'SLOW');   // ~20 min silent
    await sleep(delays[Math.min(i, delays.length - 1)]);
  }
  await notifyDeposit(depositAddress, 'TIMEOUT');
}
async function checkStatus(addr: string) { 'use step'; /* fetch + db update; throw to retry */ return 'PENDING_DEPOSIT'; }
async function notifyDeposit(addr: string, s: string) { 'use step'; /* push/email via notification module */ }
// route: import { start } from 'workflow/api'; await start(watchDeposit, [depositAddress]);
```

**5. Atomic quota check-and-increment** — ✅ tested on Postgres 18.4. A 4th call over the limit returns 0 rows. **20 concurrent callers with limit 3 → exactly 3 succeed.**
```sql
INSERT INTO quota_usage(subject, action, n) VALUES ($1, $2, $3)          -- day defaults to current UTC date
ON CONFLICT (subject, action, day) DO UPDATE SET n = quota_usage.n + EXCLUDED.n
WHERE quota_usage.n + EXCLUDED.n <= $4                                  -- $4 = limit
RETURNING n;                                                             -- no row ⇒ over quota ⇒ 429
```
Table: `quota_usage(subject TEXT, action TEXT, day DATE DEFAULT (now() AT TIME ZONE 'utc')::date, n NUMERIC(40,0), PRIMARY KEY(subject, action, day))`. Use `n` for counts or for yocto spent.

**6. Alert at most once per hour** — ✅ tested (second call within the hour → 0 rows):
```sql
INSERT INTO alert_state(key, last_sent_at) VALUES ('relayer_low_balance', now())
ON CONFLICT (key) DO UPDATE SET last_sent_at = now()
WHERE alert_state.last_sent_at < now() - interval '1 hour'
RETURNING 'send';
```

**7. Per-user burst limit with Vercel WAF** — 📄. First create a WAF rule with condition `@vercel/firewall` and rate-limit id `relay`:
```ts
import { checkRateLimit } from '@vercel/firewall';   // 1.2.6
const { rateLimited } = await checkRateLimit('relay', { request, rateLimitKey: `u:${userId}`, timeout: 1000 });
if (rateLimited) return Response.json({ error: 'rate_limited' }, { status: 429 });
```

## Gotchas & failure modes
- **`rpc.testnet.near.org` fails silently slow.** It returns HTTP 200 after +3 s, so no error, no failover, and every user action is 3 s slower. Grep dependencies' default configs for it (NEAR Auth SDK, wallet selector) → auth, web.
- **The FastNEAR public tier is per-IP and penalises bursts.**
  - It allows ≈ 120–200 req/min, then returns 429, then ~1 call/30 s while cooling.
  - One phone polling 2 views every 3 s uses ~40 req/min, which is fine. A household or office behind one NAT with several open tabs could hit it.
  - From Vercel, IPs are shared with other tenants, so throttling is unpredictable. Use a key, or always have dRPC as failover.
  - In browsers a 429 may lack CORS headers and look like a network error 📄.
- **The FastNEAR Tx API is keyless today** on testnet, but its docs say to send a key ⚠️. Wrap it behind one client module so adding `Authorization: Bearer` later is a one-line change. Hashes must be full base58 (a truncated hash → 400).
- **`free.rpc.fastnear.com` is mainnet**, despite appearing in NEAR's provider list.
- **neardata is not a free real-time stream on testnet** (30 blocks/min). `/headers` and the `last_block` redirects count against the same budget while limited.
- **NearBlocks API (testnet) is stale.** Never use it to confirm a tx. Use RPC `tx` / `EXPERIMENTAL_tx_status`. Website links are fine.
- **Cron on Hobby:** once per day, **at any minute of the hour**. A more frequent expression **fails the deployment**. No retries (all plans), possible duplicates and overlap, production only, redirects not followed.
- **Workflow loops cost events:** a 5 s infinite poll = 86,400 events/day. Never use a workflow as a chain watcher.
  - Max 25,000 events per run.
  - Runs stay **pinned to the deployment that started them**. After a rollback they keep running on the old code, so cancel stale runs.
  - Multi-region requires `workflow` ≥ 5.0.0-beta.33. 4.x runs live in `iad1`.
- **`after()`/`waitUntil` share the function's `maxDuration`** (300 s on Hobby) and are not retried.
- **Fluid compute runs concurrent requests in one instance.** Module-level mutable state (cached nonces, a single signer key) races. Use `MultiKeySigner` / a DB-backed nonce or a key lease → relayer.
- **Hobby + a private org repo = no deploys.** Hobby + a private personal repo = only the owner's commits deploy. Agent co-author trailers have been reported to block deploys (community thread, ⚠️). **Making the repo public fixes both** (the hackathon requires a public repo by day 13 anyway).
- **Pro trial = 14 days.** Started Nov 1, it ends Nov 15, and judging runs Nov 16–18. Either pay for Pro for November or make sure everything works on Hobby limits (this design does).
- **Hobby quota overrun pauses the feature for 30 days**, e.g. 1M invocations. Keep client polling off Vercel (direct RPC) so judges hammering the demo can't exhaust invocations.
- **Daemons:** production-only (no preview testing), amd64 only, not supported when the project root is a subfolder (monorepo `apps/web` ⚠️), and `vercel dev` doesn't run them.
- **Prisma trap:** `npx prisma` / `npm i prisma` give the **v8 RC** CLI. An AI agent "fixing" a missing `generate` by upgrading will break the project.
- **Drizzle docs are ahead of the release:** `defineRelations` and RQB v2 are v1-only.
- **Neon preview branching:** the Free plan allows 10 branches/project, and branches only die when deployments expire, so delete them when the PR closes. Without branching, **preview builds must not run migrations**.
- **Neon scale-to-zero:** the first query after 5 idle minutes pays a few hundred ms 📄. This is invisible next to chain latency.
- **Neon Free compute budget is 100 CU-h per project per month.** If CU-hours run out, "compute suspends until the next billing cycle" 📄.
  - A DB kept awake 24/7 at the 0.25 CU minimum ⚠️ burns ~180 CU-h/month. Awake 16 h/day it burns ~120.
  - So **don't run a minute cron or client polling against the DB**. Keep polling on RPC and let Neon sleep.
  - The hackathon window itself (≈ 18 days, mostly idle) fits comfortably.
- **WAF counters are per region.** With a single region this is fine.
- **BotID flags Playwright/Puppeteer.** Add a WAF bypass rule for CI (header + secret), or skip `checkBotId()` when the bypass secret is present.
- **Sandbox CI:** glibc 2.39 is required. Ubuntu 22.04 or `ubuntu-slim` images fail with opaque timeouts (#87).

## Costs, limits, latencies (measured vs documented)
| Item | Measured (✅) | Documented (📄) |
|---|---|---|
| Testnet block interval | p50 560 ms (n=14) | NearBlocks avg 0.645 s |
| Optimistic → visible via RPC | p50 813 ms, p95 1,089 ms after block ts | — |
| Final → visible via RPC | **p50 1,984 ms, p95 2,379 ms** after block ts | — |
| Final block via neardata long-poll | p50 1,746 ms, p95 1,946 ms after block ts | — |
| View call RTT (FastNEAR / dRPC / near.org) | 47–234 ms / 49–375 ms / **3,047–3,116 ms** | near.org deprecated |
| Relayed contribution end-to-end (delegate → `ft_transfer_call` → `ft_on_transfer` → forward → resolve) | not measured (needs a tx). ⚠️ Estimate: ~6–8 receipt hops × ~0.56 s ≈ 3.5–4.5 s to executed-optimistic, plus ~1.2 s to final. The relayer spike should measure it | — |
| FastNEAR REST call | 110–260 ms | `sync_latency_sec` ≈ 2.0 |
| NearBlocks testnet API lag | **≈ 24 days** (last block 2026-09-27) | — |
| neardata public limit | **30 blocks/min** (429 after 32) | "180 requests per minute per IP" (homepage) ❗conflict |
| FastNEAR public RPC limit (per IP, keyless) | 120 req/min sustained OK (2 min); 240 req/min → 429 after 159 calls/40 s (≈ 200/min); burst penalty ~1 call/30 s | not documented |
| FastNEAR Tx API indexing lag (testnet) | **2.8 / 3.6 / 4.8 s** after block timestamp (≈ 1–3 s after finality) | — |
| neardata filter scan | 25 blocks → 21 receipts, 8 matching watched accounts (testnet is quiet) | — |
| dRPC public | 400 calls / 22.9 s, no 429 | ⚠️ 210M CU / 30 d |
| Vercel Hobby compute | — | 4 CPU-h, 360 GB-h, 1M invocations / month |
| Workflow cost per 1Click deposit | — | ~50–200 events (5/poll) → Hobby 50k ≈ 250+ deposits/month |
| Neon Free | — | 100 CU-h/project, 1 GB, scale-to-zero 5 min, cold start a few hundred ms |
| FastNEAR key (optional) | — | $69/month Dev (10M req) |
| AWS KMS (Phase 3) | — | $1/key/month + $0.15/10k signs |
| GitHub Actions | — | Free 2,000 min/month private; est. ~2,100–2,200 min for the hackathon if private |
| Total infra cost, hackathon | — | **$0** on Hobby + free tiers; optional: Pro $20/seat/month, FastNEAR $69, Resend Pro $20 |

## Open questions / needs a human
- **Vercel plan + repo owner (decide by Nov 1):**
  - (a) Hobby, with the repo **public** from day 1 or under the Hobby owner's personal account, with all commits authored by that owner.
  - (b) Pro, $20/seat/month, paid through judging (Nov 18).
  - Option (a) works with this design. A Pro trial alone expires before judging.
  - Who owns the Vercel project and the GitHub repo?
- **Human clicks (Phase 0):**
  - Install Neon from the Vercel Marketplace (Free, region `iad1`, connect to the Pot project for Dev/Preview/Prod; decide on preview branching).
  - Create the WAF rate-limit rule and the `@vercel/firewall` rule id.
  - Enable Protection Bypass for Automation and copy the secret into GitHub `VERCEL_AUTOMATION_BYPASS_SECRET`.
  - Set `CRON_SECRET`.
- **Buy a FastNEAR Dev key ($69/month)?**
  - Recommended if server-side reads or relays show 429s in the day-3 load test.
  - Not required if dRPC failover holds.
  - A key is also needed for any Phase 2 neardata watcher. Sign-up is a human action at dashboard.fastnear.com.
- **Is the repo public during development?** That decides GitHub Actions minutes (free vs ~2,100 min over Free's 2,000) and the Hobby deploy rules.
- → **relayer:**
  - Extend the allowlist to DAO accounts (`act_proposal`/`add_proposal`) if votes go directly to Sputnik.
  - Nonce/key handling under Fluid concurrency (`MultiKeySigner` exists in 7.3.1).
  - Choose the `send_tx` `wait_until` level.
  - 429 → failover semantics (above).
  - Never pre-sign delegates for 1Click auto-add without solving nonce, expiry and amount.
- → **contracts:**
  - The feed history can come from the FastNEAR Tx API (✅ keyless and ~1–3 s after finality today). As a fallback independent of FastNEAR, should Rulebot keep a bounded **on-chain activity view** (`get_activity(from, limit)`)?
  - Either way, emit NEP-297 events (`EVENT_JSON:`) for contribution, join, spend and settle, so `relay_log` and the Tx API logs can be parsed uniformly.
  - Should Pot display metadata (name/emoji/cover) live in Rulebot state?
- → **auth:** is `email_verified` + email available server-side (for 3 Pots/email/day)? Does the NEAR Auth SDK default to `rpc.testnet.near.org` anywhere?
- → **intents:** confirm the 1Click status cadence and terminal set for the workflow. Is there any webhook alternative to polling?
- → **web:**
  - Client RPC failover list `[fastnear, drpc]`, a 3 s visible-only poll, and handling CORS-less 429s.
  - The feed timeline can call `tx.test.fastnear.com/v0/account` and `/v0/transactions` directly (CORS ok), merged with optimistic local items.
- → **sputnik:** confirm the `get_proposals` field set and pagination for the feed (shape above came from `potspike-dao-svuw`).
- ⚠️ **Not measured here:**
  - Latency from Vercel `iad1` to the RPCs (all numbers above are from Bucharest).
  - End-to-end relayed-tx latency (needs a tx → relayer spike).
  - Web Push delivery latency to a real device (→ web, day 11).
  - Whether the FastNEAR Tx API will start requiring a key.

## Sources
All accessed 2026-10-21.
- https://vercel.com/docs/functions/limitations (last_updated 2026-08-24): durations 300/800/1800 s, memory, 4.5 MB body, regions, 1,024 FDs
- https://vercel.com/docs/functions/usage-and-pricing: Hobby 4 CPU-h / 360 GB-h / 1M invocations; regional prices (iad1 $0.128/CPU-h, $0.0106/GB-h); $0.60/M invocations
- https://vercel.com/docs/cron-jobs, /docs/cron-jobs/usage-and-pricing, /docs/cron-jobs/manage-cron-jobs: plan limits, CRON_SECRET, no retries, duplicates, production-only GET
- https://vercel.com/docs/workflows, /docs/workflows/pricing, /docs/workflows/concepts; https://workflow-sdk.dev/docs/how-it-works/event-sourcing; https://vercel.com/blog/a-new-programming-model-for-durable-execution (GA 2026-04-16): Workflow model, pricing, limits, event counts
- https://vercel.com/docs/queues, /docs/queues/pricing: Queues beta, limits, pricing
- https://vercel.com/docs/daemons, /docs/daemons/limits; https://vercel.com/changelog/vercel-daemons-is-now-in-public-beta (2026-10-15): Daemons
- https://vercel.com/docs/kms, /docs/kms/pricing, /docs/kms/ts-sdk-reference, /docs/rest-api/kms/create-a-signing-key; npm `@vercel/kms` 0.3.5 tarball: KMS algorithms and pricing
- https://vercel.com/docs/plans/hobby, /docs/plans/pro-plan/trials: Hobby limits and terms; Pro trial 14 days / $20 credit
- https://vercel.com/docs/git, /docs/deployments/troubleshoot-project-collaboration, https://vercel.com/changelog/claude-code-and-cursor-agent-no-longer-require-a-team-seat, https://community.vercel.com/t/vercel-deployment-blocked-for-cursor-agent-co-authored-commits-on-hobby-team/35720: Hobby collaboration rules
- https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting, /rate-limiting-sdk: WAF rate-limit plans and SDK
- https://vercel.com/docs/environment-variables/sensitive-environment-variables: Config vs Secret env vars
- https://vercel.com/docs/functions/configuring-functions/region: iad1 default, plan region counts
- https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package: `after()`, `waitUntil`, `attachDatabasePool`, `getCache`, `upgradeWebSocket`
- https://vercel.com/docs/botid: BotID plans and pricing
- https://vercel.com/docs/functions/runtimes/edge: "Starting in Next.js 16.3, setting `runtime = 'edge'` is no longer supported"
- https://vercel.com/changelog/websocket-support-is-now-generally-available (2026-10-20)
- https://upstash.com/pricing/redis: free 500K commands/month, 250 MB, 1 DB; PAYG $0.2 per 100K commands (not needed if quotas live in Postgres)
- https://railway.com/pricing, https://docs.fly.io/about/pricing, https://render.com/docs/free: worker-host alternatives
- https://www.near.org/blog/deprecation-of-near-org-and-pagoda-co-rpc-endpoints (2025-05-19): near.org RPC deprecation and limits
- https://docs.near.org/api/rpc/providers: provider list (testnet FastNEAR, dRPC, Intear…)
- Live tests 2026-10-21: `rpc.testnet.fastnear.com`, `test.rpc.fastnear.com`, `archival-rpc.testnet.fastnear.com`, `rpc.testnet.near.org`, `near-testnet.drpc.org`, `testnet-rpc.intea.rs`, `free.rpc.fastnear.com`, `test.api.fastnear.com`, `tx.test.fastnear.com` (`/v0/account`, `/v0/transactions`), `testnet.neardata.xyz`, `api-testnet.nearblocks.io`, `testnet.nearblocks.io`: latencies, limits, freshness (scripts listed at top)
- https://fastnear.com (plans $69/$199/$499); https://docs.fastnear.com/rpc, /auth, /auth/browser-keys, /api, /tx, /transfers, /neardata, /openapi/transactions.json: endpoints, auth, browser keys, Tx API schema, Transfers mainnet-only
- https://testnet.neardata.xyz/ (homepage rate-limit text) + live 429 body: neardata limits
- https://nearblocks.io/apis: NearBlocks plans; live `api-testnet.nearblocks.io` and `testnet.nearblocks.io` checks
- https://docs.near.org/data-infrastructure/lake-framework/near-lake.md: NEAR Lake deprecated 2026-03-24
- https://docs.near.org/data-infrastructure/data-api.md: data API overview
- https://docs.intear.tech/llms.txt, https://docs.intear.tech/api.md: Intear API replaces the Events API
- https://drpc.org/docs/howitworks/ratelimiting (⚠️ via search summary only; page not machine-readable)
- near-api-js 7.3.1 `lib/index.js` (src/providers/fetch_json.ts, failover-rpc-provider.ts) and `lib/index.d.ts` (`MultiKeySigner`, `JsonRpcProvider`): retry and failover semantics
- https://aws.amazon.com/about-aws/whats-new/2025/11/aws-kms-edwards-curve-digital-signature-algorithm/, https://aws.amazon.com/kms/pricing/: AWS KMS Ed25519 and pricing
- https://docs.cloud.google.com/kms/docs/algorithms: GCP `EC_SIGN_ED25519`
- https://neon.com/docs/introduction/plans, /docs/guides/vercel-managed-integration, /docs/guides/vercel-connection-methods, /docs/connect/connection-latency: Neon Free, env vars, pooling, cold start
- https://www.prisma.io/docs/orm/release-status, /docs/guides/upgrade-prisma-orm/v7, /pricing, /docs/guides/postgres/vercel; https://github.com/prisma/orm/issues/30275: Prisma 7/8 status and Prisma Postgres
- https://supabase.com/pricing, https://supabase.com/docs/guides/integrations/vercel-marketplace: Supabase Free
- https://vercel.com/kb/guide/connection-pooling-with-functions: Fluid pooling guidance
- npm registry (`npm view`): next 16.4.2, workflow 5.2.3, @vercel/queue 0.8.0, @vercel/kms 0.3.5, @vercel/functions 3.10.2, @vercel/firewall 1.2.6, @upstash/ratelimit 2.2.0, near-api-js 7.3.1, prisma 8.0.0-rc.24 / @prisma/client 7.10.1, drizzle-orm 0.45.4 / drizzle-kit 0.31.11, pg 8.23.1
- crates.io API: near-workspaces 0.23.0 (0.24.0-rc.2), near-sandbox 0.3.16 (0.4.0-rc.2), near-sdk 5.29.1 (5.30.0-rc.1)
- https://docs.github.com/en/billing/concepts/product-billing/github-actions, /billing/reference/actions-runner-pricing, /actions/reference/limits, /actions/reference/workflows-and-actions/dependency-caching; https://github.blog/changelog/2025-12-16-coming-soon-simpler-pricing-and-a-better-experience-for-github-actions/, /2026-01-01-reduced-pricing-for-github-hosted-runners-usage/, /2026-01-29-arm64-standard-runners-are-now-available-in-private-repositories/, /2025-11-20-github-actions-cache-size-can-now-exceed-10-gb-per-repository/: Actions billing, limits, arm64
- https://github.com/actions/runner-images/issues/14748 (fetched myself): ubuntu-latest → 26.04, Oct 19 – Nov 19 2026
- https://github.com/near/near-sandbox-rs (src, issues #58 #59 #86 #87), https://github.com/near/near-workspaces-rs: sandbox download, env vars, flakiness
- https://github.com/near/cargo-near/releases (v0.22.0 assets, installer), https://releases.rs/: cargo-near and Rust release dates
- https://playwright.dev/docs/ci, https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation, https://vercel.com/kb/guide/locking-down-deployments, https://vercel.com/docs/git/vercel-for-github: e2e against previews

## Review corrections (2026-10-21)

From the security review's fact check ([../plan/review-security.md](../plan/review-security.md) §4, F-04a). The body above is unchanged.
- **Chain:** testnet is now at **protocol 88** (was 87, "latest 88") on nearcore 2.14.0-rc.5, since 2026-10-21 ≈ 08:00-14:00 UTC. Mainnet is still 86.
