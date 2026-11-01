# Contracts wave 4: earned trust, the one-OK tier, pay by link, the all-or-nothing goal (hub 1.1.0)

> Owner: the contracts engineer. Written 2026-11-01. Sandbox only: **no transaction was signed, nothing was
> deployed, nothing committed.** The testnet upgrade below needs the human's explicit OK.
> Code: `contracts/pot-hub/src/wave4.rs` (new methods + views), `lib.rs` (state, `decide`, ledger hooks, `migrate`),
> `types.rs` (new records), `kinds.rs` (link kind, rules kind + extras), `policy.rs` (policy v2), `events.rs`, `errors.rs`.
> Tests: `contracts/tests/tests/t_wave4.rs`, `t_migrate.rs`; fixture `contracts/tests/fixtures/pot_hub_v1.0.0.wasm`
> (= the deployed testnet build, sha256 `06861ce7…dc8b6ae`).

## 1. What it does (product)

| Feature | In one line |
|---|---|
| **Earned trust** | A member's instant cap grows with their record: level 0/1/2 → 1×/2×/3× the Pot's instant cap. +1 level per 3 settled (paid) spends; a declined request drops a level. The per-person budget still bounds everything. |
| **One-OK tier** | Spends over your (trust-adjusted) instant cap but ≤ the Pot's `one_ok_cap` (default 3 × the instant cap) need just **one other member's OK** (`ok_request`); the hub then approves as rulebot. Bigger ones keep the majority vote. |
| **Pay by link** | The payee is "whoever holds this link". On approval (any tier) the DAO pays the hub (escrow); the link holder claims to any account, including a brand-new 0-NEAR NEAR Auth account through the relayer. Unclaimed links go back to the Pot (cancel any time by the requester, anyone after expiry). |
| **All-or-nothing goal** | Optional goal `{amount, deadline_ms, all_or_nothing}`. While an all-or-nothing goal isn't reached, spends wait. If the deadline passes short, anyone (our cron) calls `refund_unfunded` and the hub proposes **and approves** the pro-rata refund close: everyone gets their contribution back. |

Defaults: a Pot created by hub 1.1.0 without `extras` gets **trust on, one-OK = 3 × instant cap, links on, no goal**.
Pots created before the upgrade keep the 1.0.0 behaviour (everything off) until a rules change carries `extras`.

## 2. Design decisions (and why)

**D4-1 · Side maps, not new fields in frozen records.** `Pot`, `Member`, `Request` keep their 1.0.0 Borsh layout (types.rs
says they're frozen). New data lives in three appended maps keyed by pot idx: `pot_ext` (rule extras, goal state, policy
version, open links), `trust` ((pot, member) → record), `req_ext` ((pot, request) → tier, one-OK, link). A missing record means
"1.0.0 behaviour" (`PotExt::legacy()`, `RequestExt::for_path`). So the migration rewrites **no** old record; it only adds the
three map prefixes to the root struct (`migrate`).

**D4-2 · Trust is counted on settlement, once.** "Settled" = the request reached `approved` (paid) — counted once per
request (`RequestExt.counted`), because `approved → payout_failed → approved` can happen (D7). A spend counts toward a level
only if `amount × 10 ≥ base instant cap` (no levelling up with $0.01 spends). `TRUST_STEP = 3`, `TRUST_MAX_LEVEL = 2`, fixed
multipliers `1 + level` (kept fixed for a simple UI). A decline = the DAO status `Rejected`: level −1, streak reset. Expiry
is not a decline. Records are kept even with trust off (the public record), but only used when `extras.trust`. Links settle
when **claimed**, not when funded.

**D4-3 · One-OK is a hub-side co-sign, then a rulebot vote.** Requests in the one-OK tier are normal vote-path requests
(`Path::Vote`, `pending`, the ledger is unchanged); `RequestExt.tier = one_ok` marks them. `ok_request` (predecessor = another
Active member) reserves the OK synchronously, reads the DAO proposal + policy, and **refuses on any `Reject` vote already cast**
("objection": then the majority decides), on a proposal no longer InProgress, or when the OK-er / requester is not in the live
DAO Group. Otherwise the hub votes `VoteApprove` as rulebot (transfer kind, 1/1 — works in **every** Pot, old ones included).
The tier applies to every over-cap reason (over_cap / over_budget / payee_not_allowed / new_member) when `amount ≤ one_ok_cap`
and the Pot has ≥ 2 members; one-OK spends don't use the instant budget (a second person vetted them, like a vote).
Members can still approve one-OK requests by majority in the DAO.

**D4-4 · Link escrow is funded only by the token's own notification.** The link payout kind is
`Transfer{receiver_id: hub, msg: {"link":<request_id>}}` → Sputnik pays with `ft_transfer_call`, and the hub's `ft_on_transfer`
(predecessor = USDC, `sender_id` = a Pot's DAO, amount = the request's amount, link `awaiting_funds`) is the **only** thing that
marks a link `funded`. Reading `Approved` from `get_proposal` is not enough (it is optimistic, D7, and a bounced
`ft_transfer_call` also ends `Approved`), and a hub-wide USDC balance check would let one Pot's failed payout be paid from
another Pot's escrow. Anything that doesn't match is refunded to the sender by returning the amount (never panics). So every
USDC the hub holds is attributed to exactly one funded link.
- Link payouts need gas: Sputnik (278adc7 / v3.2) forwards act_proposal's remaining gas to `ft_transfer_call`, which forwards
  it to `ft_on_transfer`. The hub's own approvals use `GAS_ACT_LINK = 100` Tgas; the relayer's member votes are 100 Tgas
  (tested: a deciding member vote at 100 Tgas funds the escrow, W3).
- **Alternative considered:** keep the money in the Pot and have the hub propose+approve a `Transfer` to the claimer at claim
  time (no hub custody). Rejected because majority-path links would need a different DAO kind (`call` to the hub) to approve
  "a payee to be named later", doubling proposals and storage, and claims would depend on the Pot's balance at claim time.

**D4-5 · Claims are authorized by signature only.** `claim_link(pot, request_id, receiver_id, signature)`; the message is
UTF-8 `pot-claim:v1:<hub_id>:<dao_id>:<request_id>:<receiver_id>` (hub id = no cross-hub replay; request id = no cross-link
replay; receiver bound = a front-runner can't redirect). 0 deposit when relayer-signed; the hub registers the receiver on the
token inside the **same receipt** as the `ft_transfer` (`storage_deposit(registration_only)` + `ft_transfer` batch: if the
transfer fails the registration reverts and the deposit comes back). A direct, unsponsored caller attaches 0.00125 NEAR + 100 B
of state (INV-18 holds).

**D4-6 · Link lifecycle.** `awaiting_funds → funded → claiming → claimed`, or `funded → returning → returned` (requester any
time; anyone after `expires_at_ms`, default 14 days, allowed (now + 60 s, now + 30 d]), or `awaiting_funds → void` when the
request is declined / expires / is refused. An approved link whose escrow payment bounced (money never left the DAO) can be
closed by the requester 60 s after approval or by anyone after expiry (`returned`, `moved: false`). **Open links block
`propose_close`** (`ERR_LINKS_PENDING`) so escrow can't outlive the Pot. Returned money is added back to `balance_estimate`
(`PotExt.links_returned`); the requester's instant budget is not restored (counters stay ledger-only, INV-06).

**D4-7 · The goal refund reuses the close.** `refund_unfunded` phase 1 = the `propose_close` chain with `by = hub` (balance read
in-chain, floor pro-rata + dust, prepay batch, `CloseRecord`), recorded as `PotExt.refund_proposal`; phase 2 votes
`VoteApprove` (or `Finalize` on a `Failed` close) as rulebot with gas `20 + 6·n` Tgas (≤ 265), then maps the result through the
existing `on_sync`. Two calls, because the approving vote of a 40-payee close needs ≈ 255 Tgas on its own (CALIBRATION §4).
- **Sputnik permission:** the 1.0.0 rulebot role has `call:AddProposal` but **not** `call:VoteApprove` / a `call` vote policy,
  so the hub cannot approve a close in existing Pots. **The all-or-nothing goal is therefore new-Pots-only:** a Pot created with an
  all-or-nothing goal gets **policy v2** = v1 + rulebot `call:VoteApprove`, `call:Finalize` and `vote_policy.call = 1/1`
  (`policy.rs::dao_policy_v`, snapshot test). Every other new Pot keeps the v1 policy (least privilege). A rules change can add a
  *soft* goal (`all_or_nothing: false`) to any Pot, but an all-or-nothing one only to a v2 Pot (`ERR_GOAL_UNSUPPORTED`).
- While collecting, all spends are blocked (strict rule; simplest to explain, and it keeps the refund = contributions). After the
  deadline without reaching it: contributions are refused (`ERR_GOAL_MISSED`), the goal is locked (`ERR_GOAL_LOCKED`), spends stay
  blocked; members may still close normally. Reaching the goal is permanent (`goal_reached_at_ms`). Before the deadline the group
  may move or drop the goal by a normal rules change.

**D4-8 · Rules extras ride the existing rules flows.** `create_pot(…, extras)`, `set_rules(pot, rules, extras)`,
`propose_rules(pot, rules, extras)`; `extras` omitted = defaults at creation / "keep the current extras" on a change. The
proposed kind's `set_rules` args carry `extras` only when set, so 1.0.0-shaped rules kinds stay byte-identical (kinds test).

## 3. Interface (hub 1.1.0)

### Changed methods (all additions are optional args; 1.0.0 calls still work)
| Method | Change |
|---|---|
| `create_pot(slug, name, preset, rules, invite_pk, emoji, float, extras?: RuleExtras)` | extras default = trust on, one-OK 3×cap, links on, no goal; all-or-nothing goal ⇒ policy v2 |
| `request_spend(pot, amount, receiver_id, category, request_ref, link?: {claim_pk, expires_at_ms?})` | with `link`, `receiver_id` **must be the hub id** (and only then); gas ≈ 190 Tgas for an instant link (SDK 250) |
| `set_rules(pot, rules, extras?)` / `propose_rules(pot, rules, extras?)` | extras validated (`ERR_EXTRAS_INVALID`, `ERR_GOAL_*`) |
| `preview_spend(pot, account_id, amount, receiver_id, balance?, link?: bool)` | `link: true` previews a link request (receiver = hub) |
| `ft_on_transfer` | also accepts `msg = {"link":<id>}` from a Pot's DAO (escrow funding) |
| `migrate()` | `#[private] #[init(ignore_state)]`, once, in the deploy transaction |

### New methods
| Method | Who | Deposit / gas (relayer) | Returns |
|---|---|---|---|
| `ok_request(pot, request_id)` | another Active member (predecessor) | 0 / 200 Tgas (R13 100-250) | `OkOutcome {request_id, ok, status, reason?}` — reasons `objection`, `not_open`, `not_pending`, `not_in_dao_group`, `pot_not_open`, `dao_unavailable`, `approve_failed`, `stale` |
| `claim_link(pot, request_id, receiver_id, signature)` | anyone with the link's signature | 0 sponsored / 100 Tgas (R14 50-150); direct: ≥ 0.00225 NEAR | `LinkOutcome {request_id, ok, status, receiver_id, reason?}` |
| `reclaim_link(pot, request_id)` | requester any time; anyone after expiry | 0 / 50 Tgas (R15 30-100) | `LinkOutcome` |
| `refund_unfunded(pot)` | anyone (cron, relayer-signed; never relayed for users) | sponsored when the relayer signs, else the close prepay / 300 Tgas | phase 1 `CloseOutcome`, phase 2 `SyncOutcome` |

### New views
`get_trust(pot, account_id) → TrustView?`, `get_trusts(pot) → TrustView[]`, `get_goal(pot) → GoalView?`,
`get_link(pot, request_id) → LinkView?` (the claim page), `get_record(pot, from_index, limit ≤ 50) → RecordEntry[]` (the public
Pot record: requester, payee or claimer, amount, category, ref, tier, `approved_by` rules|one_ok|group, `ok_by`, request status,
`money` paid|held_for_link|awaiting_funds|returned|processing|awaiting_approval|failed|declined|expired|withdrawn|void, link status,
proposal id for the DAO link). Extended: `PotView` + `extras`, `policy_version`, `open_links`, `goal_state`;
`RequestView` + `tier`, `ok_by`, `link_status`; `SpendPreview` + `tier`, `effective_cap`, `trust_level`, `one_ok_cap`;
`SpendOutcome` + `tier`, `link`; `ClosePreview.blocked_reason` + `links_pending`.

### Events (NEP-297 `pot`; new ones version `1.1.0`)
`rule_extras_set {pot, extras, rules_version, policy_version}` (create + rules change with extras) ·
`spend_ok_approved {pot, request_id, proposal_id, requester, by, amount}` ·
`trust_level_changed {pot, member, from, to, settled, declined, cause: settled|declined}` ·
`link_funded {pot, request_id, amount, expires_at_ms}` · `link_claimed {pot, request_id, receiver_id, amount}` ·
`link_returned {pot, request_id, amount, by, moved}` · `link_voided {pot, request_id}` ·
`goal_reached {pot, goal, total}` · `goal_refund_proposed {pot, proposal_id, goal, total}` · `goal_refunded {pot, proposal_id}`.
`spend_requested` gains `tier`, `link`.

### Errors (new)
`ERR_EXTRAS_INVALID ERR_GOAL_INVALID ERR_GOAL_LOCKED ERR_GOAL_UNSUPPORTED ERR_GOAL_NOT_REACHED ERR_GOAL_MISSED
ERR_GOAL_NOT_MISSED ERR_NO_GOAL ERR_NOT_ONE_OK ERR_NOT_PENDING ERR_OK_SELF ERR_OK_IN_FLIGHT ERR_LINKS_OFF ERR_LINKS_PENDING
ERR_LINK_PK_INVALID ERR_LINK_EXPIRY_INVALID ERR_LINK_NOT_FOUND ERR_LINK_NOT_FUNDED ERR_LINK_EXPIRED ERR_LINK_NOT_EXPIRED
ERR_LINK_NOT_FINAL ERR_LINK_BUSY ERR_LINK_DONE ERR_MIGRATE` (mirrored in `@pot/sdk` `HUB_ERROR_CODES`, reconcile test).

### Invariant amendments (contracts-spec §7 — to fold into the spec)
- **INV-02:** + `Transfer{token_id = usdc, receiver_id = hub, msg = {"link":<request_id>}}` (link escrow). Still never NEAR,
  policy, config, upgrade or bounty kinds.
- **INV-03:** the hub may also vote `VoteApprove` on (a) a one-OK request's Transfer, on the id stored by `on_spend_added`
  (never caller-supplied), kind rebuilt; (b) in **policy-v2 Pots only**, its own refund close (`refund_proposal`), plus
  `Finalize` on it when Failed. It still never votes on a member-created proposal.
- **INV-05:** instant also needs "no unreached all-or-nothing goal"; the cap is `instant_cap × (1 + level)` with trust on.
- **INV-06:** ledger counters unchanged and still only in `apply_transition`; `transition` additionally runs trust / link side
  effects (`after_transition`). `ok_in_flight` and link `claiming/returning` are synchronous reservations released on every path.
- **INV-15:** + the hub sends USDC from escrow only to (a) the receiver bound by a valid claim signature, (b) the link's own DAO
  (reclaim); + the claimer's token registration deposit.
- **INV-16:** + policy v2 for all-or-nothing Pots (= v1 + rulebot `call:VoteApprove`, `call:Finalize`, `call` 1/1).
- **INV-11:** + `refund_unfunded` closes are approved by the hub (all-or-nothing Pots only); payouts are still floor pro-rata of
  the in-chain balance read; open links block a close.

## 4. Storage and who pays (bounded)
| What | Size | Paid by |
|---|---|---|
| Hub code | 557,296 B (was 463,554): **+93,742 B ≈ +0.94 NEAR** locked on the hub | hub (once, at upgrade) |
| `PotExt` per new Pot | ≈ 90 B | inside `STATE_BYTES_CREATE` (1,500) |
| `RequestExt` per request | ≈ 60 B, ≈ 150 B with a link | `STATE_BYTES_REQUEST` raised 600 → 800 |
| `TrustRecord` per (Pot, member) | ≈ 120 B, ≤ 40 per Pot | hub, inside the request budget |
| Claim | token registration 0.00125 NEAR (refunded by the token when already registered) + ≈ 100 B | hub when relayer-signed (relayer `hub_yocto` quota 0.0025/claim); direct caller attaches it |
| Refund close | the close prepay (≈ 0.008 + 0.0025·n NEAR) | hub when relayer-signed (cron), else the caller |
Measured (sandbox, both builds): instant link request 38.6 Tgas burnt; `ok_request` incl. payout 25.5; `claim_link` incl.
registration 11.05 and **−0.00111 NEAR** hub balance; refund approve (n = 3) 20.4.

### Gas budgets (static, `unused_gas_weight(0)`)
`GAS_ACT_LINK 100`, `GAS_ON_SPEND_ADDED_LINK 140`, `GAS_ON_SPEND_CHECKED_LINK 165` (instant link chain ≈ 190 Tgas attached →
SDK 250; plain requests unchanged at 150), `GAS_ON_OK_CHECKED 80 / _LINK 140` (ok_request ≈ 170 → SDK 200),
`GAS_ON_LINK_DONE 15` (claim ≈ 45 → SDK 100; reclaim ≈ 30 → SDK 50), refund phase 2 act `20 + 6n` (≤ 265) + view 10 + `on_sync`
10 → 300 attached. Retry of a link payout uses `GAS_ACT_LINK` (fits R9's 150).

## 5. Migration plan (proven in sandbox: `t_migrate.rs`, builds A + B)
1. The test deploys the **deployed 1.0.0 wasm** (fixture), creates a Pot with members, money, an instant spend, a pending vote
   and an invite, then sends **one transaction: DeployContract(1.1.0) + FunctionCall `migrate {}`** from the hub account.
2. Checks: `get_config.version` 1.0.0 → 1.1.0; a second `migrate` fails; `migrate` by anyone else fails (`#[private]`); every
   old Pot field (`seq`, rules, counters, members) is unchanged; the old Pot reads `extras` = all off, `policy_version 1`.
3. Old Pots keep working: the **pending vote made before the upgrade completes** (votes + `sync` → approved, paid); instant spends;
   over-cap → group tier (no one-OK); links refused (`ERR_LINKS_OFF`); the old invite still joins.
4. The old Pot opts in through the normal rules flow (`propose_rules` with `extras` → 3 of 4 votes → `set_rules`), after which a
   link request + claim works on it. A new Pot gets the new defaults.
- Never deploy 1.1.0 without `migrate` in the same tx: every call would fail on state deserialization until `migrate` ran.

## 6. Deploy steps for the human (testnet preview; **needs explicit OK**, nothing below was run)
Pre-checks (read-only): `scripts/run deploy status` (hub runs sha `06861ce7…`, version 1.0.0). The hub needs ≈ 0.95 NEAR more
locked for code: check `free_balance` in `get_config`; if under ≈ 2 NEAR, top up first (`scripts/run deploy fund
pots.potprev.testnet 2`, from the root) — costs nothing else.
1. Build: `contracts/scripts/build.sh` → `target/near/pot_hub/pot_hub.wasm` (this wave's build: 557,296 B, sha256
   `939c1963969cd57868f5b39213a15e54a40a0b8e48d92d6f2157c70664cfdf93`; rebuilds may differ by toolchain path — compare the size).
2. Run the sandbox suite on that wasm: `cd contracts && POT_NO_BUILD=1 cargo test -p pot-tests` (≈ 15 min).
3. Upgrade (signs with the hub's key in the legacy keychain; ONE tx = deploy + migrate):
   `scripts/with-testnet-lock.sh scripts/run deploy upgrade-hub`
   (= `near-cli-rs contract deploy pots.potprev.testnet use-file …/pot_hub.wasm with-init-call migrate json-args {}
   prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-legacy-keychain send`). It refuses unless
   the chain runs 1.0.0, then prints `1.0.0 → 1.1.0` and the status checks (code sha = local wasm). **Do not use
   `redeploy-hub` for this upgrade** (it deploys without `migrate`). Cost ≈ 0.001 NEAR gas + 0.94 NEAR storage lock.
4. Smoke (read-only): `get_config.version == "1.1.0"`; `get_pot` of `lisbon-trip.pots.potprev.testnet` shows
   `extras.trust == false`, `policy_version 1`; `get_trusts` returns members.
5. Deploy the web app with the SDK / relayer changes **after** step 3 (the 1.1.0 relayer rules R13-R15 and link requests only
   work against the 1.1.0 hub; the 1.0.0-shaped calls keep working against both).
6. Mainnet clip: the same `upgrade-hub` flow does not apply (fresh deploy with `new`); policy v2 is created per all-or-nothing Pot.

## 7. SDK + relayer (done in this wave)
- `@pot/sdk`: raw + domain types (`RuleExtras`, `Goal`, `Tier`, `LinkStatus`, `TrustView`, `GoalView`, `LinkView`,
  `RecordEntry`, `OkOutcome`, `LinkOutcome`, `LEGACY_EXTRAS`, `WAVE4_LIMITS`); new fields on existing domain types are optional
  (mocks keep compiling; `parse*` always fills them); `HubViews.getTrust/getTrusts/getGoal/getLink/getRecord` (optional members,
  implemented over RPC); `previewSpend(…, link?)`; intents `ok_request`, `claim_link`, `reclaim_link`, `refund_unfunded`,
  `request_spend.link`, `extras` on create/set/propose rules; gas (`request_spend_link 250`, `ok_request 200`, `claim_link 100`,
  `reclaim_link 50`, `refund_unfunded 300`); `RELAY_POLICY` R13-R15 + request_spend max 300; `directDeposit` for claim / refund;
  decide twin (trust cap, tier, link, goal block); rules helpers (`extrasToRaw/FromRaw`, `defaultExtras`, `effectiveCap`,
  `validateExtras`); claim crypto (`claimMessage`, `buildClaimLink`/`parseClaimLink` `/c/<slug>/<id>#<secret>`,
  `signClaim`/`verifyClaim` in `@pot/sdk/sign`, WebCrypto twins); kind twins (`linkTransferKind`, `decodeLinkKind`, `rulesKind`/`decodeRulesKind` with extras); events + error codes. Tests: `src/wave4.test.ts` (21).
- Relayer (`apps/web/server/relay/policy.ts`): R3 accepts `link` (receiver must be the hub, key + expiry checked; plain requests
  keep the 150 Tgas cap, links ≤ 300); R2/R6/R7 accept `extras` (`checkExtras`); new **R13 ok_request** (family vote, 0 hub
  NEAR), **R14 claim_link** (family spend, any signed-in sender, receiver ≠ hub/token/any Pot, padded 64-byte signature,
  hub budget 0.0025 NEAR), **R15 reclaim_link**; `refund_unfunded` and `migrate` are never relayed. `classify.ts` R13-R15 results
  (`{type:"ok"}`, `{type:"link"}`); `pipeline.ts` syncs after an R13 whose payout failed (D7). 39 new policy cases.

## 8. What the frontend / backend wave must build
- **Create + rules sheets:** trust toggle, one-OK ceiling (default 3 × instant cap), links toggle, goal (amount, deadline,
  all-or-nothing). Send `extras` always (explicit beats the contract default). All-or-nothing only at creation (or on a v2 Pot).
  Copy must avoid DAO/vote/proposal words (ux-spec): e.g. "One OK from anyone else", "Everyone gets their money back if we
  don't reach $X by <date>".
- **Spend sheet:** `previewSpend(…, link)` shows `tier` ("Instant", "Needs one OK", "Needs the group") and `effectiveCap`;
  "Pay by link" option = `generateClaimKey()`, `request_spend` with `receiverId = hubId` and `link.claimPk`, then share
  `buildClaimLink({slug, requestId, secret})` (secret only in `#`). Store nothing secret server-side.
- **Request card:** for `tier === "one_ok"` and `status === "pending"`, an "OK it" button for members ≠ requester → `ok_request`
  (not a DAO vote). Show `okBy`. A "Decline" stays the DAO `VoteReject` (it becomes an objection).
- **Claim page `/c/<slug>/<id>#<secret>`:** `getLink` (amount, from whom, status, expiry), sign in (NEAR Auth / wallet), then
  `claim_link` with `signClaim(secret, hubId, pot, id, myAccount)`; states awaiting_funds / funded / claimed / returned / void.
- **Link management:** requester "Cancel link" → `reclaim_link`; after expiry anyone (or our cron) reclaims.
- **Trust UI:** `getTrusts`/`getTrust`: level, "N more paid spends to level up", effective cap, `instantUpTo`.
- **Goal UI:** `getGoal` progress, state chip, "refund on <deadline>" copy.
- **Public Pot record page:** `getRecord` (+ DAO proposal links via `proposalId`), approved by rules / one OK (`okBy`) / the
  group; money status; link claimer.
- **Backend cron (`/api/cron/reconcile`):** for Pots whose `get_goal.can_refund` is true call `refund_unfunded` twice
  (relayer-signed, 300 Tgas), and reclaim expired funded links (`reclaim_link`, 50 Tgas). Index the new events in `effects.ts`
  (feed items, pushes: "needs one OK", "link claimed", "goal reached / refunded").
- **MockChain / mock world:** no wave-4 support yet (the new `HubViews` methods are optional).

## 9. Tests
- `cargo test -p pot-hub`: **24** passed (21 + policy v2 snapshot, link kind JSON, rules kind with extras; static checks now scan
  `wave4.rs` too and assert it has no NEAR `.transfer(`).
- Sandbox (both Sputnik builds): **existing 68 sandbox tests green** (4 assertions updated for the additive interface, no
  behaviour change: `t01` event list + `rule_extras_set`, `t20` SpendOutcome JSON + `tier`/`link` and `get_config.version`
  "1.1.0", `t87` `spend_requested` fields + `tier`/`link`; `t23` (hub as receiver → `bad_receiver`) is unchanged because a link
  preview is an explicit `link: true`), plus **10 new**: `w1_trust_one_ok`, `w2_pay_by_link`,
  `w3_link_payout_retry`, `w4_all_or_nothing_goal`, `m1_upgrade_1_0_to_1_1` × A/B. Final full `cargo test --workspace` in
  `contracts/` (2026-11-01): **133 passed, 0 failed** (was 120) = 24 hub unit + 78 sandbox + 31 vendored token.
  - W1: level up after 3 qualifying spends (event), $1 doesn't qualify, effective cap 2×, one-OK by another member (hub vote,
    payout), OK by self / non-member refused, OK on a group-tier request refused, objection, decline → level down, trust-off Pot,
    invalid extras.
  - W2: instant link funded via `ft_transfer_call`, wrong key / redirected receiver / other request id refused, claim through the
    relayer by a **0-NEAR account the hub registers on the token**, replay refused, one-OK link (no money until the OK), cancel →
    money back to the DAO, expiry → claim refused + anyone reclaims, `propose_close` blocked by open links, direct claim must pay
    the registration, links off.
  - W3: link payout fails (Pot short) → optimistic approve → `sync` → payout_failed → top up → `retry_payout` (Finalize, link gas)
    → funded → claimed; group-tier link approved by member votes at the relayer's 100 Tgas → escrow funded → cancelled.
  - W4: policy v2 on chain, spends blocked while collecting, refund refused before the deadline, contributions refused and goal
    locked after it, refund phase 1 + 2 → everyone gets exactly their contribution back, goal reached → spends open, rules edits
    (move goal, invalid deadline, all-or-nothing on a v1 Pot refused, soft goal OK), `ERR_NO_GOAL`.
- `@pot/sdk`: 181 passed (21 new). Web relay: 233 passed (39 new). Web typecheck (`NEXT_DIST_DIR=.next-hub`) clean.

## 10. Open questions / known limits
1. **Product calls (Cerasela):** trust step 3 / max level 2 / multipliers 1-2-3×; one-OK default 3× and "any reason ≤ ceiling";
   links default on; strict "no spends while collecting"; 14-day link expiry; does a declined one-OK request (objection then
   majority reject) count as a decline (now: yes, any `Rejected`).
2. A member-created DAO proposal that pays the hub with `{"link":N}` funds link N (it was majority-approved, so it's the group's
   decision); the hub's own proposal for N then refunds itself. Same class as O4 (direct DAO actions bypass the hub ledger).
3. The one-OK objection check reads the proposal one block before the hub votes; a Reject cast in that block doesn't stop it.
4. A callback that runs out of gas could leave `ok_in_flight` set (that request then needs the majority) or a link in
   `claiming` / `returning` (O3 class, no `reap` yet). Static gas has ≥ 2× margin in every run; not formally calibrated like C-09.
5. The refund close's approving vote at n = 40 (≈ 260 Tgas of 300) is computed from CALIBRATION §4, not run in the sandbox.
6. Members can keep rejecting the hub's refund close by majority; each `refund_unfunded` phase 1 costs the hub a close prepay.
   The cron should back off after a rejected refund.
7. Wasm grew to 557 KB (O2): fine for testnet; `--no-embed-abi` / string-built JSON would trim it if hub NEAR gets tight.
8. contracts-spec / decisions.md still describe 1.0.0; the INV amendments in §3 need folding in (not done here).
