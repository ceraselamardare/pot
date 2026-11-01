# Pot implementation plan (Nov 1-14)

> Owner: planner. Written 2026-10-21 for P1 (contracts/backend), Cerasela (P2, frontend/UX, design lead) and the Claude Code sessions that implement from Nov 1.
> Binding inputs, in priority order: [decisions.md](decisions.md) **Revision 3** (wins over everything) → the specs ([contracts-spec.md](contracts-spec.md), [accounts-and-deploy.md](accounts-and-deploy.md), [architecture.md](architecture.md), [api-spec.md](api-spec.md), [data-model.md](data-model.md), [frontend-architecture.md](frontend-architecture.md), [ux-spec.md](ux-spec.md), [hallway-test.md](hallway-test.md)) → [../kb](../kb) → the original plan Part C where nothing above supersedes it.
> Companions: [phase0-checklist.md](phase0-checklist.md) (Oct 21-31), [test-plan.md](test-plan.md), [submission-plan.md](submission-plan.md), [risk-register.md](risk-register.md).
> **IDs.** D-xx decisions · H-xx human items · P-1…P-11 acceptance criteria (as amended in §1.1) · T-xx contract sandbox tests ([contracts-spec.md](contracts-spec.md) §7.2) · U-, A-, M-, E-, W-, AX-, QA-, PF- test IDs ([test-plan.md](test-plan.md)) · R-xx risks · G-x gates. Task IDs: **C-xx** contracts, **B-xx** backend, **F-xx** frontend, **X-xx** shared (D-xx is taken).
> **Estimates** are focused hours of one person working with Claude Code, including review and test runs. A day is planned at about 9 h (AM ≈ 4 h, PM ≈ 5 h); "Eve" marks optional overflow. Times are local Romanian time (EET, UTC+2 from Oct 25) unless marked UTC.
> No product code exists and none is written before Nov 1 (D-63).
> **Rev 4 (2026-10-21, decisions.md Revision 4, [review-security.md](review-security.md) §7):** the security fixes land inside existing tasks (marked "rev4") plus four new tasks: **B-20** + **F-27** (device-bound OIDC nonce; Nov 9, needed before NEAR Auth goes live on a hosted origin), **C-22** (close the clip Pots and lock the mainnet hub right after the clip, Nov 11) and the E-12 abuse run inside B-19. The token is locked on Nov 2 (C-05). The extra load and how it is absorbed are in §4 and R-31.
> **Rev 5 (2026-10-21, decisions.md Revision 5):** `withdraw_request` (C-19) moves to Phase 3 and the rulebot loses `transfer:RemoveProposal`. C-19 is off the schedule, and its Nov 10 PM slot goes to relief step 0 and the security tasks (§4). The cut order now runs Telegram → email + nudges → … (§1.5).
> **Rev 6 (2026-10-21, brand; decisions.md Revision 6, D-67, D-45):** Cerasela's brand and design system are done ([../brand/README.md](../brand/README.md)), so no design-token work is left. On Day 1, F-01 **imports** the brand: tokens for Day + Night generated from `brand/tokens.json`, Gabarito + Figtree, and the icons, manifest and `og-image.png` from `brand/web`. The "Figma tokens" dependency and the "tokens from Figma" freeze are gone.
> - **Time:** F-01 +0.25 h (theme script, generator, assets moved in from F-23); F-06 +0.25 h (You → Appearance); F-17 +0.5 h (Night snapshots, M-20…M-22). F-23 −0.5 h and F-24 −0.5 h (icons and the OG look exist).
> - **Net:** about **+0 h** during the event; week 1 +1 h, week 2 −1 h.
> - **Phase 0:** Cerasela's Oct 23 design slot (Figma token variables, logo, icon set) is done, so it returns to the MVP flows and the hallway prototype (phase0 §3).
> - **Fewer decisions while coding:** every state, avatar and focus style already has a token.

---

## 0. TL;DR

- **Shape.** MVP freeze **Sat Nov 7** (P-1…P-6, `/demo`, README draft, backup video). Feature freeze **Tue Nov 10** (P-7…P-11 in, or cut by flag). Release and hub lock **Thu Nov 12** (D-13). Submit **Fri Nov 13** before 18:00 UTC (D-63). Nov 14 is buffer only.
- **P1 is the critical path** (contracts → relayer → sessions). To protect it, P2 leads four server routes that sit next to the UI: faucet, demo session, feed/notes, push (X-05, X-06, X-08, X-09). P1 reviews them.
- **P2 starts mock-first.** A clickable Lisbon Trip Pot runs on `@pot/sdk/testing` MockChain on Nov 1. Real chain views follow on Nov 2, and each flow goes live the day its contract method lands on preview (§6.3).
- **Gates.** G1 Nov 3: a Pot created via the hub from the browser, user pays 0. G2 Nov 5: a second user joins by link and approves. G3 Nov 7: MVP freeze + backup video. G4 Nov 8: NEAR Auth whitelist call (D-22). G5 Nov 10: feature freeze. G6 Nov 12: release + lock. G7 Nov 13: submitted.
- **Riskiest days:** Nov 3 (relayer, sessions and the first browser-signed tx land together), Nov 5 (join + approve integration), Nov 7 (freeze + hallway round B + backup video), Nov 12 (lock + final video).
- **Freeze dates:** storage layout Nov 6 (Phase-2 fields exist from day 1); MVP ABI Nov 6; full ABI Nov 9; pot-sdk v0/v1/v2 Nov 2/6/9; API v0/v1/v2 Nov 2/6/9; copy Nov 11.
- **Cut order:** Telegram → email + nudges → Pair from Safari → web push → rules editor → mainnet clip → 1Click simulator → close (shown disabled). Never cut: P-1…P-6, `/demo`, NEAR Connect fallback, README CLI twins, contract tests, and (rev4) the security fixes of decisions.md Revision 4.
- **§10 is the resolution log** of the 32 conflicts the planner found between docs (Rev 3 review, 2026-10-21; summary in [review.md](review.md)). Every one is now fixed in the docs, e.g. 300 Tgas for `call`-proposal votes everywhere (D-09) and the 0.05 NEAR DAO float everywhere (D-05).

---

## 1. Scope

### 1.1 Acceptance criteria, as amended by decisions.md

the original plan C4 is the origin; decisions.md changed several criteria. Tests and prompts use **this** table.

| ID | Feature | Phase | Acceptance (amended) | Changed vs C4 |
|---|---|---|---|---|
| P-1 | Login | MVP | From a link to signed in within ≤ 3 steps (≤ 4 taps including the link), median < 30 s, no seed phrase. A new NEAR Auth user gets `u-<8>.users.<root>` with **0 NEAR**, two full-access keys (MPC + device) and USDC registration (D-21, D-23). Returning users see no popup (cookie or device key). Hosted fallbacks always ship: labeled `/demo` personas and NEAR Connect (D-22). NEAR Auth runs on `localhost:3000` until H-01 whitelists our origin. | 0 NEAR instead of 0.05; device key |
| P-2 | Sponsored creation | MVP | One relayed `pots.create_pot` creates `<slug>.pots.<root>` from global code `Ea8t…` in one batch (D-02, D-03). Creator pays 0 NEAR. `pot_created` ≤ 15 s p95 with progress. `get_policy` equals the hardened template: member + rulebot, bond `"0"`, quorum `"1"`, 7-day period (T-01). | the hub is factory and rulebot |
| P-3 | Invite and join | MVP | Multi-use, rotatable link `/j/<slug>?i=<pk>#<secret>` (D-08; rev4: 7 days and 10 uses by default, the Share card shows both). The landing server-renders the real Pot before login. A relayed `join` verifies ed25519 over `pot-join:v1:<dao>:<account>`; the hub auto-approves `AddMemberToRole(member)`; the member shows in the app and in `get_policy` (T-50…T-57). | one-time hash code replaced |
| P-4 | Add money | MVP | Relayed `usdc.ft_transfer_call` (1 yocto paid by the relayer, 100 Tgas) to `pots.<root>` with `msg {"pot":"<dao_id>"}`. Recorded only after the forward succeeds (T-10). Balance visible to other members ≤ 5 s after finality (≈ 3.3 s measured, D-32). Testnet money comes from `/api/faucet` (D-11). | receiver = hub, msg = DAO id |
| P-5 | Auto-approved spend | MVP | At or under the instant cap, within the per-person **instant** limit, payee a registered member, the requester has put money in (rev4, D-08), balance net of reservations → executes in one user action (T-20…T-26, T-94). "Approved by Pot rules" shows when the relayed `request_spend` returns its proposal (≈ 3 s, architecture K-15); "Sent" once the payout is confirmed (≤ 10 s p95). | Approved and Sent split; limit counts instant spends only (D-07) |
| P-6 | Group vote | MVP | Over cap, over budget or payee not allowed → vote path, no hub vote (T-21). The requester's approval is cast automatically (D-61 Rev 2). Members vote by relayed `act_proposal` with the exact kind at 100 Tgas; majority executes (T-40); declined → "Not approved" (T-41). The relayer calls `sync` after every relayed vote (D-05 Rev 2). | own approval; `sync` |
| P-7 | Any-chain deposit | Phase 2 | 1Click `FLEX_INPUT`, 100 bps, recipient = refundTo = the member's NEAR account, `refundType: INTENTS`, 2 h deadline (D-50). 5-step stepper; "Taking longer" at 5 min; Base, Arbitrum, Solana, plus Ethereum marked "slower"; paused chains hidden via Shield. Testnet = labeled simulator ("DO NOT SEND"); mainnet = recorded clip. `deposit/submit` is not built (the UX never collects an origin tx hash). | FLEX_INPUT, 5th step, simulator |
| P-8 | Rules editor | Phase 2 | Rules shown as sentences. A sole member's `set_rules` applies at once (T-60); otherwise `propose_rules` → DAO `call` proposal → majority at **300 Tgas** → the DAO calls `set_rules` (T-61, D-07b). | `propose_rules` |
| P-9 | Close | Phase 2 | `propose_close` builds one atomic `FunctionCall` proposal (≤ 40 `ft_transfer` actions) from the DAO's real balance. Majority at 300 Tgas. Floor pro-rata, dust to the last contributor, Σ = balance (T-70…T-75, contracts-spec P-01). Money in and spends are blocked while closing. ≤ 40 members (D-09). | 300 Tgas; 40-member cap |
| P-10 | Notifications | Phase 2 | Declarative Web Push (≤ 2,500 B) for "needs your approval" and "money arrived" on an installed PWA (iOS Home Screen app, Android). Email only if H-07 lands. The Telegram bot is the first cut (D-51). | email conditional; bot optional |
| P-11 | Visibility | Phase 2 | Testnet: explorer link and an in-app "On-chain rules" panel from `get_policy`, plus the README `get_policy` twin. Mainnet clip: "View in Trezu" → `https://trezu.app/<dao>/requests` (D-52). Trezu's dashboard balance stays empty and its approval count is wrong; both go in the README limitations. | Trezu is mainnet-only |

### 1.2 MVP (freeze Sat Nov 7, 23:00)

The MVP must be **submittable on its own**: if Phase 2 collapses, the Nov 7 build, the backup video and the README draft are what we submit.

**In:**
- P-1: NEAR Auth device-key onboarding on `localhost:3000`; `/demo` personas on the hosted app; a preview-only dev session (B-04) for G1, G2 and hallway round B.
- P-2 with the Trip preset only (Club and Team show "coming soon", ux-spec §4.12). P-3, P-4, P-5, P-6.
- `/demo` server-rendered (works without JS), demo pool seeded by script, permanent reference Pot `lisbon-trip` for the README CLI twins (api-spec §7).
- Pot screen: hero, goal bar, Activity feed (with memos), read-only Members and Rules tabs, Requests tab, error/offline/relayer banners.
- Hub v1 on production accounts with the **full** state layout and the `set_config` pause switch; preview environment; CI (contracts A/B, web, mocked UI + axe).
- README draft with "do X → see Y" steps and CLI twins; backup video; hallway round B.

**Not in the MVP** (built from Nov 8): rules editor, close, 1Click, push and install coach, new-device AddKey (`/api/devices`), Pair from Safari, email, Telegram, nudges, OG image (rev6: the per-invite image; the brand's static `og-image.png` ships on Nov 1 with F-01), in-app browser escape, inline approve with Undo, Advanced room, "Gets back" column. **NEAR Connect** (D-22 fallback b) is due Nov 8 for G4 and is never cut.

### 1.3 Phase 2 (feature freeze Tue Nov 10, 23:00)

In priority order (the reverse of the cut order, §1.5): close (P-9) → 1Click simulator (P-7) → mainnet clip (P-7, P-11) → rules editor (P-8) → web push + install coach (P-10) → Pair from Safari (only if the iOS spike fails, D-21) → email + nudges → Telegram. Also Phase 2 and not cuttable: NEAR Connect (Nov 8), `/api/devices` (new device), demo-pool Workflow, alerts and cron, Advanced room with `get_policy` (P-11 testnet form), a11y pass, Lighthouse, the Phase-2 release (C-18).

After G5 only fixes, accessibility, copy polish, video and README work happen.

### 1.4 Phase 3 (post-hackathon)

From C3, updated by decisions.md: NEAR Auth mainnet credentials and a mainnet launch after a hub audit; the security items deferred by Rev 4 (risk-register R-33: `reap`, `prune_members`, a relayed `DeleteKey` for "Forget this device", a "new device added" push, the Add-sheet dilution hint or time-weighted refunds, on-chain sponsored-NEAR budgets per account and per Pot); a DAO-governed hub upgrade path instead of the `pots-v2` redeploy (D-13); `withdraw_request` (rev5, D-07: not built during the hackathon; each existing Pot needs a voted policy change that gives the rulebot `transfer:RemoveProposal`); the official Sputnik factory for a full Trezu dashboard (D-03); Expo iOS/Android apps on an organization account; fiat on-ramp and guest contributions; payouts to any chain; recurring club dues; receipt photos; recovery of 1Click refunds that sit in `intents.near` (D-50); one-step deposits via `customRecipientMsg` once attribution is solved (intents-1click.md); `DeleteKey` on sign-out (architecture Q-3); leaving a Pot before close; keyed RPC and an indexer; reproducible builds and verified contracts; AWS KMS for relayer keys (backend-infra.md).

### 1.5 Cut order (C3 updated with decisions.md)

Cut from the top. Each cut is a feature flag turned off (frontend-architecture §1.5 `FLAG_*`) plus a README note; nothing half-built ships enabled.

| # | Item | Phase | What remains when cut | Flag / switch | Last decision date |
|---|---|---|---|---|---|
| 1 | Telegram bot (D-51, H-09) | 2 | "Post in Telegram" = share link | `FLAG_TELEGRAM` off | Nov 10 (default: cut) |
| 2 | ~~`withdraw_request` (D-07)~~ rev5: Phase 3, not built (no longer a cut) | 3 | requests expire after 7 days; no Withdraw button | no flag (`FLAG_WITHDRAW` dropped); C-19 not built | — |
| 3 | Email fallback (H-07) and nudges | 2 | push + in-app only | `FLAG_EMAIL`, `FLAG_NUDGE` off | Nov 10 |
| 4 | Pair from Safari (D-21 fallback) | 2 | new device via NEAR Auth popup only | `FLAG_PAIRING` off | Oct 25 spike result; Nov 10 |
| 5 | Web push (P-10) | 2 | install coach + Requests badge; demo of push dropped from the video | `FLAG_PUSH` off | Nov 10 |
| 6 | Rules editor (P-8) | 2 | read-only rule sentences; sole-member `set_rules` stays in the contract | `FLAG_RULES_EDIT` off | Nov 9 |
| 7 | Mainnet clip (P-7 real, P-11 Trezu) | 2 | testnet explorer + "On-chain rules" panel; simulator clip labeled "simulated" | — | Nov 10 18:00 |
| 8 | 1Click simulator + stepper (P-7) | 2 | demo dollars only | `FLAG_XC` off | Nov 10 |
| 9 | Close (P-9) | 2 | button visible but disabled with `close.disabled` | `FLAG_CLOSE` off | Nov 10 |
| — | **Never cut** | MVP | P-1…P-6, `/demo` + README CLI twins, NEAR Connect (D-22), contract sandbox tests, the backup video | — | — |

This updates C3 ("Telegram, web push, rules editor, 1Click, close") with D-51 (Telegram first), D-07 (`withdraw_request`, Phase 3 since Rev 5), D-21 (Pair from Safari), H-07 (email) and the mainnet clip (D-03, D-50). The contract-side order of contracts-spec §10 (`propose_rules` → `propose_close`) is the same order.

---

## 2. Workstreams and owners

| Workstream | Owner | Scope | Hands off to |
|---|---|---|---|
| Contracts | **P1** | `pot-hub`, `test-usdc` vendoring, `res/sputnik`, sandbox tests on builds A and B, calibration, ABI → pot-sdk types | pot-sdk (X-03), relayer (B-03) |
| Deploy and accounts | **P1** (humans sign, D-63) | [accounts-and-deploy.md](accounts-and-deploy.md) runbook: accounts, key pools, preview/prod hubs, reference Pot, lock, mainnet hub | env vars, README CLI twins |
| Relayer and API core | **P1** | `/api/relay` pipeline, policy, quotas, receipts, sessions (NEAR Auth, dev, wallet, device), `/api/devices`, demo intents, workflows, cron, alerts, 1Click routes | frontend signing (F-08) |
| UX, frontend, design system | **P2** | Next.js app, tokens, i18n + jargon lint, screens, sheets, machines, signing layer, `/j`, `/demo`, a11y, performance | — |
| PWA | **P2** | manifest, `sw.js`, install coach, push permission, badge | push server (X-06) |
| UI-adjacent server routes | **P2 leads, P1 reviews** | faucet (X-09), demo session/lease/state (X-08), feed/notes/meta (X-05), push subscription + sender (X-06) | relayer writes `feed_event`, calls `notify()` |
| Video and hallway tests | **P2** (P1 assists) | hallway round B, backup video, final video, screenshots | README |
| Shared | **both** | repo + CI (X-01, X-02), interfaces (X-03, X-04), e2e (X-07), README (X-12), QA (X-18), release (X-15), submission (X-16) | — |

**Rules of engagement**
- The critical-path owner (P1) does not pick up P2-led X-tasks before G3. If P1 is ahead, P1 writes contract and relayer tests instead.
- P1 reviews every P2-led server route for auth, quotas and secrets. P2 reviews every new `reason`/`errorCode` for its copy key (api-spec §1).
- Interface changes after a freeze (§6.2) need both people in the 13:30 sync. Additive changes are fine; renames are not.

---

## 3. Master task list

"When" is the planned slot (§4). "Accept" ties each task to P-x criteria and to spec tests (T-xx in contracts-spec §7.2; A-/U-/M-/E-/W-/AX-/QA-/PF- in test-plan.md). A task is done only when it meets the Definition of Done in [test-plan.md](test-plan.md) §10.

### 3.1 Shared (X)

| ID | Task | Lead | Est | Depends on | Accept | When |
|---|---|---|---|---|---|---|
| X-01 | Repo bootstrap: fresh repo created by a human (D-63); pnpm workspace per D-64; `docs/` = copies of `kb/` + `plan/` (never `spikes/`) (rev6: + `brand/` as `docs/brand/`, D-67); LICENSE; `.gitignore` (keys, `.env*`, `target/`, `.near-credentials`); `.env.example` with names only; `CLAUDE.md` (§9.4); `.claude/settings.json` ask/deny rules (§9.2); branch protection on `main`; rev4: Dependabot alerts on, and a custody check that the agents' OS user holds no custody key (`ls ~/.near-credentials/testnet`, H-17) | P1 + P2 | 2 (1 each) | H-04, H-17 | `pnpm i` clean; secret scan clean; CLAUDE.md lists the D-63 rules and the custody rule | Nov 1 AM |
| X-02 | CI pipeline per test-plan §7: contracts job (P1), web job (P2), e2e-testnet + nightly (later); rev4: the `security` job's **SEC-1** lockfile check (`next` ≥ 16.4.1, `react` ≥ 19.3.1), because `pnpm audit` can't see GHSA-673q-mjm6-r5xr yet | P1 + P2 | 3 + 0.25 | X-01 | `main` green on `ubuntu-24.04`, Rust 1.93.0; SEC-1 fails a lockfile with next 16.4.0 | Nov 1-2, e2e Nov 8 |
| X-03 | `@pot/sdk` interface: v0 draft (types, `ChainViews`, `ActionIntent`, `CallSpec`, `SdkConfig`); v0 freeze; v1 types from `cargo near abi` + contracts-spec §11 mapping; v2 Phase-2 methods | P2 (v0), P1 (v1, v2) | 2 | F-03, contracts-spec §4, §11 | web and `scripts/` compile against one package; U-09 mapping tests | v0 Nov 2 16:00; v1 Nov 6; v2 Nov 9 |
| X-04 | API wire types `@pot/sdk/types/api.ts`: v0 (session, relay, faucet, dev session `POST /api/session/dev`); v1 (all MVP routes incl. demo, feed, notes); v2 (oneclick, push, devices, profile, meta) | P1 | 1.5 | api-spec §0.3, §2 | client and server compile against one file | v0 Nov 2 16:00; v1 Nov 6 18:00; v2 Nov 9 |
| X-05 | Feed and notes routes (api-spec §2.5): `GET /api/pots/[pot]/feed` (`feed_event` + profiles + memos + decline reasons), `POST /api/notes`. Lazy reconcile is Phase 2. (Rev 3: `GET /api/pots/meta` moved to X-05b.) Rev4: `profiles` only for members and demo Pots, lazy reconcile only for member or demo reads, the shared text validator (no Unicode Cf) | P2 (P1 reviews) | 2.5 | B-01, B-03 writes `feed_event` | A-12, A-29, U-11; P-4 (b) | Nov 6 PM |
| X-05b | Rev 3. Small UI-adjacent routes: `GET /api/pots/meta` (until then Pot cards use the on-chain emoji and a slug-derived gradient), `PATCH /api/me` (display name, tint, email opt-in), `PATCH /api/pots/[pot]/meta` only if time | P2 (P1 reviews) | 1 | X-05 | api-spec §2.1, §2.5 | Nov 9 PM |
| X-06 | Notifications server (api-spec §6): push subscription routes with the SSRF host allowlist, Declarative payload builder (≤ 2,500 B), `web-push` sender (VAPID), `notify(event)` fan-out in `after()`, `notification_log` dedupe. P1 calls `notify()` from relay outcomes | P2 (P1 wires) | 4 | B-03, VAPID keys | A-14, A-15; P-10 (a)-(c), (e) | Nov 10 PM |
| X-07 | Testnet Playwright per test-plan §5.2 (rev3): lease 1 = README judge spec E-10 with E-01…E-03 observed from a second context; E-06 (dev-session join, preview, daily); `deployment_status` + nightly triggers. E-04, E-05, E-08 and E-09 are added with their features (Nov 9-10); E-11 is P1's (Nov 11) | P2 (P1 fixtures, bypass secrets) | 4 | F-15, X-08, B-08 | E-10 (J-1…J-5) with E-01…E-03, and E-06, green on preview | Nov 8 PM (manual 2-phone run before) |
| X-08 | Demo routes: `POST /api/demo/session` (HTML form → 303, JSON, visitor cookie, lease with `SKIP LOCKED`, persona switch, reset), `GET /api/demo/state`. Rev4 (review-security H-5): BotID on new leases (no-JS → 303 `/demo?ro=1`), 10 leases a day per IPv4 address / IPv6 /64, demo quotas keyed by visitor and IP net, the reference-Pot check first, no close or rules changes in the shared Pot | P2 (P1 reviews) | 2.5 + 0.5 | B-01; B-08 seeds the reference and pool Pots it reads (integration Nov 6 PM; rev3: no task made the "preview reference Pot" before) | api-spec §7.1 guarantees 1-7; A-13, A-26 | Nov 6 AM |
| X-09 | Faucet `/api/faucet`: treasury key pool, registration when missing (rev4: once per account ever, counted in `global/registrations`), quotas, idempotency, rev4: a $50 minimum claim | P2 (P1 reviews) | 2 | B-01, B-02, C-05 | api-spec §2.4; A-11, A-28 | Nov 4 AM |
| X-10 | Hallway round B ([hallway-test.md](hallway-test.md)): Cerasela facilitates, P1 takes notes; synthesis + top-5 fixes next morning | both | 2.5 + 1 | X-19, G3 build | hallway-test §6 decision rules applied; results appended | Nov 7 PM, Nov 8 AM |
| X-11 | Backup video: 2-3 min capture of F1-F4 on testnet (hosted `/demo` + NEAR Auth on localhost) | P2 records, P1 drives the 2nd phone | 1.5 | G3 | stored file covering P-1…P-6 | Nov 7 Eve |
| X-12 | README draft (Nov 7) and final (Nov 12) per [submission-plan.md](submission-plan.md) §1 | P1 (CLI, costs, architecture) + P2 (steps, screenshots) | 1 + 3.5 | C-13 (draft); X-07 and E-11 (final) | draft: every J-step has a non-UI twin, checked by hand (rev3: E-10 and E-11 don't exist until Nov 8 and Nov 11); final: E-10 and E-11 green | Nov 7 PM, Nov 12 PM |
| X-13 | Mainnet clip recording ([submission-plan.md](submission-plan.md) §6) | P1 (humans sign) | 2.5 | C-20, F-21, H-08 | hashes in README; footage ≤ 25 s usable | Nov 11 AM |
| X-15 | Release: `RELEASES.md` (wasm sha256 + commit), tag `v1.0`, production promoted from the tag | P1 | 1 | C-18, all CI green (rev3: was C-21, which itself depends on X-15; rev5: no C-19, which is Phase 3) | `view-account-summary` sha256 == `RELEASES.md` | Nov 12 AM, before C-21 |
| X-16 | Submission ([submission-plan.md](submission-plan.md) §5) | both (humans act) | 3 | all gates | HTTP 201 | Nov 13 |
| X-17 | Security pass before the repo goes public: gitleaks over the full history, env audit (Secret vs Config; no Secret in Development), CSP report-only, XSS review, key custody. Rev4: re-run review-security §1 (every Critical and High closed per its §7), SEC-1, W-08, the E-12 results, `hub_key_used` never fired; rotate the preview protection-bypass link used for the hallway test | P1 | 2 + 0.5 | — | 0 findings | Nov 11 PM |
| X-18 | Device QA runs: QA-1 early check, QA-2 hallway devices, QA-3 full matrix, QA-4 post-lock regression | P2 (P1 on Android) | 1 + 1 + 1.5 + 1 | — | test-plan §8 matrix rows filled | Nov 3, 7, 11, 12 |
| X-19 | Hallway set-up (rev3) on a preview with `FLAG_DEV_SESSION` on: 4 pre-Leo Pots (Maya + Sam, $300, live invite) made **through the app**, with the dev-session "Maya" on Cerasela's phone (she plays Maya) and a dev-session "Sam" on a second device; 2 Pots on Nov 6 evening and 2 on Nov 7 morning (creator cap 3 per UTC day); a Vercel Shareable Link for the protected preview. (Was: the seeding script, whose persona Maya the facilitator couldn't act as) | P1 (Cerasela's phone for the Maya steps) | 1 | B-04, F-09, F-10, F-13 | hallway-test §10 checklist ticked | Nov 6 Eve, Nov 7 AM |
| X-20 | Daily ritual (§7) | both | 0.5/day | — | — | daily |

### 3.2 Contracts (C, P1)

Contract work follows this order; [contracts-spec.md](contracts-spec.md) §10 now mirrors it (rev3, §10 #21). Test-writing for each slice runs in a parallel Claude Code session in its own worktree (§9.5); "Est" is P1's attention time.

| ID | Task | Est | Depends on | Accept | When |
|---|---|---|---|---|---|
| C-01 | Contracts workspace: Cargo workspace, `rust-toolchain.toml` 1.93.0 + wasm32, release profile (`overflow-checks = true`), `res/sputnik/` `fetch.sh` + `SHA256SUMS` (3 files), `test-usdc` vendored at `7721a49` + `UPSTREAM.md` | 2 | X-01 | both wasm build with `cargo near build non-reproducible-wasm`; `shasum -c` passes (D-12) | Nov 1 AM |
| C-02 | Hub foundations: `types.rs` with the **complete v1 state layout** (Pot fields, `CloseRecord`, `Subject::{Close, Rules}`, the `Removed` request status for `sync` (rev5: no withdraw fields; withdraw is Phase 3), every `StorageKey` prefix; rev4: `relayers`, `max_sponsored_pots_per_day`, `sponsored_today`, `open_rules_proposal`, required invite expiry and uses, `Reason::NewMember`), `errors.rs` (rev4 codes), `events.rs`, `new`, `get_config`, `set_config` (owner, pause; rev4: the §3.10 ranges, immutable `owner`), `policy.rs`, `kinds.rs` | 3 + 0.75 | C-01 | policy JSON == contracts-spec §3.2 (INV-16); kinds == §3.0 table; T-57 | Nov 1 |
| C-03 | `create_pot` + `on_pot_created` + `on_dao_registered` + `get_pot` + slug/name/emoji rules + creator daily count + float clamp; rev4: the sponsorship rule (signer ∈ `relayers`, else `ERR_DEPOSIT_REQUIRED` + excess refund), the global sponsored-Pot cap, the 7-day / 10-use create-time invite, Cf rejection in names | 3 + 0.5 | C-02 | T-01…T-06, T-89 (create cases), T-90 (P-2) | Nov 1 PM |
| C-04 | Sandbox harness: factory `store()` publishes builds A (`Ea8t…`) and B (`DtHZ…`); personas maya, sam, leo, ana, eve; T-00…T-06, T-89, T-90 on A and B | 1.5 | C-03 | T-00 ★, T-01 ★, T-89 ★ green on A and B | Nov 1 Eve (background) → Nov 2 AM |
| C-05 | First deploy (the "Nov-1 runbook", run on Nov 2 AM), human-confirmed signing **from the custody account** (rev4, H-17): accounts (runbook §3.2), build + hashes (§3.3), token + cold reserve split + **token lock** (§3.4 step 5, rev4), preview hub with float 0.05 and `relayers = [users.preview.<root>]` (§3.5), preview key pools (§3.6), smoke (§3.7) | 2 + 0.25 | C-04, H-02 ≥ 33 NEAR, H-03, H-17 | §3.7 checks pass; CLI `create_pot` (with its 0.07 NEAR deposit) on preview → `get_policy` correct; `list-keys usdc.<root>` empty | Nov 2 AM |
| C-06 | Contributions: `ft_on_transfer` + `on_contribution_forwarded`, `get_members`, `get_pots_of`; preview redeploy | 2.5 | C-04 | T-10…T-17 (P-4); CLI `ft_transfer_call` $150 → `get_members` shows it | Nov 3 PM |
| C-07 | `ledger.rs` `apply_transition` + its table as tests + proptest of counter invariants (INV-06) | 1.5 | C-06 | contracts-spec §2.4 table | Nov 4 AM |
| C-08 | `request_spend` chain + `preview_spend` + `get_requests` / `get_request` + storage prepay (rev4: `member_count` votes); rev4: the `new_member` row, the sponsorship rule, and the `get_proposal_subject` view (needed by B-06's R11 check); preview redeploy | 4.5 + 0.5 | C-07 | T-20…T-28, T-30, T-31, T-94, T-96 on A and B (P-5, P-6); $84 instant and $300 vote on preview | Nov 4 |
| C-09 | Calibrate `GAS_*` and prepay bytes from sandbox burns and storage deltas → `contracts/CALIBRATION.md` | 1 | C-08 | INV-07 (static ≥ 3× burnt); prepay ≥ DAO storage delta (T-20) | Nov 4 PM |
| C-10 | Invites: `add_invite`, `revoke_invite`, `join`, `get_invite`, `scripts/invite.ts`; rev4: 7-day / 10-use defaults, ≤ 30 days and ≤ 40 uses, sponsorship on `join` and `add_invite`; preview redeploy **by 13:00** | 4 + 0.25 | C-07 | T-50…T-57, T-93 (P-3) | Nov 5 AM |
| C-11 | `sync` + `retry_payout` + vote-path accounting; rev4: expiry by the DAO's `submission_time`, late `expired` → `approved`, `live` flags for `get_proposal_subject` | 3 + 0.25 | C-08 | T-29, T-40…T-46, T-97 (P-6) | Nov 6 AM |
| C-12 | Safety tests (background session): T-80…T-87; rev4: T-95 (`set_config` ranges) and PR-05 (no hub drain) | 1 + 0.5 | C-11 | all green on A and B | Nov 7 PM |
| C-13 | MVP release: freeze state layout + MVP ABI; prod hub v1 (runbook §3.5) with `dao_float` = `min_dao_float` = 0.05 NEAR (D-05 Rev 2) and `relayers = [users.<root>]` (rev4); prod key pools (§3.6); smoke (§3.7); reference Pot `lisbon-trip` with B-08's script (`--kind reference`; runbook §3.8 is the fallback), rev4: ending with its personas' key deleted; `RELEASES.md`; pot-sdk v1 types | 2.5 | C-11, B-08, H-02 ≥ 55 NEAR | §3.7 on prod; reference Pot = $450 and 3 members, with its feed rows; `list-keys maya.users.<root>` empty; README CLI twins answer | Nov 6 PM |
| C-14 | CI contracts matrix: A, B and the protocol-88 ★ job. Rev 3: folded into X-02's contracts job on Nov 2 (+0.25 h), so the Nov 6 release can require the protocol-88 job | 0.25 | X-02 | all three green | Nov 2 PM |
| C-15 | Rules: `set_rules` (DAO, sole member) + `propose_rules` (rev4: one open per Pot, `ERR_RULES_PENDING`) + `validate_rules` + Club/Team presets per H-10 | 2.5 + 0.25 | C-13 | T-60…T-62, T-91 (P-8) | Nov 8 AM |
| C-16 | Close: `propose_close` (rev4: 24 h cooldown, `ERR_CLOSE_COOLDOWN`) + `prorata.rs` (vectors V1-V7 from the shared fixture file, test-plan §4) + `preview_close` + `sync` close mapping | 4 + 0.25 | C-13 | T-70…T-72, T-74, T-75, T-92, contracts-spec P-01 (P-9) | Nov 9 AM |
| C-17 | T-73: close gas at n = 30 and 40 (binary search on prepaid gas) | 1 | C-16 | final vote fits 300 Tgas at n = 40, else `HARD_MAX_MEMBERS` = 30 | Nov 9 PM |
| C-18 | Phase-2 release: layout-compatible prod redeploy (runbook §3.9), full ABI freeze, pot-sdk v2 | 1.5 | C-15, C-16, C-17 | §3.7 on prod; full sandbox suite green on the release commit | Nov 9 PM |
| C-19 | ~~`withdraw_request` + T-47/T-48~~ **Rev 5: Phase 3, not built.** Off the schedule; its Nov 10 PM slot goes to relief step 0 and the security tasks (§4) | 0 | — | — | Phase 3 |
| C-20 | Mainnet hub + clip Pot + Trezu read-only check (runbook §3.12; a human at the keyboard); rev4: `relayers: []`, so the clip personas attach each hub call's cost; mainnet keys in the custody account or on the Ledger | 2 | C-18, H-08 | Trezu `/requests` and `/members` load; else fallback (submission-plan §6) | Nov 10 AM |
| C-21 | Pre-lock checklist + lock the hub (runbook §3.10; the token was locked on Nov 2) | 1 | X-15, all CI green | `list-keys` empty for `pots.<root>` and `usdc.<root>` (D-13) | Nov 12 AM |
| C-22 | Rev 4 (review-security H-4): right after the X-13 recording, close the clip Pots (the real USDC goes back to the personas), then lock the mainnet hub, or delete it (a human call) (runbook §3.12) | 0.5 | X-13 | `list-keys pots.<root>.near` empty, or the account gone | Nov 11 AM |

### 3.3 Backend (B, P1)

| ID | Task | Est | Depends on | Accept | When |
|---|---|---|---|---|---|
| B-01 | DB and server foundation: Drizzle 0.45.4 schema for the MVP tables (data-model §2.1-2.3 + `demo_pot`), migrations applied from CI only, db client with `attachDatabasePool`, envelope + `requestId`, zod `.strict()`, Origin/CSRF check, `error_log`, `seed-db.ts` lease rows | 3 | X-01, Neon (H-04) | data-model §3 SQL patterns tested (20 concurrent callers vs limit 3 → exactly 3); migrations apply to the Neon `preview` branch | Nov 2 |
| B-02 | Server chain client: failover FastNEAR → dRPC (near.org banned, D-32), `send_tx` wait levels, `tx_status`; key-pool leases on the `lease` table + per-key nonce; key loading from Secret env vars | 2.5 | B-01 | A-18 (8 concurrent leases), failover unit tests | Nov 2 PM |
| B-03 | Relayer core `/api/relay` (api-spec §3.2 steps 1-17): canonical decode, static policy R1, R2, R3, R9, R11 (R4/R5 stubs), key binding, signature, chain reads, sponsor health, quotas in one transaction, `relay_log`, submit, timeout algorithm, receipt classification (§3.4), trusted events, `feed_event` rows, minimal `/api/health`; rev4: per-user `relay_yocto` and `hub_yocto` budgets, global `hub_yocto`, 0.03 NEAR pre-charge for `call` votes and `Finalize`, never a deposit on hub calls | 7 + 0.5 | B-02, C-05, X-04 | A-01 safety vectors refused before submission; A-03, A-04, A-23; relayed `create_pot` (P-2) and `ft_transfer_call` (P-4) on preview | Nov 3 |
| B-04 | Dev session `POST /api/session/dev` (api-spec §2.1; preview only, `FLAG_DEV_SESSION`, session kind `dev`): creates a 0-NEAR `u-<8>` account for a PoP'd browser device key, no Auth0; quotas 20/day global, 10/day per IP; 404 on production whatever the flag | 1 | B-03 | A-21; session cookie; account with one FAK and 0 NEAR; 404 on prod | Nov 3 PM |
| B-05 | Vote follow-ups in `after()`: payout receipt scan, `sync` after every relayed DAO vote and after a failed payout (D-05 Rev 2), `retry_payout` trigger after a contribution | 1 + 1 | B-03; C-11 for `sync` | P-6 (b) `relay_log` row `op: sync`; T-29 path on preview | scan Nov 4 PM; sync Nov 6 AM |
| B-06 | Policy rows R4 (`join`), R5 (invites + rotate pair; rev4: ≤ 30 days, ≤ 40 uses), R11 pre-flight polish (kind deep-equal, already voted, expiry); rev4 (review-security H-2): R11 relays only live, hub-tracked proposals (`get_proposal_subject`, from C-08) for members of the Pot, exact gas 100 / 300, `Finalize` ≤ 3 per proposal per day, payee registration before a close's deciding vote | 1 + 1 | B-03, C-08, C-10 | A-01 rows for R4/R5/R11; A-22, A-24 | Nov 5 PM (relief step 1b: the R11 part may move to Nov 8 AM, §4) |
| B-07 | NEAR Auth sessions: `POST /api/session` (JWKS, PoP, `used_proof`, onboarding lease, MPC derived key, create + register in parallel, resume rules, display-name default), `GET`/`DELETE`, `POST /api/session/device`, cookies + `pot_hint` | 3.5 | B-04 | P-1 (a)-(d) per api-spec §8; A-07, A-08 | Nov 5 PM |
| B-08 | Demo intents in the relay (persona key under the `demo_signer` lease, scope checks; rev4: the reference-Pot refusal first, no close or rules changes in the shared Pot) + `scripts/seed-demo-pot.ts` (api-spec §5.2 steps 1-8, `--kind pool \| shared \| reference`; rev4: `shared` gets fresh personas, `reference` ends with step 9, deleting its personas' key; run in the custody user's shell when it needs prod keys); seeds the **preview** reference Pot and first pool Pots, and the prod reference Pot for C-13 | 2.5 + 0.5 | B-03, C-10 | A-13, A-26; a seeded Pot equals D-33 ($450, 3 members, no spends) | Nov 6 PM |
| B-09 | Two-phase `request_spend` early response (architecture K-15) + `GET /api/relay/[relayId]` | 2 | B-03, C-08 | P-5 (a): early 200 ≤ 4 s p95, final `payout: sent` ≤ 10 s p95; A-05 | Nov 7 AM |
| B-10 | Wallet sessions `POST /api/session/wallet` (NEP-413; verify byte layout against Meteor and Intear) + USDC registration in `after()`. Optional, cut by default: `POST /api/tx/report` for wallets without `signDelegateActions` | 2 | B-07 | P-1 (f); A-09 | Nov 7 AM |
| B-11 | Ops: alerts (`relayer_low`, `hub_low`, `treasury_low`, `global_cap_hit`), global caps tuning, cron reconcile (expiries → `sync`, failed payouts → retry, retention) | 1.5 | B-03 | A-17 (cron twice = no double effects) | Nov 8 PM |
| B-12 | Demo pool Workflow `refillDemoPool` / `seedDemoPot` + the 04:00 UTC shared Pot; rev4: shared-Pot reseed below $300 or not Open, `demo_yocto` counts the hub's costs, DAO top-ups only for demo and reference Pots (≤ 2 per DAO) | 2 + 0.5 | B-08 | 6 ready pool Pots on prod; leases never collide (A-13); A-31 | Nov 8 AM |
| B-13 | `/api/devices`: new-device `AddKey` via NEAR Auth MPC (`fast-auth.testnet.sign`, rev4: 1-yocto deposit, no reserve, D-21), MPC slots, and (rev4, L-7) the `derived_public_key(sub)` re-check before `sign` | 3.5 | B-07 | P-1 (e) ≤ 25 s p95; A-10 (`payload_mismatch`, expired JWT), A-30 | Nov 8 PM |
| B-14 | 1Click (D-50): `/api/oneclick/chains` (Shield), `quote` (simulated + real), `status`, `simulate`, `watchDeposit` Workflow, `deposit_intent` table; rev4 (review-security H-3): simulator caps ($500 per quote and per session per day, $150 for demo sessions, inside the global `faucet_usd`) | 4 + 0.5 | B-01 | P-7 (a), (c), (d); A-16, A-27 | Nov 9 PM - Nov 10 AM |
| B-15 | Pair from Safari routes (only if the iOS spike shows outcome b or c); rev4 (M-2): start only from a session whose device is on chain, completion signed by that device | 2 | B-13 | A-10 pairing rows, A-30 | Nov 10 PM (conditional) |
| B-16 | Email via Resend (only if H-07 verified) | 2 | X-06 | P-10 (d) | Nov 10 PM (conditional) |
| B-17 | Telegram bot (grammY, plain bot, no Mini App): `POST /api/telegram/webhook` + `POST /api/telegram/link` | 3 | X-06, H-09 | P-10 bot posts | Nov 11 PM only if every gate is green; default **cut** |
| B-18 | Nudges route | 1.5 | X-06 | api-spec §2.5 nudges | default **cut** |
| B-19 | Load and abuse test: 20 concurrent demo sessions on prod, relayer pool contention, FastNEAR 429s on server reads, quota trips; rev4: the **E-12** abuse run on preview (direct hub calls from a throwaway account with and without deposits, votes on a member-created proposal, simulator caps, lease limits), run by hand (a human signs) | 1.5 + 0.5 | B-12 | PF-05; no 5xx; global caps hold; E-12 green | Nov 11 AM |
| B-20 | Rev 4 (review-security M-1): `GET /api/session/challenge`; the `nonce` check in `POST /api/session`; production accepts only the dedicated `aud` (or the shared one only with the binding live); `pending_device` session limits. Needed before NEAR Auth is enabled on any hosted origin; if G4 keeps NEAR Auth on localhost only, it is the first security item to defer (production then refuses NEAR Auth tokens altogether) | 1.5 | B-07, G4 | A-25 | Nov 9 (conditional on G4) |

### 3.4 Frontend (F, P2)

Screens follow [ux-spec.md](ux-spec.md) (states, copy keys, tokens) and [frontend-architecture.md](frontend-architecture.md) (structure, machines, signing). Every screen is built on MockChain first.

| ID | Task | Est | Depends on | Accept | When |
|---|---|---|---|---|---|
| F-01 | Scaffold `apps/web`: create-next-app 16.4.2 (Cache Components on, D-43), D-40 pins, shadcn base-nova; rev4: the static security headers in `next.config.ts` (frontend-architecture §1.5) and ESLint `react/no-danger`. **Rev 6: import the brand; no design work** (frontend-architecture §7-§8, brand/README §10-§11):<br>• `scripts/gen-tokens.mjs`: `docs/brand/tokens.json` → `app/tokens.css` (Day + Night) + `@theme`<br>• the no-flash `data-theme` head script<br>• Gabarito + Figtree via next/font (replaces Geist as `--font-sans`)<br>• Button variants (secondary default, one marigold `primary`)<br>• `brand/web` icons + `og-image.png` → `public/`, `app/manifest.ts`, root metadata + viewport (moved forward from F-23) | 3 + 0.25 + 0.25 (rev6) | X-01, `brand/` (done Oct 21; was "Figma tokens") | `next build` passes; tokens render in Day and in Night (OS dark) with no flash; lint passes; U-WEB-09 green; W-08 on the first preview | Nov 1 AM |
| F-02 | i18n: flat `en.json` from ux-spec §5, generated types, typed `t()`, `lint-copy.mjs` (banned list + allowlist), ESLint `jsx-no-literals`, jargon regex, import guards, near.org ban | 2 | F-01 | `pnpm lint:copy` 0 hits (U-WEB i18n) | Nov 2 AM |
| F-03 | `@pot/sdk/testing`: Lisbon Trip fixtures at every D-61 state (pre-Leo $300, seeded $450, $366, $66, closed), MockChain implementing `ChainViews`, `money.ts`, `math/` (prorata TS twin, k-of-n, expiry) | 1.5 + 1 | X-03 v0 | U-03, U-04, U-05, U-10 (fast-check, 2,000 runs) | Nov 1 PM (math tests Nov 4 PM; rev3, moved from the overloaded Nov 2) |
| F-04 | AppShell + TabBar + SessionGate (hint cookie) + Pot screen on mocks (BalanceHero, GoalBar, SegmentedTabs, ActivityFeed, Waiting on you) + sheet host (`?sheet`, `?r`, ResponsiveSheet) + Spend sheet with the 1.2 s beat machine | 3.5 | F-01, F-03 | clickable at 390×844; Back closes a sheet; axe 0 on the mock Pot (M-13) | Nov 1 PM |
| F-05 | Read client (FastNEAR → dRPC, request budget, parse) + query keys + 3 s heartbeat + data-source switch (§6.3) | 2 | F-03, C-05 | renders a CLI-created preview Pot; ≤ 3 RPC calls per 3 s (PF-03); U-01, U-02 | Nov 2 AM |
| F-06 | MVP sheets and tabs on mocks: Add money (Keypad, SourcePicker), Approve + ApprovalMeter, Requests tab, Create (3 steps) + Share (QR lazy), read-only Members and Rules tabs, empty/error/offline states; rev3: also the Pots home (`/pots`, PotCards from `get_pots_of`) and the You tab (profile, sign out, Advanced entry), which no task owned; rev6: You → Settings → Appearance (`useTheme`, ux-spec §4.15) and the sonner theme | 5 + 0.25 (rev6) | F-04 | M-02…M-06 on mocks; axe 0 on every open sheet, in Day and Night | Nov 2 PM |
| F-07 | DeviceKeyStore: WebCrypto Ed25519 non-extractable + noble fallback, IndexedDB, PoP signing, `navigator.storage.persist()` | 2 | F-03 | U-WEB device-key tests; key survives reload | Nov 3 AM |
| F-08 | Signing engine (lazy near-api-js chunk) + WebCryptoSigner + SigningQueue (nonce = max(chain, last) + 1, TTL 200 blocks) + relay client + error map (frontend §4.8) + ops store (settle by block height) | 4 | F-07, X-04 | signing chunk absent from first load (PF-01); a delegate accepted by B-03 on preview | Nov 3 |
| F-09 | Create Pot + Share wiring: `create_pot` + invite seed in IndexedDB + silent slug re-suffix; rev4: the InviteCard shows the expiry and joins left (`get_invite`) | 1.5 + 0.25 | F-08, B-03, B-04 | **G1**: P-2 (a)-(c), user NEAR balance 0, link `/j/<slug>?i=<pk>#<secret>`; M-18 | Nov 3 PM |
| F-10 | Add money wiring: faucet pre-request, `ft_transfer_call`, pending hero, count-up, "Finish adding" | 2 | X-09, C-06 | P-4 (a), (b) on two browsers | Nov 4 AM |
| F-11 | Spend wiring: RulePreview via `preview_spend`, result card beats (checking ≥ 1.2 s → approved → sending → sent), became-vote, vote path + automatic own-approval delegate + `autoVote` resume. The optional note is stored with `POST /api/notes`, which lands on Nov 6 (X-05), so F-16 wires it | 4 + 1.5 | C-08, B-03 | P-5 beats in order; P-6 shows "1 of 2" after Maya's request | Nov 4 PM - Nov 5 AM |
| F-12 | Approve + Requests on testnet: exact-kind vote, optimistic meter, decline, already/decided/expired states. The optional decline reason is built on mocks and wired in F-16 after X-05 (rev3). Rev4 (review-security H-2, M-10): act only on hub-tracked, live proposals (`get_proposal_subject`); render amount and receiver decoded from the proposal's kind and refuse on a mismatch; members' own proposals as read-only "Direct change" cards; the `new_member` reason copy | 2.5 + 0.5 | F-11, B-03 R11, C-08 | P-6: Leo approves → executes; `already_voted` handled; M-17 | Nov 5 AM |
| F-13 | `/j/[slug]` SSR landing (`'use cache'` invite preview, `?i=` inviter, invite error states) + join machine (sign the D-08 message, relay `join`) + dev-session join on preview ([Join with a test account], `landing.cta.dev`) | 5 | C-10, B-06 | **G2**: P-3 in a second browser; landing shows the Pot before login (M-01 tap count ≤ 4) | Nov 5 PM |
| F-14 | NEAR Auth thin wrapper over `@auth0/auth0-spa-js` (popup pre-opened in the tap, redirect fallback, callback island on `/`) + `/api/session` integration + AccountSetupProgress + SignedOutScreen + You tab sign-out (`DELETE /api/session`) | 2.5 | B-07, F-07 | P-1 timed on `localhost:3000` (3 samples) | Nov 6 AM |
| F-15 | `/demo` SSR (no-JS forms, "What to try", reference Pot snapshot) + DemoSigner + DemoBanner (switch, reset) + `?as=` island; rev4: the forms submit through a `fetch` island so BotID sees the browser, `/demo?ro=1` for no-JS posts, `?as=` only without a non-demo hint | 2.5 + 0.5 | X-08, B-08 | M-11: `curl /demo` contains "Lisbon Trip" and "$450"; judges act as Maya and Leo; M-19 | Nov 6 PM |
| F-16 | Feed merge (feed route + chain overlay + pending ops, identity keys, status derivation) + memo and decline-reason wiring (`POST /api/notes`) + error toasts + Details + offline/relayer banners | 3 | X-05 | P-4 (b): other phone updates ≤ 3.3 s after finality; frontend §4.8 copy per error | Nov 7 AM |
| F-17 | MVP bug bash; axe + visual snapshot suites and the bundle-budget gate in CI; rev6: the Night project and the brand checks | 2.5 + 0.5 (rev6) | all MVP F-tasks | M-12, M-13, PF-01 green; rev6: M-20, M-21, M-22 green | Nov 7 |
| F-18 | Hallway round B top-5 fixes | 2.5 | X-10 | hallway-test §6 rules applied | Nov 8 AM |
| F-19 | NEAR Connect: "I have a NEAR wallet", `signDelegateActions` → relay, else `signAndSendTransaction`, reconnect readiness | 2.5 | B-10 | P-1 (f): Meteor or Intear contribution gasless | Nov 8 |
| F-20 | Members tab "Gets back" (`preview_close`), Rules editor (`propose_rules`, sole `set_rules`, proposer's own approval at 300 Tgas), Advanced room (On-chain rules from `get_policy`, receipts via FastNEAR Tx API, explorer links; Trezu link only on mainnet) | 4 | C-15; C-16 for "Gets back" (on mocks until C-18 reaches preview on Nov 9 PM; rev3) | P-8; P-11 testnet form; M-08, M-16 | Nov 9 AM |
| F-21 | DepositStepper + 1Click simulator UI (5 steps; ok/partial/failed/slow; "Taking longer" at 5 min; `?sheet=add&src=xc&d=`) | 2 + 1.5 | B-14 | P-7 (a), (b); M-09 (clock-mocked) | Nov 9 PM, Nov 10 PM |
| F-22 | Close sheet + RefundTable + close-approve variant (300 Tgas; rev4: its table renders the payouts decoded from the proposal's `ft_transfer` actions) + closed read-only state | 4 + 0.25 | C-16 | **G5**: P-9; RefundTable == `preview_close`; $22.00 each in the demo (M-07) | Nov 10 AM |
| F-23 | PWA: manifest + icons (rev6: already in place from F-01; only `badge-96.png` is derived from the glyph here), `sw.js` (push, `notificationclick`, postMessage bridge), SwBridge, install coach (all contexts), push pre-prompt + subscription, BadgeSync, new-device ConfirmStep (B-13), Pair-from-Safari UI if B-15 exists | 4.5 − 0.5 (rev6) | X-06, B-13 | W-01…W-03; W-05 push on an installed iPhone (P-10) | Nov 11 AM |
| F-24 | Polish moved out of the MVP: OG image (`/j/[slug]/opengraph-image`; rev6: the per-invite image in the brand's look, with Gabarito/Figtree TTFs and `og-image.png` as the fallback, brand/README §11), in-app browser detection + escape with `#fragment`, inline approve with 4 s Undo | 2.5 − 0.5 (rev6) | F-13, F-12 | QA rows for Telegram/Instagram in-app; M-05 Undo | Nov 9 PM |
| F-25 | Accessibility pass (VoiceOver join and approve scripts, TalkBack, keyboard, 200 % zoom, 320 px, reduced motion) + CSP report-only (`script-src`, `connect-src`) + Lighthouse; rev4: W-08 headers on every route | 3 + 0.25 | all | AX-01…AX-08; PF-02; W-08 | Nov 11 PM |
| F-26 | Final video (≤ 2:45 and ≤ 2:20 cuts) + 4-6 README screenshots with alt text | 8 | G5, X-13 | [submission-plan.md](submission-plan.md) §2 storyboard | Nov 12 |
| F-27 | Rev 4 (review-security M-1, F-15): NEAR Auth **login** by a direct `/authorize` call (Authorization Code + PKCE, `response_mode=web_message`) with `nonce = base64url(sha256(devicePk ‖ challenge))`, the challenge prefetched on idle; signing approvals stay on auth0-spa-js (frontend-architecture §4.4). Same condition as B-20 | 1.5 | B-20, F-14 | A-25 end to end on localhost; the popup still opens inside the tap | Nov 9 (conditional on G4; F-24's inline Undo then moves to Nov 11 Eve) |

---

## 4. Day-by-day schedule

Each day lists P1 and P2 at morning/afternoon granularity, the planned load, and the **end-of-day demoable checkpoint** (checked in the 18:30 demo ritual, §7). "→" marks the hand-off that the other person waits for. Deploys and signed transactions always wait for a human "yes" (D-63).

**Week-1 load (rev3 recount).** Summing the §3 estimates gives ≈ 69-70 h for each person over Nov 1-7, against 63 h at 9 h a day: most days are 10 h, not 9. Nothing on the critical path can move earlier, so the plan keeps the order and pre-agrees what gives way, in this order, the moment a day ends more than 1 h behind: (1) F-17's visual snapshot suite moves to Nov 8 (P2 −1 h on Nov 7); (2) the README draft on Nov 7 is a skeleton with the CLI twins only (P1 −0.5 h); (3) hallway round B drops the spare Pot (−0.5 h); (4) **human call:** B-09 (the ≈ 3 s early "Approved") moves to Nov 9, and G3 accepts "Approved" and "Sent" together at ≈ 5-6 s (P1 −2 h on Nov 7). See [review.md](review.md).

**Rev 4 load (security fixes, R-31).** Rev 4 adds ≈ 4.5 h of P1's attention and ≈ 2 h for P2 in week 1 (contract checks in C-02, C-03, C-05, C-08, C-10, C-11, C-12; relayer and demo hardening in B-03, B-06, B-08, X-08, F-12, F-15; F-01 headers; SEC-1 in X-02), and ≈ 3 h / 0.5 h in week 2, plus B-20 + F-27 (1.5 h each) only if G4 turns NEAR Auth on for a hosted origin. That puts week 1 at ≈ 74 h (P1) and ≈ 72 h (P2; rev6: ≈ 73 h with the brand import and the Night checks, given back in week 2). How it is absorbed:
- The contract checks must be in the Nov 6 layout, so they stay where they are; the background sessions (§9.5) write them together with their tests (T-89…T-97, PR-05) and P1 reviews, which is why only ≈ 2 of their ≈ 3.5 h count as P1's attention.
- **Relief step 0 (new, applied first):** the relayer and demo hardening that only matters once outsiders can reach the app (B-06's R11 hub-tracked check, B-03's per-user budgets, X-08's BotID and per-/64 lease limits with F-15's `fetch` island) may slip to Nov 8-10. It must be live by **G5 (Nov 10, 23:00)** and is re-checked in X-17; the repo goes public on Nov 13 and judging starts Nov 16.
- In week 2 the security tasks and any open relief-step-0 item take the Nov 10 PM slot that C-19 held (rev5: `withdraw_request` is Phase 3 and off the schedule, so the slot is free). If B-20 and F-27 run on Nov 9, F-24's inline Undo moves to Nov 11 Eve.

### Week 1: MVP

#### Day 1 · Sun Nov 1 · Foundations, clickable Pot
| Slot | P1 | P2 |
|---|---|---|
| AM | X-01 repo bootstrap (with P2) · C-01 workspace + vendored Sputnik/USDC · C-02 hub foundations (start) | X-01 · F-01 scaffold + brand import (rev6: tokens, fonts, icons from `brand/`) |
| PM | C-02 (finish: full state layout, policy snapshot, `set_config`) · C-03 `create_pot` | F-03 MockChain + fixtures · F-04 Pot screen on mocks + Spend beat · X-02 web CI skeleton |
| Eve | C-04 harness + T-00…T-06 in a background session | — |
| Load | 9 h (rev4 +0.75 h: C-02/C-03 checks, mostly in the background session) | 10 h (hot; rev3 recount; rev4 +0.25 h: headers; rev6 +0.25 h: brand import) |

**Checkpoint:** P2: the Lisbon Trip Pot is clickable at 390×844 on MockChain ($450; Maya, Sam, Leo), and `?sheet=spend` plays Checking (1.2 s) → Approved → Sent. Rev 6: it is in the brand: Day and Night follow the OS, the typing dots show during Checking, one marigold burst plays on Approved, and the favicon and manifest are in place. P1: `create_pot` runs in the sandbox and the policy snapshot equals contracts-spec §3.2. Both: HACKATHON.md re-fetched and diffed (H-13).

#### Day 2 · Mon Nov 2 · Preview chain live, interfaces v0
| Slot | P1 | P2 |
|---|---|---|
| AM | C-04 review (T-00, T-01 ★, T-89 ★ on A and B) · **C-05 first runbook deploy** (accounts, token, reserve split, **token lock** (rev4), preview hub, key pools; a human signs from the custody account) → P2 · B-01 DB foundation (start) | F-02 i18n + jargon lint · F-05 read client (MockChain until the preview hub is up, then preview) |
| PM | B-01 (finish) · B-02 chain client + key pool · X-04 API v0 freeze (16:00, with P2) · X-02 contracts CI job with the A/B matrix and the protocol-88 ★ job (absorbs C-14; rev3), and the SEC-1 lockfile check (rev4) | F-06 MVP sheets and tabs on mocks, incl. Pots home and You · X-03 pot-sdk v0 freeze (16:00) |
| Load | 10 h (hot; rev3 recount; rev4 +0.5 h) | 10 h (hot; rev3: F-03 math tests moved to Nov 4; rev6 +0.25 h: Appearance in F-06) |

**Checkpoint:** the Pot screen renders a CLI-created Pot from `pots.preview.<root>` (real `get_pot`, `get_policy`, USDC balance). Every MVP sheet is clickable on mocks. CI green on `main`. pot-sdk and API types v0 are frozen.

#### Day 3 · Tue Nov 3 · Relayer → G1
| Slot | P1 | P2 |
|---|---|---|
| AM | B-03 relayer core (decode, policy rows, signature, chain reads, quotas, `relay_log`), tested with CLI-signed delegates | F-07 DeviceKeyStore · F-08 signing engine + queue (signatures checked offline against a local verifier) |
| PM | B-03 (submit, timeout algorithm, classify, events, `/api/health`) · B-04 dev session → P2 · C-06 contributions (tests in a background session) · G1 integration from 16:00 | F-08 relay client + ops store · F-09 Create + Share wiring · G1 integration · QA-1 early device check (iPhone standalone popup, Android install) |
| Load | 10 h (hot; rev3 recount; rev4 +0.5 h: per-user budgets, relief step 0) | 9.5 h (hot; rev4 +0.25 h: invite expiry on the Share card) |

**Checkpoint = G1:** in a browser on preview, a dev-session user with a device key and 0 NEAR creates "Lisbon Trip" through `/api/relay`; `pot_created` within 15 s; `get_policy` shows member + rulebot, bond "0", quorum "1"; the user's NEAR balance is still 0 (P-2). Soft: a CLI `ft_transfer_call` of $150 shows in `get_members` (P-4 contract path).

#### Day 4 · Wed Nov 4 · Money in, instant spend
| Slot | P1 | P2 |
|---|---|---|
| AM | B-03 follow-ups (R3, R9, R11 pre-flight) · C-07 ledger · C-08 `request_spend` (start; tests in a background session) | X-09 faucet route · F-10 Add money wiring → $150 from the app |
| PM | C-08 (finish) · C-09 calibration · preview redeploy (~17:00) → P2 · B-05 payout receipt scan | F-11 Spend sheet live: RulePreview, beats, became-vote (mock-first, wired after 17:00) · F-03 math tests (U-04, U-05, U-10; moved from Nov 2, rev3) |
| Load | 9.5 h (hot; rev4 +0.5 h: `new_member`, `get_proposal_subject`) | 9 h |

**Checkpoint:** from the app on preview: add $150 (the second browser sees it ≤ 5 s after finality, P-4); Maya's $84 Groceries shows "Approved by Pot rules" then "$84 sent to you" (P-5); $300 shows "This needs 2 of 3 approvals". T-20…T-31 green on A and B.

#### Day 5 · Thu Nov 5 · Join and approve → G2
| Slot | P1 | P2 |
|---|---|---|
| AM | C-10 invites + `join` (tests in a background session) · preview redeploy **by 13:00** → P2 | F-11 vote path + automatic own approval · F-12 Approve sheet + Requests on testnet |
| PM | B-06 R4/R5 policy rows · B-07 NEAR Auth sessions · G2 integration | F-13 `/j/[slug]` landing + join machine (dev-session join on preview) · G2 integration |
| Load | 9.5 h (hot; rev4 +1.25 h: invite bounds, R11 hub-tracked check, relief step 0) | 10 h (hot; rev3 recount; rev4 +0.5 h: hub-tracked approve) |

**Checkpoint = G2:** Maya shares `/j/<slug>?i=<pk>#<secret>`; Leo opens it on a second phone, sees the Pot before signing in, joins in ≤ 4 taps (P-3); Maya asks for $300; her approval counts ("1 of 2"); Leo approves in the Approve sheet; the $300 executes (P-6).

#### Day 6 · Fri Nov 6 · Production, demo, NEAR Auth
| Slot | P1 | P2 |
|---|---|---|
| AM | C-11 `sync` + `retry_payout` · B-05 `sync` after every relayed vote | F-14 NEAR Auth wrapper + `/api/session` on `localhost:3000` (with B-07) · X-08 demo routes |
| PM | B-08 demo intents + seeding script (preview reference Pot + pool Pots) · **C-13 MVP release**: prod hub v1, prod key pools, reference Pot (B-08 script, `--kind reference`), seed 6 pool Pots (human signs) → P2 · X-04 API v1 freeze (18:00) · X-03 pot-sdk v1 | F-15 `/demo` SSR + DemoSigner + banner · X-05 feed/notes routes (rev3: `GET /api/pots/meta` moved to X-05b, Nov 9) |
| Eve | X-19 part 1 (rev3): 2 hallway Pots through the app on the hallway preview (P1 as Sam) | X-19 part 1: Cerasela's phone as Maya (30 min) |
| Load | 10.5 h (hot; rev3 recount; rev4 +0.75 h: late transitions, reference-persona lock) | 10 h (hot; rev3 recount; rev4 +1 h: demo guards, BotID, relief step 0) |

**Checkpoint:** production (prod accounts) serves `/demo`; `curl /demo` shows "Lisbon Trip" and "$450" with no JS; "Try as Maya" leases a seeded pool Pot; README CLI twins answer for `lisbon-trip.pots.<root>.testnet`, and (rev4) `list-keys` on its personas is empty; NEAR Auth on localhost creates `u-<8>` with two keys and 0 NEAR (P-1, timed: taps and seconds).

#### Day 7 · Sat Nov 7 · MVP freeze → G3
| Slot | P1 | P2 |
|---|---|---|
| AM | B-09 two-phase `request_spend` · B-10 wallet sessions · X-19 part 2 (2 more hallway Pots, Shareable Link, checklist; by 13:00) | F-16 feed merge + memo/decline-reason wiring + errors + banners · F-17 bug bash |
| PM | X-10 hallway note-taker (15:00-17:30) · C-12 T-80…T-87 (background) · X-12 README draft (CLI twins, costs) | X-10 hallway facilitation (15:00-17:30) · QA-2 · F-17 fixes + axe/visual/bundle gates in CI |
| Eve | X-11 backup video (drives the second phone) | X-11 backup video (records) |
| Load | 10.5 h (hot; rev3 recount, C-14 moved to Nov 2; rev4 +0.25 h: T-95/PR-05 review) | 10.5 h (hot; rev3 recount; rev6 +0.5 h: Night snapshots and M-20…M-22 in F-17, which relief step 1 moves to Nov 8 with the rest of the visual suite) |

**Checkpoint = G3 (MVP freeze, 23:00):** P-1…P-6 pass on production (P-1 on localhost + `/demo`); hallway round B done; the backup video file exists; README draft committed; CI green. Spill rule: anything unfinished moves to Nov 8 AM and takes the place of Phase-2 work, never of G4 prep.

### Week 2: Phase 2, release, submission

#### Day 8 · Sun Nov 8 · Rules, devices, wallet → G4
| Slot | P1 | P2 |
|---|---|---|
| AM | C-15 rules (`set_rules`, `propose_rules`) · B-12 demo-pool Workflow + nightly shared Pot | X-10 synthesis · F-18 hallway top-5 fixes · F-19 NEAR Connect (start) |
| PM | B-13 `/api/devices` (rev4: 1-yocto deposit, `derived_public_key` re-check) · B-11 alerts + cron (rev4: `hub_budget`, `hub_key_used`) · **G4 call at 18:00** (with P2) | F-19 (finish) · X-07 testnet Playwright: lease 1 (E-10 + E-01…E-03 observer), E-06 · G4 call |
| Load | 10 h (hot; rev3 recount; rev4 +0.75 h: rules slot, shared-Pot reseed, top-up rule) | 10.5 h (hot; rev3: E-11 moved to P1 on Nov 11) |

**Checkpoint = G4:** a decision on hosted login (NEAR Auth whitelisted or not, D-22); NEAR Connect contributes gaslessly with Meteor or Intear (P-1 f); `propose_rules` → 2 of 3 approve at 300 Tgas → rules change, by CLI on preview (T-61); E-10 (J-1…J-5) with E-01…E-03 green against preview (rev3: E-04 runs nightly, test-plan §5.2).

#### Day 9 · Mon Nov 9 · Close in the contract, rules and stepper in the UI
| Slot | P1 | P2 |
|---|---|---|
| AM | C-16 close + pro-rata (tests in a background session) | F-20 Members "Gets back" + Rules editor + Advanced |
| PM | C-17 T-73 close gas · **C-18 Phase-2 release** (layout-compatible prod redeploy, full ABI freeze) → P2 · X-03/X-04 v2 · B-14 1Click (start, rev4: simulator caps) · rev4: B-20 nonce binding (only if G4 enabled NEAR Auth on a hosted origin) | F-21 DepositStepper on mocks · F-24 OG image + in-app escape + inline Undo · X-05b meta and profile routes (rev3) · rev4: F-27 nonce-bound login (same condition; then inline Undo moves to Nov 11 Eve) |
| Load | 9 h (rev4 +0.5 h; +1.5 h if B-20 runs) | 9.5 h (rev4: +1.5 h if F-27 runs, −1 h with inline Undo moved; rev6 −0.5 h: the OG look exists) |

**Checkpoint:** the rules editor changes the instant limit with group approval on preview, and RulePreview reflects it (P-8); a CLI close on preview pays $22.00 each from $66 (T-70 shape on testnet); the stepper runs every scenario on mocks.

#### Day 10 · Tue Nov 10 · Feature freeze → G5
| Slot | P1 | P2 |
|---|---|---|
| AM | **C-20 mainnet hub + clip Pot + Trezu check** (human at the keyboard) · B-14 (finish: simulate, `watchDeposit`) → P2 | F-22 Close sheet + RefundTable + close-approve + closed state |
| PM | X-06 wiring: `notify()` from relay outcomes · rev4: any relief-step-0 item still open, then the week-2 security tasks (rev5: they get the slot C-19 freed; `withdraw_request` is Phase 3) · B-15 or B-16 (conditional) | X-06 push server · F-21 wired to the simulator |
| Load | 9 h (rev4 +0.25 h; rev5: relief-step-0 items and security tasks use the slot C-19 freed) | 9 h (rev4 +0.25 h: decoded close table) |

**Checkpoint = G5 (feature freeze, 23:00):** each Phase-2 item passes its P-x criteria on preview or its flag is off (§1.5): close (P-9), simulated deposit end to end (P-7), rules editor (P-8), push sent to a subscribed desktop Chrome (P-10 server side), On-chain rules panel (P-11). Mainnet clip: go/no-go at 18:00.

#### Day 11 · Wed Nov 11 · PWA, accessibility, mainnet clip
| Slot | P1 | P2 |
|---|---|---|
| AM | X-13 mainnet clip recording (humans sign every tx) → **C-22** close the clip Pots + lock the mainnet hub (rev4) · B-19 load and abuse test + E-12 (rev4) · E-11 CLI-twin script `scripts/readme-cli-check.sh` (rev3: moved from X-07) | F-23 PWA: install coach, push pre-prompt, `sw.js` on devices, BadgeSync, new-device ConfirmStep |
| PM | X-17 security pass · fixes · B-17 Telegram only if every gate is green (default: cut) | F-25 a11y pass + CSP report-only + Lighthouse · X-18 QA-3 full device matrix |
| Load | 10.5 h (hot; rev4 +1.5 h: C-22, E-12, X-17 re-checks) | 9 h (rev4 +0.25 h: W-08; rev6 −0.5 h: icons and manifest landed on Nov 1) |

**Checkpoint:** a push "Maya needs your OK" arrives on an installed iPhone PWA and opens the Approve sheet (P-10; see R-15 for the session it needs); VoiceOver join and approve scripts pass (AX-02, AX-03); mainnet clip footage and tx hashes exist, or the clip is formally cut. Copy freeze at 23:00.

#### Day 12 · Thu Nov 12 · Release, lock, final video → G6
| Slot | P1 | P2 |
|---|---|---|
| AM | X-15 release + tag `v1.0`, then **C-21 pre-lock checklist + lock the hub** (human; the token has been locked since Nov 2) · README CLI twins re-checked against the locked state · balances topped up through Nov 18 | F-26 capture: F1, F3, F4, F5, mainnet clip, Trezu, CLI |
| PM | X-12 README final (costs, limitations, track hints, NEAR features) · E-10/E-11 judge runs on prod · collect the submission values from the humans | F-26 edit the ≤ 2:45 and ≤ 2:20 cuts + captions · README screenshots · X-18 QA-4 regression |
| Load | 8 h | 9 h |

**Checkpoint = G6:** `list-keys` on `pots.<root>` and `usdc.<root>` returns an empty table; `RELEASES.md` hashes match `view-account-summary`; both video cuts exported; README final with every J-step green (E-10, E-11); nightly CI green; the gitleaks scan of the full history is clean.

#### Day 13 · Fri Nov 13 · Submission → G7
Both, following [submission-plan.md](submission-plan.md) §5 (times in UTC): 08:00 final checks → 10:00 a human makes the repo public → 11:00 a human posts on X → 12:00 the JSON is printed and a human confirms it → POST. Target: HTTP 201 before 18:00 UTC. The rest of the day: watch balances, the demo pool and the nightly run.

#### Day 14 · Sat Nov 14 · Buffer
No new features. Only: retrying the submission with the same `requestId` after a 400 or 503; a post-lock S1 bug response (accounts-and-deploy §5.5: pause, then `pots-v2`); demo-pool and balance care. Deadline 23:59 UTC (01:59 EET on Nov 15).

#### Nov 15-18 · Before and during judging (judging runs Nov 16-18 UTC)
Keep everything alive: Vercel plan paid through Nov 18 (H-04), relayer ≥ 10 NEAR available (well above its `relayer_low` threshold of 5 NEAR, api-spec §3.5; rev4: no MPC reserve, the deposit is 1 yocto), hub ≥ 5 NEAR free, ≥ 6 ready pool Pots, nightly E-10/E-11. Read-only work only.

---

## 5. Go/no-go gates

A gate is judged in the 18:30 demo ritual on real phones against the named environment. "Fail" means the pass criteria are not all met by 23:00; the cut decision is made the next morning at standup and written into the risk register.

| Gate | When | Pass criteria (evidence) | If it fails: cut or adapt |
|---|---|---|---|
| **G0** Foundations | Sun Nov 1, 23:00 | Clickable mock Pot (F-04); `create_pot` in the sandbox on A and B (C-03, T-01); repo + CI skeleton | P2 continues on mocks regardless. If the Rust toolchain or sandbox blocks: P1 builds in CI (H-11) and deploys from CI artifacts on Nov 2 (human signs) |
| **G1** Pot created, user pays 0 | Tue Nov 3, 23:00 | From a browser on preview, a device-key user with 0 NEAR creates a Pot through `/api/relay`; `pot_created` ≤ 15 s; `get_policy` = template; user balance still 0 (P-2 a-c, A-01, E-05 manual) | (1) Relayer not accepting delegates: both pair on B-03 on Nov 4 AM; C-07/C-08 slide half a day; cut items 1-4 of §1.5 immediately. (2) Browser signing broken: switch hosted flows to server-signed demo intents (architecture K-4) and keep device keys for the localhost video only. (3) Hub `create_pot` broken on testnet: create Pots by CLI, hide "Start a Pot" on hosted builds until fixed |
| **G2** Second user joins and approves | Thu Nov 5, 23:00 | Leo joins by link on a second phone (P-3); Maya's $300 request shows "1 of 2"; Leo approves; it executes (P-6); $84 instant works (P-5) | (1) Join broken: P1 fixes on Nov 6 AM; demo Pots are pre-joined by CLI (`scripts/invite.ts`) so `/demo` is not blocked; P-3 must pass by G3 or the MVP freeze moves to Nov 8 noon and Phase 2 loses the rules editor and 1Click. (2) Approve broken: fix on Nov 6 AM; close is cut (it needs votes). (3) Instant broken: top priority for both on Nov 6 AM; it is the demo moment |
| **G3** MVP freeze | Sat Nov 7, 23:00 | P-1…P-6 on production; `/demo` without JS (M-11); reference Pot + README CLI twins; backup video recorded; hallway round B run; CI green | Finish the MVP on Nov 8 AM. Phase 2 shrinks to close + push; 1Click and the mainnet clip are cut. The backup video is recorded regardless, with CLI shots for whatever is missing. Hallway rule: if T1+T2 ≥ 2:00 for ≥ 2 of 3 people, onboarding fixes come first on Nov 8 (hallway-test §6) |
| **G4** Hosted login decision (D-22) | Sun Nov 8, 18:00 | H-01 answer known; NEAR Connect works (F-19) | A dedicated client (or a whitelist) → B-20 + F-27 (nonce binding, rev4) on Nov 9, then `FLAG_NEAR_AUTH` on for the prod origin, device checks on Nov 9. Not whitelisted → hosted app = `/demo` + NEAR Connect; the video shows NEAR Auth on `localhost:3000`; P-10 on iPhone needs the R-15 decision (demo-session push) |
| **G5** Feature freeze | Tue Nov 10, 23:00 | Each Phase-2 item meets its P-x criteria on preview (§4 Day 10); rev4: every relief-step-0 security item is live on production (R11 hub-tracked check, per-user budgets, BotID and per-/64 lease limits) | Flags off per §1.5, README "Limitations" updated. Mainnet clip go/no-go at 18:00: C-20 done and Trezu loads, else cut |
| **G6** Release | Thu Nov 12, 23:00 | Hub and token locked (D-13); `RELEASES.md` matches the chain; both video cuts; README final; E-10/E-11 green; secrets scan clean | Lock not done: fix the pre-lock item, lock by Nov 13 08:00 UTC at the latest (README twin #3 waits). Video not done: submit with the backup video plus new clips. A hub bug found after the lock: accounts-and-deploy §5.5 (pause, `pots-v2`) |
| **G7** Submitted | Fri Nov 13, 18:00 UTC | HTTP 201 | 400 → fix the listed fields, resend with the **same** `requestId`; 503 → wait 1 min, same `requestId`; 403 or 409 → stop and tell the humans (no retries, no renaming). Nov 14 is the buffer |

---

## 6. Critical path and integration points

### 6.1 Critical path

```
C-01 → C-02 → C-03 → C-04 → C-05 (preview hub, Nov 2 AM)
     → B-01 → B-02 → B-03 relayer (Nov 3) ──┐
F-07 → F-08 signing (Nov 3) ───────────────┴→ F-09 create = G1 (Nov 3)
     → C-07 → C-08 request_spend (Nov 4) → F-11 spend (Nov 4-5)
     → C-10 join (Nov 5, 13:00) → B-06 → F-13 landing = G2 (Nov 5)
     → C-11 sync → C-13 prod release + reference Pot (Nov 6) → B-08 + X-08 + F-15 /demo (Nov 6)
     → G3 MVP freeze + backup video (Nov 7)
     → C-16 close (Nov 9) → C-18 Phase-2 release → F-22 close UI = G5 (Nov 10)
     → C-21 lock + F-26 video + X-12 README = G6 (Nov 12) → X-16 submission = G7 (Nov 13)
```

The slack is smallest on Nov 3 and Nov 5, when a P1 deliverable and a P2 integration land on the same afternoon. Two mitigations are built into the plan: P2 builds every flow on MockChain first, so the integration window is wiring only; and P1 runs contract test-writing in background Claude Code sessions (§9.5) so the relayer gets P1's attention.

### 6.2 Freeze dates

| Artifact | Freeze | After the freeze | Owner |
|---|---|---|---|
| Design tokens (`--pot-*`) | Nov 1 (from Figma); rev6: **frozen Oct 21**, generated from `brand/tokens.json` (D-67). A change starts in the Design System artifact, then `tokens.json`, then the generator | additive only | P2 |
| **Hub storage layout** (every borsh struct and `StorageKey` prefix, including the Phase-2 fields and the rev4 fields: `relayers`, `max_sponsored_pots_per_day`, `sponsored_today`, `open_rules_proposal`, required invite expiry and uses) | **Nov 6** (prod v1, C-13) | only layout-compatible redeploys (accounts-and-deploy §3.9); a breaking change means `pots-v2` | P1 |
| Hub ABI, MVP methods | Nov 6 | additive only | P1 |
| Hub ABI, Phase-2 methods (`set_rules`, `propose_rules`, `propose_close`, `preview_close`) | Nov 9 (C-18) | frozen (rev5: `withdraw_request`, the one planned Nov 10 addition, is Phase 3, not built) | P1 |
| Hub code (everything) | Nov 12 (lock, D-13) | `pots-v2` only | P1 |
| `@pot/sdk` interface | v0 Nov 2 16:00 · v1 Nov 6 (ABI-derived) · v2 Nov 9 | additive; renames need both people | P2 (v0), P1 (v1, v2) |
| API contract (`types/api.ts`, routes, `reason` codes) | v0 Nov 2 16:00 (session, relay, faucet, dev session) · v1 Nov 6 18:00 (all MVP routes) · v2 Nov 9 (oneclick, push, devices) | new `reason` codes only with a copy key | P1 |
| DB schema | expand-only after Nov 6 (data-model §6) | no destructive migration | P1 |
| Copy (`en.json`) | Nov 11, 23:00 | typo fixes only (video and screenshots are captured on Nov 12) | P2 |

### 6.3 How the frontend switches from mocks to testnet

1. **One interface, two implementations.** `ChainViews` (frontend-architecture §1.4) is implemented by `MockChain` (`@pot/sdk/testing`) and by the RPC client (`@pot/sdk/read`). `createPotSdk()` picks one with `NEXT_PUBLIC_DATA_SOURCE` = `mock` | `testnet`.
2. **Relay transport.** `lib/relay/client.ts` has a mock transport (`NEXT_PUBLIC_RELAY_MODE=mock`) that applies intents to MockChain with the hallway round A timings (setup 6 s, checking 1.2 s, sending 2 s) and the same result shapes as api-spec §2.3.
3. **Mock mode** = everything mocked. It stays forever for local design work, CI visual and axe tests (M-tier) and the hallway prototype replay.
4. **Testnet mode** = views live from Nov 2 (preview hub). Each action is enabled by its flag the day its contract method and relay rule land on preview: create (Nov 3), add + spend (Nov 4), vote/approve + join (Nov 5), demo (Nov 6), rules (Nov 9), close + deposit simulator + push (Nov 10). Until then the button shows the disabled "coming soon" state, so mocked actions never mix with live views.
5. **Environments.** Local dev and Vercel previews use the preview accounts (`pots.preview.<root>`, `users.preview.<root>`); NEAR Auth only works on `http://localhost:3000`. Production uses the prod accounts from Nov 6 (C-13). All ids come from env (`NEXT_PUBLIC_HUB_ID`, `NEXT_PUBLIC_USDC_ID`, `NEXT_PUBLIC_RPC_URLS`).

### 6.4 Integration points

| When | Producer → consumer | Artifact | Check |
|---|---|---|---|
| Nov 2, ~11:00 | P1 → P2 | preview hub + token + one CLI Pot | F-05 renders it |
| Nov 2, 16:00 | both | pot-sdk v0 + API v0 | both sides compile |
| Nov 3, ~15:00 | P1 → P2 | `/api/relay` (R1, R2) + dev session | G1 |
| Nov 4, ~17:00 | P1 → P2 | `request_spend` on preview + R3/R11 | F-11 wired |
| Nov 5, 13:00 | P1 → P2 | `join` on preview + R4/R5 (PM) | G2 |
| Nov 6, ~17:00 | P1 → P2 | prod hub, reference Pot, pool Pots, demo intents, API v1 | `/demo` on prod |
| Nov 8, 18:00 | both | G4 hosted-login decision | flags set |
| Nov 9, ~17:00 | P1 → P2 | prod redeploy with rules + close; pot-sdk v2 | F-20, F-22 wired |
| Nov 10, ~12:00 | P1 → P2 | 1Click simulator routes | F-21 wired |
| Nov 10, ~18:00 | P2 → P1 | `notify()` + push routes | P1 calls `notify()` |
| Nov 12, ~11:00 | P1 → P2 | locked state + final README twins | video CLI shots |

---

## 7. Daily rituals

| Time (EET) | Ritual | Who | Output |
|---|---|---|---|
| 09:30 (15 min) | **Standup.** Yesterday's checkpoint met? Today's AM/PM task IDs. Blockers. Interface changes. Gate status. Risk triggers due today (risk-register "Trigger date" column) | both | task board updated; any cut decision recorded |
| 13:30 (10 min) | **Integration sync.** What is on preview now; what the other person needs by 17:00; interface changes since the freeze | both | hand-off times confirmed |
| 18:00 | **Deploy to preview.** The day's branches merged after review; the human says "yes" to the push (Vercel deploys the preview); P1 redeploys the preview hub if contract code changed (human signs, runbook §3.5 `without-init-call`) | the author + a human "yes" | preview URL + hub sha256 in `RELEASES.md` (preview section) |
| 18:30 (20 min) | **Demo check.** Run the day's §4 checkpoint on an iPhone and an Android phone against preview (prod from Nov 6). Record a 30 s screen capture of it (progress proof and video b-roll) | both | checkpoint ✅/❌; capture in the shared folder |
| 19:00 (10 min) | **Risk register.** For each open risk: signals seen today? triggers due? Update likelihood and status; add new risks | P1 edits, P2 reviews | [risk-register.md](risk-register.md) copy in `docs/plan/` updated |
| 19:10 | **Balances.** Relayer, hub, treasury, preview accounts (`/api/health` + CLI); top up per accounts-and-deploy §2.4 | P1 | top-ups (human signs) |
| 03:00 UTC (automatic) | **Nightly CI**: testnet smoke on prod, README CLI twins (E-11), CDP installability (W-01), balances report | CI | failure → alert webhook; first item of the next standup |
| Nov 1, Nov 7, Nov 13 | Re-fetch `https://nearhackathon.com/HACKATHON.md` and diff it against [../kb/hackathon-rules.md](../kb/hackathon-rules.md) (H-13) | a human | diff noted; plan updated if rules changed |

---

## 8. Nov 1 morning readiness checklist

Run this at 09:00 EET on Sun Nov 1 (the event opens at 02:00 EET). Every line points to its Phase-0 item in [phase0-checklist.md](phase0-checklist.md). Lines marked **must** block the Day-1 plan; the rest fall back as noted.

| # | Item | Must? | Ref | Fallback if missing |
|---|---|---|---|---|
| 1 | `<root>.testnet` exists (≤ 10 chars); its key is in the **custody account's** legacy keychain (or on a Ledger; rev4, H-17) **and** in the encrypted team vault, never in the agents' OS user | must | H-03, H-05, H-17 | create it now from the faucet, as the custody user (accounts-and-deploy §3.1) |
| 2 | ≥ 33 testnet NEAR available to `<root>` today (the C-05 deploy on Nov 2 AM needs ≈ 32.1); ≥ 55 promised by Nov 6; 75 total (Rev 2 float) | must | H-02 | lean plan ≈ 45 (accounts-and-deploy §2.3): preview hub 4 NEAR, preview capped at 30 Pots, no v2 reserve |
| 3 | Password vault "Pot hackathon" exists; nobody pastes keys into chat, docs or prompts | must | phase0 §4 | — |
| 4 | Vercel: plan chosen (Pro for both seats through Nov 18, or Hobby + public personal repo); team and project name reserved; Protection Bypass for Automation on; BotID available; one WAF rate-limit rule planned | must | H-04 | Hobby + public repo from day 1 |
| 5 | Neon: installed from the Vercel Marketplace in `iad1`; branches `main`, `preview`, `dev`; `DATABASE_URL` / `DATABASE_URL_UNPOOLED` injected | must | H-04 | create the Neon project directly and paste the URLs as Secret env vars |
| 6 | GitHub: the owner (org or personal) chosen; the repo name agreed; the repo itself is created **today** (D-63), empty | must | H-04 | — |
| 7 | Toolchains on both laptops: rustup 1.93.0 + `wasm32-unknown-unknown`, cargo-near 0.22.0, near-cli-rs 0.30.1, Node ≥ 22.22.2, pnpm 11, Playwright browsers; arm64 Mac or Linux (Intel Macs can't run the sandbox) | must | H-11 | CI-only sandbox for an Intel Mac |
| 8 | VAPID key pairs generated for dev, preview and prod (`npx web-push generate-vapid-keys --json`), stored in the vault; `VAPID_SUBJECT` = a real `mailto:` | should | phase0 §4 | generate on Nov 10 (push is Phase 2) |
| 9 | NEAR Auth: H-01 request sent (date logged); spike results in `spikes/near-auth/RESULTS.md`; Pair-from-Safari decision made | should | H-01, H-12, phase0 §2 | D-22 fallbacks are already in the plan |
| 10 | Figma: tokens as variables named like the CSS variables, MVP screens final, hallway round A results applied to ux-spec. Rev 6: the tokens, logo and web icons are **done** in `brand/` (Oct 21) and need no Figma step; X-01 copies them to `docs/brand/`. What remains: MVP screens final and round A applied | must for P2 | phase0 §3 | screens: build from ux-spec tables directly (the tokens can't be missing any more) |
| 11 | Cerasela's decisions recorded (H-10 + frontend "Questions for Cerasela") | should | phase0 §5 | defaults in phase0 §5 |
| 12 | Devices: iPhone on iOS 26 (and 27 if available), Android with Chrome, both charged; a test Google account; Meteor or Intear testnet wallet | should | phase0 §4 | borrow devices for QA-1 on Nov 3 |
| 13 | Domain decided (H-07); Resend DNS verified or explicitly skipped | could | H-07 | no email (push + in-app only) |
| 14 | 1Click partner key created (optional) | could | H-08 | anonymous API |
| 15 | HACKATHON.md re-fetched and diffed | must | H-13 | — |
| 16 | `CLAUDE.md` text (§9.4) and the `.claude/settings.json` rules (§9.2) ready to paste | must | §9 | write them during X-01 (adds 30 min) |
| 17 | Submission identity started: team email (unique to Pot), X account that will post, who holds the mainnet payout account | should | H-14 | finalize by Nov 12 |
| 18 | Rev 4: the key-custody account exists (a separate standard macOS user, or a Ledger) and `ls ~/.near-credentials/testnet` in the agents' OS user shows no custody key; the preview relayer key is the only key agents may get, through env vars | must (before C-05) | H-17 | set it up now (≈ 30 min); C-05 waits for it |

---

## 9. Using Claude Code during the event

### 9.1 Which docs to load for each task type

The plan and KB are copied into the repo as `docs/plan/` and `docs/kb/` (D-63). Several specs are over 100 KB, so **load sections, not whole files**: name the section in the prompt, or ask a search subagent to quote it.

| Task type | Always | Then load these sections | KB on demand |
|---|---|---|---|
| Contracts (C-xx) | `CLAUDE.md`; decisions.md §2 + §8 | contracts-spec.md §2 (state, ledger), the method's §3.x, §7 (its INV and T-xx rows), §8 (gas) | sputnik-dao.md, contracts-patterns.md, contracts-toolchain.md, fungible-tokens-usdc.md |
| Deploy, accounts, lock | decisions.md D-02, D-13, D-63 | accounts-and-deploy.md §1.5 (custody) + the runbook step (§3.x); contracts-spec.md §9 for mainnet | contracts-toolchain.md (CLI shapes) |
| Relayer (B-03, B-05, B-06, B-09) | decisions.md D-05, D-24 | api-spec.md §3 (policy table, validation order, key pool, classification), §1 (reasons, error codes); architecture.md §2.4, §4.1; contracts-spec.md §3.12, §3.13 | meta-tx-relayer.md, accounts-onboarding.md |
| Sessions, onboarding, devices (B-04, B-07, B-10, B-13, B-15) | decisions.md D-20…D-23 | api-spec.md §2.1, §2.2, §4; architecture.md §3.1-§3.4 | near-auth.md, near-connect.md, accounts-onboarding.md |
| DB and migrations (B-01) | decisions.md D-31 | data-model.md (all, it is short) | backend-infra.md R4 |
| Demo, workflows, cron (B-08, B-11, B-12, X-08) | decisions.md D-33 | api-spec.md §2.8, §5, §7; architecture.md §3.15 | backend-infra.md R5 |
| 1Click (B-14, F-21) | decisions.md D-50 | api-spec.md §2.7, §5.1; frontend-architecture.md §5.6; ux-spec.md §4.8 (copy per D-50) | intents-1click.md |
| Push, PWA (X-06, F-23) | decisions.md D-42, D-51 | api-spec.md §6; frontend-architecture.md §8, §5.8, §5.9; ux-spec.md §5.15, §9 | notifications.md, pwa-push.md |
| Screens and sheets (F-xx) | decisions.md §5 + D-60, D-61, D-67 (rev6) | ux-spec.md: the screen's §4.x, its copy keys in §5, its flow in §6; tokens: `brand/README.md` + `brand/tokens.json` (rev6; ux-spec §7 is now a pointer); frontend-architecture.md: the relevant §2-§7 | frontend-stack.md, ux-research.md |
| pot-sdk (X-03, F-03, F-05) | decisions.md §8 | frontend-architecture.md §1.4, §3.1; contracts-spec.md §4, §11 | — |
| Tests | the matching test-plan.md section | the spec's own test table (contracts-spec §7.2, api-spec §8, frontend-architecture §11) | — |
| README, video, submission | submission-plan.md | hackathon-rules.md (all) | — |

### 9.2 Human-confirmation rules (D-63) and how to enforce them

An agent **always stops and asks a human for an explicit "yes"** before it:

| Action | Examples | Enforcement |
|---|---|---|
| Pushes or force-pushes | `git push`, `gh pr merge` | `ask` rule in `.claude/settings.json` |
| Changes repo visibility or creates repos | `gh repo edit --visibility`, `gh repo create` | `ask` rule |
| Posts anything anywhere | X, Discord, Telegram, GitHub issues | no tool access; drafts only |
| Signs any transaction, **testnet included** | every `near … send`, seeding/deploy/faucet scripts that sign, `delete-keys` | `ask` rule on `near` and on `pnpm`/`tsx` scripts under `scripts/` |
| Deploys | contract deploys, `vercel deploy --prod`, promoting a preview, mainnet anything (mainnet needs a human at the keyboard) | `ask` rule on `vercel`; contract deploys are signed txs |
| Submits | `POST https://nearhackathon.com/api/applications` | `ask` on `curl`/`WebFetch` to that host; the JSON is printed first |
| Spends money | paid plans, FastNEAR key, mainnet funds | humans only |

Also never, with or without confirmation: commit secrets; read `.env*`, `~/.near-credentials/**` or the vault export (`deny` rules on Read); use `save-to-keychain`; use `rpc.testnet.near.org`; copy from `spikes/`; adopt release candidates (D-12); edit `docs/plan/decisions.md`.

**Rev 4 key custody (D-63, H-17).** The Read deny rules don't stop `Bash` or a prompt-injected agent, so the hub, root, reserve and treasury keys (and every other full-access key except the Vercel hot keys) are **not on disk in the OS user that runs agents** at all; they live in the custody account, and every signing step of the runbook runs in that account's terminal, never through `sudo` from an agent's shell. Agents only ever get the **preview relayer keys**, through env vars. Flows that need the treasury or persona keys are tested against the preview deployment.

### 9.3 Session hygiene

1. **One task ID per session**, branch and PR (`C-08-request-spend`). Commit messages start with the ID.
2. **Start every session the same way:** "Read CLAUDE.md. Then read `<doc> §<section>`. Task `<ID>`: `<acceptance from §3>`."
3. **Plan mode first** for any change touching more than three files; a human approves the plan.
4. **Tests first** when the spec has a test table (T-xx, A-xx): ask for the failing tests, then the code.
5. Run the narrowest test, then the package suite. Paste failures, not full logs (logs can carry keys or JWTs).
6. When the context is about 60 % full, have the agent write the state into the PR description (done, next, open questions), then `/clear` and start fresh from that summary.
7. **Never** accept a change that relaxes a test, a quota, a policy row or a pin to make something pass. Disagreements with a spec go to the humans at standup.
8. Use a search subagent to find things in `docs/` instead of loading whole files.
9. Time-box: a session stuck on one failure for 45 min stops and goes to the 13:30 sync.
10. End of session: the human reviews the diff; the agent may commit locally; the push waits for "yes".

### 9.4 `CLAUDE.md` (written in X-01 on Nov 1)

Contents, in this order: what Pot is (3 lines) · source-of-truth order (decisions.md Rev 4 > specs > KB; never edit decisions.md) · repo map (D-64) · pins (D-12, D-40) and "no upgrades without a human" · build and test commands per package · the §9.2 rules · rev6: the brand rules (D-67: tokens from `docs/brand/tokens.json` only; one marigold button per screen; marigold never text; status = icon + word; Gabarito + Figtree with tabular figures; Lucide at stroke 2; the logo never recoloured, always lowercase "pot" beside the mark) · invariants agents must not break (authorize by `predecessor_account_id` only; `signer_account_id` only decides who pays (the hub sponsors relayer-signed calls; direct callers attach the cost); always pass `proposal` to `act_proposal`; the only deposit the relayer pays is 1 yocto on `ft_transfer_call` to the hub, never a deposit on a hub call; no `rpc.testnet.near.org`; all copy through `t()` and `en.json`; Cache Components rules: params inside `<Suspense>`, no segment config except `maxDuration`; no `'use cache'` function returns typed arrays (rev4, GHSA-673q-mjm6-r5xr)) · the key-custody rule (§9.2, rev4) · task conventions (§9.3) · "how to ask for confirmation": print the exact command and wait.

### 9.5 Parallel sessions

- P1 keeps two git worktrees: `wt-contracts` and `wt-backend`. While P1 works on the relayer, a background session in `wt-contracts` writes the next T-xx tests from contracts-spec §7.2. P1 reviews them at the next break. This is how C-04, C-06, C-08, C-10, C-11, C-12 and C-16 fit beside the backend work.
- P2 keeps `wt-web` and, from Nov 6, `wt-routes` for the P2-led server routes.
- Two sessions never edit the same files. Shared files (`types/api.ts`, `en.json`) change in one session at a time, announced at the sync.

---

## 10. Resolution log (Rev 3 review, 2026-10-21)

The planner listed 32 places where the docs disagreed with each other or with decisions.md Revision 2. All 32 are resolved: decisions.md won except where it was incomplete, and then decisions.md itself got a Revision 3 entry. In ux-spec.md every edit is minimal and marked "(rev3)" for Cerasela to review (phase0-checklist §3). [review.md](review.md) has the summary, the remaining issues and the open questions.

| # | Topic | Resolution | Files changed |
|---|---|---|---|
| 1 | Close and rules vote gas | 300 Tgas for votes and `Finalize` on `call` proposals (close, rules) everywhere; 100 Tgas for Transfer votes; Pots capped at 40 members. Stale "other docs use 200" notes removed | decisions (D-07b, D-09 Rev 3), frontend-architecture (§1.4 gas table and `vote` intent, §13 A11), contracts-spec (§3.9, T-73, §11, §12 Q8) |
| 2 | DAO float | 0.05 NEAR on both testnet hubs (`dao_float` = `min_dao_float` = 0.05), 0.1 on the mainnet clip; the budget is the 75 NEAR column. decisions §1 row 5 already said 0.05 since Rev 2 | decisions (D-05 Rev 3 note), contracts-spec (§0, §2.2, §3.1, §3.2, §3.11, §4, §13), accounts-and-deploy (§0, §1.1, §1.2, §2.1-§2.4, §3.5, §3.11, §5.6, §6), frontend-architecture (§11.2), phase0-checklist (H-02) |
| 3 | Demo cast and per-person limit | Maya, Sam, Leo; Trip $100 instant, $200 per person | frontend-architecture (§2.1 `SessionHint`, §14 O4, §15 Q10), contracts-spec (§12 Q7 closed) |
| 4 | Withdraw | Hidden in the MVP; Phase 2 behind `FLAG_WITHDRAW` (C-19), shown only while nobody else has voted. **Rev 5:** Phase 3, not built; the rulebot gets no `transfer:RemoveProposal` and `FLAG_WITHDRAW` is dropped (decisions D-04, D-07) | frontend-architecture (§1.4 intent, §5.4 `own`, §14 O3, §15 Q5), ux-spec (§4.10, §4.11) |
| 5 | Rules editing path | `propose_rules` and `withdraw_request` intents added (**Rev 5:** `withdraw_request` is Phase 3, not built); multi-member edits go through `propose_rules` + the proposer's own vote at 300 Tgas | frontend-architecture (§1.4, §11.2 P-8, §14 O8) |
| 6 | `Rules` shape | The pot-sdk `Rules` mirrors the contract: `instantCap`, `memberBudget`, `instantPayees`, `payeeAllowlist` | frontend-architecture (§1.4), contracts-spec (§11 mapping) |
| 7 | Preset `custom` | `custom` added to the TS type, the DB enum and relayer R2; it needs explicit rules (the hub refuses `custom` with `rules: null`); the MVP UI still only sends `trip` | decisions (§8 Rev 3), contracts-spec (§3.2, §11), frontend-architecture (§1.4), data-model (`pot.preset`), api-spec (§3.1 R2) |
| 8 | Relayer vs hub bounds | R2 name 2-40 code points (the UI rule; the hub allows ≤ 48 for CLI use); payee allowlist ≤ 10 (the hub's limit) | api-spec (§3.1) |
| 9 | Reference vs shared demo Pot | One D-33 design everywhere: permanent, never-leased reference Pot `lisbon-trip` (README twins and the `/demo` snapshot); pool Pots `lisbon-<k>`; a new shared Pot `lisbon-<yyyymmdd>` each night via a `demo_pot` row, never an env var. `seedDemoPot` takes `kind: pool \| shared \| reference`; B-08's script makes the reference Pot so it has feed rows | decisions (D-33 Rev 3), accounts-and-deploy (§1.1, §3.8), architecture (Q-9), api-spec (§5.2), data-model (§5, §8 Q3), frontend-architecture (§2.6), this plan (B-08, C-13, X-08) |
| 10 | `/demo` personas | Two main buttons (Maya, Leo); the banner switches to either other persona, Sam included | ux-spec (§4.19), frontend-architecture (§2.6) |
| 11 | Invite route and semantics | `/j/<slug>?i=<pk>#<secret>`, multi-use; `invite.used` only fires on `max_uses` | ux-spec (§0, §2, §4.1, §5.2, §13) |
| 12 | Sheet primitive | Base UI Drawer (D-41), no vaul | ux-spec (§2, §3, §7.6) |
| 13 | Per-person limit copy | "…without asking" in `rules.budget`, `preview.vote.over_budget`, `approve.why.budget` and the vocabulary table | ux-spec (§1.2, §5.6, §5.9, §5.10) |
| 14 | Approvals in F4 | Maya's request shows "1 of 2"; Leo's approval is the 2nd of 2 and executes | ux-spec (§4.9, §4.10, §6.4) |
| 15 | Request expiry | 7 days for every Pot (D-04) | ux-spec (§6.4, §13) |
| 16 | Cross-chain copy | No "exactly" (FLEX_INPUT) + a new `xc.instructions.min`; "Usually under a minute"; "Taking longer" at 5 min in PROCESSING; no refund button (refunds are automatic); refunds go to the member's NEAR Intents balance | ux-spec (§4.8, §5.8) |
| 17 | Balances in push | The contribution push and bot post carry no balance | ux-spec (§5.15) |
| 18 | Apple login | Mainnet only, hidden on testnet | ux-spec (§4.1, §5.1, §6.1) |
| 19 | Push for demo sessions (R-15) | Specified so it can be built either way: `FLAG_DEMO_PUSH` (testnet only) lets demo sessions in **pool** leases subscribe, scoped by `push_subscription.demo_pot_id` and deleted with the lease. Default on; the humans confirm at G4 (Nov 8) | api-spec (§0.6, §2.6), data-model (`push_subscription`, §4), phase0-checklist (§5 #24) |
| 20 | Relayer balance thresholds | critical = 2 NEAR + the MPC reserve; warn (`relayer_low`) = critical + 3 NEAR, so 9/6 NEAR with the D-21 reserve and 5/2 NEAR with a 1-yocto deposit. The suggested "warn < 5" would have sat below critical (6 NEAR). Top up to the 15 NEAR cap; ≥ 10 NEAR during judging. **Rev 4:** the deposit is 1 yocto (proven), so the thresholds are 5/2 NEAR | api-spec (§3.5), accounts-and-deploy (§2.4), decisions (D-21 Rev 3), test-plan (A-20), this plan (§4 Nov 15-18), submission-plan (§5) |
| 21 | Contract day order and the day-3 gate | This plan's order wins: no contract reason forces contracts-spec's (a vote-path payout executes without `sync`; Phase-2 methods are additive). contracts-spec §10 now mirrors §3.2/§4; dates aligned (deploy Nov 2, calibration Nov 4, T-73 Nov 9, Trezu check Nov 10) | contracts-spec (header, §3.4, §3.9, §9.2, §10, §12), accounts-and-deploy (§1.4, §3.2, §3.5, §3.12), phase0-checklist (H-02, H-03), this plan (C-05 wording) |
| 22 | ABI freeze | Layout + MVP ABI on Nov 6; Phase-2 methods additive until Nov 9 (C-02 defines all storage on day 1). Release rule: Nov 6 needs the tests of the shipped slices plus the protocol-88 job; Nov 9 and the lock need the full matrix | contracts-spec (§10), test-plan (§2.2), this plan (C-14 → Nov 2) |
| 23 | When `sync` runs | After every relayed vote and after a failed payout | frontend-architecture (§13 A8), api-spec (§9.1 A8), contracts-spec (§3.5, §11) |
| 24 | Early "Approved" signal | The relay's two-phase answer (K-15, B-09) is primary; E1 is a fallback only if B-09 slips; the client types carry `final`, `relayId` and `result` | frontend-architecture (§4.8, §5.2), contracts-spec (§3.4) |
| 25 | `/api/devices` body | api-spec's shape, incl. `pop`, `keyKind`, `idempotencyKey`, base64 `signPayload` | frontend-architecture (§4.2, §13 A3) |
| 26 | MPC sign deposit | 2 NEAR per slot until a 1-yocto `sign` is proven (spike §C by Oct 25, else B-13 on Nov 8); then 1 yocto. Alert thresholds follow (#20). **Rev 4:** proven on chain (review-security F-6), so 1 yocto with no reserve; spike §C only confirms | decisions (D-21 Rev 3) |
| 27 | README step amounts | $84 instant, then $300 by vote, everywhere | api-spec (§7.4), frontend-architecture (§11.2) |
| 28 | P-7 `deposit/submit` | Not built; listed in the README limitations | submission-plan (§1.6) |
| 29 | Hallway round B set-up | The preview-only dev session is specified (`POST /api/session/dev`, session kind `dev`, 404 on production). Hallway Pots are made **through the app** with dev sessions, with Cerasela's phone as Maya, because `/demo?as=maya` would lease a post-Leo demo Pot the participant isn't in | decisions (§8), api-spec (§0.2, §0.3, §0.6, §1.2, §2.1, §3.2, §3.5, §4.2), data-model (kinds, proofs), architecture (§2.4, §4.6), frontend-architecture (§1.5, §2.1, §5.1, §15), ux-spec (§4.1, §5.1), hallway-test (§0, §3, §5, §6, §10), this plan (B-04, B-08, X-19, F-13), test-plan (A-21), submission-plan (§2.3) |
| 30 | Push before install on Android | D-42 Rev 3: off unless Cerasela opts in by Oct 25 | decisions (D-42) |
| 31 | Superseded text in the original plan | No edit (the original plan is out of scope and decisions.md already wins). It isn't copied into the repo (D-63 copies `kb/` and `plan/` only), so it stays out of prompts | none |
| 32 | Two-context testnet E2E vs per-visitor leases | Playwright copies Maya's visitor cookie into Leo's context; the README uses "Switch to Leo". The testnet tier now plans its leases (E-04 changes the close math; E-07 is E-10's J-6) | decisions (D-65 Rev 3 note), frontend-architecture (§4.6, §11.2), test-plan (§5.2) |

**Rev 4:** the security review's fixes and deferrals are logged per finding in [review-security.md](review-security.md) §7, not in this table; the tasks are marked "rev4" in §3 and §4.

**Also fixed in this review** (found beyond the 32; details in [review.md](review.md)): decisions §1 row 7 double-counted the USDC deposit in the onboarding cost; X-15 and C-21 depended on each other; the X-12 draft required tests that don't exist until Nov 8-11; no task created the preview reference Pot, the Pots home, the You tab, `PATCH /api/me` or the Telegram link route; E-06 couldn't run on production; `request_ref` was "12 chars" in contracts-spec but a 16-char op id everywhere else; `{flow}.error.*` keys that don't exist for some flows (api-spec §1.1 now maps them); the e2e-testnet job was blocking before it existed; no contract tests for `get_config`, `get_rules`, `preview_spend`/`preview_close` parity or paging (new T-88); the week-1 load was under-counted (§4).
