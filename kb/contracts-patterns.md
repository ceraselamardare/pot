# Contract patterns: Rulebot ↔ Sputnik, NEP-141 receiver, factories and global contracts, events, storage, limits, security
> Owner: contracts. Last verified: 2026-10-21. Legend: ✅ verified · 📄 docs-only · ⚠️ unverified/conflicting

## TL;DR
- **Test setup for every ✅ number below:** sandbox runs with near-workspaces 0.23.0, nearcore 2.13.4 (protocol 86, the same as mainnet) and near-sdk 5.29.1. They used the **exact live Sputnik wasm** of testnet (legacy v3.31) and mainnet (v3.2), plus a throwaway probe contract and a near-contract-standards FT. Toolchain and fixtures: [contracts-toolchain.md](contracts-toolchain.md).
- ✅ **Contract → Sputnik works.** The chain is `add_proposal` → callback (`#[callback_result] Result<u64, PromiseError>`) → `act_proposal(id, "VoteApprove", <kind>)` → callback. The FT payout executes inside the DAO.
  - One auto-approved FT spend **burns 16.6-17.0 Tgas** in total.
  - Static gas per hop: `add_proposal` **10**, callback **55**, `act_proposal` **40**, final callback **5** Tgas. The relayer attaches **100-150 Tgas** to the user call.
  - Measured minimums: 2, ≥ g_act+g_cb2+~5, **25** for an FT payout (15 for a NEAR payout, legacy build), and 1 Tgas.
- ✅ **"`act_proposal` succeeded" does not mean "money moved".** Sputnik runs the payout as a *detached* promise. If the payout fails (receiver not registered with USDC, or the DAO is short), the proposal ends `Failed` while the Rulebot's callback sees **Ok**. Retry with `act_proposal(id, "Finalize", <kind>)` after fixing the cause. That needs `transfer:Finalize` (the rulebot role or any member). Verified.
- ✅ **Two live Sputnik ABIs.** Mainnet (`sputnik-dao.near`, v3.2) **requires** `proposal` (the `ProposalKind`), rejects unknown arguments (`#[deny_unknown_arguments]`) and checks `ERR_WRONG_KIND`. Testnet (`sputnikv2.testnet`, v3.31 from 2024) has `act_proposal(id, action, memo)` and **ignores** an extra `proposal`. Always send `{"id","action","proposal","memo"?}`; that works on both (✅ both tested).
- ✅ **NEP-141 forward-and-refund.** `ft_on_transfer` returns `ft_transfer(DAO, amount)` + callback, and the callback returns the *unused* amount: 0 if forwarded, `amount` if the forward failed. The token's `ft_resolve_transfer` then **refunds the sender automatically**. Bad `msg` → panic → refund. Funds never get stuck in the Rulebot (✅ success, bad msg and unregistered DAO all tested). The chain burns **10.1 Tgas**. The sender must attach **≥ 35 Tgas** (use 100); with less, the money silently bounces back.
- ✅ **Naming.** Only the direct parent can create `x.parent`. Verified `CreateAccountNotAllowed` for `pot-factory.pot-team` → `lisbon.rulebot.pot-team`, so the plan's `<slug>.rulebot.pot-<team>.testnet` from `pot-factory` is impossible.
- ✅ **Recommendation: a singleton Rulebot at `rulebot.pot-<team>.testnet` that *is* the pot-factory** (it calls the Sputnik factory), with state keyed by DAO account id. Per-Pot Rulebots via global contracts do work (✅ measured: 0.0074 NEAR burnt per child), but each code publish burns **0.0001 NEAR/byte (~25 NEAR per 250 KB version)**, upgrades need N migrations, and they add little to the demo.
- ✅ **Global contracts (NEP-591) and deterministic accounts (NEP-616) are live** on testnet and mainnet and work in the sandbox. A by-account-id upgrade switches **every** child within ~1 block, with **no** state migration; by-hash is immutable.
- ✅ **With `proposal_bond "0"`, the DAO pays each proposal's storage from its own NEAR:** about 190-220 B ≈ 0.002 NEAR. A DAO created with the 0.01 NEAR minimum **rejects even the first proposal** (`LackBalanceForState`). Fund each DAO with **≥ 0.25 NEAR** (≈ 120 proposals) and top it up when low.
- ✅ **Limits:** **1 PGas** per tx (testnet and mainnet), **100 actions per receipt** (101 → `TotalNumberOfActionsExceeded`), 1024 promises per call, and **100 logs / 16 KB of logs per receipt**. A 30-member pro-rata close fits in **one DAO `FunctionCall` proposal** with 30 `ft_transfer` actions: atomic, 61.5 Tgas burnt, but the **final voter's tx needs ≥ 150 Tgas**.
- ✅ **Auth:** in relayed NEP-366 calls `env::signer_account_id()` **is the relayer** (`actions.rs:501-508`). The Rulebot must authorize only by `env::predecessor_account_id()`.

## Plan check
| Claim in the original plan | Verdict |
|---|---|
| C6 `on_proposal_added(&mut self, #[callback_result] id: Result<u64, PromiseError>, auto: bool) -> Option<Promise>` | ⚠️ Use `PromiseOrValue<bool>` (tested). `Option<Promise>` serialization would call `value_return` and also mark the promise as the return (source `promise.rs:960-968`). The callback also needs static gas ≥ the static gas it attaches + ~5 Tgas (measured). |
| C6 policy: rulebot `transfer:AddProposal`, `transfer:VoteApprove`, `add_member_to_role:*`, 1 of 1, bond "0" | ✅ Single-role 1/1 finalizes on both live builds (sandbox; testnet live → sputnik agent). Prefer explicit `add_member_to_role:AddProposal` + `:VoteApprove` (least privilege; `*` also grants `RemoveProposal`, `VoteReject`, `VoteRemove`, `Finalize`, `MoveToHub`), and add **`transfer:Finalize`** for payout retries. |
| C6 "deposit must equal the bond exactly" | ✅ `ERR_MIN_BOND` with 1 yocto when bond = 0 (both builds). ❗ New consequence: the DAO pays proposal storage (§E). |
| C6 "Read `proposals.rs` on day 1 for `act_proposal` arguments" | ✅ Done (§A): two signatures, `ERR_WRONG_KIND`, deny-unknown on mainnet. |
| C6 cost "Rulebot about 0.1 NEAR per Pot via global contract (estimate)" | ❌ Per child: 0.0074 NEAR burnt + storage above 770 B; per code version: 0.0001 NEAR/B (~25 NEAR for a 250 KB wasm). Singleton: ~0.003 NEAR per Pot header plus per-record costs (§E). |
| C6 cost "Sputnik creation at least 0.01 NEAR (docs 6 NEAR; test live)" | ✅/❌ Global factory (mainnet): 0.01 is accepted but useless without about 0.25 NEAR of proposal-storage float. Testnet `sputnikv2.testnet` (legacy, code per DAO): **≥ 5.39679 NEAR** (sandbox-measured with the live wasm) → sputnik agent verifies live. |
| C4 P-2 "creates the DAO and `<slug>.rulebot.pot-<team>.testnet`" | ❌ Impossible from `pot-factory.pot-<team>` (§C). Change to "creates `<slug>.sputnikv2.testnet` and registers it in `rulebot.pot-<team>.testnet`". |
| C6 arch `[pot-factory.pot-<team>.testnet] … + <slug>.rulebot… via global contract` | ❌ Naming. Recommended: merge pot-factory into a singleton Rulebot. Two contracts in total (Rulebot + test USDC). |
| C4 P-4 "`ft_transfer_call` to Rulebot with `{"pot":"<slug>"}`; recorded and forwarded" | ✅ Pattern verified (§B). Record in the success callback; the refund is automatic. The `pot` field already implies a shared receiver, i.e. the singleton. |
| C4 P-5 "auto-approved … executes in one user action" | ✅ One relayed call; one tx tree of about 8 receipts. Payout success must be read from the DAO (§A.6). |
| C4 P-9 close pro-rata `floor`, dust to last | ✅ Feasible in one atomic DAO `FunctionCall` proposal for ≤ 100 members (30 measured) (§F). |
| C9 "Single-role approval does not finalize → design B" | ✅ It finalizes in the sandbox on both live builds. |
| Security / "Rulebot audit" (Phase 3) | ✅ Hackathon invariants and tests are in §G. |
| C6 `invites: LookupSet<[u8; 32]>` | ✅ 73 B per invite. ⚠️ Plain secrets can be front-run; prefer ed25519-keypair invites (§G). |

## Reference

### A. Rulebot → Sputnik: add_proposal → callback → act_proposal

**A.1 Signatures (source-verified)**
| | Mainnet `sputnik-dao.near` v3.2 (`2b0f34a`) and repo `main` | Testnet `sputnikv2.testnet` v3.31 (`7764926`, near-sdk 4.0.0-pre.4) |
|---|---|---|
| add | `#[payable] add_proposal(proposal: ProposalInput) -> u64` (`proposals.rs:535`) | same (`:486`) |
| act | `#[deny_unknown_arguments] act_proposal(id: u64, action: Action, proposal: ProposalKind, memo: Option<String>)` (`:593-600`) | `act_proposal(id: u64, action: Action, memo: Option<String>)` (`:540`); unknown fields ignored ✅ |
| kind check | `assert!(proposal.kind == input_proposal_kind, "ERR_WRONG_KIND")` (`:616`) | none |
| bond | `attached_deposit == policy.proposal_bond` else `ERR_MIN_BOND` (`:543`) | same |
| payout | Transfer: `ft_transfer` with 1 yocto and **static 10 Tgas**, then `.then(on_proposal_callback)` with **static 10 Tgas** (`GAS_FOR_FT_TRANSFER`, `types.rs:16`); NEAR: `Promise::transfer` + callback | same constants |
| `get_proposal` output | `vote_counts: {"rulebot": ["1","0","0"]}` (strings) | `vote_counts: {"rulebot": [1,0,0]}` (numbers) ✅ |

**A.2 JSON args (tested on both builds)**
```jsonc
// add_proposal (deposit = 0 when proposal_bond "0")
{"proposal": {"description": "Groceries $84", "kind":
  {"Transfer": {"token_id": "usdc.pot-team.testnet", "receiver_id": "leo.testnet", "amount": "84000000", "msg": null}}}}
// act_proposal: same kind object, byte-for-byte equal after deserialization
{"id": 7, "action": "VoteApprove", "proposal": {"Transfer": {"token_id": "usdc.pot-team.testnet", "receiver_id": "leo.testnet", "amount": "84000000", "msg": null}}, "memo": "auto: under $100 cap"}
// join
{"AddMemberToRole": {"member_id": "leo.testnet", "role": "member"}}
// settlement (members vote; final vote executes all actions atomically)
{"FunctionCall": {"receiver_id": "usdc.pot-team.testnet", "actions": [
  {"method_name": "ft_transfer", "args": "<base64 of {\"receiver_id\":\"m1.testnet\",\"amount\":\"62400000\"}>", "deposit": "1", "gas": "5000000000000"}]}}
```
- `token_id: ""` means NEAR (`OLD_BASE_TOKEN`), and `msg` must then be null (`ERR_BASE_TOKEN_NO_MSG`). `msg: "<string>"` makes the DAO call `ft_transfer_call` instead: never let the Rulebot set it.
- `Action` values: `AddProposal` (internal), `RemoveProposal`, `VoteApprove`, `VoteReject`, `VoteRemove`, `Finalize`, `MoveToHub`. `Gas`, `NearToken` and `U128` are JSON **strings** ✅.
- Permission labels (`<label>:<Action>`, with `*` wildcards): `transfer`, `add_member_to_role`, `remove_member_from_role`, `call` (FunctionCall), `config`, `policy`, `upgrade_self`, `upgrade_remote`, `vote`, `add_bounty`, `bounty_done`, `factory_info_update`, `policy_add_or_update_role`, `policy_remove_role`, `policy_update_default_vote_policy`, `policy_update_parameters`, `set_vote_token` (`proposals.rs:125-150`).

**A.3 Recommended Pot policy roles (tested shape)**
```json
{ "name": "rulebot", "kind": { "Group": ["rulebot.pot-team.testnet"] },
  "permissions": ["transfer:AddProposal", "transfer:VoteApprove", "transfer:Finalize",
                  "add_member_to_role:AddProposal", "add_member_to_role:VoteApprove"],
  "vote_policy": { "transfer":           { "weight_kind": "RoleWeight", "quorum": "0", "threshold": [1, 1] },
                   "add_member_to_role": { "weight_kind": "RoleWeight", "quorum": "0", "threshold": [1, 1] } } }
```
- **Vote math.** `threshold = max(quorum, min(num*N/den + 1, N))` for `Ratio(num, den)` over the role's group size N. A 1-account group gives threshold 1 for both `[1,1]` and `[1,2]`. Votes count **per role of the voter** (`policy.rs` `proposal_status`), so the rulebot's vote never counts toward the `member` majority, and member votes don't count toward `rulebot`.
- Finalize semantics: `Finalize` re-computes status from existing votes. It re-executes `Approved`/`Failed` proposals and rejects expired ones (both builds). It can't approve anything without votes, so giving `transfer:Finalize` to the rulebot is safe.
- Nobody can make the rulebot approve a proposal it didn't create, because only its code calls `act_proposal`. **The code is the only guard** (§G).

**A.4 Gas budget per hop: measured ✅ and recommended**
| Hop | Burnt (measured) | Min static that worked | Recommend |
|---|---|---|---|
| Relayed tx → `rulebot.request_spend` (own exec) | 0.32 (tx) + 2.1 Tgas | — | attach **100-150 Tgas** (45 Tgas was enough for a 3/35/25/3 budget) |
| `dao.add_proposal` | 1.95 (mainnet) / 2.09 (legacy) Tgas | **2 Tgas** (1 fails) | **10 Tgas** (grows with policy size) |
| `rulebot.on_added` (schedules `act_proposal` + `on_acted`) | 2.16 Tgas | g_act + g_cb2 + **~5 Tgas** (30-33 failed and 35 passed for 25+5) | **55 Tgas** (with 40 + 5 below) |
| `dao.act_proposal`, FT payout | 2.93 / 3.04 Tgas | **25 Tgas** (≤ 23 → "Exceeded the prepaid gas"; it attaches 10 + 10 internally) | **40 Tgas** |
| `dao.act_proposal`, NEAR payout / AddMemberToRole | 2.6 Tgas | 15 Tgas for a NEAR payout (legacy build; 12 failed). The mainnet build wasn't measured because the DAO lacked NEAR (`LackBalanceForState`) | 40 Tgas (same constant) |
| `usdc.ft_transfer` (inside the DAO) / `dao.on_proposal_callback` | 1.71 / 2.28 Tgas | 10 + 10 (Sputnik constants) | — |
| `rulebot.on_acted` | 1.35 Tgas | 1 Tgas | **5 Tgas** |
| **Whole auto-approved FT spend** | **16.6 (mainnet) / 17.0 (legacy) Tgas** ≈ 0.0017 NEAR at 1e8/gas | — | — |
| Whole auto-approved join (AddMemberToRole) | 11.6-11.8 Tgas | — | — |
| `Finalize` retry of a failed payout | 8.2-8.3 Tgas | — | 100 Tgas |

The gas price is 1e8 yocto per gas. Receipt gas is *bought* at `max(gas_price, 1e9)` and the surplus is refunded later, so the relayer reserves 0.15 NEAR per in-flight 150 Tgas tx (see [meta-tx-relayer.md](meta-tx-relayer.md)).

**A.5 `#[callback_result]` handling (near-sdk 5.29.1, source and tests)**
- `#[callback_result] r: Result<T, PromiseError>`. `PromiseError` is `Failed` or `TooLong(usize)` and carries **no panic message**. The reason (for example `ERR_PERMISSION_DENIED`) is only in the receipt outcome, so the indexer reads it from RPC.
- `Result<(), PromiseError>` treats an empty result as `Ok(())` (special-cased in the macro). The optional `max_bytes` (default `usize::MAX`) caps the result size.
- Mark callbacks `#[private]` (which means predecessor == current account). Never `require!`/panic inside a callback after a failure; record it and return.
- Return `PromiseOrValue<T>`. `Promise` is `#[must_use]`, so either return it or call `.detach()`.
- Tested behaviours:
  - `add_proposal` fails (no permission) → `on_added` gets `Err` → event plus `false`; the **tx as a whole succeeds**.
  - `act_proposal` runs out of gas → the vote is **not** recorded, the proposal stays `InProgress` → `on_acted` gets `Err` → safe to retry.
  - The payout fails inside the DAO → `on_acted` gets **Ok**, but the status ends `Failed`.

**A.6 What to store, and the state machine for failed attempts**
```
Requested ──add ok──► Approving{pid} ──act ok──► VoteCast{pid}  (payout pending in DAO; final = DAO status)
    │                      │                         ├─ DAO status Approved → Paid
    └─add err─► AddFailed  └─act err─► ApproveFailed{pid} ─retry_approve()─► …   └─ DAO status Failed → retry via Finalize
(over cap) Requested ──add ok──► NeedsVote{pid}  (members vote in the DAO; the Rulebot never votes)
```
- Store `Request { pot: AccountId /*DAO*/, requester, receiver, amount: U128, memo, kind: ProposalKind (what you sent), created_ms, status }`, keyed by a Rulebot-local `u64`. Keep the **exact `kind` you sent**: it is required for `act_proposal` on mainnet and for `Finalize`.
- **Reserve budgets before the first cross-contract call** (`spent_by += amount`) and release them in `on_added` on `Err`. Otherwise two concurrent requests can both pass the per-member budget check, because state isn't locked across receipts.
- Expose idempotent `retry_approve(request_id)` (re-sends `act_proposal(VoteApprove)` only for `ApproveFailed` requests with the stored kind) and `sync(request_id)` (cross-contract `get_proposal` → callback maps `Approved`/`Failed`/`Rejected`/`Expired`).

### B. NEP-141 receiver (`ft_on_transfer`)
- Signature: `ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> PromiseOrValue<U128>`, which returns the **unused** amount. near-contract-standards 5.29.1 `ft_transfer_call` forwards **all remaining gas** (weight 1) to `ft_on_transfer` and keeps **5 Tgas** for `ft_resolve_transfer`. The resolver refunds `min(unused, receiver balance)` (`core_impl.rs:13,129-153`).
- Pattern (✅ tested; snippet 2):
  1. `require!(predecessor == usdc)`.
  2. Strictly parse `msg` (`{"pot": "<dao or slug>"}`) and look up the Pot (the DAO id comes **from state, never from `msg`**).
  3. Return `ft_transfer(dao, amount)` with 1 yocto and 10 Tgas, `.then(on_forwarded)` with 10 Tgas.
  4. `on_forwarded` records the contribution and emits an event, then returns `U128(0)`; on `Err` it returns `amount`, and the token refunds the sender.
- Measured per receipt: `ft_transfer_call` 2.48, `ft_on_transfer` 2.07, `ft_transfer` 1.72, `on_forwarded` 1.38, `ft_resolve_transfer` 1.29. **Total 10.1 Tgas.** The sender's `ft_transfer_call` with 25-30 Tgas → `ft_on_transfer` can't schedule 10+10 → the amount is refunded (`result "0"`); **35 Tgas works**. Recommend 100.
- Failure cases verified: bad msg → `ERR_BAD_MSG` → refunded. DAO not registered with the token (`The account … is not registered`) → `forward_failed` → refunded, and the Rulebot holds 0. Direct call from a non-token account → `ERR_WRONG_TOKEN`.
- Prerequisites:
  - **The Rulebot and every DAO must be registered** with USDC (`storage_deposit`, 0.00125 NEAR each). Register the DAO in the create-Pot callback.
  - `ft_transfer` needs **exactly 1 yocto** from the Rulebot's balance. It holds NEAR anyway; protocol ≥ 85 also lets a zero-balance contract attach 1 yocto (`one_yocto_on_promise`).
  - Payout receivers must be registered too, or the DAO's payout ends `Failed` (§A).
- Plan alternative "funds stuck in the Rulebot → retry method": not needed with this pattern. A `sweep`/`retry_forward` is only needed if you ever return `Value(0)` *before* the forward completes. Don't.

### C. Factories, naming, global contracts, deterministic accounts

**C.1 Naming rule (✅ sandbox).** `CreateAccount` of `x.parent` requires predecessor == `parent`. The error is `CreateAccountNotAllowed { account_id: "lisbon.rulebot.pot-team.test.near", predecessor_id: "pot-factory.pot-team.test.near" }`. Grand-children can't be created from the grandparent either. The options:
| Option | Accounts | Notes |
|---|---|---|
| **1. Singleton Rulebot is the factory (recommended)** | `rulebot.pot-<team>.testnet` (+ `usdc.pot-<team>.testnet`); DAOs `<slug>.sputnikv2.testnet` | No per-Pot accounts. The Rulebot calls `sputnikv2.testnet.create` itself. Every DAO's rulebot member is the same readable id. |
| 2. Factory is the parent | Factory code at `rulebot.pot-<team>.testnet`, children `<slug>.rulebot.pot-<team>.testnet` | A parent can publish child code *by its own account id* while running different local code (✅ t5: `gfactory` ran the probe locally and published global code under its id). |
| 3. Children under the plan's factory | `<slug>.pot-factory.pot-<team>.testnet` | Works, but long (64-char cap) and less readable. |
| 4. Deterministic `0s…` accounts (NEP-616) | `0s` + 40 hex | Anyone can create them; no naming authority; unreadable in Trezu and explorers. |

- DAO slugs must be unique across **all** `sputnikv2.testnet` DAOs (5319 exist). Add a suffix (`lisbon-trip-7f3a`) and handle "name taken": the Sputnik `create` promise fails → our callback gets `Err` → the factory's own `on_create` refunds the deposit to the caller (source).
- The full id must be ≤ 64 chars.

**C.2 Global contracts (NEP-591).** Final, live on testnet and mainnet (`global_contract_host_fns: true`), and `sputnik-dao.near` itself uses them.
- **near-sdk 5.29.1 `Promise` API** (no feature flag since 5.25):
  - `.deploy_global_contract(code)`, by hash: immutable.
  - `.deploy_global_contract_by_account_id(code)`: identified by the **receiver** account id; upgradable by that account.
  - `.use_global_contract(code_hash)` / `.use_global_contract_by_account_id(account_id)`.
  - `env::current_contract_code()` / `current_global_contract_id()` (feature `deterministic-account-ids`).
- **CLI:** `near contract deploy-as-global use-file <wasm> as-global-account-id <acc>|as-global-hash <acc> …`; `near contract deploy <acc> use-global-account-id <acc>|use-global-hash <hash> …` (📄 docs; subcommands present in near-cli-rs 0.30.1 ✅).
- **near-api 0.8.6:** `Contract::deploy_global_contract_code(code).as_hash()/.as_account_id(id)`. **near-workspaces 0.23 has no tx-level global actions**: deploy globals from a contract in tests.
- **Costs ✅:**
  - Publishing **burns** `0.0001 NEAR × code bytes` from the deployer (`global_contract_storage_amount_per_byte`, `global_contracts.rs:34-50`). Measured: 185,319 B → **18.533 NEAR**; Sputnik DAO 444,088 B → **44.41 NEAR**. Gas is 27 Tgas for 185 KB (9 Tgas of that is tx-size cost).
  - Using one adds only the identifier (32 B for a hash, or len(account id)) to the account's storage.
  - Child creation (`create_account + transfer + use_global + new`) **burns 0.0074 NEAR** per child (the 0.007 `account_creation_charge` + gas, paid by the tx signer). The child was 193 B for by-account and 207 B for by-hash, and it worked with **0 NEAR** because it is under the NEP-448 770 B zero-balance limit. Above 770 B the child must stake **all** its bytes.
- **Upgrade semantics ✅:** re-publishing by-account switched a child to the new code within 1 block (`view_code` returned the new 155,223 B; old methods `MethodNotFound`; old state "Cannot deserialize"). **There is no automatic state migration.** By-hash children are unaffected.
- Protocol notes: `GlobalContractSameChunkCallFix` (87; mainnet is 86) means calling a just-published global contract in the same chunk can fail on mainnet, so publish in an earlier tx. `FailCallToMissingGlobalContract` (88).

**C.3 Deterministic accounts (NEP-616).** Final, and live **since protocol 82** (nearcore `87.yaml`). The id is `"0s" + hex(keccak256(borsh(StateInit::V1{code: GlobalContractId, data: BTreeMap})))[12..32]`.
- near-sdk feature `deterministic-account-ids`: `Promise::new(si.derive_account_id()).state_init(si, deposit)`. CLI `near contract state-init`.
- ✅ Sandbox: `0sb85f138bfd40af315869ec3bc92633dd7b522c68` was created with code `GlobalAccountId(gfactory)` and one data entry: **172 B, balance 0**, 10.7 Tgas, 0.00705 NEAR burnt.
- Universal `0u` accounts (`UniversalAccounts`, protocol 87) are **testnet-only** (mainnet is 86); near-sdk support arrives in 5.30.0-rc.1 (NEP-655). Not needed for Pot.

**C.4 Singleton vs per-Pot Rulebot**
| Criterion | Singleton (state keyed by DAO id) | Per-Pot child via global code |
|---|---|---|
| Cost per Pot | No account: ~151 B Pot header + rules ≈ **0.002-0.004 NEAR** of Rulebot storage | **0.0074 NEAR burnt** + stake once child state > 770 B (members and requests push it over quickly) |
| One-time / per version | Regular deploy: storage of the code (~2.5 NEAR per 250 KB, **re-used** on redeploy) | **0.0001 NEAR/B burnt per publish** (≈ 25 NEAR per 250 KB). 10 hackathon iterations ≈ 250 testnet NEAR |
| Complexity | Every method takes a `pot` id; collections need composite keys or per-Pot prefixes; one membership map | Simpler per-instance state, but factory parent naming, child init, N migrations, cross-account tests |
| Security blast radius | Bug or key compromise → every DAO where it is the rulebot (it can approve any transfer it creates) | **Same for code bugs** (shared code). By-account upgrade key = all Pots. Only by-hash isolates, but then no fixes are possible |
| Upgradeability | 1 deploy + 1 `migrate` | 1 publish (all switch within ~1 block) + N `migrate` calls, or forward-compatible state |
| Explorer / Trezu | Proposer is always `rulebot.pot-team.testnet`. Pot activity interleaves on one account, but each DAO's own history is per Pot | Proposer is `<slug>.rulebot.pot-team.testnet`: per-Pot identity, nice in Trezu |
| Demo clarity | "Every Pot is a Sputnik DAO, and our Rulebot holds one seat with a 1/1 transfer rule" | Slightly better story, at more cost and risk |
| `ft_on_transfer` msg `{"pot":…}` | Needed (shared receiver), as the plan already implies | Unneeded (one receiver per Pot) |

**Recommendation: the singleton, merged with pot-factory** (two contracts in total: `rulebot` and `usdc`). Switch to per-Pot only if judges' Trezu readability is worth about 25 NEAR per publish. If so, use option 2 naming and by-account code, and design state to be forward-compatible.

### D. Events (NEP-297) for the feed
- `#[near(event_json(standard = "pot"))] enum PotEvent { #[event_version("1.0.0")] Variant { .. } }` then `.emit()` produces `EVENT_JSON:{"standard":"pot","version":"1.0.0","event":"<snake_case>","data":{…}}`. ✅ Probe output: `EVENT_JSON:{"standard":"probe","version":"1.0.0","event":"proposal_added","data":{"id":0}}`.
- Emit these, always including `pot` (the DAO id) for indexer filtering:
  - `pot_created {pot, creator, preset}`
  - `member_joined {pot, member, proposal_id}`
  - `invite_created {pot, by, invite_pk_prefix}`
  - `contribution {pot, member, amount, total_in}` (in the forward callback only)
  - `contribution_refunded {pot, member, amount}`
  - `request_created {pot, request_id, requester, receiver, amount, memo, path: "auto"|"vote", proposal_id}`
  - `request_vote_cast {pot, request_id, proposal_id}`
  - `request_failed {pot, request_id, stage: "add"|"approve"}`
  - `rules_changed {pot, rules}`
  - `settlement_proposed {pot, proposal_id, payouts: [{member, amount}]}`
- Amounts are `U128` strings. Never log invite secrets, emails or PII.
- Limits per receipt: **100 logs, 16,384 B total** (testnet and mainnet config). A 30-payout event at ~70 B each is ~2.1 KB: fine; batch into one event with an array.
- Sputnik emits **no NEP-297 events** (only `Memo: …` logs and a policy log). The feed must also read `get_proposals`/`get_proposal`, and `get_actions_log` on mainnet v3.2 only → infra.
- NEP-141 token events (`nep141 ft_transfer`) come from near-contract-standards automatically ✅.

### E. Storage: who pays
| Record | Measured bytes ✅ (`env::storage_usage()` delta, near-sdk 5.29.1 `store::*`) | NEAR |
|---|---|---|
| `LookupMap<AccountId,u128>` entry (16-char / 64-char implicit id) | 77 / 125 | 0.00077 / 0.00125 |
| `IterableMap<AccountId,u128>` entry (16 / 64 chars) | 158 / 206 | 0.0016 / 0.0021 |
| Request record `LookupMap<u64, {u128, 2×AccountId, u8, bool, 23-char memo}>` | 134 | 0.0013 |
| Invite `LookupSet<[u8;32]>` | 73 | 0.0007 |
| Pot header `LookupMap<AccountId(34c), ~68 B struct>` | 151 | 0.0015 |
| `Vector<u64>` push | 53 | 0.0005 |
| Sputnik proposal (mainnet / legacy) | +188-219 per Transfer; +319 / +223 for AddMemberToRole incl. the member | ~0.002 |
| Sputnik DAO base (global / legacy) | 846 / 540,404 | 0.0085 / 5.404 |
- Storage price: 1e19 yocto/B = **0.00001 NEAR/B** (100 KB = 1 NEAR). Each trie entry adds 40 B (`num_extra_bytes_record`). Zero-balance accounts are ≤ 770 B (`verifier.rs:25`) ✅.
- **Rulebot storage:** for the hackathon, sponsor it from the Rulebot's own NEAR float, **capped per Pot** (for example ≤ 50 open invites, ≤ 20 open requests per member, ≤ 3 Pots per creator per day enforced on-chain by creator account, plus the relayer's per-email limit), and alert below 5 NEAR. Or charge per call: `let b = env::storage_usage(); …; let cost = env::storage_byte_cost().saturating_mul((env::storage_usage() - b) as u128); require!(env::attached_deposit() >= cost)` and refund the excess. In relayed calls the **relayer** pays attached deposits ([meta-tx-relayer.md](meta-tx-relayer.md)).
- **DAO storage:** bond 0 means proposals are paid by the DAO's NEAR. ✅ A DAO created with 0.01 NEAR (845 B) fails the first `add_proposal` with `LackBalanceForState`; +0.01 NEAR fits only 6 proposals. Fund **≥ 0.25 NEAR** at creation (global factory) or deposit ~6 NEAR (legacy testnet: 5.40 code + ~0.6 float ≈ 270 proposals), and add a top-up job (→ infra).
- **USDC storage:** the DAO, the Rulebot and every member or receiver need `storage_deposit` (0.00125 NEAR) → relayer or onboarding.

### F. Limits (✅ RPC `EXPERIMENTAL_protocol_config`, testnet 87 / mainnet 86 / sandbox 86, identical)
| Limit | Value | Pot impact |
|---|---|---|
| `max_total_prepaid_gas` / `max_gas_burnt` per tx or receipt | **1,000 Tgas (1 PGas)** | Not 300 Tgas any more. near-workspaces `max_gas()` = 1 PGas |
| Static gas a function can attach | ≤ its own prepaid gas minus what it burns | Callbacks need explicit budgets (§A.4) |
| `max_actions_per_receipt` | **100** (✅ 100 ok with 1 PGas, 178.7 Tgas burnt; 101 → `TotalNumberOfActionsExceeded`) | ≤ 100 payouts per DAO `FunctionCall` proposal |
| `max_promises_per_function_call_action` | 1024 | Fan-out is not the bottleneck; gas is |
| `max_number_input_data_dependencies` | 128 | `Promise::and` joins ≤ 128 |
| `max_number_logs` / `max_total_log_length` | 100 / 16,384 B per receipt | Batch events |
| `max_arguments_length` / `max_transaction_size` / `max_contract_size` | 4 MiB / 1.5 MiB / 4 MiB | Wasm uploads via DAO `store_blob` fit |
| `yield_timeout_length_in_blocks` | 200 | (not used by Pot) |
| `account_creation_charge` | 0.007 NEAR per created account (protocol ≥ 85), taken from the **signer's** gas refund | Each Pot creation = DAO account ⇒ ≥ 0.007 NEAR |
| `min_gas_purchase_price` | 1e9 yocto/gas (receipt gas prepay); gas price 1e8 | The relayer needs float for prepay |
| `burnt_gas_reward` | 0 on testnet (protocol 87), 30% on mainnet (86) | Contracts no longer earn gas rewards on testnet |

**Settlement for 30 members (✅):**
1. **30 separate promises** from one call: 62.3 Tgas total (11.6 to schedule + 30 × 1.67). Each transfer succeeds or fails independently.
2. **One receipt with 30 `ft_transfer` actions:** 55.9 Tgas, **atomic** (one bad transfer at index 10 reverted all 30).
3. **A DAO `FunctionCall` proposal with 30 actions (recommended):** 3 Tgas static per action worked (each `ft_transfer` burns ~1.67; in the probe fan-out even 2 worked; use 5). The final vote with 150 or 300 Tgas executed it, with 61.5 Tgas burnt.

So the relayer must attach **300 Tgas to every member vote**, because any vote can be the deciding one and carries the execution gas. Pro-rata math in u128: `floor(balance × c_i / total)`; 1e15 (USDC 6-dp, $1B) × 1e15 = 1e30 < 3.4e38.

### G. Security invariants (the rulebot role can approve any transfer it proposes; the code is the only guard)
| # | Invariant | Prove in the sandbox |
|---|---|---|
| I1 | Only creates `Transfer{token_id == pot.usdc, msg: None, amount > 0}` and `AddMemberToRole{role: "member", member_id: predecessor}`. Never NEAR transfers, `FunctionCall`, policy or config kinds, and never `msg` | Unit test of the kind builder; sandbox: no public path produces other kinds |
| I2 | Auto-approve only if `amount ≤ instant_cap`, `spent_by[requester] + amount ≤ member_budget`, `amount ≤ pot_available` (Rulebot accounting), receiver allowed (member or allowlist), and requester is a member | `under_cap_executes`, `over_cap_stays_in_vote` (status `InProgress`, no rulebot vote), `budget_enforced`, `non_member_rejected`, `receiver_not_allowed_goes_to_vote` |
| I3 | Votes only on proposal ids returned by **its own** `add_proposal` in the same flow (or stored `ApproveFailed` retries), always with the stored kind. **No generic `approve(id)`** | `member_created_big_proposal_never_rulebot_approved`; `retry_only_for_failed_requests` |
| I4 | Reserves budget/balance **before** the cross-contract calls and releases on failure, so concurrent requests can't double-spend | Two `request_spend` in the same block exceed the budget together → second rejected |
| I5 | All auth via `predecessor_account_id()`. In relayed calls `signer_account_id()` is the relayer (`actions.rs:501-508`) | Relayed call (or sandbox call from a non-member) rejected |
| I6 | Callbacks are `#[private]`, use `#[callback_result]`, never panic after state changes, and roll back reservations | Inject failures: `add_proposal` without permission, `act_proposal` with low gas, unregistered receiver → records `AddFailed`/`ApproveFailed`/`Failed` |
| I7 | `ft_on_transfer`: predecessor == pot token; Pot from state; record only in the success callback; refund via the unused amount | `wrong_token_rejected`, `bad_msg_refunded`, `unregistered_dao_refunded`, `contribution_recorded_exactly_once` |
| I8 | Joins: invite single-use (`remove` returns true), role fixed to `member`, invites bound to the joiner (below) | `bad_invite_rejected`, `invite_reuse_rejected`, `frontrun_with_stolen_invite_rejected` |
| I9 | Rule changes only by the Pot's DAO (`predecessor == pot.dao`, via a member-voted `FunctionCall` proposal). No owner override | `rules_change_by_member_direct_rejected`, `rules_change_via_dao_proposal_ok` |
| I10 | Settlement: `Σ payouts == balance`, dust to the last contributor, executed only by the DAO after a member vote | Property tests (fast-check / proptest) + sandbox `settle_sums_exactly` |
| I11 | Storage abuse bounded (caps per Pot or member, or a deposit) | Spam invites → cap error |
| I12 | `overflow-checks = true` in release; all money math in u128 with checked ops | Unit tests near u128 bounds |
- **Invite front-running:** a plain secret in `join(secret)` is visible in the tx before inclusion, so a watcher could join first. Better: the invite link carries an **ed25519 keypair**. The creator stores `invite_pk` (32 B). `join(pot, sig)` checks `env::ed25519_verify(&sig, predecessor.as_bytes() /* plus pot id */, &invite_pk)` (base cost 0.21 Tgas), which binds the invite to the joiner. ⚠️ design, not yet tested.
- **Locking and upgrades (hackathon):**
  - Keep a full-access key on `rulebot.pot-<team>.testnet` until the last deploy (day 12), then delete it. README: `near account list-keys rulebot.pot-<team>.testnet network-config testnet now` shows no full-access key.
  - A locked singleton can't be fixed. On testnet that is acceptable; a v2 would need every DAO's policy updated.
  - DAO-governed alternative (no new mechanism needed): a team Sputnik DAO uploads the wasm with `store_blob` (deposit ≥ (len+32) × byte cost), and members approve `UpgradeRemote{receiver_id: rulebot, method_name: "upgrade", hash}`. That calls `rulebot.upgrade(<raw wasm>)` with all remaining gas (`upgrade.rs:263-275`). The Rulebot checks `predecessor == team_dao`, then `deploy_contract(code)` + `migrate`. ⚠️ not tested; Phase 3.
- **Sputnik-side trust:** a DAO created by a factory has `factory_info.auto_update = true`. On `main`/mainnet, a factory-pushed update first appears as an `UpgradeSelf` proposal and applies only after **2 weeks** (`TWO_WEEKS_NS`, `upgrade.rs:113`), so it can't happen within the event. The legacy testnet build (`7764926`, `upgrade.rs:62-72`) has **no delay gate**, so its factory owner (`sputnikv2.testnet`) can push code to DAOs immediately. ✅ source; not exercised.

## Snippets
Throwaway, adapted from the sandbox probe that passed the tests above. Snippets 1, 2, 3, 4 and 5 **compile together** with near-sdk 5.29.1 under `cargo near build` (✅ checked in a scratch crate). Shapes only; this is not the Rulebot. `Promise::function_call` takes `impl Into<String>`: pass `"create"`, not `"create".into()` (ambiguous).

**1. Rulebot → Sputnik with callbacks (near-sdk 5.29.1)**
```rust
use near_sdk::{env, ext_contract, near, AccountId, Gas, NearToken, Promise, PromiseError, PromiseOrValue};
use near_sdk::serde_json::{json, Value};

const GAS_ADD: Gas = Gas::from_tgas(10);      // burns ~2
const GAS_ACT: Gas = Gas::from_tgas(40);      // min 25 for FT payout (DAO attaches 10 + 10)
const GAS_ON_ACTED: Gas = Gas::from_tgas(5);  // burns ~1.4
const GAS_ON_ADDED: Gas = Gas::from_tgas(55); // must cover GAS_ACT + GAS_ON_ACTED + ~5 own

#[ext_contract(ext_dao)]
trait SputnikDao {
    fn add_proposal(&mut self, proposal: Value) -> u64;
    fn act_proposal(&mut self, id: u64, action: String, proposal: Value, memo: Option<String>);
}

// inside #[near] impl Rulebot:
fn propose_and_approve(&mut self, dao: AccountId, kind: Value, description: String, req_id: u64) -> Promise {
    ext_dao::ext(dao)
        .with_static_gas(GAS_ADD).with_unused_gas_weight(0)          // deposit 0 == proposal_bond "0"
        .add_proposal(json!({ "description": description, "kind": kind }))
        .then(Self::ext(env::current_account_id())
            .with_static_gas(GAS_ON_ADDED).with_unused_gas_weight(0)
            .on_added(req_id, kind))
}

#[private]
pub fn on_added(&mut self, req_id: u64, kind: Value,
                #[callback_result] id: Result<u64, PromiseError>) -> PromiseOrValue<bool> {
    match id {
        Ok(pid) => {
            /* store status Approving{pid}; emit request_created */
            PromiseOrValue::Promise(
                ext_dao::ext(self.dao_of(req_id))
                    .with_static_gas(GAS_ACT).with_unused_gas_weight(0)
                    .act_proposal(pid, "VoteApprove".into(), kind, Some("auto: within Pot rules".into()))
                    .then(Self::ext(env::current_account_id())
                        .with_static_gas(GAS_ON_ACTED).with_unused_gas_weight(0)
                        .on_acted(req_id, pid)))
        }
        Err(_) => { /* release reservation; status AddFailed; emit request_failed{stage:"add"} */ PromiseOrValue::Value(false) }
    }
}

#[private]
pub fn on_acted(&mut self, req_id: u64, pid: u64, #[callback_result] r: Result<(), PromiseError>) -> bool {
    // Ok = vote recorded and payout *scheduled*; final payout status = DAO get_proposal(pid).status
    r.is_ok() /* else: status ApproveFailed{pid}; retry_approve() re-sends act_proposal with stored kind */
}
```

**2. NEP-141 receiver that forwards to the DAO and refunds on failure (✅ tested)**
```rust
#[ext_contract(ext_ft)]
trait Nep141 { fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>); }

pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> PromiseOrValue<U128> {
    require!(env::predecessor_account_id() == self.usdc, "ERR_WRONG_TOKEN");
    let m: ContributeMsg = near_sdk::serde_json::from_str(&msg).unwrap_or_else(|_| env::panic_str("ERR_BAD_MSG"));
    let dao = self.pot_dao(&m.pot);                      // from state, never from msg; panics → refund
    PromiseOrValue::Promise(
        ext_ft::ext(self.usdc.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(Gas::from_tgas(10)).with_unused_gas_weight(0)
            .ft_transfer(dao, amount, Some(format!("pot:{}", m.pot)))
            .then(Self::ext(env::current_account_id())
                .with_static_gas(Gas::from_tgas(10)).with_unused_gas_weight(0)
                .on_forwarded(m.pot, sender_id, amount)))
}

#[private]
pub fn on_forwarded(&mut self, pot: String, sender_id: AccountId, amount: U128,
                    #[callback_result] r: Result<(), PromiseError>) -> U128 {
    if r.is_ok() { /* record contribution; emit contribution */ U128(0) }
    else { /* emit contribution_refunded */ amount }          // token's ft_resolve_transfer refunds sender
}
```

**3. Create a DAO from the Rulebot (singleton-as-factory shape; compiles with near-sdk 5.29.1 ✅; not executed: the factory calls themselves are tested)**
```rust
use near_sdk::json_types::Base64VecU8;            // serializes to a base64 JSON string (Sputnik's `args` type)
let args = json!({ "config": { "name": slug, "purpose": "Pot", "metadata": "" }, "policy": policy_json });
Promise::new("sputnikv2.testnet".parse().unwrap())
    .function_call("create",
        json!({ "name": slug, "args": Base64VecU8::from(args.to_string().into_bytes()) }).to_string().into_bytes(),
        NearToken::from_near(6),          // legacy testnet factory: ≥ 5.4 (code) + proposal float; mainnet: 0.25
        Gas::from_tgas(150))              // legacy burns 88.5 Tgas; global 15
    .then(Self::ext(env::current_account_id()).with_static_gas(Gas::from_tgas(30))
        .on_dao_created(slug, creator));  // Ok(()) = DAO `new` ran; Err = name taken / failed (factory refunds us)
// in on_dao_created Ok: insert Pot state, then usdc.storage_deposit({"account_id": dao, "registration_only": true}) 0.00125 NEAR
```
`near_sdk::base64` is base64 **0.22**, which has no top-level `encode`. Use `Base64VecU8` as above, or the `Engine` API.

**4. Per-Pot child via global code (✅ tested in the sandbox as `create_child`)**
```rust
// once (publish; burns 0.0001 NEAR/B): input = raw wasm
Promise::new(env::current_account_id()).deploy_global_contract_by_account_id(env::input().unwrap()).detach();
// per Pot:
Promise::new(format!("{slug}.{}", env::current_account_id()).parse().unwrap())
    .create_account().transfer(NearToken::from_millinear(50))
    .use_global_contract_by_account_id(env::current_account_id())
    .function_call("new", init_args, NearToken::from_yoctonear(0), Gas::from_tgas(10));
```

**5. NEP-297 events (✅ format verified)**
```rust
#[near(event_json(standard = "pot"))]
pub enum PotEvent {
    #[event_version("1.0.0")] Contribution { pot: AccountId, member: AccountId, amount: U128, total_in: U128 },
    #[event_version("1.0.0")] RequestCreated { pot: AccountId, request_id: u64, requester: AccountId,
        receiver: AccountId, amount: U128, path: String, proposal_id: u64 },
}
// PotEvent::Contribution { .. }.emit();  →  EVENT_JSON:{"standard":"pot","version":"1.0.0","event":"contribution","data":{…}}
```

## Gotchas & failure modes
- **Missing `proposal` on mainnet** → `missing field \`proposal\``. **Unknown arg** → `unknown field \`bogus\`, expected one of \`id\`, \`action\`, \`proposal\`, \`memo\``. **Mismatched kind** → `ERR_WRONG_KIND`. **Re-vote** → `ERR_PROPOSAL_NOT_READY_FOR_VOTE`. **Missing permission** → `ERR_PERMISSION_DENIED`. **Bond mismatch** → `ERR_MIN_BOND`. All ✅.
- **NEAR payouts from a NEAR-poor DAO fail the whole vote.** The transfer deposit is deducted inside `act_proposal`, so `LackBalanceForState` reverts the vote (✅). Only pay in USDC, and never pay out the DAO's NEAR float.
- **A payout failure is invisible to the Rulebot callback** (✅, §A.5). Reflect DAO status in the UI from the tx receipt tree (`wait_until: FINAL` covers the detached receipts) or from `get_proposal`.
- **A callback underfunded with static gas fails before doing anything** ("Exceeded the prepaid gas" in `on_added` at 30 Tgas when it attached 30 + 5). The proposal then exists with no vote. That's recoverable via `retry_approve`, but budget correctly.
- **`ft_transfer_call` with too little gas silently refunds** (25-30 Tgas → `result "0"`, no error). The UI must check the returned used amount or the `contribution` event, not just tx success.
- **Membership growth changes thresholds** of in-flight member votes (Sputnik comment). Over-cap requests created before a join may need one more approval.
- **Legacy testnet DAO vs mainnet DAO JSON** differ in `get_proposal.vote_counts` (numbers vs strings). Parse both.
- **Global contract publish cost** is easy to burn through on testnet: about 25 NEAR per 250 KB publish, and by-account re-publishes burn again.
- **Re-publishing a by-account global with an incompatible state layout bricks every child** until `migrate` (✅ "Cannot deserialize").
- **DAO-name collisions** on `sputnikv2.testnet` (5319 DAOs). Use suffixes and handle the `Err` callback.
- **`AddMemberToRole` with a wrong role name is a silent no-op.** If the role doesn't exist or isn't a `Group`, Sputnik only logs `ERR_ROLE_NOT_FOUND:<role>` / `ERR_ROLE_WRONG_KIND:<role>` (no panic), and the proposal still ends `Approved` (`policy.rs:290-320`, ✅ source). Hard-code `"member"` and assert membership after a join (`get_policy`).

## Costs, limits, latencies (measured vs documented)
| Item | Measured ✅ | Documented / plan |
|---|---|---|
| Auto-approved USDC spend (whole tree) | 16.6-17.0 Tgas burnt ≈ 0.0017 NEAR | plan: relayer 0.001-0.005 NEAR per action ✅ consistent |
| Auto-approved join | 11.6 Tgas | — |
| Contribution `ft_transfer_call` → forward | 10.1 Tgas burnt; ≥ 35 Tgas attached | — |
| DAO create, global factory | 15.0 Tgas, 0.0077 NEAR burnt + deposit (≥ 0.25 recommended) | plan: ≥ 0.01 NEAR ⚠️ |
| DAO create, legacy testnet factory | 88.5 Tgas, 0.0151 NEAR burnt + ≥ 5.39679 NEAR deposit | docs: 6 NEAR ✅ |
| Per-Pot child (global by account) | 0.0074 NEAR burnt; 193 B; 0 NEAR needed until 770 B | plan: ~0.1 NEAR ❌ |
| Global publish | 0.0001 NEAR/B (18.53 NEAR per 185 KB; 44.41 per 444 KB) | 📄 "10 NEAR per 100KB" ✅ |
| Deterministic `0s` account | 0.00705 NEAR burnt, 172 B, balance 0 | — |
| Proposal storage (bond 0) | ~0.0019-0.0022 NEAR each, paid by the DAO | — |
| 30-member close (DAO FunctionCall) | 61.5 Tgas burnt; the final vote needs ≥ 150 Tgas | — |
| Sandbox wall time per scenario | 4-80 s (t1 15 s, t2 81 s, t3-5 48 s) | — |

## Open questions / needs a human
- **Decide:** singleton Rulebot merged with pot-factory (recommended), or named per-Pot rulebots (≈ 25 NEAR per code publish)? This changes P-2's acceptance text and the relayer allowlist.
- **Decide:** testnet DAO source.
  - (a) `sputnikv2.testnet`: legacy, ≈ 6 NEAR per Pot locked, `act_proposal` without kind checks, factory can auto-update immediately;
  - (b) our own factory from Sputnik `main` on testnet: ≈ 51 NEAR once, then ≈ 0.25 NEAR per Pot, same code as mainnet.
  - → sputnik: does Trezu testnet show DAOs that weren't created by `sputnikv2.testnet`?
- → relayer: the allowlist must include the DAO accounts (`*.sputnikv2.testnet` `act_proposal` for member votes), `rulebot.pot-<team>.testnet` and `usdc`. Attach 300 Tgas on votes, 100-150 on `request_spend`/`join`, and 100 on `ft_transfer_call`. Note `meta-tx-relayer.md`'s `pot-factory` row assumes the old naming.
- → relayer: confirm mainnet USDC's `ft_transfer_call` gas split. Our ≥ 35 Tgas figure is for the near-contract-standards FT.
- → infra: Sputnik emits no NEP-297 events, so poll `get_proposals` / `get_proposal` per DAO (mainnet also has `get_actions_log`). Also needed: a DAO NEAR top-up job (proposal storage) and an alert on the Rulebot float.
- → product-ux: a payout can show "approved" and then turn "failed" (receiver not registered). Copy for "Retry payment"; the relayer should register receivers with USDC before proposing.
- Invite scheme: ed25519 keypair (front-run safe) vs plain secret hash (as in the plan). This is a P1 call on day 5.

## Sources
- https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/proposals.rs#L535-L700 : `add_proposal`, `#[deny_unknown_arguments] act_proposal`, `ERR_WRONG_KIND`, `ERR_MIN_BOND`, detached execution, Finalize: 2026-10-21
- https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/policy.rs : RoleKind, VotePolicy, `can_execute_action`, `proposal_status` threshold math: 2026-10-21
- https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/types.rs#L16 : `GAS_FOR_FT_TRANSFER` 10 Tgas: 2026-10-21
- https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/upgrade.rs#L113-L275 : 2-week auto-update gate, `upgrade_remote`: 2026-10-21
- https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao-factory2/src/factory_manager.rs#L8-L123 and `src/lib.rs#L172-L181` : global `store`, `create` (`MINIMAL_DEPOSIT` 0.01, 40/10 Tgas): 2026-10-21
- https://github.com/near-daos/sputnik-dao-contract/blob/7764926cfd3c47f62b5fcde231c251f3c3892887/sputnikdao2/src/proposals.rs#L486-L620 : legacy `act_proposal(id, action, memo)` (testnet build): 2026-10-21
- https://github.com/near/near-sdk-rs/blob/near-sdk-v5.29.1/near-sdk/src/promise.rs#L346-L590 and #L951-L968 : `#[must_use]` Promise, global-contract and `state_init` methods, `detach`, Serialize: 2026-10-21
- https://github.com/near/near-sdk-rs/blob/near-sdk-v5.29.1/near-sdk-macros/src/core_impl/code_generator/attr_sig_info.rs#L240-L305 : `#[callback_result]` (unit special case, `max_bytes`): 2026-10-21
- https://github.com/near/near-sdk-rs/blob/near-sdk-v5.29.1/near-sdk/src/lib.rs#L959-L1113 : `callback_result` and `event_json` docs: 2026-10-21
- https://github.com/near/near-sdk-rs/blob/near-sdk-v5.29.1/near-global-contracts/src/state_init.rs : NEP-616 `derive_account_id` (`0s` + keccak256[12..32]): 2026-10-21
- https://github.com/near/near-sdk-rs/blob/near-sdk-v5.29.1/near-contract-standards/src/fungible_token/core_impl.rs#L13-L153 : `ft_transfer_call` gas split (resolve 5 Tgas), resolve semantics: 2026-10-21
- https://github.com/near/near-sdk-rs/tree/near-sdk-v5.29.1/examples/factory-contract-global : official global factory example: 2026-10-21
- https://github.com/near/nearcore/blob/1441cd3ad4581109649e29609b87f874540b0a84/runtime/runtime/src/global_contracts.rs#L26-L60 : publish burns 0.0001 NEAR/B; use adds identifier bytes: 2026-10-21
- https://github.com/near/nearcore/blob/1441cd3ad4581109649e29609b87f874540b0a84/runtime/runtime/src/actions.rs#L501-L508 : delegate inner receipt `predecessor = sender`, `signer = relayer`: 2026-10-21
- https://github.com/near/nearcore/blob/1441cd3ad4581109649e29609b87f874540b0a84/runtime/runtime/src/verifier.rs#L25 : zero-balance limit 770 B: 2026-10-21
- https://github.com/near/nearcore/blob/1441cd3ad4581109649e29609b87f874540b0a84/runtime/runtime/src/lib.rs#L1355-L1395 and `core/primitives/src/fees.rs#L534` : account-creation charge from the signer refund; gas purchase price: 2026-10-21
- https://github.com/near/nearcore/tree/1441cd3ad4581109649e29609b87f874540b0a84/core/parameters/res/runtime_configs (`parameters.yaml#L300-L416`, `85.yaml`, `87.yaml`, `88.yaml`) and `core/primitives-core/src/version.rs#L160-L195` : limits, global costs, protocol features (DeterministicStateInit live since 82, UniversalAccounts 87, RemoveGasRewards 87, GlobalContractSameChunkCallFix 87): 2026-10-21
- RPC `EXPERIMENTAL_protocol_config` on testnet (`rpc.testnet.fastnear.com`) and mainnet (`rpc.mainnet.fastnear.com`), plus the sandbox: limits table: 2026-10-21
- https://github.com/near/NEPs/blob/master/README.md and neps/nep-0141.md, nep-0297.md, nep-0448.md, nep-0591.md, nep-0616.md : statuses (all Final) and specs: 2026-10-21
- https://docs.near.org/smart-contracts/global-contracts : costs, CLI (📄): 2026-10-21
- Sandbox spike (throwaway, session scratchpad `contracts/spike`, tests t1-t10 incl. the probe contract and near-contract-standards FT): every ✅ measurement above: 2026-10-21

## Review corrections (2026-10-21)

From the security review's fact check ([../plan/review-security.md](../plan/review-security.md) §4, F-16 and F-04a). The body above is unchanged; these notes win where they disagree.
- **§G "Sputnik-side trust" is wrong for the deployed builds.** A factory-pushed `update()` applies **immediately** on mainnet: the 2-week delay (`TWO_WEEKS_NS`, `upgrade.rs:113`) exists only on `main` HEAD `5434a59`, which no network runs. The deployed mainnet build `2b0f34a` and the testnet global code `278adc7` both apply `update()` from the factory at once (`upgrade.rs`: `predecessor == factory_id && auto_update` → deploy + migrate). So for Pot DAOs, whoever controls the hub's code or key before the lock can push DAO code at once; deleting the hub's key on Nov 12 removes that power (plan: contracts-spec INV-14, decisions D-13).
- **§F heading:** testnet moved to **protocol 88** (nearcore 2.14.0-rc.5) on 2026-10-21, between ≈ 08:00 and 14:00 UTC. Mainnet is still 86, so the toolchain pins stay; the limits in the table are unchanged.
