# Pot test plan

> Owner: planner. Written 2026-10-21 for P1, Cerasela (P2) and the Claude Code sessions that write tests from Nov 1.
> Binding inputs: [decisions.md](decisions.md) Rev 2 (D-65 test strategy, D-12 pins, D-63), [contracts-spec.md](contracts-spec.md) §7 (invariants INV-01…INV-17, sandbox matrix T-00…T-87 + P-01), [api-spec.md](api-spec.md) §8 (API acceptance), [frontend-architecture.md](frontend-architecture.md) §10-§11 (a11y, budgets, tiers), [ux-spec.md](ux-spec.md) §8 (VoiceOver paths), [hallway-test.md](hallway-test.md), [../kb/backend-infra.md](../kb/backend-infra.md) R7 (CI facts).
> Acceptance criteria are P-1…P-11 **as amended** in [implementation-plan.md](implementation-plan.md) §1.1. Task IDs (C-, B-, F-, X-) come from implementation-plan.md §3.
> No test code exists yet; everything below is a plan.
> **Rev 6 (2026-10-21, brand; decisions.md Revision 6, D-67, D-45):** visual and accessibility checks for the brand rules.
> - **U-WEB-09:** token and asset drift, and token contrast pairs for Day and Night.
> - **M-20:** one marigold button per screen; marigold never text; status = icon + word.
> - **M-21:** the Night theme, with no flash.
> - **M-22:** tabular figures.
> - **AX-09:** the brand on devices.
> - M-12 and M-13 also run in Night.
>
> **Rev 5 (2026-10-21, decisions.md Revision 5):** T-47/T-48 cover `withdraw_request`, which is now Phase 3 and not built (§2.2); T-85 checks that `DaoAction` has no `RemoveProposal`.
> **Rev 4 security fixes (2026-10-21, [review-security.md](review-security.md) §7):** new contract tests T-89…T-97 and PR-05, API tests A-22…A-31, mocked UI tests M-17…M-19, unit test U-11, header check W-08, the manual abuse run E-12 and the CI check SEC-1 (next ≥ 16.4.1). The review proposed T-88…T-100, A-21…A-33 and M-16…M-19; those numbers were already taken, so its §7 maps them to these.
> **Rev 3 review (2026-10-21, [review.md](review.md)):** new contract view test T-88, Advanced-room test M-16 and dev-session test A-21; the testnet tier now plans two leases per run (E-04 changes the close math, E-07 is folded into E-10 J-6) and checks `sync` on chain; the Nov 6 release rule matches what exists by then; e2e-testnet blocks merges from Nov 9 (after X-07); relayer thresholds per api-spec §3.5.

## 0. TL;DR

- **Eight layers:** contract sandbox (both Sputnik builds), unit (pot-sdk, web machines), property (pro-rata twin + ledger), API/relayer, mocked-UI Playwright (visual + axe), testnet Playwright (two contexts Maya/Leo + the README judge script), PWA and device checks, accessibility and performance budgets.
- **The README is executable.** Every "do X → see Y" step J-1…J-8 has a Playwright test (E-10, on each preview deploy and nightly on production) or a CLI-twin script (E-11, nightly, before the lock and on Nov 13). A CI check fails when README steps and tests drift apart.
- **CI** runs on `ubuntu-24.04` (never `ubuntu-latest`, which moves to 26.04 during the event) with Rust **1.93.0** pinned in `rust-toolchain.toml` (Rust 1.100 ships Nov 12), cached cargo, pnpm and the sandbox binary; a nightly testnet smoke runs at 03:00 UTC.
- **Definition of done** (§10) and a **traceability table P-1…P-11 → tests** (§11) close the loop.

---

## 1. Layers and test IDs

| Layer | IDs | Tooling | Runs | Owner |
|---|---|---|---|---|
| Contract sandbox | T-00…T-97 (rev4: T-89…T-97), contracts-spec P-01 | near-workspaces `=0.23.0`, sandbox nearcore 2.13.4 (protocol 86) + a protocol-88 job | every push touching `contracts/**`; the release commit | P1 |
| Unit: pot-sdk | U-01…U-11 (rev4: U-11) | `node --test` (type stripping, Node 22.22.2) or Vitest | every push | P2 (read, money, math), P1 (builders, kinds, mapping) |
| Unit: web | U-WEB-01…U-WEB-09 (rev6: U-WEB-09) | Vitest 4.1.12 | every push | P2 |
| Property | PR-01…PR-05 (rev4: PR-05) | proptest (Rust), fast-check 4.10.2 (TS) | every push | P1 (Rust), P2 (TS) |
| API and relayer | A-01…A-31 (rev4: A-22…A-31) | Vitest + Postgres 18 service container + recorded chain fixtures | every push touching `apps/web/app/api/**` or `lib/server/**` | P1 (P2 for X-routes) |
| E2E, mocked | M-01…M-22 (rev4: M-17…M-19; rev6: M-20…M-22) | Playwright 1.64.1 (Chromium + WebKit iPhone 13; rev6: + a Night project), @axe-core/playwright 4.14.0, mock RPC server | every PR | P2 |
| E2E, testnet | E-01…E-12 (rev4: E-12, a manual abuse run) | Playwright two contexts via `/demo?as=`; near-cli-rs 0.30.1 | `deployment_status` (preview) + nightly (prod) | P2 (specs), P1 (fixtures) |
| PWA, headers and devices | W-01…W-08 (rev4: W-08 security headers), QA-1…QA-5 | CDP in a persistent Chromium context; real phones | nightly (W-01…W-03); manual on fixed dates | P2 |
| Accessibility | AX-01…AX-09 (rev6: AX-09) | axe, VoiceOver, TalkBack, keyboard | AX-01 every PR; the rest Nov 7 and Nov 11 | P2 |
| Performance | PF-01…PF-05 | bundle-budget script, Lighthouse 13.5.0, relay_log timings | every PR (PF-01); Nov 7, Nov 12 (PF-02); nightly (PF-04) | P2, P1 (PF-05) |
| Supply chain (rev4) | SEC-1 | a lockfile script in the CI `security` job | every PR | P2 |

---

## 2. Contract sandbox tests

**Source of truth:** [contracts-spec.md](contracts-spec.md) §7.2. Its matrix (T-00…T-97 + P-01 + PR-05) is the contract test list; this section only plans **when** and **how** it runs.

### 2.1 Harness and builds

- Harness per contracts-spec §7.2: the vendored mainnet factory `store()`s each Sputnik wasm as global code in an earlier tx; `test-usdc` with the supply on `treasury.test.near`; the hub with `dao_code_hash` = the published hash; personas `maya`, `sam`, `leo` (D-61 cast), `ana` (4th member), `eve` (outsider).
- **Every test runs twice**: build **A** = testnet global `Ea8tHXFSQVszVwGASyzAfLq65DjcRDhkfab4FcPaRpgD` (`278adc7`), build **B** = mainnet v3.2 `DtHZA1mUmGYeScEaUoUZYQGGFHSMpnjMCvkr5U9hJXuF` (D-65). Selected by an env var (`SPUTNIK_BUILD=A|B`) and a CI matrix. **A test that passes on one build and fails on the other is a finding**, reported at standup (R-07).
- The ★ tests (T-00, T-01, T-10, T-20, T-40, T-50, T-61, T-70, and rev4's T-89) also run on `sandbox_with_version("2.14.0-rc.4")` (protocol 88, testnet parity; testnet itself moved to 88 on 2026-10-21) in a separate CI job.
- Rules: explicit `.gas(…)` on every call (the default is 10 Tgas); `fast_forward(3)` before balance asserts; inner failures asserted through `receipt_failures()`; `NEAR_RPC_TIMEOUT_SECS=60`; `--test-threads=2` (backend-infra R7 sandbox flakiness).
- `contracts/res/sputnik/SHA256SUMS` is verified before any test (T-00, INV-17).

### 2.2 Schedule (tests land with their slice)

| Slice (task) | Tests | Day |
|---|---|---|
| C-02 unit | policy JSON snapshot (INV-16), kinds builders (T-57), static call surface (T-85) | Nov 1 |
| C-03 / C-04 | T-00…T-06; rev4: T-89 (sponsorship: a direct `create_pot` without a deposit is rejected), T-90 (creation caps) | Nov 1-2 |
| C-06 | T-10…T-17 | Nov 3 |
| C-07 | `apply_transition` table + PR-03 | Nov 4 |
| C-08, C-09 | T-20…T-28, T-30, T-31, T-88 (spend views: `preview_spend` parity, `get_requests`/`get_request`); rev4: T-94 (zero contribution → vote), T-96 (`get_proposal_subject`); calibration deltas recorded | Nov 4 |
| C-10 | T-50…T-57; rev4: T-93 (invite defaults; an expired or used-up invite is rejected) | Nov 5 |
| C-11 | T-29, T-40…T-46; rev4: T-97 (DAO-time expiry, prepay for every vote) | Nov 6 |
| C-12 | T-80…T-87; rev4: T-95 (`set_config` ranges), PR-05 (no hub drain) | Nov 7 |
| C-15 | T-60…T-62; rev4: T-91 (one open rules proposal) | Nov 8 |
| C-16, C-17 | T-70…T-75, T-88 (close views: `preview_close` parity), contracts-spec P-01 (= PR-01), T-73 gas search; rev4: T-92 (one open close proposal, cooldown) | Nov 9 |
| C-19 | T-47, T-48: **Phase 3, not built** (rev5; `withdraw_request` is off the schedule, so the full matrix excludes them) | — |

**Release rule** (rev3; rev4 additions): prod hub v1 (Nov 6) deploys only a commit whose tests for the shipped slices (T-00…T-31, T-40…T-46, T-50…T-57, T-88 spend views, and rev4's T-89, T-90, T-93, T-94, T-96, T-97) are green on A, B and the protocol-88 job, which X-02 sets up on Nov 2. The Phase-2 release (Nov 9) and the lock need the **full** matrix, T-80…T-97 and PR-05 included; the pre-lock checklist (accounts-and-deploy §3.10 item 4) re-checks it on Nov 12. (Was: "full matrix on Nov 6", but T-80…T-87 are written on Nov 7.)

---

## 3. Unit tests

### 3.1 pot-sdk (`packages/pot-sdk`)

| ID | Covers | Key assertions |
|---|---|---|
| U-01 | read client failover | FastNEAR → dRPC on network error, timeout, HTTP 408/429/5xx, JSON-RPC `-429`, CORS-less 429 (`TypeError`); no failover on `UNKNOWN_ACCOUNT` or contract panics; 60 s stickiness; **constructor throws on `rpc.testnet.near.org` or `lava.build`** (D-32); 100 req/min tab budget queues, never drops |
| U-02 | parsing | `vote_counts` as number or string → numbers; `submission_time` ns string → bigint; raw control characters in panic text sanitized (sputnik-dao.md gotcha 11) |
| U-03 | money | keypad input → Micro (6 dp); display floors to the cent; `$450` hero vs `$84.00` rows; no bare signs |
| U-04 | k of n | `max(quorum, min(floor(n·num/den) + 1, n))`: n = 1 → 1, 2 → 2, 3 → 2, 5 → 3, 6 → 4, 30 → 16, 40 → 21 |
| U-05 | expiry | `submission_time + proposal_period − now`; `InProgress` past the period shows expired (Sputnik expiry is lazy) |
| U-06 | `buildCall` per intent | receiver, method, args JSON, gas and deposit for every `ActionIntent` equal the relayer policy defaults (api-spec §3.1): `ft_transfer_call` 100 Tgas + 1 yocto; `request_spend` 150; Transfer votes 100; **`call`-proposal votes and Finalize 300**; `join` 100; `create_pot` 300 (accepted range 150-300) |
| U-07 | kinds | vote args carry the `proposal` kind deep-equal to `get_proposal(id).kind` (D-05); built kinds match contracts-spec §3.0 JSON byte for byte |
| U-08 | invite crypto | message bytes `pot-join:v1:<dao_id>:<joiner>`; signature standard base64 with padding (88 chars); `?i=` = base58 pk without the `ed25519:` prefix; secret = 43-char base64url seed |
| U-09 | name mapping | contracts-spec §11 table: `within_rules` → `ok`, `payee_not_allowed` → `recipient`, `insufficient_balance` → `balance`, `pot_not_open` → `not_open`; request statuses → UI statuses |
| U-10 | pro-rata twin | vectors V1-V7 from the shared fixture (§4.2) + PR-02 |
| U-11 | text validation (rev4, review-security L-4) | the shared validator for names, display names, memos and decline reasons rejects Unicode format characters (Cf: bidi overrides U+202A-U+202E, U+2066-U+2069, …) except ZWJ U+200D and VS16 U+FE0F; the emoji validator rejects any ASCII byte; reserved display names ("Pot", "NEAR", "Support", "Admin", "Team") are refused; the same rules as the hub's `ERR_NAME_INVALID` / `ERR_EMOJI_INVALID` |

### 3.2 Web app (`apps/web`)

| ID | Covers |
|---|---|
| U-WEB-01 | the ten reducers in `lib/machines/*`, using the frontend-architecture §5 tables as fixtures (join, spend, voteRequest, approve, addMoney, deposit, confirmDevice, installCoach, push, createPot) |
| U-WEB-02 | feed merge and status derivation (frontend §3.6): identity keys, op re-keying, server ⊕ chain ⊕ ops precedence |
| U-WEB-03 | ops store: settle when every query in the settle set has `blockHeight ≥ executedAtBlock`; 10 s fallback; persistence rules (sessionStorage, `autoVote` in localStorage) |
| U-WEB-04 | relay error map (frontend §4.8): each `reason`/`errorCode` → UI class, copy key, `moneyMoved` |
| U-WEB-05 | signing queue: one in flight per key; nonce = max(chain, last) + 1; re-sign once on `expired`/`nonce_used` with the same `idempotencyKey` |
| U-WEB-06 | device key store: WebCrypto path and noble fallback both sign verifiable Ed25519 (never compare Safari signature bytes: they are randomized) |
| U-WEB-07 | i18n: generated types match `en.json`; `lint-copy` catches every banned word and respects the allowlist (`advanced.*`, `xc.*`, `demo.*`, `legal.*`, `add.usdc_note`, `landing.more.wallet`) |
| U-WEB-08 | platform detection: iOS 26 vs 27 via `Version/<n>`, in-app browsers (Telegram globals, Instagram/FB UA), standalone |
| U-WEB-09 | **Brand drift and token contrast** (rev6, D-67). Three checks:<br>(a) `scripts/gen-tokens.mjs` re-run on `docs/brand/tokens.json` equals the committed `app/tokens.css`;<br>(b) `public/` `favicon.ico`, `favicon.svg`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` and `og-image.png` match `docs/brand/web/` by sha256;<br>(c) WCAG contrast computed from `tokens.json` for Day **and** Night: `ink`, `ink-muted`, `link`, `approved`, `waiting` and `declined` ≥ 4.5:1 on `ground`, `surface` and `surface-sunken`; `on-brand` on `brand` ≥ 4.5:1; `ink` and `ink-muted` on `brand-soft` ≥ 4.5:1; `line-strong` ≥ 3:1 on every surface; Day `brand-deep` vs `ground` ≥ 3:1; `focus` vs `ground` and `surface` ≥ 3:1; `on-brand` on `member-1…6` ≥ 4.5:1.<br>The expected values are brand/README §3; a token change that breaks a pair fails CI |

---

## 4. Property tests

### 4.1 Properties

| ID | Where | Property | Runs |
|---|---|---|---|
| PR-01 | Rust `prorata.rs` (= contracts-spec P-01) | n ∈ 1..40, c_i ∈ 0..1e12 with at least one non-zero, B ∈ 0..1e15: Σ payouts = B; each share ≥ floor(B·c_i/C); dust < n and goes to the last contributor; zero contributors get 0 and are omitted; no overflow at maximum values (INV-11, INV-13) | 10,000 cases in CI |
| PR-02 | TS `@pot/sdk/math/prorata.ts` | the same properties with fast-check, **plus parity**: a seeded generator writes 500 random cases to a JSON file that the Rust test reads and checks; results must be identical | 2,000 runs (frontend §11.2) |
| PR-03 | Rust `ledger.rs` | random sequences of request transitions keep every counter equal to its definition in contracts-spec §2.4 (recomputed from the request set); each reservation released exactly once (INV-06) | 2,000 sequences |
| PR-04 | TS money display | for any Micro amount, the displayed cents never exceed the real amount (floor); "Gets back" rows sum to ≤ the close balance and the rounding note explains the dust | 2,000 runs |
| PR-05 | Rust hub (rev4, = contracts-spec PR-05) | random interleavings of direct calls (each with exactly `cost(op)` attached) by k accounts across the six hub-funded methods: the hub's free balance never decreases; random sponsored sequences in one UTC day: sponsored creations ≤ `max_sponsored_pots_per_day` (INV-18) | 1,000 sequences |

### 4.2 Shared vectors

`contracts/tests/vectors/prorata.json` holds V1-V7 from contracts-spec §3.9 (V1: $66 → $22.00 × 3; V2: 29,333,333 / 22,000,000 / 14,666,667; V3: $83.20 / $62.40 / $41.60; V4: 33/33/34; V5: dust to A; V6: nothing to refund; rev4 V7: a late $150 gets $54 back when $384 was spent before it). Both the Rust tests and U-10 read this one file, so the two implementations cannot drift.

---

## 5. End-to-end tests

### 5.1 Mocked UI tier (every PR)

Runs against `build:mock` + `next start`: `NEXT_PUBLIC_DATA_SOURCE=mock`, `NEXT_PUBLIC_RPC_URLS=http://127.0.0.1:4010` served by `e2e/fixtures/mock-rpc-server.ts` (so server-rendered `/j` and `/demo` are mocked too), and `page.route('/api/**')` fixtures for relay, session and feed. Latencies are deterministic and equal hallway round A (setup 6 s, checking 1.2 s, sending 2 s). Projects: Chromium and WebKit iPhone 13, 390×844; plus a 320 px project. Rev 6: plus a **Night** project (Chromium, `colorScheme: 'dark'`, 390×844) that reruns M-12, M-13, M-20 and M-22.

| ID | Flow | Asserts |
|---|---|---|
| M-01 | Invite landing → join (F1) | Pot shown before login; ≤ 4 taps to "You're in!"; focus moves to the H1; fragment kept in `sessionStorage` and stripped after join |
| M-02 | Add money (F2) | sheet closes at once; "+$150 on the way"; hero counts up after settle; "Finish adding" card on a forward failure fixture |
| M-03 | Instant spend (F3) | "Checking Pot rules…" ≥ 1.2 s, then "Approved by Pot rules", then "Sending…", then "$84 sent to you"; one live-region announcement only |
| M-04 | Vote request | "This needs 2 of 3 approvals"; own approval → "1 of 2"; `autoVote` resumes after a reload |
| M-05 | Approve and decline | optimistic meter < 100 ms; `already_voted` → `approve.already`; decided/expired states; inline approve Undo within 4 s (Phase 2) |
| M-06 | Create + Share | 3 steps; slug re-suffix on `slug_taken`; share link format `/j/<slug>?i=<pk>#<secret>` |
| M-07 | Close (Phase 2) | RefundTable equals the `preview_close` fixture ($22.00 × 3); rounding note; closed read-only state |
| M-08 | Rules (Phase 2) | sentences from `get_rules`; sole member applies; multi-member creates a request + own approval |
| M-09 | Deposit stepper (Phase 2) | ok/partial/failed/slow/expired scenarios; "Taking longer" at 5 min with a mocked clock; "DO NOT SEND" on testnet |
| M-10 | Degraded service | offline banner + disabled money CTAs; `relayer.down.banner` after a 503; `relayer.cap` on 429 |
| M-11 | `/demo` with **no JavaScript** | `GET /demo` HTML contains "Lisbon Trip", "$450", the three persona names and "Demo · test money on NEAR testnet"; the form POST returns 303 to `/p/<slug>` |
| M-12 | Visual snapshots | `toHaveScreenshot` at 390×844, animations disabled, frozen clock, for each MVP screen and open sheet; grayscale copies for review. Rev 6: one baseline set per theme (Day, Night) |
| M-13 | axe | `wcag2a`, `wcag2aa`, `wcag21aa`, `wcag22aa`: 0 violations on every route and open sheet |
| M-14 | Target sizes | every `button`, `a`, `[role=tab]` ≥ 48×48 px with ≥ 8 px spacing |
| M-15 | Reflow and motion | 320 px without horizontal scroll; `reducedMotion: 'reduce'` replaces motion as ux-spec §7.6 says (the 1.2 s beat stays). Rev 6: under reduced motion no `Celebration` particle is rendered on "Approved by Pot rules" and the typing dots have no running animation (`getAnimations()` is empty); without reduced motion the burst lasts 600 ms, plays once, and is absent on a group approval (`approve.final`) |
| M-16 | Advanced room (rev3; P-11) | the "On-chain rules" panel renders the `get_policy` fixture (roles `member` and `rulebot`, bond 0, quorum 1); explorer and receipt links present; **no Trezu link** on a testnet Pot, a Trezu link on a mainnet fixture (D-52) |
| M-17 | Hub-tracked approvals (rev4, review-security H-2, M-10) | a mocked DAO with a member-created `ChangePolicy` and a member-created `Transfer` (`get_proposal_subject` → `null`): the Requests tab shows them as read-only "Direct change" cards with the decoded kind and **no Approve button**; a hub proposal whose `get_proposal(id).kind` amount differs from the hub's `RequestView` → `generic.error`, nothing signed; a close approval's table shows the payouts decoded from the proposal |
| M-18 | Invite and new-member UI (rev4, H-1) | the Share card shows "Link works until {date} · {n} more people can join" from a `get_invite` fixture (7 days, 10 uses) and the "share it only in your group chat" copy; [Make a new link] creates a fresh 7-day, 10-use link; a member with $0 put in gets `preview.vote.new_member` for $50, and `preview.instant` after a contribution fixture |
| M-19 | `/demo` guards (rev4, L-5, H-5) | `/demo?as=maya` with a `pot_hint` of kind `near-auth` shows the forms and doesn't auto-submit; with no hint it auto-submits; `/demo?ro=1` renders the read-only notice above the snapshot |
| M-20 | **Brand rules** (rev6, D-67), on every route and open sheet, Day and Night | **One marigold button:** visible elements matching `button, a, [role=button]` outside `inert` / `aria-hidden` subtrees whose computed `background-color` is `brand` (`rgb(255, 179, 32)`) number ≤ 1, and exactly 1 on the screens with a primary action (`/j`, the Pot, every money sheet, the Approve sheet while it offers Approve, You're in). **Marigold is never text:** no text node renders in `brand` or `brand-deep` (Day `rgb(184, 120, 0)`, Night `rgb(227, 154, 0)`). **Status:** every StatusChip and status line contains an icon (`svg`) and a word; no state colour appears without both. **Goal bar:** it always has its text twin. **Day:** the marigold button has its 1 px `brand-deep` border |
| M-21 | **Night theme, no flash** (rev6, D-67) | (a) With `colorScheme: 'dark'`, no stored choice, and every request whose `resourceType()` is `script` aborted (the stylesheets still load, but no app JS runs), `<html data-theme="night">` is set and `body` computes to the Night `ground` `rgb(28, 20, 36)`: the inline head script did it before first paint. (b) `localStorage['pot-theme'] = 'day'` under dark → Day; `'night'` under light → Night. (c) You → Settings → Appearance switches live, survives a reload, and rewrites both `theme-color` metas; "Match my phone" restores the media pair. (d) `javaScriptEnabled: false` + dark: `/demo` renders on the Night ground (the CSS media fallback). (e) The header shows the lockup's on-dark wordmark in Night; the mark is identical in both themes. (f) M-12 and M-13 pass in the Night project |
| M-22 | **Tabular figures** (rev6, D-45) | Every `MoneyText` (`[data-money]`) on every route and sheet computes `font-variant-numeric` containing `tabular-nums`. A fixture hero shows the same width (± 0.5 px) for "$111.11" and "$888.88" in Gabarito 800, and so does a feed row in Figtree 700. `document.fonts.check('800 44px Gabarito')` and `('700 17px Figtree')` are true once loaded. Money out renders U+2212 |

### 5.2 Testnet tier: two contexts (Maya, Leo) via demo personas

Trigger: GitHub `deployment_status` (state `success`) for previews, with the Vercel Protection Bypass cookie (set once, not as `extraHTTPHeaders`, which would leak to RPC and wallet origins) and the BotID bypass header; nightly at 03:00 UTC against production (rev4: new demo leases pass BotID, so the nightly job sends the separate production bypass secret, architecture §4.5). Leases are per visitor (the `pot_demo_visitor` cookie, api-spec §2.8), so two fresh cookie jars would lease two different Pots. The Maya context therefore opens `/demo?as=maya` first; the Leo context gets a copy of Maya's `pot_demo_visitor` cookie and then POSTs `/api/demo/session` with `persona: "leo"`. Both contexts end up with their own session cookie in the same leased Pot (api-spec §7.3 persona switch). See implementation-plan §10 #32.

**Leases per run (rev3).** A single lease can't hold every test: a contribution (E-04) changes the close math that E-07 asserts ($22.00 each), and E-10 needs a fresh $450 Pot. So:
- **Lease 1, every run (preview deploys and nightly):** E-10 follows the README literally in context A (J-1…J-5, then J-6 = E-07 once `FLAG_CLOSE` is on, from Nov 10). Context B is Leo's session in the same lease (the cookie copy above) and only observes: it makes E-01…E-03's cross-context assertions while context A acts.
- **Lease 2, nightly only:** E-04 → E-08 → E-09, in that order (none of them asserts the close math). E-05 creates its own Pot from this lease's Maya session.
- **E-06, preview only, once a day** (the first preview deploy of the UTC day, or a manual dispatch): it needs a brand-new account as the joiner, and only the preview-only dev session can make one without NEAR Auth (api-spec §2.1). Production has no such path, so P-3 on production is covered by G2/G3 and the QA rows.
- Pool use: 1 Pot per preview deploy (+1 a day for E-06) and 3 Pots per night (2 leases + E-05), inside accounts-and-deploy §2.2's 60 preview and 106 production Pots.

| ID | Steps | Asserts (P-x) | When |
|---|---|---|---|
| E-01 | lease as Maya (context A) and as Leo (context B) | both see the same leased Pot, $450, 3 members | every run (lease 1) |
| E-02 | context A: Spend → Reimburse me → $84 → Groceries (= J-3) | early "Approved by Pot rules" ≤ 4 s p95, "Sent" ≤ 10 s p95, Pot $366 in context B ≤ 3.3 s after finality (P-5, P-4 b) | every run (lease 1) |
| E-03 | context A: $300 Tickets → Ask the group (= J-4), then Switch to Leo → Approve (= J-5) | the meter shows "1 of 2" after Maya's request; context B's Requests badge shows 1 before J-5; Leo's vote executes; both contexts' feeds show "Approved" ≤ 10 s; the hub's `get_request` for that request shows `approved` within 10 s (only `sync` moves a vote request there, so this proves the relayer's `sync` ran; rev3, was a `relay_log` check the E-tier can't read) (P-6) | every run (lease 1) |
| E-04 | Leo adds $10 demo dollars | contribution event; Maya's hero updates ≤ 8 s after the relay returns (P-4) | nightly (lease 2, first) |
| E-05 | Maya creates a Pot | `pot_created` ≤ 15 s; persona NEAR balance unchanged; `get_policy` template (P-2) | nightly only (each run funds a DAO float) |
| E-06 | Maya makes a new invite link; a third context with a dev session opens `/j/<slug>?i=…#…` and joins | member visible in Maya's Members ≤ 5 s; DAO group contains the joiner (P-3) | preview, once a day (rev3: was nightly on production, where no new account can be made without NEAR Auth) |
| E-07 | close (= E-10 J-6) | RefundTable = $22.00 each; the final vote at 300 Tgas executes; Pot closed (P-9) | every run from Nov 10 (lease 1, after J-5) |
| E-08 | rules change $100 → $150 | group approval → RulePreview changes (P-8) | nightly from Nov 9 (lease 2) |
| E-09 | simulated any-chain deposit | 5 steps reach "Added to the Pot" (P-7) | nightly from Nov 10 (lease 2) |
| **E-10** | **README judge script** (§5.3) | every J-step, as written in the README | every run (lease 1) |
| **E-11** | **CLI twins** (§5.3) | read-only near-cli-rs commands return the README's expected values | nightly + pre-lock + Nov 13 morning (script by P1 on Nov 11) |
| E-12 | **Abuse run** (rev4; by hand during B-19 on Nov 11, again before the Nov 13 public flip; a human signs) | on preview, with a throwaway testnet account funded with 1 NEAR: a direct `create_pot` / `request_spend` / `propose_rules` without a deposit → `ERR_DEPOSIT_REQUIRED` and the hub's balance unchanged, with the contracts-spec §3.0 deposits → success and the hub's balance not lower; a member-created DAO proposal → the relayer refuses votes on it (`proposal_not_tracked`) and the UI shows it read-only; a 4th `Finalize` in a day → 429; simulated deliveries over $500 → 429; a 2nd `propose_rules` while one is open → `ERR_RULES_PENDING`. Nothing returns 5xx and every budget holds. (Not in CI: GitHub holds no NEAR keys) | Nov 11, Nov 13 |

### 5.3 The README judge script as an executable test

The README's "Try it" steps are numbered **J-1…J-8** ([submission-plan.md](submission-plan.md) §1.2) and carry hidden markers `<!-- J-n -->`.

- **E-10** (`e2e/testnet/readme-judge.spec.ts`) has one `test('J-n …')` per UI step and follows the README wording literally: the same button labels, the same amounts ($84, $300), the same expected texts ("Approved by Pot rules", "This needs 2 of 3 approvals", "$22.00"). J-1 runs twice: once with JavaScript disabled (plain `request.get('/demo')` and a form POST, the way an AI judge without a browser would; rev4: without the BotID signal that POST must get 303 → `/demo?ro=1`, whose HTML still shows "Lisbon Trip" and "$450") and once in a browser.
- **E-11** (`scripts/readme-cli-check.sh`) runs each J-7 command with `npx -y near-cli-rs@0.30.1` against the permanent reference Pot `lisbon-trip.pots.<root>.testnet` and asserts substrings: `get_policy` has roles `member` and `rulebot`, `proposal_bond` `"0"`, quorum `"1"`; `ft_balance_of` of the reference Pot = `"450000000"` and of the hub = `"0"`; `view-account-summary` shows the global code hash `c9a502ef…39ce`; `get_factory_info.factory_id` = the hub; after Nov 12, `list-keys` on the hub, the token and the Pot prints an empty table (rev4: the token's from Nov 2, and `list-keys maya.users.<root>` is empty from Nov 6, so the reference Pot is read-only). It also `curl`s `/api/demo/state` and checks the JSON fields named in the README.
- **Drift check** (`scripts/check-readme-steps.mjs`, in the web CI job): every `<!-- J-n -->` marker in README.md has a matching `test('J-n` in E-10 and vice versa, and every command block under J-7 appears verbatim in E-11. A README edit that isn't mirrored fails CI.
- J-8 (`cargo test -p pot-tests`, `pnpm test`) is covered by the CI jobs themselves.

---

## 6. API and relayer tests

Route handlers are tested with Vitest against a Postgres 18 service container (migrations applied by `drizzle-kit migrate`) and a stubbed RPC that replays **recorded outcomes**. Recorded outcomes are captured from our own preview runs during the event (`e2e/fixtures/outcomes/*.json`); nothing is copied from `spikes/`.

| ID | Area | Cases |
|---|---|---|
| **A-01** | **Allowlist and policy, negative** (api-spec §8 "Relayer safety") | each is refused **before submission** (no outer tx hash; `relay_log.status = rejected`): deposit 2 yocto on `ft_transfer_call` → `deposit_cap`; any deposit on a hub method → `deposit_cap`; `near_deposit` or any unlisted method → `method_not_allowed`; unknown receiver → `receiver_not_allowed`; `ft_transfer_call` with `receiver_id` ≠ hub, extra `msg` field, unknown or closed Pot, or `memo` present → `args_invalid`; 300 Tgas on `ft_transfer_call` → `gas_cap`; 200 Tgas on a `call`-proposal vote → `gas_cap` (must be exactly 300); rev4: 300 Tgas on a Transfer vote → `gas_cap` (must be exactly 100); `act_proposal` with `memo`, missing `proposal`, or a kind that differs from `get_proposal` → `args_invalid`; two actions outside the R5 rotate pair, a non-FunctionCall action, `DelegateV2` or nested delegates → `action_not_allowed`/`bad_request`; slug with `--`, reserved slug, > 32 chars → `args_invalid`; `AddKey` through `/api/relay` → `action_not_allowed` (R12 only via the device routes); delegate sender ≠ session account → `sender_mismatch`; NEAR Auth session signed by a key other than its device key → `key_not_allowed`; tampered bytes → `bad_signature`; `max_block_height ≤ head + 10` → `expired`; `> head + 600` → `ttl_too_long`; nonce ≤ access-key nonce → `nonce_used`; a second delegate for the same key in flight → `nonce_pending`; a function-call key attaching 1 yocto → `fc_key_deposit` |
| A-02 | Quotas | the atomic upsert-with-limit: 20 concurrent callers vs a limit of 3 → exactly 3 succeed (data-model §3.1); burst 20 writes/min → `rate_limited`; per-family daily caps (create 3/user, faucet $500/account) → `quota_exceeded` with `detail.family`; per-Pot caps; `global/relay_yocto` cap → 503 `global_cap`; > 10 on-chain rejections in a day → `user_suspended`; a failure later in the request rolls back earlier counters |
| A-03 | Idempotency | same `idempotencyKey` + same body → stored response with `replayed: true`; same key + different body → 409 `idempotency_conflict`; the same signed delegate under a new key → deduped by `delegate_hash` |
| **A-04** | **Receipt scanning outcomes** (api-spec §3.4) | top-level `Failure` variants → `expired`, `nonce_used`, `key_not_found`, `fc_key_deposit`, `bad_signature`; `ft_transfer_call` with `ft_resolve_transfer` used = `"0"` → `inner_failed` + `CONTRIBUTION_REFUNDED` while the top-level status is `SuccessValue("")`; used = amount + `contribution` event → success; `request_spend` final value `status: refused` → `REFUSED_<REASON>`; a hub panic with control characters → sanitized text + the first `ERR_*` token; the payout `ft_transfer` (predecessor = DAO) failed → `payout: failed` and `sync` queued in `after()`; `EVENT_JSON` logs from executors other than the hub or the token are ignored (spoofing); the final value is found by following `SuccessReceiptId` chains; `executedAtBlock` = the max receipt height |
| A-05 | Two-phase `request_spend` | the early 200 (`final: false`, `payout: pending`) once `get_requests` shows the proposal; `GET /api/relay/[relayId]` returns the final body after `after()` stores it; a refusal at the pre-check returns one final response |
| A-06 | Timeout algorithm (architecture §4.1) | unknown outcome → re-broadcast the same signed bytes while the key nonce is below; dropped outer tx → a new outer tx around the same delegate; delegate already executed → found via the FastNEAR Tx API stub; 25 s → 202 `pending` |
| A-07 | NEAR Auth session | ID token: wrong `iss`, wrong `aud`, `alg: none`, HS256, PS256 (rev4: `jose` pinned to RS256), expired, `iat` > 10 min → `id_token_invalid`; JWKS down → `auth_unavailable`; PoP outside ±120 s or replayed → `device_proof_invalid`; two concurrent first logins → one account (onboarding lease, 409 `onboarding_in_progress`); resume after a failed registration; `sub` that doesn't match `SUB_RE` → rejected |
| A-08 | Device re-login | valid device key → new session without a popup; key gone on chain → `device_not_registered`; revoked → `device_revoked` |
| A-09 | Wallet session (NEP-413) | stale nonce, reused nonce, wrong recipient, wrong message → `wallet_signature_invalid`; function-call key → `wallet_key_not_full_access`; accounts under the relayer → `bad_request` (rev4: **any** account under `<root>`, e.g. `pots.<root>` or a persona); USDC registration once per account |
| A-10 | `/api/devices` and pairing | JWT wrong `aud`/`azp`/`scope`/`sub` → `near_auth_token_invalid`; < 15 s left → `near_auth_token_expired`; `fatxn` ≠ bytes or a delegate other than one `AddKey` of the PoP'd key → `payload_mismatch`, with **no MPC call** (nothing paid); key already on chain → 200 without signing; pairing for another user → `pairing_invalid`; > 10 min → `pairing_expired` |
| A-11 | Faucet | idempotent per key; per-account and per-IP caps; registers unregistered accounts; never `ft_transfer_call`s on the user's behalf; mainnet → 404; rev4: a claim below $50 → `bad_request`; a `pending_device` session → `device_not_registered` |
| A-12 | Notes and feed | non-member → `not_a_member`; a memo shows only when its author is the on-chain requester of that `request_ref`; a decline reason only when its author's vote is Reject; members get memos, anonymous readers don't; text 1-140 code points; rev4: a memo with a bidi override → `bad_request` (U-11 validator) |
| A-13 | Demo | form POST → 303 with cookies; JSON variant; a cross-site `Origin` or `Sec-Fetch-Site: cross-site` → rejected; demo intents targeting the reference Pot or another lease → `demo_forbidden`; two visitors never get the same pool Pot under concurrency; empty pool → shared Pot with `shared: true`; signed bodies refused in demo sessions (rev4 hardening: A-26) |
| A-14 | Push subscription | endpoints outside the push-service host allowlist → `args_invalid` (SSRF guard); demo session → `demo_forbidden` (unless the R-15 flag is adopted); max 10 per user; an endpoint moves between users on a shared device |
| A-15 | Notification fan-out | payload ≤ 2,500 B, absolute https `navigate`, no balances, account ids or tx hashes in bodies; 404/410 deletes the subscription; 429 honours `Retry-After` once; `notification_log` dedupe: the same event twice → one send |
| A-16 | 1Click | simulated quote has 1Click's shapes and `qrText` "DO NOT SEND"; simulator profiles drive statuses; `chain_paused` from a Shield fixture; `amount_too_low` parses the minimum; real-mode request body = D-50 (`FLEX_INPUT`, 100 bps, `INTENTS` refund, +2 h deadline); `verifyQuoteSignature` checked; `watchDeposit` ends in a terminal state within ≤ 400 events |
| A-17 | Cron | a double-fired run exits early on the lease; expiries → `sync`; failed payouts → `retry_payout` only when the balance covers them; retention deletes per data-model §4 |
| A-18 | Key pool | 8 concurrent relays lease 8 distinct keys; the 9th waits ≤ 3 s, then 503 `relayer_busy`; leases released on every path |
| A-19 | CSRF and envelope | non-JSON content type or foreign `Origin` → `forbidden_origin`; body > 16 KB → `bad_request`; unknown fields → `bad_request` (`.strict()`); every response carries `requestId` and `x-request-id` |
| A-20 | Health | `relayer` low/critical thresholds per api-spec §3.5: rev4 (1-yocto MPC deposit, D-21) warn/critical = **5/2 NEAR**; warn is always above critical (implementation-plan §10 #20); `rpc` degraded/down |
| A-21 | Dev session (rev3, B-04) | `POST /api/session/dev` answers 404 when `VERCEL_ENV=production` even with `FLAG_DEV_SESSION=true`, and 404 when the flag is off; on preview it creates `u-<8>` with exactly **one** full-access key (the device key) and 0 NEAR; replayed `pop` → `device_proof_invalid`; the `dev_accounts` quota; a `dev` session's delegate signed by another key → `key_not_allowed`; `POST /api/devices` → `demo_forbidden` |
| A-22 | **R11 hub-tracked votes** (rev4, review-security H-2; the relayer refuses votes on non-hub proposals) | a relayed `VoteApprove` / `VoteReject` / `Finalize` on a member-created DAO proposal (`get_proposal_subject` → `null`) → 403 `proposal_not_tracked`, **no tx**; on a hub proposal that is no longer `live` (a replaced close) → `proposal_not_tracked`; a vote by an account that isn't an Active member of that Pot → 403 `not_a_member`; Transfer vote at 100 Tgas and `call` vote at 300 Tgas → relayed, any other gas → `gas_cap`; a 4th `Finalize` (or `retry_payout`) on one proposal in a UTC day → 429 `quota_exceeded` (family `finalize`); a close's deciding vote with an unregistered payee → the relayer registers it first |
| A-23 | **Per-user budgets** (rev4, H-2, C-1) | `user:{id}`/`relay_yocto` trips at 0.2 NEAR before the global cap → 429 (family `budget`); `user:{id}`/`hub_yocto` trips once the user's estimated hub spend passes 0.3 NEAR in a UTC day (3 `create_pot` = 0.183 fit) → 429; `global/hub_yocto` → 503 `global_cap` + `hub_budget` alert at 80 %; `call` votes and `Finalize` pre-charged at 0.03 NEAR and corrected after the outcome; demo relays count only toward `demo_yocto` |
| A-24 | **Invite bounds** (rev4, H-1) | R5 `add_invite` with `expires_at_ms` > now + 30 days → 422 `args_invalid`; `max_uses` 41 → `args_invalid`; both `null` → relayed (the hub applies 7 days and 10 uses) |
| A-25 | **ID-token nonce binding** (rev4, M-1; B-20) | an ID token whose `nonce` ≠ base64url(sha256(devicePk ‖ challenge)) → 401 `id_token_invalid` (`detail.cause: "nonce"`); a token minted for device key A replayed with device key B → `id_token_invalid`; a reused or > 10-min-old challenge, or one with a bad MAC → `id_token_invalid`; with a production config, `aud` = the shared client → `id_token_invalid`; a `pending_device` session calling notes, faucet, push, `PATCH /api/me` or pairing → 403 `device_not_registered` |
| A-26 | **Demo hardening** (rev4, H-5; the reference Pot is read-only) | the 11th new lease in a UTC day from one IPv4 address, or from one IPv6 /64 with rotating /128s → 429 (family `lease`; a form post → 303 `/demo?ro=1`); a BotID bot verdict → no lease (form → 303 `/demo?ro=1`, JSON → 403 `bot_detected`); a persona switch inside an active lease skips BotID; a demo intent naming the reference Pot → `demo_forbidden` even when the persona created it (checked first); in the shared Pot `propose_close`, a close vote or `Finalize`, `propose_rules`, `set_rules` and a rules vote → `demo_forbidden`; a shared Pot below $300 or not Open → a fresh shared seed starts and the pointer moves when it is ready; demo `create_pot` quota keyed by visitor **and** IP net |
| A-27 | **Simulator caps** (rev4, H-3) | a simulated quote of $1,000,000 → 422 `amount_too_high`; `simulate` with `amount` above the quote → 422; a session's simulated deliveries above $500 in a UTC day → 429 `quota_exceeded` (family `xc`); a demo session above $150 → 429; deliveries count toward the global `faucet_usd`; the treasury's balance delta ≤ the caps |
| A-28 | **Registrations** (rev4, L-6) | an account we registered with USDC before and that `storage_unregister`ed → 409 `registration_used`, nothing paid; `global/registrations` 200/day → 429 (family `accounts`) |
| A-29 | **Privacy and lazy reconcile** (rev4, M-7, L-8) | an anonymous feed read of a non-demo Pot → `profiles: {}` and no lazy reconcile (no RPC, no `sync`); a member read → profiles; an anonymous read of a demo Pot → profiles; an unknown slug is negatively cached for 60 s |
| A-30 | **Devices and pairing** (rev4, L-7, M-2) | `derived_public_key(sub)` ≠ the stored `mpc_public_key` → `payload_mismatch` with **no** `sign` call; the `sign` call attaches exactly 1 yocto; a pairing started from a `pending_device` session → `pairing_invalid`; a pairing completed by an active device other than the session's → `pairing_invalid` |
| A-31 | **DAO float top-ups** (rev4, M-4) | a non-demo DAO below 0.02 NEAR → no top-up; a demo DAO → at most 2 top-ups in its lifetime |

---

## 7. CI pipeline (GitHub Actions)

Pinned facts ([../kb/backend-infra.md](../kb/backend-infra.md) R7, D-65): `runs-on: ubuntu-24.04` x64 everywhere (`ubuntu-latest` moves to Ubuntu 26.04 between Oct 19 and Nov 19; the sandbox binary needs glibc 2.39, which 24.04 has); Rust **1.93.0** from `rust-toolchain.toml` (stable 1.100.0 lands **Nov 12**, mid-event, and must not leak in); arm64 runners only as non-blocking jobs (no Chrome, untested upstream).

| Job | Trigger | Steps | Caches | Blocking? |
|---|---|---|---|---|
| `contracts` (matrix `SPUTNIK_BUILD: [A, B]`) | push/PR touching `contracts/**` | checkout → `actions-rust-lang/setup-rust-toolchain@v2` (reads `rust-toolchain.toml`; `build-warnings: ""`) → cargo-near **0.22.0** via its pinned `cargo-near-installer.sh` URL → restore the sandbox binary (nearcore 2.13.4) and set `NEAR_SANDBOX_BIN_PATH` → `shasum -c contracts/res/sputnik/SHA256SUMS` → `cargo near build non-reproducible-wasm` for `pot-hub` and `test-usdc` → `cargo test -p pot-hub` (unit + proptest) → `cargo test -p pot-tests -- --test-threads=2` with `NEAR_RPC_TIMEOUT_SECS=60` | `Swatinem/rust-cache@v2` (workspace `contracts`); `actions/cache` for `~/.cargo/bin/cargo-near` and the sandbox tarball keyed on its version | yes |
| `contracts-p88` | same | the ★ tests with `sandbox_with_version("2.14.0-rc.4")` (protocol 88); set up with the contracts job on Nov 2 (X-02 absorbs the old C-14, rev3) | same | yes before the releases on Nov 6, Nov 9 and the lock |
| `web` | every push/PR | pnpm 11 via Corepack, Node 22.22.2 → `pnpm install --frozen-lockfile` → `lint`, `lint:copy`, `i18n:check`, `typecheck` → `check-no-near-org.mjs` (repo + `node_modules/**/dist`) → `check-readme-steps.mjs` → Vitest (web + sdk, incl. U-, PR-02, PR-04) → API tests A-xx with a `postgres:18` service container → `drizzle-kit generate` diff must be empty → `next build` + `next analyze` + `check-bundle-budget.mjs` (PF-01) → Playwright mocked tier M-01…M-22 (Chromium + WebKit; rev6: + the Night project; U-WEB-09 runs with the unit tests) | pnpm store; Next build cache; Playwright browsers | yes |
| `migrate` | push to `main` (prod DB); PR (Neon `preview` branch) | `drizzle-kit migrate` with `DATABASE_URL_UNPOOLED` (never from a Vercel build, data-model §6) | — | yes for `main` |
| `e2e-testnet` | `deployment_status` = `success` (preview) | Protection Bypass cookie + BotID bypass → W-08 headers (rev4) → lease 1: E-10 with E-01…E-03 (§5.2); E-06 once a day | Playwright browsers | yes for merges from Nov 9 (the job exists after X-07 on Nov 8; rev3, was "after Nov 6") |
| `nightly` | schedule `0 3 * * *` (03:00 UTC; the Vercel reconcile cron is 04:00 UTC) on `main` against production | lease 1: E-10 with E-01…E-03 and E-07; lease 2: E-04, E-08, E-09; E-05 (§5.2) → E-11 CLI twins → W-01…W-03, W-08 → balances report (relayer, hub, treasury, preview) → PF-04 latency summary from `relay_log` | — | failure → `ALERT_WEBHOOK_URL` and first item at standup |
| `security` | PR + before the public flip (X-17) | gitleaks over the diff (PR) and the full history (Nov 11-12); `pnpm audit --prod` for critical advisories **plus SEC-1** (rev4, review-security M-8): `scripts/check-pins.mjs` reads `pnpm-lock.yaml` and fails unless every resolved `next` is ≥ 16.4.1 and `react`/`react-dom` ≥ 19.3.1, because GHSA-673q-mjm6-r5xr (RCE in `use cache`, next 16.0.0-16.4.0) was not in the npm advisory database on 2026-10-21, so `pnpm audit` alone would pass a downgrade; repo Dependabot alerts on (X-01) | — | yes |

**Budget:** a private repo on GitHub Free has 2,000 minutes/month and the event needs ≈ 2,100-2,200 if everything runs on every push ([../kb/backend-infra.md](../kb/backend-infra.md)). So: path filters (`contracts/**` vs `apps/**`, `packages/**`), `concurrency: cancel-in-progress` per branch, the nightly only on `main`, and the protocol-88 job on `main` + release tags only. A public repo (H-04 Hobby option) makes minutes free.

**Secrets in GitHub:** `VERCEL_AUTOMATION_BYPASS_SECRET`, `BOTID_BYPASS_SECRET` (preview only), `DATABASE_URL_UNPOOLED` (migrate), `ALERT_WEBHOOK_URL`. No NEAR keys ever live in GitHub; E-11 is read-only and needs none.

---

## 8. Manual QA device matrix

Dates: **QA-1** Tue Nov 3 (early check: iPhone standalone popup, Android install, in-app detection), **QA-2** Sat Nov 7 (hallway devices), **QA-3** Wed Nov 11 (full matrix), **QA-4** Thu Nov 12 (post-lock regression on prod), **QA-5** Sun Nov 15 (pre-judging sanity on prod: `/demo`, E-10 manually, CLI twins).

| Flow ↓ / Device → | iPhone iOS 26 Safari tab | iPhone iOS 26 installed | iPhone iOS 27 Safari + installed | Android Chrome tab | Android installed (WebAPK) | Desktop Chrome / Safari / Firefox | Telegram in-app (iOS, Android) | Instagram in-app (iOS, Android) |
|---|---|---|---|---|---|---|---|---|
| F1 join from a chat link (OG preview, landing, join) | QA-2, QA-3 | QA-3 | QA-3 | QA-2, QA-3 | QA-3 | QA-3 | QA-1, QA-3: in-app banner, escape keeps `#fragment` | QA-1, QA-3: same; `x-safari-https` may fail, [Copy link] works |
| F2 add money | QA-2, QA-3 | QA-3 | QA-3 | QA-2, QA-3 | QA-3 | QA-3 | — | — |
| F3 instant spend beats | QA-3 | QA-3 | QA-3 | QA-3 | QA-3 | QA-3 | — | — |
| F4 vote + approve from push | QA-3 | **W-05** | W-05 | QA-3 (tab push, D-42 permitting) | **W-06** | W-04 (Chrome headed) | — | — |
| F5 close | QA-3 | QA-3 | — | QA-3 | — | QA-3 | — | — |
| F6 create + share (Web Share sheet, QR) | QA-3 | QA-3 | — | QA-3 | QA-3 | QA-3 | — | — |
| F7 simulated deposit stepper | QA-3 | — | — | QA-3 | — | QA-3 | — | — |
| Install coach (iOS 26 "•••", iOS 27 "Page Menu", Android prompt/menu) | QA-3 | n/a | QA-3 | QA-3 | n/a | You tab only | in-app coach | in-app coach |
| New device / installed-app sign-in (NEAR Auth popup or pairing; spike §D result) | — | QA-1, QA-3 | QA-3 | — | QA-3 | localhost | — | — |
| NEAR Connect (Meteor/Intear) | — | — | — | QA-3 | — | QA-3 | — | — |
| Offline / relayer-down banners | QA-3 | QA-3 | — | QA-3 | — | QA-3 | — | — |
| VoiceOver / TalkBack | AX-02, AX-03 | AX-02, AX-03 | — | AX-04 | AX-04 | AX-05 keyboard | — | — |

Each cell is recorded as ✅ / ❌ + a note in the QA sheet (kept in `docs/qa/` in the repo). A ❌ on an MVP flow before G3 blocks the freeze; after G5 it goes into the README limitations if it can't be fixed.

---

## 9. PWA, accessibility and performance

### 9.1 PWA checks

| ID | Check | How | When |
|---|---|---|---|
| W-01 | Installability | CDP `Page.getInstallabilityErrors` → `[]` in a **persistent** Chromium context (incognito reports `in-incognito`) | nightly from Nov 11 |
| W-02 | Manifest | CDP `Page.getAppManifest` errors `[]`; `/manifest.webmanifest` served as `application/manifest+json`; icons 192/512/maskable present. Rev 6: `background_color` and `theme_color` are `#faf9f6`, the icons are the brand files (U-WEB-09), and the HTML has two media-matched `theme-color` metas (`#faf9f6`, `#1c1424`) plus `og:image` → `/og-image.png` 1200×630 | nightly |
| W-03 | Service worker | `curl -I /sw.js` → 200, `Content-Type: application/javascript`, `Cache-Control: no-cache, no-store, must-revalidate`, CSP header; **no fetch handler** (D-42) | nightly |
| W-04 | Push round trip (desktop) | headed Chrome: subscribe → server sends a Declarative payload → notification shown → click opens `/p/<slug>?r=<id>` (headless cannot subscribe) | Nov 10 PM, Nov 11 |
| W-05 | Push on an installed iPhone | permission from a button tap after install; a Declarative push arrives with the app closed; badge count; tap opens the Approve sheet | Nov 11 (QA-3) |
| W-06 | Push on Android | tab (if D-42 allows) and installed WebAPK | Nov 11 (QA-3) |
| W-07 | Badge | `setAppBadge` count = items waiting on me (installed desktop and iOS with permission) | Nov 11 |
| W-08 | Security headers (rev4, review-security M-3) | `curl -sI` on `/`, `/pots`, `/p/<slug>`, `/j/<slug>`, `/demo` and one `/api/*` route: `Content-Security-Policy` contains `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'none'`, `form-action 'self'`; `X-Frame-Options: DENY`; `X-Content-Type-Options: nosniff`; `Referrer-Policy` (`same-origin` on `/j/*`); `Permissions-Policy`; `Strict-Transport-Security` | every preview deploy + nightly |

### 9.2 Accessibility (WCAG 2.2 AA)

| ID | Check | Pass criteria | When |
|---|---|---|---|
| AX-01 | axe on every route and open sheet | 0 violations (= M-13) | every PR |
| **AX-02** | **VoiceOver: join** (iPhone, Safari tab and installed) | the ux-spec §8 script, in order: "Maya invited you to Lisbon Trip, heading level 1" → balance, goal, members sentences → trust sentence → "Join with Google, button" → "Setting up your Pot account. Busy." → polite "Joining Lisbon Trip." → focus on "You're in!, heading level 1" → body → "Add my $150 share, button" | Nov 7 (round C optional), Nov 11 |
| **AX-03** | **VoiceOver: approve** | notification "Maya needs your OK. $300 for Tickets · Lisbon Trip" → "Approve request, dialog. Maya asks for $300, heading level 2" → reason → "Needs approval because it's over the $100 instant limit." → "1 of 2 approvals so far." → "Pot after this: $66." → "Expires in …" → "Approve $300, button" → polite "Approved. 2 of 2. $300 is on its way to Maya." → focus on the request item, now "Approved" | Nov 11 |
| AX-04 | TalkBack on Android Chrome | the same two paths complete; one announcement per event | Nov 11 |
| AX-05 | Keyboard (desktop) | every action reachable; sheets trap focus, Esc closes, focus returns; keypad takes digits, Backspace, Enter | Nov 11 |
| AX-06 | Zoom and reflow | 200 % text and 320 px without horizontal scroll (= M-15) | Nov 11 |
| AX-07 | Reduced motion | ux-spec §7.6 replacements; no loop > 5 s; the 1.2 s beat stays (rev6: no burst; the typing dots are still) | Nov 11 |
| AX-08 | Colour independence | grayscale snapshots (M-12) reviewed: every status readable by icon + word (rev6: in Day and Night; chips show `check` / `clock` / `x`, never a bare dot) | Nov 7, Nov 11 |
| AX-09 | **Brand on devices** (rev6, D-67) | On the iPhone (Safari tab and installed) and on Android:<br>• OS dark mode and the Appearance override both apply with no flash on a cold start;<br>• Android's toolbar follows `theme-color` (Day `#faf9f6`, Night `#1c1424`);<br>• on desktop, the keyboard focus ring is visible next to a marigold button in Night (the 2 px offset);<br>• the 600 ms burst plays once on "Approved by Pot rules" and not with Reduce Motion on;<br>• the favicon (the small-size cut) shows three dots at 16 px in light and dark browser UI;<br>• the Home Screen icons (apple-touch, maskable) aren't clipped;<br>• the invite link unfurls with the brand image in WhatsApp and Telegram | Nov 7 (Day + Night on the hallway devices), Nov 11 |

### 9.3 Performance budgets

| ID | Budget | Measured by | Gate |
|---|---|---|---|
| PF-01 | First-load JS (brotli): `/j/[slug]` ≤ 170 KB, `/demo` ≤ 150 KB, app routes ≤ 230 KB. Lazy chunks: signing ≤ 75, auth ≤ 70, wallet ≤ 15, motion ≤ 25, create ≤ 45, qr ≤ 15 KB. `near-api-js` never on first load (D-42) | `check-bundle-budget.mjs` on `next build` + `next analyze` | CI fails |
| PF-02 | LCP ≤ 2.5 s on `/j/[slug]` and `/demo` (Lighthouse 13.5.0 mobile, 390×844, DPR 3); TBT ≤ 200 ms; CLS ≤ 0.05; INP ≤ 200 ms; Lighthouse accessibility 100 | Lighthouse CLI on a preview | Nov 7, Nov 12 |
| PF-03 | RPC: ≤ 3 calls per 3 s per visible Pot; ≤ 100 calls/min per tab; hidden tabs poll nothing | `?debug=1` counter; asserted in M-tier | every PR |
| PF-04 | Chain latency (P-x budgets): create ≤ 15 s p95 (P-2); others see a contribution ≤ 5 s after finality (P-4); "Approved" ≤ 4 s p95 and "Sent" ≤ 10 s p95 (P-5); join ≤ 5 s; new device ≤ 25 s p95 (P-1 e) | E-tier timings + `relay_log` timings | nightly report; a miss is a standup item |
| PF-05 | API p95 per route (api-spec §0.6 table, e.g. `GET /api/session` 300 ms, `/api/relay` single hop ≈ 2.5 s) under 20 concurrent demo sessions; no 5xx; FastNEAR 429s absorbed by dRPC failover | B-19 load test | Nov 11 |

---

## 10. Definition of done

**Every task** (C, B, F, X) is done when all of these hold:
1. Code merged on `main` through a reviewed PR whose title starts with the task ID; no secrets; CI green (all blocking jobs in §7).
2. Its tests exist and pass: the spec's test rows for that slice (T-xx, A-xx, U-xx, M-xx) plus any new edge found while building.
3. For contract code: green on builds A **and** B; gas and storage numbers still inside the calibrated margins (INV-07).
4. For user-facing code: every string goes through `t()`; `lint:copy` 0 hits; axe 0 on its screens; works at 390×844 and 320 px; reduced-motion variant; error, offline and empty states from ux-spec §4. Rev 6: it works in Day **and** Night; it uses brand tokens only (no raw colours); M-20 and M-22 pass on its screens.
5. Deployed to preview, and the day's checkpoint demo (implementation-plan §4) shown on two real phones.
6. Its P-x acceptance criteria (implementation-plan §1.1) demonstrated on testnet, with a nearblocks receipt link where money moves.
7. Cuttable features sit behind a flag that is off by default until they pass.
8. The README step (J-n) is updated if the feature is user-facing, with its non-UI twin.

**Per feature, on top of that:**

| Feature | Done also requires |
|---|---|
| Login (P-1) | 3 timed samples on `localhost:3000` (taps, seconds); account has exactly two FAKs and 0 NEAR; device re-login without a popup; A-07, A-08 green |
| Create (P-2) | T-01…T-06; E-05 green in the nightly; creator balance unchanged |
| Join (P-3) | T-50…T-57; E-06; the landing renders without login; the fragment never reaches a server log (grep the logs) |
| Add money (P-4) | T-10…T-17; E-04; refund path shows "nothing left your account" |
| Instant spend (P-5) | T-20…T-31; E-02; the beat order verified in M-03; payout failure → `feed.failed` + retry |
| Vote (P-6) | T-40…T-46; E-03; `sync` row after every vote; `already_voted` and expiry states |
| `/demo` + README | M-11 (no JS), E-10, E-11 green on production; the reference Pot never leased |
| Any-chain (P-7) | A-16; M-09; E-09; real-mode body matches D-50; mainnet hashes in README (if the clip ships) |
| Rules (P-8) | T-60…T-62; E-08; M-08 |
| Close (P-9) | T-70…T-75, PR-01, PR-02 parity; T-73 recorded; E-07; RefundTable == `preview_close` |
| Notifications (P-10) | A-14, A-15; W-04, W-05 or W-06 on a device; payload size check |
| Visibility (P-11) | the On-chain rules panel matches `get_policy`; E-11 `get_policy` twin; no Trezu link on testnet |
| Lock (D-13) | accounts-and-deploy §3.10 checklist ticked by a human; E-11 `list-keys` empty (rev4: the token from Nov 2) |
| Security fixes (rev4) | T-89…T-97, PR-05, A-22…A-31, M-17…M-19, U-11, W-08 and SEC-1 green; E-12 run by hand on Nov 11 and before the public flip; every Critical and High of review-security.md closed as its §7 says (X-17) |

---

## 11. Traceability: P-1…P-11 → tests

| P | Contract (sandbox) | Unit / property | API | E2E mocked | E2E testnet | PWA / a11y / manual / perf |
|---|---|---|---|---|---|---|
| P-1 Login | — | U-WEB-05, U-WEB-06, U-11 | A-07, A-08, A-09, A-10, A-19, A-21 (preview dev session), A-25, A-28, A-30 (rev4) | M-01 | E-01 (demo); localhost timing samples | QA-1, QA-3 (installed sign-in), AX-02, PF-04 (new device ≤ 25 s) |
| P-2 Creation | T-01…T-06, T-89, T-90 (INV-14, 16, 17, 18) | U-06, U-07, PR-05 | A-01 (R2), A-02 (create quota), A-23 | M-06 | E-05, E-12 | QA-3 F6, PF-04 (≤ 15 s) |
| P-3 Invite + join | T-50…T-57, T-93 (INV-09) | U-08 | A-01 (R4, R5), A-24 | M-01, M-18 | E-06 (preview) | QA-1/QA-3 in-app rows, AX-02 |
| P-4 Add money | T-10…T-17 (INV-08) | U-03 | A-04 (refund outcome), A-11 | M-02 | E-01, E-04 | QA-3 F2, PF-04 (≤ 5 s after finality) |
| P-5 Instant spend | T-20…T-28, T-30, T-31, T-88, T-94 (INV-03, 05, 06) | U-WEB-01 (spend), PR-03 | A-04, A-05 | M-03, M-18 | E-02, E-10 J-3 | QA-3 F3, PF-04 (≤ 4 s / ≤ 10 s) |
| P-6 Group vote | T-29, T-40…T-46, T-96, T-97 | U-04, U-05, U-07 | A-01 (R11), A-04, A-22 | M-04, M-05, M-17 | E-03, E-10 J-4, J-5, E-12 | AX-03, W-05/W-06 |
| P-7 Any-chain | — | U-WEB-01 (deposit) | A-16, A-27 | M-09 | E-09 | QA-3 F7; mainnet clip hashes |
| P-8 Rules | T-60…T-62, T-91 (INV-10) | U-06 (300 Tgas) | A-01 (R6, R7, R11 exact 300) | M-08 | E-08 | — |
| P-9 Close | T-70…T-75, T-88, T-92, P-01 (INV-11, 13) | PR-01, PR-02, PR-04, U-10 | A-01 (R8, R11 exact 300) | M-07 | E-07, E-10 J-6 | QA-3 F5 |
| P-10 Notifications | — | — | A-14, A-15 | — | — | W-04…W-07, QA-3 F4 |
| P-11 Visibility | T-01 (`get_policy`, `get_factory_info`) | — | — | M-16 | E-11 | README review |
| Security (rev4, not a P-x) | T-89…T-97 (incl. T-95, the owner's ranges), PR-05 | U-11 | A-22…A-31 | M-17…M-19 | E-12 | W-08, SEC-1, X-17 |
| Brand (rev6, D-67, D-45; not a P-x) | — | U-WEB-09 | — | M-12 and M-13 in Night, M-15, M-20, M-21, M-22 | — | W-02, AX-07, AX-08, AX-09 |
