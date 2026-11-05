> **Security fixes (2026-11-05): hub 1.3.0** fixes the 2026-11-04 audit's contract findings (policy v3 where members
> only vote, one-OK hardening, close confirmed by the money leaving, pending links vs the close, minimum link). A plain
> code deploy from 1.2.0 (no `migrate`). Design, tests and the human's deploy steps: the last section of this file.
> Not deployed.

# Contracts: progress, deviations, open issues

> **Gifts (2026-11-02): hub 1.2.0** lets anyone send a Pot a gift (group money, shared at close, equal split when
> nobody contributed), with no migration from 1.1.0 (a plain code deploy). Design, interface and the human's deploy
> steps: [contracts-gifts.md](contracts-gifts.md). Not deployed.

> **Wave 4 (2026-11-01): hub 1.1.0** adds earned trust, the one-OK tier, pay by link and the all-or-nothing goal,
> with a `migrate` from the deployed 1.0.0 state. Design, interface, invariant amendments and the human's deploy steps:
> [contracts-wave4.md](contracts-wave4.md). Not deployed.

> Owner: the contracts engineer. Spec: plan/contracts-spec.md (v1.0, Rev 5). Last updated 2026-10-22.
> Only sandbox work was done here: no testnet or mainnet transactions and no git.
> Toolchain per D-12: Rust 1.93.0 (`contracts/rust-toolchain.toml`), near-sdk and
> near-contract-standards `=5.29.1`, near-workspaces `=0.23.0`, cargo-near 0.22.0 (already in
> `~/.cargo/bin`). The protocol-88 release candidates are not used.

## Status by task

| Task | Status | Where / evidence |
|---|---|---|
| C-01 workspace | **done** | The workspace has `pot-hub`, `test-usdc` and `tests` (package `pot-tests`), resolver 3, and a release profile with `overflow-checks`. `res/sputnik/fetch.sh` and `SHA256SUMS` cover 3 files: A `Ea8t…`, B `DtHZ…` and the mainnet factory. `shasum -c` passes. `test-usdc` is vendored byte-for-byte at `7721a49` (`UPSTREAM.md`; no source tweak needed). Both crates build with `cargo near build non-reproducible-wasm`. |
| C-02 state layout + foundations | **done** | `types.rs` has the full v1 layout, including the Phase-2 fields: `CloseRecord`, `Subject::{Close,Rules}`, `RequestStatus::Removed`, every `StorageKey` (0x00-0x09), `relayers`, `max_sponsored_pots_per_day`, `sponsored_today`, `open_rules_proposal`, the required invite expiry/uses, and `Reason::NewMember`. Also done: `errors.rs`, `events.rs`, `new`, `get_config`, `set_config` with the §3.10 ranges, the `policy.rs` snapshot (INV-16), and the `kinds.rs` exact-JSON tests (T-57, T-85). |
| C-03 `create_pot` | **done** | Uses the global-contract batch, the hardened policy (no RemoveProposal), USDC registration of the DAO, the float clamp, slug/name/emoji/Cf rules, the creator daily cap, the global sponsored cap and the 7-day/10-use invite. Sponsorship applies only when `signer ∈ relayers`; otherwise the caller gets `ERR_DEPOSIT_REQUIRED: <yocto>` and any excess is refunded. |
| C-04 harness | **done** | Both builds are published through the factory's `store()`. Personas: maya, sam, leo, ana, eve, plus owner, relayer (`users`) and treasury. Relayed calls are real NEP-366 delegates, built with near-primitives 0.37 because near-workspaces 0.23 has no meta-transaction support. |
| C-06 contributions | **done** | T-10…T-13 and T-15…T-17. T-14 lives in t_close. |
| C-07 ledger | **done** | `ledger.rs::apply_transition` is the only code that changes counters. It has the §2.4 table test and PR-03 (proptest, 2,000 sequences). |
| C-08 `request_spend` | **done** | Instant and vote paths, `preview_spend` (same decision function), `get_requests` / `get_request`, prepay with `member_count` votes, `new_member`, `get_proposal_subject`. T-20…T-28, T-30, T-31, T-88 (spend views), T-94, T-96. |
| C-09 calibration | **done** | `contracts/CALIBRATION.md` and `tests/t_calibrate.rs` assert INV-07, prepay ≥ the DAO's storage growth, and minimum caller gas ≤ what the relayer attaches. Several `GAS_*` constants changed (deviation D1). |
| C-10 invites + join | **done** (contract side) | `add_invite`, `revoke_invite`, `join` and `get_invite` (ed25519, 7 days / 10 uses, ≤ 30 days / ≤ 40 uses). T-50…T-57, T-93. `scripts/invite.ts` is **not done**: it's TS outside `contracts/`, see open item O5. |
| C-11 `sync` / `retry_payout` | **done** | Vote-path accounting; expiry by the DAO's `submission_time`; a late `expired → approved/payout_failed`; the `live` flags. T-29, T-40…T-46, T-97 (sandbox parts, plus unit tests for the time paths). |
| C-12 safety | **done** | T-80…T-84, T-86, T-87, T-95, PR-05 in `t_safety.rs`; T-85 and the T-95 static checks are unit tests. |
| C-15 rules | **done** | `set_rules` (by the DAO or a sole member), `propose_rules` (one open per Pot, `ERR_RULES_PENDING`), `validate_rules`, and the Club/Team presets (the §6 values, still pending Cerasela's H-10). T-60…T-62, T-91. |
| C-16 close | **done** | `propose_close` (24 h cooldown, at most one open close, Failed → re-propose), `prorata.rs` (V1-V7, P-01 with 10,000 cases, and the sdk parity test), `preview_close`, and the `sync` close mapping. T-70…T-72, T-74, T-75, T-92, T-88 (close views). |
| C-17 close gas | **done** | T-73 at n = 30 and 40: the deciding vote needs **195 / 255 Tgas**, so 300 Tgas works and `HARD_MAX_MEMBERS = 40` stands (CALIBRATION §4). |
| C-05, C-13, C-18 (deploys) | not in scope | No transactions in this wave. |
| C-14 CI matrix | partial | The harness supports it: `POT_SANDBOX_VERSION=2.14.0-rc.4` selects the protocol-88 sandbox, and the ★ tests pass there; `POT_NO_BUILD=1` makes it use wasm CI built earlier. The workflow file belongs to X-02 (platform). |

## Test results (the final full `cargo test` in `contracts/`, 2026-10-22, all green, exit 0)

| Binary | Result |
|---|---|
| pot-hub unit + proptest | 21 passed: PR-01 at 10k cases, PR-03 at 2k, PR-02 sdk parity over 507 vectors, snapshots, `unit_time` |
| test-usdc unit (vendored upstream) | 31 passed |
| t_create | 18 passed |
| t_contrib | 6 |
| t_spend | 10 |
| t_vote | 6 |
| t_invite | 6 |
| t_rules | 2 |
| t_close | 8 |
| t_close40 | 2 (268 s) |
| t_safety | 8 |
| t_calibrate | 2 |

- **Total: 120 passed, 0 failed.** The sandbox share is 68 tests: 34 scenario groups, each run on
  build A and build B.
- The sandbox suite takes ≈ 12 min wall time on this M5 Pro (binaries run one after another).
- **Protocol 88:** the ★ tests (T-00, T-01, T-10, T-20, T-40, T-50, T-61, T-70, T-89) pass on
  nearcore 2.14.0-rc.4 (`POT_SANDBOX_VERSION=2.14.0-rc.4`, reported protocol 88) on both builds.

Artifacts:

| Artifact | Size | sha256 |
|---|---|---|
| `pot_hub.wasm` | **463,554 B** | `06861ce7c8eb…dc8b6ae` |
| `test_usdc.wasm` | **168,721 B** | `8253d2238075…c6d6` |

## ABI for the sdk

**`contracts/abi/pot_hub.json` has been produced.** It is the cargo-near embedded ABI, NEAR ABI
schema 0.4.0, 38 functions. It is regenerated by `contracts/scripts/build.sh`, which also writes
`abi/test_usdc.json`.

- The sdk can diff its types against it.
- A promise-returning method's final value is the return type of its last `on_*` callback
  (README → Build).
- `#[callback_result]` parameters don't appear in the ABI (see D2).

## Deviations from contracts-spec.md

Each deviation gives the reason, the evidence, and what other layers must change.

**D1 · Gas constants were recalibrated (C-09). Caller gas is unchanged.**
- The spec's callback budgets didn't count the ≈ 2.3–2.5 Tgas exec fee each outgoing function-call
  receipt prepays. Evidence: `on_join_added` at 60 Tgas failed with "Exceeded the prepaid gas"
  (t_contrib run, 2026-10-22).
- New values:
  - `GAS_ON_SPEND_CHECKED` 105, `GAS_ON_SPEND_ADDED` 80
  - `GAS_ON_POT_CREATED` 40, `GAS_ON_DAO_REGISTERED` 10, `GAS_ON_CLOSE_BALANCE` 60
  - new `GAS_VIEW_DAO` = 10 for `get_policy` / `get_proposal`
  - new `GAS_ACT_JOIN` = 20 (the join's AddMemberToRole vote burns 2.6; at 40, join needed 95 of
    100 Tgas)
- Minimum caller gas, all measured:
  - create 73, request_spend 132, join 75 and propose_close 69, all inside the relayer's
    150/150/100/150
  - sync 24 of 50, propose_rules 24 of 100, add_invite 5 of 30
- **Backend / relayer:** no change. `request_spend` has the thinnest margin, 132/150. If a hop is ever
  added, raise it to 200.
- The close formula is ≈ 15 + 6·n, not 15 + 5.4·n. 300 Tgas is still enough up to n ≈ 47.

**D2 · Callbacks read promise results by hand (`env::promise_result_checked` + serde) instead of
`#[callback_result]`.**
- Why: with `#[callback_result]`, the near-sdk macro panics while deserializing an unexpected DAO
  payload, which breaks INV-07 (callbacks never panic). A bad payload is now `Err` and is handled as
  `dao_unavailable` / no change. `unit_time.rs` feeds `on_sync` garbage and a `Failed` result.
- **sdk:** the callbacks' ABI entries have no callback-result params. Nothing else changes.

**D3 · `on_spend_checked` applies "payee must be in the live DAO Group" only to the instant path.**
- The spec's literal order would refuse every vote-path request to a non-member
  (`payee_not_allowed`). T-23 requires those to work.
- The requester-in-Group check still applies to both paths.

**D4 · `propose_close` keeps the CloseRecord until `on_close_added` succeeds.**
- The computed payouts travel in the callback args. No `Proposing` record is written; the
  `CloseStatus::Proposing` variant stays in the layout, unused.
- Why: re-proposing after a **Failed** close would otherwise overwrite the Failed record. If
  `add_proposal` then failed, the Pot would be stuck in `Closing` with no record, and nothing could
  re-propose it.

**D5 · The rules slot is reserved synchronously.** `propose_rules` sets
`open_rules_proposal = u64::MAX` before the promise, so two `propose_rules` in the same block can't
both pass. `on_rules_added` then sets the real id, or clears the slot on `add_failed`. Views show
`null` while the sentinel is set.

**D6 · Outcome and view shapes the spec left open. The sdk should use these exactly.**
- `CreatePotOutcome`:
  - success: `{ok:true,pot,slug,float,usdc_registered}`
  - failure: `{ok:false,pot,reason}` (absent fields are omitted, as in the spec examples)
- `SpendOutcome`: as in the spec. Its `status` is one of `approved | pending | approving | rejected
  | payout_failed | expired | removed | refused`.
- `JoinOutcome`: `{ok,status:"active"|"pending"|"failed",proposal_id?,reason?}`.
- `RulesOutcome`: `{applied,proposal_id,rules_version,reason?}`.
- `CloseOutcome`:
  - success: `{ok:true,proposal_id,balance,payouts,dust,dust_to,approvals_needed}`
  - failure: `{ok:false,reason}`
- `SyncOutcome`: `{proposal_id,subject,dao_status,hub_status,changed}`. `hub_status` per subject:
  - spend: a request status
  - join: `active | removed | joining`
  - close: `open | closing | closed | replaced`
  - rules: `open | resolved`
  - In `dao_status`, an InProgress proposal past its period reads `"Expired"`.
- **New** `RetryOutcome`: `{proposal_id,retried,dao_status,hub_status}`.
- `PotView` has two extra fields:
  - `open_rules_proposal`: the open rules proposal id, or null
  - `closing_in_flight`: a `propose_close` chain is running
- `balance_estimate` is **0 once the Pot is Closed**. That's the coordinator's item 2; T-70 asserts it.
- The coordinator's item 1 (Rust ↔ TS pro-rata parity) is done:
  `pot-hub/src/prorata.rs::sdk_vectors_parity` reads `packages/pot-sdk/src/math/vectors/prorata.json`
  and `prorata-random.json` (500 cases), and all 507 match. It is skipped only if
  `packages/pot-sdk` is absent from the checkout. The sdk's `prorata.json` is identical to
  `contracts/tests/vectors/prorata.json`.

**D7 · `retry_payout`'s `retried: true` / `hub_status: "approved"` is optimistic.** This is OBJ-1, made
concrete.
- `Finalize` re-runs the payout as a detached promise. The chained `get_proposal` reads `Approved`
  before the DAO's callback can set `Failed` again.
- Evidence: T-29 retries before re-registering the payee. The hub says `approved`, the DAO says
  `Failed`, and `sync` then returns `payout_failed` (`changed: true`).
- **Relayer (B-05):** after `retry_payout`, scan the receipts for the payout `ft_transfer` and the DAO
  callback, exactly as after a vote, and call `sync` if either failed.
- **UI:** don't treat `retried` as "money moved"; treat it as "retry submitted".

**D8 · `seq` semantics: +1 per state-changing call or callback, not per user action.**
- Typical steps per action:
  - contribution +2
  - instant spend +4
  - vote spend +3
  - join +3
  - `propose_close` +2
  - `propose_rules` +2
  - `sync` +1 when it changes something, else 0
- Views never bump it (T-87).
- **Frontend:** use `seq` only as "something changed". Don't use it to count events.

**D9 · `on_join_status` on `Err` (the DAO view failed) keeps the member `Joining{pid}` for `sync`.**
The spec says to delete it. Deleting could desync, because the DAO may already have added the member.
On `Rejected / Expired / Removed / Failed`, the member is deleted and `uses` is released, as in the
spec.

**D10 · A sole member can call `set_rules` only when `member_count == 1 && joining_count == 0`.**
While a join is pending, the Pot is about to have 2 members, so a sole member gets
`ERR_USE_PROPOSE_RULES`.

**D11 · Test-technique deviations. The behaviour under test is unchanged.**
- **The sandbox advances ≈ 0.3 s of block time per block, so `fast_forward` can't reach 7 days or
  24 h.** The UTC-midnight reset (T-90), the close cooldown ending (T-92) and expiry by the DAO's
  `submission_time` (T-97, L-3) are contract-level unit tests (`pot-hub/src/unit_time.rs`).
- Expiry through the DAO (T-42, T-91) is tested by having the group shorten the DAO's
  `proposal_period`; a later vote then marks the proposal Expired.
- Invite expiry (T-53) uses the minimum allowed expiry, > now + 60 s.
- T-04 forces creation failure with an **unpublished code hash** (`UseGlobalContract` →
  GlobalContractDoesNotExist), not a test-only feature build. The same rollback path runs, and no
  second wasm is needed.
- T-55 ("41st joiner") lowers `max_members` with `set_config`, to 3 and to 11. The 40-member Pot is
  built for real in t_close40.
- The 1-letter reserved slugs (`j`, `p`, `r`) are unreachable: `ERR_SLUG_INVALID` fires first.
- PR-05 runs seeded random interleavings in the sandbox: 12–16 paid direct calls per build, of 36
  attempted steps. A proptest over a sandbox is impractical. It subtracts an upper bound of the
  protocol-86 gas reward, so it would also hold on testnet.

**D12 · The documented direct-call deposit for `propose_close` (0.15 NEAR) is too low near n = 40.**
- `cost(op)` there is ≈ 0.17 NEAR (CALIBRATION §6).
- **Seed scripts / CLI / mainnet clip:** attach the amount in `ERR_DEPOSIT_REQUIRED: <yocto>`, or
  0.2 NEAR.

## Facts measured for other layers

- An instant spend burns 32.5 Tgas. A contribution burns 12.6 (min 35 Tgas attached). A join burns
  18.5. `create_pot` burns 22.7 plus the 0.007 NEAR creation charge.
- A member vote that executes a Transfer burns 9.3 Tgas. An executing `set_rules` vote burns 9.7. An
  executing close vote burns 13.1 at n = 3 and 83.7 at n = 40.
- DAO storage: an instant spend is +351 B; a join is +321 B. A later vote costs ≈ 27 B, not the
  100 B the prepay model assumes, so the model is conservative.
- At n = 40 the `close_proposed` event is 2,261 B.
- Builds A and B behave identically in every test; gas differs by ≤ 0.05 Tgas. That's a finding:
  "no A/B differences".
- `store_blob` by a non-member eats ≈ 127 B (≈ 0.0013 NEAR) of DAO float per call. Measured with a
  1,000 B blob: the DAO keeps a 1,035 B-equivalent deposit but stores 1,162 B. This matches the
  review's ≈ 137 B estimate. It can't be fixed in the hub; the relayer and the monitoring alert
  cover it (M-4).

## Open issues

- **O1 · H-10 (Cerasela):** two defaults await her call: the Club/Team preset values and
  `contributed > 0` for instant spends. Both are implemented as the spec defaults.
- **O2 · Wasm size:** `pot_hub.wasm` is 463.6 KB, about 4.64 NEAR of storage on the hub account.
  `json!`, `format!` and the ABI embed drive it. The size is fine for testnet. It could be trimmed
  (string-built policy JSON, `--no-embed-abi`) if hub NEAR becomes tight.
- **O3 · L-2 / R-33, deferred to Phase 3 per the spec:** a callback that runs out of gas could strand
  a record in `checking`, `proposing` or `Joining{None}`. With D1's budgets this hasn't happened in
  any run. There is still no `reap` method.
- **O4 · Members removed directly in the DAO keep their hub record (L-1, by design).**
  `request_spend` is refused (`not_in_dao_group`), but invites, close and rules proposals still
  accept them.
- **O5 · `scripts/invite.ts` (C-10) isn't built here.** It's TS outside `contracts/`; the sdk /
  platform agent owns it. What it must produce:
  - message: the UTF-8 bytes of `pot-join:v1:<dao_id>:<joiner_account_id>`
  - signature: raw ed25519 over those bytes, standard base64 with padding (64 bytes)
  - key: `invite_pk = "ed25519:" + bs58(pk)`
  - The Rust twin is `pot_tests::Env::join_sig`.
- **O6 · The protocol-88 ★ run passes** (see Test results). CI should run it as the
  `contracts-p88` job.

## Hub 1.3.0 security fixes (2026-11-05)

> Owner: the contracts engineer. Sandbox only: **nothing was signed, deployed or committed.** Source:
> [security-audit-2026-11-04.md](security-audit-2026-11-04.md). Code: `pot-hub/src/security.rs` (new), `policy.rs`,
> `lib.rs`, `wave4.rs`, `views.rs`, `types.rs`, `errors.rs`. Tests: `pot-hub/src/unit_security.rs`,
> `tests/tests/t_security.rs`, `t_migrate.rs` m2, updated `t_close` T-92 and `t_wave4` W4. Fixture
> `tests/fixtures/pot_hub_v1.2.0.wasm` = the 1.2.0 build (sha256 `a78f4fdc…d7335`, 574,805 B).

### What changed, per finding

| ID | Status | Design |
|---|---|---|
| **HUB-1, GOV-2 (raw path), GOV-3, GOV-4, W4-7, GOV-9** | fixed for new Pots | **Policy v3**: the member role has only `*:VoteApprove`, `*:VoteReject` (no `AddProposal`, no `Finalize`). Only the hub (rulebot) can create proposals, so a creator alone can't add alts or change the policy, sybils can't file a raw `Transfer`, a majority can only approve or reject what the hub proposed (spend, join, rules change, close; no upgrade, policy change or arbitrary call), nobody can spam the DAO's float, every `call` proposal is the hub's own (so the v4 rulebot's `call` approval can't touch a member-made call), and nobody can be removed in the DAO behind the hub's back. The rulebot gains `call:Finalize` (retry a failed close; Finalize never approves anything). **Policy v4** = v3 + `call:VoteApprove` / `call` 1/1 for all-or-nothing Pots (the goal refund), replacing v2 for new Pots. Helpers `policy_rulebot_approves_call` (v2, v4), `policy_rulebot_finalizes_call` (v2+), `policy_members_propose` (v1, v2). v1 / v2 Pots keep their policy (Sputnik policies live in each DAO). |
| **HUB-2** | fixed | Instant spends need `contributed ≥ MIN_STAKE` = 1_000_000 ($1 at the token's 6 decimals); below it the reason is `new_member` (the group decides). Applies to every Pot. |
| **W4-1 (a)** | fixed | A one-OK request needs the requester's stake (≥ $1); a requester without it goes to the group. |
| **W4-1 (b)** | fixed | The OK-giver must be an Active member ≠ requester, ≠ the payee, `joined_at_ms` < the request's `created_at_ms`, and `contributed ≥ $1` (`ERR_OK_SELF` / `ERR_OK_NOT_ELIGIBLE: receiver \| joined_after \| no_stake`). For a one-OK **link**, the OK-giver can't be the claimer (`claim_link` → `ERR_BAD_RECEIVER`). The tier is **re-checked at OK time** (`ERR_NOT_ONE_OK: <why>`: ceiling, stake, allowance, goal). View `get_ok_check(pot, request_id, account_id)` returns the same answer for the UI. |
| **W4-1 (c)** | fixed | **A lifetime one-OK allowance per member = the Pot's one-OK ceiling** (`extras.one_ok_cap`). Each one-OK approval is charged to the requester (`OneOkUsed`), reserved synchronously in `ok_request` (two OKs in one block can't both fit) and released exactly once (`OkCharge` marker) if the approval doesn't land (refused, objection, rejected, expired, removed). So two accounts OK-ing each other stop after one ceiling each. Why not the member budget: `member_budget` is a lifetime instant allowance (it never resets; there is no period), and the default ceiling (3 × the cap, $300 on Trip) is above the default budget ($200): sharing it would make "a $300 spend needs one OK" (the product's main story, the landing playground and the /demo tour) impossible. Per member, the most that can move without a group vote over the Pot's life is `member_budget + one_ok_cap`. `MemberView` gains `one_ok_used`, `one_ok_left`. |
| **HUB-4** | fixed | Sputnik stores `Approved` before its payout callback can set `Failed`. A close is now **Closed only when `sync` sees the money out**: `sync` of a close reads `get_proposal` **and** `usdc.ft_balance_of(dao)`; the payout is one atomic batch paying exactly the balance the close read (Σ payouts = `rec.balance`) and money in is refused while closing, so "DAO balance < rec.balance" means it was paid. Until then the Pot stays `closing` with the record `Approved` (`PotView.close_settling`, goal state `refunding`); `pot_closed` / `goal_refunded` are emitted only on confirmation. A Failed close stays `closing` and is retryable: re-propose (as before), or **`retry_payout(pot, close_id)`**, which now Finalizes the Pot's *current* failed close as rulebot (policy v2+). A Pot confirmed Closed whose close the DAO later reports `Failed` (only possible if a member-approved spend executed during the payout window) reopens as a failed close on the next `sync`. `refund_unfunded` gained a third state: on an approved-but-unconfirmed refund it does the same confirming read (`get_goal.can_refund` stays true until then). |
| **HUB-6** | fixed for v3 / v4 | Members have no `Finalize` in v3 / v4, and the hub only finalizes the current close (`retry_close` checks `Closing{pid}` + record Failed), so a replaced failed close can never pay out later. v1 / v2: members can still Finalize an old close in the DAO (limitation). |
| **W4-5** | fixed | Only links holding escrow (Funded / Claiming / Returning) block a close. Instead of voiding pending links at close (which needs iterating requests), **a closing (or closed) Pot refuses to fund a link**: `fund_link` returns the amount, the token refunds the DAO, and the close pays it out with everything else; if the close is rejected, pending links work again. Tracking: per-Pot `LinkTrack {awaiting}` (prefix 0x10). A Pot with open links made before 1.3.0 has no record and keeps the old rule (every open link blocks) until its links settle; tracking starts with the next link requested while none is open. |
| **W4-8** | fixed | Links under `MIN_LINK_AMOUNT` = $1 are refused (`ERR_LINK_TOO_SMALL`, preview reason `link_too_small`). |
| **W4-4** | not done | A safe `reap_link` needs to know whether a stuck claim's `ft_transfer` happened; the hub's USDC is shared escrow, so this needs escrow accounting (W4-3's `escrow_total`) first. Callbacks keep ≥ 2× static gas margin. |
| GOV-1, GOV-5, GOV-6, GOV-8 | out of scope | Custody / testnet stage (decided). |

### State and storage (no migration)
New records live directly under new prefixes with `LookupMap`'s key layout (like the 1.2.0 gift records); none is a
field of the root struct, so **1.2.0 → 1.3.0 is a plain DeployContract** (proven by `t_migrate` m2):
`0x0E (pot idx, account) → u128` one-OK used · `0x0F (pot idx, request id) → u128` one-OK charge · `0x10 pot idx →
LinkTrack`. No frozen Borsh layout changed (`Pot`, `Member`, `Request`, `PotExt`, `RequestExt`, `CloseRecord` as before;
`CloseStatus::Approved` now also means "approved, not yet confirmed" while the Pot is Closing). Storage per one-OK
approval ≈ 2 × ~60 B, paid inside the existing request budget. Review fixes add `0x11 (pot idx, request id) → ()` (pending-link marker), `0x12 pot idx → CloseSeen` and `0x13 pot idx → SweepRecord`.
Hub code 601,051 B (was 574,805): **+26.2 KB ≈ +0.26 NEAR**.

### Interface changes (all additive)
- Views: `get_ok_check(pot, request_id, account_id) → {pot, request_id, account_id, can_ok, reason}`; `PotView.close_settling`;
  `MemberView.one_ok_used`, `one_ok_left`; `preview_spend` reason `link_too_small`; `policy_version` 3 / 4.
- Errors: `ERR_OK_NOT_ELIGIBLE`, `ERR_LINK_TOO_SMALL`; `ERR_NOT_ONE_OK` may carry a detail (`: one_ok_used_up` …).
- `retry_payout` accepts the current failed close (gas `20 + 6·n` + 20 Tgas; the relayer's R9 cap of 150 Tgas covers
  ≤ 17 payees, the server can call it relayer-signed at 300). `sync` of a close reads one more view (+5 Tgas static; 50 Tgas still enough).
- No new change method, so the relayer allowlist is unchanged. `contracts/abi/pot_hub.json` regenerated.
- Mirrors: `@pot/sdk` (`security.ts`: `HUB_1_3`, `POLICY`, `okGiverRefusal`; decide twin; parse; `getOkCheck`; error codes;
  MockChain policy v3; `validateExtras` accepts v4), the app's one-OK copy ("one OK from someone else who has added
  money"), `approve.ok.not_eligible`, `canGiveOk` hides the OK button from the payee, the regenerated /demo script.

### Tests (2026-11-05)
- `pot-hub` unit: 44 (9 new: `hub_1_policy_v3_members_only_vote`, `hub_1_policy_v4_is_v3_plus_refund_approval`,
  `hub_2_one_unit_contribution_is_not_a_stake`, `w4_1_ok_giver_rules`, `w4_1_one_ok_loop_is_bounded_by_the_allowance`,
  `hub_4_close_waits_for_the_money_to_leave`, `hub_6_only_the_current_failed_close_is_retried`,
  `w4_5_w4_8_links_and_the_close`, `w4_5_untracked_pots_keep_the_old_rule`; static checks now scan `security.rs`).
- Sandbox, both Sputnik builds: `t_security` `hub_1_gov_2_raw_proposals_refused`, `w4_1_hub_2_one_ok_sybils`,
  `w4_5_w4_8_links_and_the_close`; `t_migrate` `m2_upgrade_1_2_to_1_3`; `t_close` T-92 rewritten (member Finalize
  refused, hub retry, settle, confirm); `t_wave4` W4 (refund: approve → settling → confirm). Tests that need raw member
  proposals (T-31/T-27/T-28 `t_spend`, T-91/T-62 `t_rules`, T-42 `t_vote`, T-15 `t_contrib`, G6 `t_gifts`) now build
  their Pots on the 1.2.0 fixture (`Env::legacy`) and upgrade before acting, so they also cover v1 Pots under 1.3.0.
  `t_gifts` G7 now upgrades to the 1.2.0 fixture (it tests 1.1.0 → 1.2.0).

### Deploy 1.2.0 → 1.3.0 (testnet preview; needs the human's explicit OK; nothing below was run)
1. Read-only: `scripts/run deploy status` → `version 1.2.0`, code sha256 `a78f4fdc…` (= the fixture). The hub needs
   ≈ 0.26 NEAR more locked for code above `min_hub_reserve`; check `free_balance` in `get_config` (top up with
   `scripts/with-testnet-lock.sh scripts/run deploy fund pots.potprev.testnet 1` if it's under ≈ 0.7 NEAR).
2. Build: `contracts/scripts/build.sh` → `contracts/target/near/pot_hub/pot_hub.wasm` (this build: 601,051 B, sha256
   `79c94df597972e3ac3690ae9b8196d653272599b727060f1d96a7bf656685992`; another machine may differ, compare the size).
3. Tests on that wasm: `cd contracts && POT_NO_BUILD=1 cargo test --workspace` (≈ 20 min).
4. Upgrade, ONE DeployContract, **no** function call: `scripts/with-testnet-lock.sh scripts/run deploy redeploy-hub`
   (`contract deploy pots.potprev.testnet use-file … without-init-call … sign-with-legacy-keychain send`). **Not
   `upgrade-hub`** (that calls `migrate`, which is for 1.0.0 state and fails here). Cost ≈ 0.001 NEAR gas + 0.26 NEAR lock.
5. Smoke (read-only): `get_config.version == "1.3.0"`; `get_pot` of an old Pot → `policy_version 1`, `close_settling false`;
   `get_members` → `one_ok_used "0"`. Create one Pot through the app → `policy_version 3`, `get_policy` member
   permissions = `["*:VoteApprove","*:VoteReject"]`.
6. Deploy the web app (copy, `canGiveOk`, the not-eligible result) after step 4; it works against 1.2.0 too.
- Rollback: copy `contracts/tests/fixtures/pot_hub_v1.2.0.wasm` to the target path and `redeploy-hub` again. 1.2.0 ignores
  the new prefixes; Pots created by 1.3.0 keep policy v3 (members still only vote; 1.2.0's flows are all hub-made, so they
  work); a close left "settling" becomes Closed on 1.2.0's next sync of it.
- Mainnet clip: a fresh deploy with `new` (1.3.0 from the start).

### Follow-ups for the backend (not done here: other agents own `apps/web/server`)
- After `refund_unfunded`'s approve step, call `sync(pot, refund_proposal_id)` (or `refund_unfunded` again with a new
  idempotency key) so the refund is confirmed the same run; today `ops/goals.ts` keys the approve call per day, so the
  confirmation would wait for the next daily run (the money is already out; only the status lags).
- The reconcile cron should `sync` Pots whose `close_settling` is true, and the relayer should `sync` after any
  `retry_payout` on a close (not only when the payout failed).
- R11 still relays a member `Finalize`; on v3 / v4 Pots it fails with `ERR_PERMISSION_DENIED`. Pre-flight could refuse it
  when `policy_version ≥ 3` and point to `retry_payout`.
- The live VM's local preview passes `used` = instant spends only; to mirror the allowance pass
  `requester.oneOkUsed = MemberView.oneOkUsed` (the hub's `preview_spend` / `request_spend` decide anyway). The app's
  mock world (`lib/client/mock`) still uses the 1.2.0 one-OK rules.

### Review of the 1.3.0 diff (2026-11-05, second pass)
An independent review of this diff found five issues; all are fixed and tested (unit tests ported from the
reviewer's proofs `audit_a1`-`a4`, named after the IDs):

| ID | Fix | Tests |
|---|---|---|
| **M-1** money of an approved link still in flight left out of the close | Every open link blocks a close except a **plain pending** request (not approved, no OK in flight). Tracked without iterating: a marker per pending link request (`0x11`) and a count in `LinkTrack.pending`; `ok_request` unmarks, a refused / not-landed OK re-marks, any transition out of Pending unmarks. | `m_1_link_in_transit_blocks_the_close` (unit) |
| **M-2** money arriving after the payout kept the Pot "settling" forever | A close's `Approved` is final when the DAO's balance shows the payout (fast path, as before) **or** a `sync` sees it Approved ≥ `CLOSE_CONFIRM_BLOCKS` (10) blocks after the first sighting (`CloseSeen`, `0x12`): Sputnik's payout callback has run by then; a `Failed` sighting and every retry restart that clock, and a later `Failed` still reopens a Closed Pot. New **`propose_sweep(pot)`** (anyone; sponsored when a relayer signs, else the caller pays the prepay): on a Closed Pot the hub reads the DAO's USDC and proposes paying it out like the close (pro-rata; equal when nobody contributed); members approve it by majority; one per Pot per day (`ERR_NOT_CLOSED`, `ERR_SWEEP_COOLDOWN`, event `sweep_proposed`, view `get_sweep`; `get_proposal_subject` returns kind `"sweep"`, live during its period, so the relayer's vote pre-flight accepts it). Also covers L-4 (a balance drop from something else marking a close done early: a later `Failed` reopens it, leftovers are swept). | `m_2_settling_confirms_by_age_then_sweep`, `m_2_failed_restarts_the_clock` (unit), `m_2_sweep_after_close` (sandbox) |
| **L-1** a second OK after an unknown result counted the request's own charge | `one_ok_rules` ignores the request's own `OkCharge`. The marker is deleted once the request is Approved (the optional storage item). | `l_1_reok_after_unknown_status` |
| **L-2** a rules change between `ok_request` and its callback was ignored | `on_ok_checked` re-runs `ok_giver_rules` and `one_ok_rules` (reasons `not_eligible`, `not_one_ok`; the reservation is released). | `l_2_rules_change_races_ok` |
| **L-5** a link refused during a close attempt that then failed | `fund_link` refuses only once a close is proposed or done (`status != Open`), not during `closing_until_ms`. | `l_5_link_fundable_during_a_close_attempt` |

Left as is: `refund_unfunded` / `get_goal` still require `open_links == 0` (stricter on purpose: the goal refund must
not race an escrow payment). Not in this scope: M-3 (per-account limits × invited accounts, documented with the GOV-2
residual), L-3 (the backend retries big closes server-side at 300 Tgas).
- **Backend / app:** `propose_sweep` is not in the relayer allowlist (not user-facing): the reconcile cron can call it
  relayer-signed (sponsored; the close-sized prepay) for Closed Pots whose DAO still holds USDC; members then approve
  through the existing vote path (kind `"sweep"`, a FunctionCall → 300 Tgas). When the balance can't show the payout, a
  Pot is confirmed Closed by a `sync` ≥ 10 blocks after the first one that saw it approved.

### Known limitations left (documented, not fixed)
- **v1 / v2 Pots** (all testnet Pots created before 1.3.0) keep the old policy: HUB-1 / GOV-2 / GOV-3 / HUB-6 still
  apply to them. The hub has no permission to change their policy; a group could move by closing and re-creating.
- **HUB-3 / W4-2** (close split by lifetime contributions; gifts / surplus capture), **HUB-5 / W4-6** (one unpayable payee
  fails the whole atomic close; pull payouts), **GOV-11** (no minority exit), **W4-3** (escrow accounting), **W4-4**
  (`reap_link`) need larger redesigns.
- **GOV-2 (sybil majority via invites)** remains for hub-made spends: invited sybils can still out-vote honest members on a
  group-tier spend. One-OK and instant spends by sybils are now bounded (stake, tenure vs the request, allowance), but
  $1 per sybil is a low bar; guest joiners / per-inviter quotas are not built.
- **v3 trade-off:** with members unable to propose, a Pot whose hub is gone can't do anything new in its DAO (votes on
  existing proposals still work). That is the intended trust model (the hub's rules are the Pot's rules), with GOV-1 open.
- `ok_in_flight` / a link stuck in Claiming after a lost callback (O3 class) still has no reaper.
