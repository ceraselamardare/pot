# Pot risk register

> Owner: planner (maintained during the event by P1, reviewed by Cerasela in the 19:00 ritual, [implementation-plan.md](implementation-plan.md) §7). Written 2026-10-21.
> Sources: [decisions.md](decisions.md) Rev 2, the original plan C9, the specs in this folder, the KB "Gotchas" sections, and the spikes.
> **Scale.** Likelihood (L) and impact (I): **H** high, **M** medium, **L** low. Impact H = a gate fails or judges can't verify a core claim; M = a Phase-2 feature or a demo moment is lost; L = cosmetic or cheap to work around. **Trigger date** = when the owner must check the signals and, if they fire, apply the fallback. Status starts as "open" for every risk.
> **Rev 3 review (2026-10-21, [review.md](review.md)):** R-15 points to the specified `FLAG_DEMO_PUSH` option, R-23's fallback uses `limits.max_members`, and R-31 (week-1 overload) is new.
> **Rev 4 security fixes (2026-10-21, [review-security.md](review-security.md) §7):** R-02, R-08, R-10, R-12, R-19, R-20, R-21, R-22, R-24 and R-31 are updated; new R-32 (hub NEAR drain), R-33 (deferred security hardening, accepted for the event), R-34 (a custody key stolen before the lock), R-35 (a leaked invite link) and R-36 (ID-token replay).
> **Rev 5 (2026-10-21, decisions.md Revision 5):** R-33's pending lead decision is resolved (the rulebot loses `transfer:RemoveProposal`; `withdraw_request` is Phase 3, not built), and R-31 gets C-19's freed Nov 10 slot.
> **How to use it:** at 19:00 each day, read the rows whose trigger date is today or past, note any signal seen, and change L, I or status. A fired fallback is recorded with the date and moved to "mitigated" or "accepted".

## 0. Top risks (H × H, H × M or M × H)

R-13 scope creep · R-14 one person blocked or sick · R-31 week-1 overload · R-01 NEAR Auth whitelist · R-10 demo-pool exhaustion · R-15 push on an installed iPhone · R-08 relayer drain · R-24 judges can't verify · R-02 testnet NEAR supply · rev4: R-34 a custody key stolen before the lock · R-32 hub NEAR drain.

## 1. Summary

| ID | Risk | L | I | Owner | Trigger date | Status |
|---|---|---|---|---|---|---|
| R-01 | NEAR Auth won't whitelist our origin by Nov 8 | H | M | Cerasela | Oct 27 follow-up · **Nov 8 18:00** (G4) | open |
| R-02 | Not enough testnet NEAR | M | H | P1 | **Oct 31 20:00** · Nov 5 · daily balances | open |
| R-03 | 1Click chain pauses or outage (Oct 1 precedent) | M | M | P1 | Nov 10 18:00 · Nov 11 AM | open |
| R-04 | FastNEAR 429s; Vercel functions share egress IPs | M | M | P1 | Nov 3 · Nov 11 (load test) | open |
| R-05 | Vercel Hobby limits, or the Pro trial ending before judging | M | M | both | **Oct 28** (H-04) · Nov 14 | open |
| R-06 | NEAR Auth popup fails inside an installed iOS PWA | M | M | Cerasela | **Oct 25** (spike §D) · Nov 11 | open |
| R-07 | Sputnik ABI drift between testnet (`Ea8t…`) and mainnet (`DtHZ…`) | L | M | P1 | Nov 2 (A/B matrix) · Nov 10 (mainnet hub) | open |
| R-08 | Relayer drain and abuse | M | H | P1 | Nov 6 (prod) · **Nov 13** (public repo) · daily | open |
| R-09 | A DAO's NEAR float runs out | L | M | P1 | Nov 4 (calibration) · daily | open |
| R-10 | Demo pool exhausted or broken while judges visit | M | H | P1 | Nov 6 · Nov 8 · **Nov 15-18** | open |
| R-11 | CI image and Rust release changes (Ubuntu 26.04; Rust 1.100 on Nov 12) | M | M | P1 | **Nov 1** (pins) · Nov 12 | open |
| R-12 | A hub bug found after the Nov 12 lock | L | H | P1 | Nov 12-18 | open |
| R-13 | Scope creep | H | H | both | every gate (Nov 3, 5, 7, 10) | open |
| R-14 | One person blocked or sick | M | H | both | daily standup | open |
| R-15 | Push on an installed iPhone can't be shown on the hosted origin | H | M | both | **Nov 8** (G4) · Nov 11 | open |
| R-17 | Submission rejected or blocked (name taken, 403, 409, 400) | M | H | Cerasela | **Oct 22** (name) · Nov 13 | open |
| R-18 | X video length limit or posting account problems | M | M | Cerasela | Oct 31 · Nov 12 | open |
| R-19 | Testnet or RPC outage, or a protocol upgrade, during the event or judging | L | H | P1 | daily · Nov 15-18 | open |
| R-20 | A critical advisory in a pinned dependency (Next.js, near-api-js) | M | M | P2 | daily (CI `security` job) | open |
| R-21 | NEAR Auth shared tenant changes or goes down (no SLA; "D13" hashed `sub`) | L | H | Cerasela | Oct 22 (ask) · daily on localhost | open |
| R-22 | A secret leaks when the repo goes public | L | H | P1 | Nov 11-13 (X-17) | open |
| R-23 | Gas or storage estimates wrong (prepay, 300 Tgas close at 40 members) | M | M | P1 | **Nov 4** (C-09) · **Nov 9** (T-73) | open |
| R-24 | AI judges can't verify the claims (no JS, no login, README drift) | M | H | both | Nov 6 · nightly · Nov 13 | open |
| R-25 | Hallway round B: join + pay takes ≥ 2:00 | M | M | Cerasela | **Nov 7** | open |
| R-26 | Relayer key-pool or nonce contention under judge load | L | M | P1 | Nov 11 (B-19) | open |
| R-27 | Pro-rata or ledger bug produces wrong refunds | L | H | P1 | Nov 9 · Nov 10 | open |
| R-28 | Mainnet clip funds lost or stuck | L | L | humans | Nov 11 | open |
| R-29 | Neon Free limits or cold starts slow the API | L | M | P1 | Nov 6 · Nov 11 | open |
| R-30 | Hackathon rules change during the event | L | M | Cerasela | Nov 1 · Nov 7 · Nov 13 | open |
| R-31 | Week-1 overload: ≈ 69-70 h of estimated tasks per person over Nov 1-7 against 63 h (rev3 recount); rev4 adds ≈ 4.5 h (P1) and ≈ 2 h (P2) | H | M | both | daily standup, Nov 2-7 | open |
| R-32 | Hub NEAR drained (direct calls, a compromised relayer key, or an owner adding a relayer) | L | H | P1 | Nov 1 (C-03) · Nov 6 (prod) · daily (`hub_budget`) | open |
| R-33 | Deferred security hardening, accepted for the event (review-security §7 list) | M | M | P1 | Nov 11 (X-17) | accepted |
| R-34 | A custody key (hub, root, token, reserve, recovery) is stolen before the lock | L | H | P1 | Oct 23 (H-17) · Nov 2 · Nov 12 | open |
| R-35 | A leaked invite link lets strangers join a Pot | M | M | Cerasela | Nov 5 (C-10) · Nov 13 (public) | open |
| R-36 | NEAR Auth ID-token replay or a phished device pairing | L | H | P1 | Nov 8 (G4) · Nov 9 (B-20) | open |

## 2. Details

Format: **Signals** (early warning) · **Mitigation** (done in advance) · **Fallback** (if it happens) · **Owner / trigger**.

### R-01 · NEAR Auth won't whitelist our origin by Nov 8 (L: H · I: M)
- **Signals:** no answer by Oct 27; an answer without a date; a request for exact URLs we haven't fixed yet (H-06, H-07 late).
- **Mitigation:** H-01 sent on Oct 22 with exact origins (a domain avoids depending on `*.vercel.app`), asking for a dedicated client id first (rev4; a whitelist on the shared client is the fallback, R-36); both fallbacks of D-22 are built anyway: `/demo` personas (MVP) and NEAR Connect (F-19, Nov 8); NEAR Auth fully works on `localhost:3000` for P-1 and the video.
- **Fallback:** at G4 (Nov 8, 18:00): hosted app = `/demo` + NEAR Connect; `FLAG_NEAR_AUTH` off on hosted builds; README limitation line; video caption "Google sign-in shown on localhost".
- **Owner / trigger:** Cerasela · Oct 27, Nov 3 follow-ups · Nov 8 decision.

### R-02 · Not enough testnet NEAR (L: M · I: H)
- **Signals:** no grant answer by Oct 27; < 33 NEAR usable on Oct 31; the faucet rate-limited; `hub_low` or `relayer_low` alerts earlier than the budget predicts (accounts-and-deploy §2.3).
- **Mitigation:** ask early (H-02, Oct 22; rev4: ≈ 74 NEAR); the 0.05 DAO float (D-05 Rev 2) cuts ≈ 12 NEAR versus 0.25; sweep spike leftovers (≈ 7 NEAR); rev4: the 1-yocto MPC deposit is proven, so the 6 NEAR that sat parked for MPC slots is free; the hub now sponsors only relayed calls (direct calls can't spend its NEAR); daily balance check in the ritual; the relayer's global daily yocto cap (api-spec §3.5).
- **Fallback:** the lean plan (≈ 45 NEAR): preview hub 4 NEAR, preview capped at 30 Pots, demo pool of 50 leases, no `pots-v2` reserve. Faucet sweeping only with a human OK. Last resort: pool target 3 instead of 6 and the shared nightly Pot.
- **Owner / trigger:** P1 · Oct 31 20:00 (≥ 33), Nov 5 (≥ 55 for the Nov 6 prod deploy).

### R-03 · 1Click chain pauses or outage (L: M · I: M)
- **Signals:** the Shield status JSON (`partners.near-intents.org/api/shield/public/status`) shows incidents for Base, Arbitrum or Solana (Base paused 100 min on Oct 15, Ethereum 33 min on Oct 17); quotes return "Quoting for this pair is not available"; status stuck in PROCESSING.
- **Mitigation:** D-50: hide paused chains via Shield; testnet uses the simulator, so the judged path never depends on 1Click; the mainnet clip is Phase 2 and cuttable; refunds go to the member's NEAR Intents balance (`refundType: INTENTS`).
- **Fallback:** switch the clip from Base to Arbitrum; if all are paused on Nov 11, re-try Nov 12 AM, then cut the clip (submission-plan §6) and show the labeled simulator.
- **Owner / trigger:** P1 · Nov 10 18:00 go/no-go · Nov 11 AM before recording.

### R-04 · FastNEAR 429s; Vercel functions share egress IPs (L: M · I: M)
- **Signals:** HTTP 429 or JSON-RPC `-429` in server logs or `error_log`; `rpc_degraded` alerts; slow `/j` SSR; failover to dRPC staying on.
- **Mitigation:** browsers read the chain directly (D-32), so server reads are few; failover FastNEAR → dRPC on 429 in both clients (U-01); `'use cache'` on the `/j` and `/demo` server reads; never `rpc.testnet.near.org` (lint + CI grep).
- **Fallback:** buy a FastNEAR Dev key ($69/month, H-16) and send it as a bearer header on server reads; raise the SSR cache lifetimes; at worst pin server reads to dRPC.
- **Owner / trigger:** P1 · Nov 3 (first real server traffic) · Nov 11 (B-19 load test).

### R-05 · Vercel Hobby limits, or the Pro trial ending before judging (L: M · I: M)
- **Signals:** H-04 undecided on Oct 28; P1's commits not deploying (Hobby + private repo); quota warnings (Hobby pauses a feature for 30 days when a quota is exceeded); the trial banner.
- **Mitigation:** the design runs on Hobby (daily cron is a safety net only; DB tables replace logs); recommended default = Pro paid for November, so judging (Nov 16-18) is covered; client polling goes to RPC, not to `/api/*`.
- **Fallback:** Hobby + a public personal repo; the cron reconcile runs once a day (04:00 UTC) and `relay_log`/`error_log` replace the 1 h logs.
- **Owner / trigger:** both · Oct 28 decision · Nov 14 (plan paid through Nov 18?).

### R-06 · NEAR Auth popup fails inside an installed iOS PWA (L: M · I: M)
- **Signals:** spike §D outcome **b** (the login opens in Safari and never returns) or **c** (nothing opens); QA-1 on Nov 3 reproduces it on our build.
- **Mitigation:** the session is a cookie (copied at install, iOS 17.2+); the app works fully in a Safari tab and install only adds push (C9); the popup is pre-opened inside the tap, with a redirect fallback (frontend §4.4).
- **Fallback:** "Pair from Safari" (D-21 fallback: B-15 + F-23 UI) moves up the Phase-2 list; if that is cut, installed-iPhone users keep using a Safari tab and the push demo uses Android or the R-15 option.
- **Owner / trigger:** Cerasela · Oct 25 (spike decision) · Nov 11 (QA-3).

### R-07 · Sputnik ABI drift between testnet and mainnet (L: L · I: M)
- **Signals:** a sandbox test passes on build A and fails on B (or the reverse); `ERR_WRONG_KIND` or "Failed to deserialize" on mainnet only; proposal byte sizes outside the prepay margin on B.
- **Mitigation:** every contract test runs on both builds (D-65, test-plan §2.1); `act_proposal` always carries the exact kind (D-05); `deny_unknown_fields`-safe config keys only; the known type differences are JSON-identical (contracts-spec §7.2).
- **Fallback:** a B-only failure blocks the mainnet clip, not the testnet product; fix in the hub before C-20 or cut the clip.
- **Owner / trigger:** P1 · Nov 2 (first A/B run) · Nov 10 (mainnet deploy).

### R-08 · Relayer drain and abuse (L: M · I: H)
- **Signals:** `relay_yocto` approaching the 5 NEAR/day cap; spikes in account creation, faucet claims or Pot creation; many rejected delegates from one user; `relayer_low` alerts; traffic jumps after the repo goes public on Nov 13; rev4: `proposal_not_tracked` refusals or `finalize` quota trips (someone probing R11).
- **Mitigation:** the D-24 allowlist (deposit exactly 1 yocto only on `ft_transfer_call` to the hub, 0 everywhere else; gas caps; method and args checks) tested by A-01; quotas per user, per Pot and global (A-02); BotID on account creation, Pot creation, the faucet and (rev4) new demo leases; one WAF rate-limit rule; key pool on a ≤ 15 NEAR hot balance with a recovery key in the custody account (accounts-and-deploy §5.1); the dev session never on production. Rev4 (review-security H-2): R11 relays votes only on live, hub-tracked proposals for members, at exactly 100 / 300 Tgas, `Finalize` ≤ 3 per proposal per day, and per-user daily budgets (`relay_yocto` 0.2 NEAR, `hub_yocto` 0.3 NEAR) trip long before the global cap, so two abusers can no longer stop the relayer for everyone (A-22, A-23).
- **Fallback:** the kill switches: `FLAG_*` to disable `/api/relay` or a route; lower `QUOTA_*` env values; key revocation from the recovery key (§5.1); hub `set_config {paused: true}` for contract-level abuse (close, sync and votes keep working).
- **Owner / trigger:** P1 · Nov 6 (prod live) · Nov 13 (public) · daily balance check.

### R-09 · A DAO's NEAR float runs out (L: L · I: M)
- **Signals:** `add_proposal` fails with `LackBalanceForState`; a DAO's `get_available_amount()` < 0.02 NEAR; prepay smaller than the measured storage delta (T-20 assertion).
- **Mitigation:** D-05 Rev 2: every hub-created proposal carries its own storage prepay in the same batch; calibration on Nov 4 (C-09) with margins; per-Pot request quotas against griefing members.
- **Fallback:** the backstop top-up (0.05 NEAR from the relayer when below 0.02, at most hourly per DAO; api-spec §3.5; rev4: demo and reference Pots only, ≤ 2 per DAO, review-security M-4); for a user Pot, a manual transfer (accounts-and-deploy §5.6) after checking its majority didn't withdraw the float; raise `dao_float` with `set_config` (≤ 0.5 NEAR).
- **Owner / trigger:** P1 · Nov 4 · daily alert check.

### R-10 · Demo pool exhausted or broken while judges visit (L: M · I: H)
- **Signals:** fewer than 3 `ready` pool Pots; the `refill_demo_pool` Workflow failing (`workflow_stuck` alert); the `demo_yocto` budget hit; leases falling back to the shared Pot; E-10 failing in the nightly run; rev4: many `lease` quota trips or `bot_detected` on the lease route (someone farming leases).
- **Mitigation:** a pool of 6 pre-seeded Pots (D-33) refilled up to 3 per run; the seeding script works by hand (B-08) before the Workflow exists (B-12); the shared nightly Pot as the fallback; a permanent reference Pot that is never leased, so the README CLI twins never change; 2 h leases. Rev4 (review-security H-5): BotID on every new lease and 10 leases a day per IPv4 address or IPv6 /64; demo quotas keyed by visitor and IP net; the reference Pot is read-only (its personas hold no key); the shared Pot can't be closed or have its rules changed and is reseeded below $300; the simulator gives demo sessions at most $150 (A-26, A-27).
- **Fallback:** P1 runs the seeding script by hand (human signs); raise the demo budget; during judging (Nov 15-18) check the pool twice a day and top up the hub and relayer.
- **Owner / trigger:** P1 · Nov 6 (first seeding) · Nov 8 (Workflow) · Nov 15-18 twice daily.

### R-11 · CI image and Rust release changes (L: M · I: M)
- **Signals:** jobs suddenly failing on glibc or toolchain errors; a warning that `ubuntu-latest` now means 26.04 (it moves between Oct 19 and Nov 19); Rust **1.100.0 ships Nov 12**; a cargo-near installer URL change; `near-sandbox` download failures.
- **Mitigation:** `runs-on: ubuntu-24.04` everywhere; `rust-toolchain.toml` = 1.93.0; cargo-near installed from the pinned 0.22.0 installer URL; the sandbox binary cached with `NEAR_SANDBOX_BIN_PATH`; lockfiles committed; no release candidates (D-12).
- **Fallback:** re-run with the cached binary; pin the action versions; if GitHub runners misbehave on Nov 12, build the release wasm locally on an arm64 Mac with the same pins and record its sha256 in `RELEASES.md`.
- **Owner / trigger:** P1 · Nov 1 (pins in X-02) · Nov 12 (release day).

### R-12 · A hub bug found after the Nov 12 lock (L: L · I: H)
- **Signals:** a nightly E-tier failure on prod after Nov 12; a judge-reported issue; an INV violation found in review.
- **Mitigation:** the full A/B + protocol-88 matrix green before the lock; the pre-lock checklist (accounts-and-deploy §3.10); a layout-compatible Phase-2 release on Nov 9 leaves Nov 10-11 for fixes; the owner's `set_config` pause still works after the lock (rev4: within coded ranges, and the owner itself can't be changed).
- **Fallback:** accounts-and-deploy §5.5: S1 (funds at risk) → pause within minutes, README banner, `pots-v2` for new Pots, affected groups can remove the rulebot role by vote; S2 (liveness) → route around it in the app or `pots-v2`; S3 (a view) → compute it client-side in pot-sdk.
- **Owner / trigger:** P1 · Nov 12-18.

### R-13 · Scope creep (L: H · I: H)
- **Signals:** a task's estimate exceeded by > 50 %; a gate missed; new "small" features appearing in PRs without a task ID; polish before the gate's criteria pass.
- **Mitigation:** the MVP and Phase-2 lists and the cut order are fixed (implementation-plan §1); every PR carries a task ID; gates checked on phones every evening; the feature freeze on Nov 10 is absolute.
- **Fallback:** apply the cut order from the top at the next standup; record each cut in the README limitations.
- **Owner / trigger:** both · every gate (Nov 3, 5, 7, 10).

### R-14 · One person blocked or sick (L: M · I: H)
- **Signals:** someone blocked > 4 h on one issue; a missed standup; illness; a day with < 5 h of work.
- **Mitigation:** both people know the whole plan; docs in the repo; small PRs merged daily; Claude Code sessions are reproducible from the task table; each week-1 day has an evening overflow slot; P1's background test sessions keep contract coverage moving.
- **Fallback:** **P1 out:** freeze contracts at the last green release (the hub on preview/prod keeps working), P2 continues frontend work against what is deployed, and Phase-2 contract items (rules, close) are cut in order; deploys that need signing wait for P1 or a second keyholder (store the root key backup in the vault for exactly this). **P2 out:** P1 finishes the MVP flows using the mocks and the ux-spec copy as-is; Phase-2 UI is cut (push, stepper, rules editor), close stays if C-16 is done; the backup video from Nov 7 becomes the submission video. A blocked person asks for help at the 13:30 sync, not at the end of the day.
- **Owner / trigger:** both · daily standup.

### R-15 · Push on an installed iPhone can't be shown on the hosted origin (L: H · I: M)
- **Signals:** no H-01 whitelist (R-01) and NEAR Connect wallets don't work inside an installed iOS PWA; api-spec §2.6 refuses push subscriptions in demo sessions (`demo_forbidden`).
- **Mitigation:** decide at G4 (Nov 8): allow push subscriptions for demo sessions behind `FLAG_DEMO_PUSH` (testnet only, pool leases only, scoped by `push_subscription.demo_pot_id`; specified in api-spec §2.6, implementation-plan §10 #19; default on); or demonstrate push on Android (Chrome supports push in tabs and installed apps) and desktop.
- **Fallback:** the video shows push on Android; P-10 is demonstrated on desktop Chrome (W-04); the README says iOS push needs a whitelisted login.
- **Owner / trigger:** both · Nov 8 · Nov 11 (QA-3).

### R-17 · Submission rejected or blocked (L: M · I: H)
- **Signals:** someone else announces a project called "Pot"; the API returns 400/403/409/413/503; the payload grows past 12,000 bytes; `nearAddress` turns out to be a testnet account.
- **Mitigation:** a distinctive `projectName` + fallback chosen on Oct 22 (H-06); submit on Nov 13 with Nov 14 as buffer; `requestId` generated once and stored outside git; the JSON validated and printed before the POST (submission-plan §4); the API is never called outside the window or "to test".
- **Fallback:** 400 → fix the listed fields, same `requestId`; 503 → wait a minute, same `requestId`; 413 → shorten `idea`; 403 or 409 → stop and ask the humans (never rename around a 409).
- **Owner / trigger:** Cerasela · Oct 22 (name) · Nov 13.

### R-18 · X video length limit or posting account problems (L: M · I: M)
- **Signals:** the composer rejects the upload; the account is new, restricted or locked; the post isn't visible logged out.
- **Mitigation:** a ≤ 2:20 cut always exists (submission-plan §2.2); the posting account confirmed and its video limit checked in the composer by Oct 31 (H-14); post at 11:00 UTC on Nov 13, leaving 7 h before the internal deadline.
- **Fallback:** post screenshots (the rule allows "video or screenshots attached") plus a link to the full video; use a teammate's account.
- **Owner / trigger:** Cerasela · Oct 31 · Nov 12 (export both cuts).

### R-19 · Testnet or RPC outage, or a protocol upgrade (L: L · I: H)
- **Signals:** FastNEAR and dRPC both failing; blocks stalling; a testnet protocol upgrade announcement (rev4: testnet moved from 87 to protocol **88** on 2026-10-21, review-security F-4a; mainnet is still 86, so the pins stay); the nightly smoke failing for chain reasons.
- **Mitigation:** two RPC providers with failover; the protocol-88 CI job now proves the hub works on testnet's **current** protocol; near-sdk 5.29.1 avoids features that changed (contracts-spec §9.3); the backup video and README screenshots show everything working.
- **Fallback:** during an outage the README points judges to the video, the sandbox tests (J-8, no network needed) and recorded receipts; after an upgrade, re-run E-10/E-11 and fix forward (before the lock) or note the limitation (after it).
- **Owner / trigger:** P1 · daily nightly report · Nov 15-18.

### R-20 · A critical advisory in a pinned dependency (L: M · I: M)
- **Signals:** a GitHub advisory for next, react, near-api-js, auth0-spa-js or web-push; the CI `security` job failing (next 16.0.0-16.4.0 already had a critical RCE, D-40).
- **Mitigation:** D-40 pins with next ≥ 16.4.1; lockfile committed; `pnpm audit --prod` in CI; rev4 (review-security M-8): the SEC-1 lockfile check enforces next ≥ 16.4.1 because the npm advisory database doesn't list GHSA-673q-mjm6-r5xr yet, so `pnpm audit` alone would miss a downgrade; repo Dependabot alerts; no typed arrays returned from `'use cache'`; no third-party scripts on app routes; static security headers enforced from Nov 1 and a CSP report-only experiment from Nov 11.
- **Fallback:** bump only the affected package to the patched patch release, run the full CI, deploy (human "yes"); never take a major or a release candidate during the event.
- **Owner / trigger:** P2 · daily.

### R-21 · NEAR Auth shared tenant changes or goes down (L: L · I: H)
- **Signals:** login or MPC signing fails on `localhost:3000`; the JWKS keys change; derived public keys change for an existing `sub` (the "D13" hashed-`sub` change would do that); the approval form changes.
- **Mitigation:** ask about D13 timing and an SLA in H-01 (rev4: and ask for a dedicated client id, preferred); device keys mean everyday actions never touch NEAR Auth, so an outage only blocks new logins and new devices; JWKS cached by `jose`; rev4: `/api/devices` re-checks `derived_public_key(sub)` before paying for a `sign`, so a hashed-`sub` change fails for free (A-30).
- **Fallback:** demo personas and NEAR Connect cover hosted use; the video's NEAR Auth scene uses the Nov 6-11 recordings; if `sub` hashing changes mid-event, existing accounts keep working through their device keys and new logins get new accounts (README note).
- **Owner / trigger:** Cerasela · Oct 22 (question asked) · daily during localhost work.

### R-22 · A secret leaks when the repo goes public (L: L · I: H)
- **Signals:** gitleaks hits; a key-like string in history, issues or CI logs; a `.env` file tracked.
- **Mitigation:** keys only in Vercel Secret env vars, the vault and (rev4) the custody account (accounts-and-deploy §1.5): the hub, root, reserve and treasury keys are never on disk in the agents' OS user, and agents only get the preview relayer keys through env vars (R-34); `.gitignore` from X-01; `deny` rules on reading `.env*` and `~/.near-credentials` for agents (implementation-plan §9.2); no Secret in Vercel's Development environment; gitleaks on every PR and on the full history before the flip (X-17).
- **Fallback:** do not flip; rotate the leaked key at once (accounts-and-deploy §5.1-§5.4); rewrite history only if the key can't be rotated, then flip.
- **Owner / trigger:** P1 · Nov 11-13.

### R-23 · Gas or storage estimates wrong (L: M · I: M)
- **Signals:** `Exceeded the prepaid gas` (`OUT_OF_GAS`) in relay outcomes; `LackBalanceForState` in DAOs; T-73 needing more than 300 Tgas at 40 members.
- **Mitigation:** calibration from sandbox burns and storage deltas on Nov 4 (C-09), static gas ≥ 3× burnt (INV-07); T-73 binary search on Nov 9 (C-17); relayer gas ranges accept the defaults (U-06, A-01).
- **Fallback:** raise the gas constants in a layout-compatible redeploy before the lock; if 40-member closes don't fit 300 Tgas, set `limits.max_members` to 30 with `set_config` (`HARD_MAX_MEMBERS` = 40 is the compile-time ceiling; contracts-spec §12 Q8).
- **Owner / trigger:** P1 · Nov 4 · Nov 9.

### R-24 · AI judges can't verify the claims (L: M · I: H)
- **Signals:** `/demo` needs JavaScript to show the balance; README steps fail in E-10/E-11; the reference Pot's numbers change; placeholders left in the README.
- **Mitigation:** `/demo` server-renders (M-11); every step has a non-UI twin; the reference Pot is never leased (rev4: and is read-only, its personas hold no key); README steps run as tests on each deploy and nightly, with a drift check (test-plan §5.3); 4-6 screenshots with alt text; tests runnable with no keys (J-8). Rev4: BotID on new demo leases means a judge without JavaScript (curl, a plain form post) gets the read-only `/demo?ro=1` instead of a lease; that client couldn't use the JS app shell anyway, and the snapshot, the JSON twins and the CLI commands stay open (E-10's no-JS J-1 checks it).
- **Fallback:** fix the step or the README the same day; on Nov 13, E-10 and E-11 must be green before the repo goes public.
- **Owner / trigger:** both · Nov 6 · nightly · Nov 13 08:00 UTC.

### R-25 · Hallway round B: join + pay takes ≥ 2:00 (L: M · I: M)
- **Signals:** ≥ 2 of 3 participants fail T1 or T2 unassisted, or the median T1+T2 ≥ 2:00; an in-app browser blocks someone; jargon flagged.
- **Mitigation:** round A in Phase 0 on the Figma prototype; landing and setup copy tuned before Nov 1; the hallway-test decision rules decided in advance.
- **Fallback:** Nov 8 AM goes to onboarding fixes first (F-18) before Phase-2 work (hallway-test §6).
- **Owner / trigger:** Cerasela · Nov 7.

### R-26 · Relayer key-pool or nonce contention under judge load (L: L · I: M)
- **Signals:** 503 `relayer_busy`; `InvalidNonce` retries; relay p95 above the api-spec budgets in B-19.
- **Mitigation:** 8 prod keys with Postgres leases (`FOR UPDATE SKIP LOCKED`) ≈ 2.5 tx/s; per-user signing queues in the client; B-19 load test on Nov 11.
- **Fallback:** add keys (runbook §3.6, a human signs) and redeploy the env; release leases right after broadcast (api-spec §3.3 upgrade path).
- **Owner / trigger:** P1 · Nov 11.

### R-27 · Pro-rata or ledger bug produces wrong refunds (L: L · I: H)
- **Signals:** Σ payouts ≠ balance in a test; the TS twin disagrees with Rust; `preview_close` differs from the executed close; ledger counters drift from the request set.
- **Mitigation:** PR-01 (proptest), PR-02 (fast-check + parity file), PR-03 (ledger sequences), the shared V1-V6 vectors, `overflow-checks = true`, `assert Σ == B` in `prorata.rs`.
- **Fallback:** close is cuttable (shown disabled) if the math can't be trusted by G5.
- **Owner / trigger:** P1 · Nov 9 · Nov 10.

### R-28 · Mainnet clip funds lost or stuck (L: L · I: L)
- **Signals:** the deposit stays PROCESSING; a refund lands in `intents.near` instead of the wallet; a mistyped recipient.
- **Mitigation:** ≈ $20 only; `FLEX_INPUT` (no exact-amount refund trap); a dry quote first; the recipient checked by a human; Shield status checked before sending.
- **Fallback:** accept the loss (budgeted); record it as a limitation; recovery from `intents.near` is Phase 3.
- **Owner / trigger:** humans · Nov 11.

### R-29 · Neon Free limits or cold starts slow the API (L: L · I: M)
- **Signals:** first requests after idle taking > 1 s; CU-hours approaching 100/month.
- **Mitigation:** clients poll the chain, not the API; small pool with a short idle timeout; Neon in the same region as the functions (`iad1`).
- **Fallback:** keep the DB warm with the nightly job; upgrade the Neon plan (a human decision).
- **Owner / trigger:** P1 · Nov 6 · Nov 11.

### R-30 · Hackathon rules change during the event (L: L · I: M)
- **Signals:** the HACKATHON.md diff shows new fields, dates or rules.
- **Mitigation:** re-fetch on Nov 1, Nov 7 and Nov 13 (H-13).
- **Fallback:** update submission-plan §4/§5 the same day; tell both people at standup.
- **Owner / trigger:** Cerasela · Nov 1, Nov 7, Nov 13.

### R-31 · Week-1 overload (L: H · I: M) (added by the Rev 3 review)
- **Signals:** a day's checkpoint missed by the 18:30 demo; a task more than 50 % over its estimate; work regularly past 21:00.
- **Mitigation:** the recount is in implementation-plan §4: most week-1 days are 10 h, not 9, for both people. Mock-first frontend work and background test sessions already absorb some of it. The relief order is agreed in advance, so nobody debates it at 23:00.
- **Fallback:** apply implementation-plan §4's relief order at the next standup: (0, rev4) the relayer and demo hardening that only matters once outsiders can reach the app slips to Nov 8-10, live by G5; (1) F-17's visual snapshots → Nov 8; (2) the Nov 7 README draft becomes a skeleton; (3) hallway round B drops the spare Pot; (4) a human call: B-09 moves to Nov 9 and G3 accepts "Approved" and "Sent" together. If a gate still slips, R-13's cut order applies.
- **Rev 4 load:** the security fixes add ≈ 4.5 h of P1's attention and ≈ 2 h for P2 in week 1 (≈ 74 h / 72 h in total), and ≈ 3 h / 0.5 h in week 2, plus B-20 + F-27 (1.5 h each) only if G4 enables NEAR Auth on a hosted origin. The contract checks are written by the background sessions with their tests; relief step 0 moves the rest; rev5: C-19 (`withdraw_request`) is Phase 3, not built, so its Nov 10 PM slot is free for relief step 0 and security work (implementation-plan §4).
- **Owner / trigger:** both · daily standup, Nov 2-7.


### R-32 · Hub NEAR drained (L: L · I: H) (added by Rev 4, review-security C-1)
- **Signals:** `hub_low` or `hub_budget` alerts; `get_config().sponsored_today` near 50 early in the UTC day; `ERR_DEPOSIT_REQUIRED` probes in the logs; `config_changed` events nobody on the team made; the hub's free balance falling faster than accounts-and-deploy §2.3 predicts.
- **Mitigation:** the hub sponsors only calls whose `signer_account_id` is in `config.relayers`; direct callers attach the cost (contracts-spec §3.0, INV-18; T-89, PR-05). On-chain caps: 3 Pots per creator per UTC day, 50 sponsored Pots per UTC day, ≤ 1 open rules and ≤ 1 open close proposal per Pot, the per-Pot request caps, `min_hub_reserve`. Relayer side: per-user `hub_yocto` 0.3 NEAR and global `hub_yocto` 5 NEAR a day. `dao_float` is bounded to [0.05, 0.5] NEAR. The mainnet hub has `relayers: []`.
- **Residual:** a stolen relayer key, or an owner who adds their own account to `relayers`, gets sponsored floats up to `max_sponsored_pots_per_day` × `dao_float` a day: 2.5 NEAR at today's 50 × 0.05, but an attacker holding the owner key could raise both to the tops of their ranges. So the owner key's custody (R-34) is the real control; on-chain NEAR budgets per account and per Pot are deferred (R-33).
- **Fallback:** owner `set_config {"paused": true}` stops sponsored creation within minutes; remove a compromised relayer from `relayers`; revoke relayer keys (accounts-and-deploy §5.1); top up the hub.
- **Owner / trigger:** P1 · Nov 1 (C-03, T-89) · Nov 6 (prod) · daily alerts.

### R-33 · Deferred security hardening, accepted for the event (L: M · I: M) (added by Rev 4)
Each item has an owner, a workaround or a README disclosure, and is re-checked in X-17 (Nov 11). Details per finding: [review-security.md](review-security.md) §7.
- **L-2** `reap(pot, id)` for records a callback stranded (P1, Phase 3). Workaround: the majority closes through a direct DAO proposal.
- **L-1** `prune_members(pot)` for members removed directly in the DAO (P1, Phase 3). Workaround: revoke their invites; README note.
- **M-9** a relayed `DeleteKey` behind "Forget this device" (`DELETE /api/devices/[publicKey]`, rule R13; P1, Phase 3). README: a device key is full access until removed.
- **M-2** a "new device added" push to the user's other devices (P1 with X-06, only if B-15 ships).
- **M-6** the Add-sheet hint "If the Pot closed now you'd get back {x}", or time-weighted refunds (Cerasela, Phase 3). README limitation + pro-rata vector V7.
- **M-7** the Create-sheet line "The Pot name and amounts are public", lock-screen-safe push bodies, and preferring pairing for new devices (Cerasela, frontend-architecture §15 Q14). README disclosure.
- **C-1 extras:** on-chain sponsored-NEAR budgets per account, per Pot and per day (P1, before any mainnet launch).
- **H-1 extras:** joins beyond N go to a member vote, and an instant budget proportional to what a member put in (Cerasela + P1, Phase 3; R-35).
- **H-5 extras:** recycling an untouched lease after 15 min (it would cut off a judge who reads first), a reserved judge budget, and hiding demo `create_pot` (Cerasela's call, phase0-checklist §5 #19).
- **Supply chain:** a `cargo audit` / `cargo deny` job on `contracts/` (P1, optional and non-blocking, Nov 11 if time); an origin suffix on PoP messages (optional).
- ~~**Lead decision pending:** drop `transfer:RemoveProposal` from the day-1 policy if `withdraw_request` (C-19) won't ship (contracts-spec §12 Q10).~~ **Resolved (decisions.md Revision 5):** dropped from the day-1 policy; `withdraw_request` (C-19) is Phase 3, not built.
- **Owner / trigger:** P1 · Nov 11 (X-17) · status `accepted`.

### R-34 · A custody key is stolen before the lock (L: L · I: H) (added by Rev 4, review-security H-4)
- **Signals:** the cron's `hub_key_used` alert; `config_changed` events nobody made; unknown keys in `list-keys` of the hub, root, reserve or treasury; a laptop compromise or a suspected prompt injection in an agent session.
- **Mitigation:** the custody account (a separate macOS user, a Ledger, or the vault with import-on-demand; H-17); agents never get these keys and only see the preview relayer keys through env vars; the token is locked on Nov 2, the hub on Nov 12 and the mainnet hub right after the clip; `set_config` ranges and an immutable `owner`; small hot balances.
- **Fallback:** before the lock: rotate the key from the backup, redeploy the release build (`RELEASES.md` sha256), check every DAO's code hash with `view-account-summary` (the factory could have pushed code, INV-14) and tell the members of any changed DAO; pause the hub if needed. Root: accounts-and-deploy §5.4.
- **Owner / trigger:** P1 · Oct 23 (H-17) · Nov 2 (token lock) · Nov 12 (hub lock).

### R-35 · A leaked invite link lets strangers join a Pot (L: M · I: M) (added by Rev 4, review-security H-1)
- **Signals:** unexpected `member_joined` pushes; joins from accounts nobody knows; requests from brand-new members.
- **Mitigation:** links expire after 7 days with 10 uses by default; any member can make a new link (the old one stops working); every member gets a push on each join; instant spends need `contributed > 0`; the Share sheet says to share the link only in the group chat.
- **Residual:** on testnet the faucet makes "put money in" free, so a stranger can add $1 and then spend up to the instant limit to themselves; on mainnet that costs $1. Strangers who outnumber the group take the majority (D-04). Phase 3 options are in R-33.
- **Fallback:** make a new link; the group removes the stranger with a direct DAO proposal (README); close the Pot.
- **Owner / trigger:** Cerasela (product call) · Nov 5 (C-10) · Nov 13 (public repo).

### R-36 · NEAR Auth ID-token replay or a phished device pairing (L: L · I: H) (added by Rev 4, review-security M-1, M-2)
- **Signals:** H-01 grants only a whitelist on the shared client; sessions created from tokens whose `azp` or origin we don't expect; pairings started from `pending_device` sessions; devices users don't recognize.
- **Mitigation:** H-01 asks for a dedicated client id; production accepts only that `aud`; the ID token's `nonce` is bound to the device key and a server challenge (B-20, F-27); `pending_device` sessions are limited; pairing starts only from an on-chain device and must be completed by the same device; `jose` is pinned to RS256.
- **Residual:** with only a whitelist on the shared client, a malicious co-whitelisted origin can fetch our challenge itself and mint a token bound to its own device key. Accepted for testnet only (no real money); mainnet needs a dedicated client.
- **Fallback:** without a dedicated client at G4, keep NEAR Auth on localhost (D-22 default), or accept the residual on testnet with the binding live.
- **Owner / trigger:** P1 · Nov 8 (G4) · Nov 9 (B-20).
