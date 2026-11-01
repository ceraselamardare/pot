# Sputnik DAO v2 (the core of every Pot)
> Owner: sputnik. Last verified: 2026-10-21. Legend: ✅ verified · 📄 docs-only · ⚠️ unverified/conflicting
> Spike evidence (tx links, logs, scripts): [../spikes/sputnik-rulebot/RESULTS.md](../spikes/sputnik-rulebot/RESULTS.md)

## TL;DR
- ✅ **Spike 1 passed. Design A works.** One `act_proposal VoteApprove` from the only member of a `rulebot` role (threshold 1/1) **approved and executed** a NEAR `Transfer`, an FT `Transfer` (`wrap.testnet`) and an `AddMemberToRole` in the same tx. No member votes were needed, and a member's `VoteReject` cast first did not block it. `proposal_bond: "0"` plus 0 attached deposit works. 1 yocto → `ERR_MIN_BOND` (`assert_eq`). Design B is unnecessary.
- ✅ **Two code generations are live.** `sputnikv2.testnet` (the official testnet factory; `sputnik-v2.testnet` is a different legacy factory) deploys DAO **v3.31 = commit `7764926` (Aug 2024)**. Its signature is `act_proposal(id, action, memo?)`, and an extra `proposal` arg is **ignored**.
  Mainnet `sputnik-dao.near` deploys **v3.2 = commit `2b0f34a`** as a global contract. Its signature is `act_proposal(id, action, proposal: ProposalKind, memo?)`: `proposal` is **required** and must equal the stored kind (`ERR_WRONG_KIND`), and unknown args are rejected. **`skip_execution` does not exist** in any version.
  **Always send `proposal`** (copy `kind` from `get_proposal`). That call works on both generations ✅.
- ✅ **Testnet creation through `sputnikv2.testnet` costs ≥ 5.40642 NEAR** (the factory deploys the full 539,647-byte wasm per DAO), not 0.01. The plan's 0.01 NEAR applies to mainnet only.
  A **testnet global contract `Ea8tHXFSQVszVwGASyzAfLq65DjcRDhkfab4FcPaRpgD`** (`sputnikdao2@278adc7`, mainnet-like API) gives a working DAO for **0.0121 NEAR** of storage via `use_global_contract` + `new` (tested). It just cannot go through `sputnikv2.testnet`.
- ✅ **Sputnik enforces no caps.** The rulebot's single vote approves **any** `transfer` proposal (including member-created ones) and **any** `AddMemberToRole` (any role name, including `rulebot`). Caps, budgets, payee rules and `role == "member"` must be enforced **in Rulebot code**, and the Rulebot should only vote on proposals it created in the same call chain.
- ✅ **With bond 0, the DAO pays for proposal storage from its own NEAR.** With no free balance, `add_proposal` fails `LackBalanceForState`. Expect ~0.003 NEAR per auto-approved spend (v3.31) or ~0.0042 NEAR (v3.2/278adc7), so keep a **≥ 0.5 NEAR float** per DAO and top it up.
- ✅ **Execution failure does not fail the tx.** `act_proposal` returns OK while the proposal ends `Failed` (FT receiver not registered, account missing) or `Expired`. Funds stay in the DAO. The only retry is `act_proposal Finalize`, which the plan's policy **does not grant**: add `transfer:Finalize` (rulebot) and `*:Finalize` (members).
- ✅ **The threshold is a strict majority of the current role size at vote time**: `floor(n/2)+1` for `[1,2]` (n=2 → 2, 3 → 2, 5 → 3, 6 → 4, 30 → 16). Members joining raise the bar for **in-flight** requests (tested 3 → 4). Only the voter's own roles are evaluated, so any single role reaching its threshold decides.
- ✅ 🚨 **An empty Group role plus `quorum "0"` plus a Finalize permission lets an unvoted proposal execute** (tested: `Finalize` → Approved and paid with `vote_counts {}`). Set `quorum: "1"` on every vote policy (tested: blocks it; rulebot auto-approve still works) and never leave a Group empty.
- ✅ **Expiry is lazy**: it is checked only on vote/Finalize. A vote after `proposal_period` returns OK but sets `Expired` with no execution. Shortening `proposal_period` retroactively expires in-flight proposals. There are no NEP-297 events; index by polling `get_last_proposal_id`/`get_proposals` (plus `get_actions_log` on v3.2/278adc7).
- ✅ **Trezu (prod) is mainnet-only.** A testnet "View in Trezu" button cannot work. See [trezu.md](trezu.md).

## Plan check
| Claim in the original plan | Status |
|---|---|
| Key Findings: "`MINIMAL_DEPOSIT` … 0.01 NEAR; `CREATE_CALL_GAS` 40 Tgas, `ON_CREATE_CALL_GAS` 10 Tgas; the whole deposit moves to the new DAO, which uses a global contract" | ✅ for `main` and the mainnet factory (`2b0f34a`). ❌ for testnet: `sputnikv2.testnet` runs the old factory (`7764926`), whose floor is `(code_len+32)·1e19` = **5.39679 NEAR**, and it deploys the full wasm (no global contract). The minimum that **worked was 5.40642 NEAR** (5.39679 → `LackBalanceForState`, refunded). 40/10 Tgas ✅ in both |
| "NEAR Docs show 6 NEAR on `sputnikv2.testnet`; README `--amount 10`, 'attached 5 NEAR'" | ✅ consistent with the old factory. The README's sample output is from `sputnik-v2.testnet` (a different, legacy factory) |
| "The deployed mainnet minimum is unverified" | ✅ now: floor 0.01 NEAR (source of the deployed `2b0f34a`: `ERR_NOT_ENOUGH_DEPOSIT:10000000000000000000000`) **plus the DAO's state storage**. Trezu creates with **0.09 NEAR**; a fresh Trezu DAO uses 2,252 B (0.0225 NEAR). A Pot policy needs ≈ 1.1-1.3 KB (⚠️ computed), so create with **≥ 0.05-0.1 NEAR** |
| "Proposal deposit must match proposal_bond exactly … ERR_MIN_BOND (default 0.1 NEAR)" | ✅ exact match (`assert_eq!`, tested with 1 yocto). ❌ default: the contract's `default_policy()` bond is **1 NEAR** (the docs' 0.1 is a UI convention). Irrelevant: Pot sets `"0"` |
| C3 "docs say `sputnikv2.testnet`, README output says `sputnik-v2.testnet`; confirm" | ✅ **Use `sputnikv2.testnet`** (factory API, 5,320 DAOs, default v[3,31]). `sputnik-v2.testnet` only exports `create/get_dao_list/new/on_create` (39 DAOs; Trezu uses it for omni e2e). Don't use it |
| C3 Spike 1 "rulebot role (1/1, `transfer:AddProposal`, `transfer:VoteApprove`), bond 0; one Rulebot vote executes a transfer" | ✅ Passed (NEAR + FT + AddMember). Go/no-go: **go with design A** |
| C6 policy "`member` `*:AddProposal`,`*:VoteApprove`,`*:VoteReject` majority; `rulebot` `transfer:AddProposal`,`transfer:VoteApprove`,`add_member_to_role:*` 1 of 1; bond 0" | ⚠️ Works, but harden it (R3): add `*:Finalize`/`transfer:Finalize`, `quorum "1"`, and an explicit `add_member_to_role:AddProposal` + `:VoteApprove` instead of `:*` (`*` also grants VoteRemove/RemoveProposal/Finalize) |
| C6 "Whether one role reaching threshold finalizes is the spike" | ✅ Yes, regardless of other roles ([policy.rs#L380-434](https://github.com/near-daos/sputnik-dao-contract/blob/2b0f34a3860460f285307ec2ccf36345acbe05a2/sputnikdao2/src/policy.rs#L380-L434)) |
| C6 "Read `proposals.rs` on day 1 for `act_proposal` arguments" | ✅ Done (R6): testnet factory DAOs take `(id, action, memo?)`; mainnet/278adc7 take `(id, action, proposal, memo?)` |
| C6 "pot-factory … `create_pot` -> Sputnik factory `create(name, args_base64)`" | ⚠️ Works on testnet at ≥ 5.41 NEAR per Pot, and the cross-contract `create` needs ~90 Tgas. Alternative: deploy each DAO yourself from the testnet global contract (≈0.012 NEAR + float; R1, R2). Decision needed |
| C6 Costs "Sputnik creation at least 0.01 NEAR … (docs examples 6 NEAR; test live)" | ❌ testnet **5.40642 NEAR** measured (or 0.0121 NEAR via the global contract). ✅ mainnet 0.01 floor plus ~0.013-0.025 state |
| C9 "Live creation deposit above 0.01 → 20 testnet NEAR float; mainnet 6 NEAR per Pot worst case" | ❌ 20 NEAR covers only **3 Pots** on `sputnikv2.testnet`. Mainnet worst case is ~0.1 NEAR (global contract), not 6 |
| C8 README "`near contract call-function as-read-only lisbon-trip.sputnikv2.testnet get_policy json-args {} network-config testnet now`" | ✅ The syntax works (tested on the spike DAO). `lisbon-trip` is **free today** on both `sputnikv2.testnet` and `sputnik-dao.near` (it can be squatted). Generic names (`demo`, `test`, `genesis`) are taken |
| C8 tests "near-workspaces-rs with the Sputnik wasm in `res/`" | ⚠️ The repo **no longer ships `res/*.wasm`** (removed in `fe699d3`, 2026-02-25). The only wasm left, root `sputnikdao2_original.wasm`, is the **v2.0** code (`8RMe…`). Pull the wasm you need from chain (R1) → contracts |
| P-3 "Rulebot … auto-approves `AddMemberToRole`" | ✅ one vote. Note it raises the threshold for open votes |
| P-6 "majority executes; declined shows 'Not approved'" | ✅ `Approved`/`Rejected` at a strict majority. A tie (3-3) stays `InProgress` until expiry. The requester's own approval is **not** automatic |
| P-11 / C1 "Every Pot is a real Sputnik DAO that opens in Trezu" | ❌ on testnet (Trezu prod reads mainnet only). ✅ mainnet DAOs from any factory open by account id. See [trezu.md](trezu.md) |

## Reference

### R1. Live deployments (RPC view calls, 2026-10-21) ✅
| | Testnet `sputnikv2.testnet` | Testnet global code `Ea8t…` | Mainnet `sputnik-dao.near` |
|---|---|---|---|
| Factory code | `77dkUJRCHKRxJxo6UtYgBtRP6hsEX2v4vXjmFuY7dktb` (808,766 B; no global-contract host fns; exports `store_contract_self`) | — (no factory; deploy it yourself) | `BXd5idTXSnC7WRfxHmi7z4crw2F5WXQJ6MZUEv8DfnnY` (198,307 B), NEP-330 `link …/tree/2b0f34a` |
| `get_default_code_hash` → version | `AA4nA45vauiac3jdVwJTzSdUP3oj2r1fDaPAb2mHdgcH` → `[3,31]`, commit `7764926` (2024-08-24, "handle argument gas cost increasing"; near-sdk 4.0.0-pre.4) | `Ea8tHXFSQVszVwGASyzAfLq65DjcRDhkfab4FcPaRpgD` (430,308 B), NEP-330 `rev=278adc7` (2025-04-07; near-sdk 5.x, actions log; no 2-week update delay) | `DtHZA1mUmGYeScEaUoUZYQGGFHSMpnjMCvkr5U9hJXuF` (444,088 B; deployed as a **global contract**) → `[3,2]`, commit `2b0f34a` (2026-02-25) |
| `get_number_daos` | 5,320 | n/a | 1,976 |
| DAO `version()` | `"2.3.1"` (crate version; **identical across generations**, so don't use it to tell them apart) | `"2.3.1"` | `"2.3.1"` |
| Owner | `sputnikv2.testnet` | — | `sputnik-dao.near` |
| Other stored versions | 2.0 `8RMe…`, 2.1 `8LN5…`, 3.0 `783v…`, 3.1 `49J3…`, 3.2 `12wL…`, 3.3 `xJQX…` | | 2.0, 2.1, 3.0 `2Zof…`, 3.1 `4zSo…` (`3d568f9`) |

- `main` HEAD is `5434a59` (2026-05-27). It adds a 2-week delay on factory auto-updates (`9e96c75`). Neither network runs it yet ✅.
- GitHub releases: only `2.0.0` (2022-02) and `3.0.0` (2022-05). Deployed code is tracked by factory metadata (commit id), not by releases ✅.
- The DAO namespace is **per factory**: `<name>.sputnikv2.testnet` and `<name>.sputnik-dao.near` are independent accounts. Check availability with `view_account` (`UNKNOWN_ACCOUNT` = free) ✅.
- Get wasm for sandboxes: the factory's `get_code({"code_hash":…})` (view) or RPC `view_global_contract_code {code_hash}` ✅.

### R2. Factory `create`
```
create(name: AccountId, args: Base64VecU8)   #[payable]
  args = base64( JSON {"config": Config, "policy": VersionedPolicy} )   // passed verbatim to DAO `new(config, policy)`
```
- **Account id**: `main` uses `current_account_id().sub_account(name).unwrap()`, i.e. `format!("{name}.{factory}")` parsed as an AccountId ([lib.rs#L72-88](https://github.com/near-daos/sputnik-dao-contract/blob/2b0f34a3860460f285307ec2ccf36345acbe05a2/sputnikdao-factory2/src/lib.rs#L72-L88)). The testnet factory does the same with `format!(…).parse().unwrap()` ([7764926 lib.rs#L100-118](https://github.com/near-daos/sputnik-dao-contract/blob/7764926cfd3c47f62b5fcde231c251f3c3892887/sputnikdao-factory2/src/lib.rs#L100-L118)). ✅ source.
  - `name` must deserialize as an AccountId: 2-64 chars, `[a-z0-9]`, separators `-`/`_`/`.` with no leading, trailing or doubled separators. The full id must be ≤ 64, so the slug is **≤ 46 chars on `sputnikv2.testnet`** and **≤ 47 on `sputnik-dao.near`**. Too long → the `unwrap()` panics and the tx fails (deposit auto-refunded).
  - A dotted name passes validation, but `CreateAccount` of a non-direct sub-account fails, so `on_create` refunds. ⚠️ (derived)
- **Deposit**:
  - `main`/mainnet ([factory_manager.rs#L76-122](https://github.com/near-daos/sputnik-dao-contract/blob/2b0f34a3860460f285307ec2ccf36345acbe05a2/sputnikdao-factory2/src/factory_manager.rs#L76-L122)) requires `attached ≥ MINIMAL_DEPOSIT = 0.01 NEAR`, else `ERR_NOT_ENOUGH_DEPOSIT:10000000000000000000000`.
  - Testnet ([7764926 factory_manager.rs#L106-113](https://github.com/near-daos/sputnik-dao-contract/blob/7764926cfd3c47f62b5fcde231c251f3c3892887/sputnikdao-factory2/src/factory_manager.rs#L106-L113)) requires `attached ≥ (code_len+32)·storage_byte_cost`, i.e. `ERR_NOT_ENOUGH_DEPOSIT:5396790000000000000000000` ✅ tested.
  - In both, the **entire** deposit is transferred to the new DAO in one batch: `CreateAccount` + `Transfer(deposit)` + `DeployContract(code)` (testnet) or `UseGlobalContract(hash)` (mainnet) + `FunctionCall new(args, 0, 40 Tgas)`. Then `.then(factory.on_create(account_id, attached_deposit, predecessor_account_id), 10 Tgas)`.
- **Failure and refund** ✅ tested: if any batch action fails (e.g. `new` → `LackBalanceForState`, name taken, bad policy JSON), the batch is reverted and `on_create` returns `false` and `Promise::transfer(attached_deposit)` to the caller. On success it returns `true` and inserts the DAO into `daos`.
  The **tx status reflects `new`, not `on_create`** (`create` returns the batch promise). A Pot factory must check its own callback, or check `view_account(dao)` afterwards.
- **Gas** ✅: testnet create burns **89.1 Tgas** (attach 150-300). Mainnet ≈ **16.2 Tgas** (Trezu creation tx `3xUd3J2n…`).
- **Who owns the DAO afterwards**: the DAO has **no access keys**. `new` stores `FactoryInfo{factory_id: predecessor, auto_update: true}`, so the **factory owner can push code updates**.
  On `7764926`/`278adc7`/`2b0f34a` these apply immediately ([2b0f34a upgrade.rs `update()`](https://github.com/near-daos/sputnik-dao-contract/blob/2b0f34a3860460f285307ec2ccf36345acbe05a2/sputnikdao2/src/upgrade.rs)). Opt out with a `FactoryInfoUpdate` proposal ✅ source.
- **Views**: `get_dao_list()` (all; 185 KB JSON on testnet), `get_daos(from_index: u64, limit: u64)` (insertion order, newest last), `get_number_daos()`, `get_default_code_hash()`, `get_default_version() -> [u8;2]`, `get_contracts_metadata() -> [[hash, {version, commit_id, changelog_url}]]`, `get_owner()`, `get_code({code_hash})` (raw bytes) ✅ live.

### R3. Policy schema ✅ source ([policy.rs](https://github.com/near-daos/sputnik-dao-contract/blob/2b0f34a3860460f285307ec2ccf36345acbe05a2/sputnikdao2/src/policy.rs)); v3.2/278adc7 use `deny_unknown_fields`
```jsonc
// Policy (VersionedPolicy is untagged: a JSON *array* of accounts = Default(council) → upgraded to default_policy(); an *object* = Current)
{
  "roles": [ RolePermission ],
  "default_vote_policy": VotePolicy,
  "proposal_bond": "0",                     // yocto string; add_proposal deposit must EQUAL it
  "proposal_period": "604800000000000",     // ns (7 days)
  "bounty_bond": "0",                       // yocto; unused by Pot
  "bounty_forgiveness_period": "86400000000000"
}
// RolePermission
{ "name": "member",
  "kind": "Everyone" | {"Member": "1"} /*U128 min delegated weight*/ | {"Group": ["a.testnet", "b.testnet"]},
  "permissions": ["<label>:<Action>", ...],   // HashSet: order not preserved in views
  "vote_policy": { "<label>": VotePolicy } }  // per-kind override, else default_vote_policy
// VotePolicy
{ "weight_kind": "RoleWeight" | "TokenWeight", "quorum": "1", "threshold": [1, 2] /*ratio*/ | "2" /*absolute weight, string*/ }
// Config (DAO `new` + ChangeConfig)
{ "name": "Lisbon Trip", "purpose": "…", "metadata": "" }   // metadata = base64 bytes; Trezu expects "" or base64(JSON object), see trezu.md
```
- **Proposal-kind labels** (the left side of permissions and the `vote_policy` keys; [proposals.rs#L125-147](https://github.com/near-daos/sputnik-dao-contract/blob/2b0f34a3860460f285307ec2ccf36345acbe05a2/sputnikdao2/src/proposals.rs#L125-L147)):
  `config`, `policy`, `add_member_to_role`, `remove_member_from_role`, `call` (FunctionCall), `upgrade_self`, `upgrade_remote`, `transfer`, `set_vote_token` (SetStakingContract), `add_bounty`, `bounty_done`, `vote`, `factory_info_update`, `policy_add_or_update_role`, `policy_remove_role`, `policy_update_default_vote_policy`, `policy_update_parameters`.
  The `ChangePolicy*` shortcuts have their **own labels**, which `policy:*` does not cover.
- **Actions** ([types.rs#L47-63](https://github.com/near-daos/sputnik-dao-contract/blob/2b0f34a3860460f285307ec2ccf36345acbe05a2/sputnikdao2/src/types.rs#L47-L63)): `AddProposal`, `RemoveProposal` (immediate delete), `VoteApprove`, `VoteReject`, `VoteRemove` (spam: delete, bond kept), `Finalize`, `MoveToHub` (no-op).
- **Wildcards** ([policy.rs#L335-359](https://github.com/near-daos/sputnik-dao-contract/blob/2b0f34a3860460f285307ec2ccf36345acbe05a2/sputnikdao2/src/policy.rs#L335-L359)): a permission matches if the role has `label:Action`, `label:*`, `*:Action` or `*:*`. Nothing else, e.g. no `policy*`.
  A user may be in several roles. Their vote is **added to every role of theirs that grants the action**, and status is evaluated only over those roles. **Never put the Rulebot account in `member`**, or its vote also counts toward the majority.
- **Pot policy (recommended, hardened, ✅ tested on testnet DAO `g1.potspike-dao-svuw.testnet`)**:
```json
{
  "roles": [
    { "name": "member", "kind": { "Group": ["maya.testnet", "leo.testnet", "priya.testnet"] },
      "permissions": ["*:AddProposal", "*:VoteApprove", "*:VoteReject", "*:Finalize"], "vote_policy": {} },
    { "name": "rulebot", "kind": { "Group": ["lisbon-trip.rulebot.pot-team.testnet"] },
      "permissions": ["transfer:AddProposal", "transfer:VoteApprove", "transfer:Finalize",
                      "add_member_to_role:AddProposal", "add_member_to_role:VoteApprove"],
      "vote_policy": {
        "transfer":           { "weight_kind": "RoleWeight", "quorum": "1", "threshold": [1, 1] },
        "add_member_to_role": { "weight_kind": "RoleWeight", "quorum": "1", "threshold": [1, 1] } } }
  ],
  "default_vote_policy": { "weight_kind": "RoleWeight", "quorum": "1", "threshold": [1, 2] },
  "proposal_bond": "0", "proposal_period": "604800000000000",
  "bounty_bond": "0", "bounty_forgiveness_period": "86400000000000"
}
```
  - Creator-only Pot (1 member): the member threshold is `max(1, floor(1/2)+1) = 1`, so the creator approves alone ✅ (math).
  - Optional: `"*:VoteRemove"` for members lets them delete spam and free storage. Not needed for the MVP.

### R4. Proposal kinds Pot uses: exact JSON (✅ = used live in the spike)
```jsonc
// add_proposal args: {"proposal": {"description": "<string, no length limit>", "kind": <KIND>}}
{"Transfer": {"token_id": "", "receiver_id": "leo.testnet", "amount": "84000000"}}   // ✅ "" = NEAR (no msg allowed: ERR_BASE_TOKEN_NO_MSG)
{"Transfer": {"token_id": "usdc.pot.testnet", "receiver_id": "leo.testnet", "amount": "84000000", "msg": null}}  // ✅ FT → ft_transfer(receiver, amount, memo=description), 1 yocto
// "msg": "<string>" → ft_transfer_call instead (see R8 gas caveat). "msg" omitted == null.
{"AddMemberToRole": {"member_id": "newbie.testnet", "role": "member"}}               // ✅
{"RemoveMemberFromRole": {"member_id": "leo.testnet", "role": "member"}}             // 📄 same shape
{"FunctionCall": {"receiver_id": "x.testnet", "actions": [
   {"method_name": "ft_transfer", "args": "<base64 JSON>", "deposit": "1", "gas": "10000000000000"}]}}  // ✅ parsed (perm-denied for rulebot); strings for deposit/gas
{"ChangePolicy": {"policy": <Policy object>}}                                         // ✅ must be an object (Current) else ERR_INVALID_POLICY
{"ChangePolicyAddOrUpdateRole": {"role": <RolePermission>}}                           // ✅ replaces the whole role incl. its Group list
{"ChangePolicyRemoveRole": {"role": "organizers"}}                                    // ✅
{"ChangePolicyUpdateParameters": {"parameters": {"proposal_period": "120000000000"}}} // ✅ all 4 fields optional: proposal_bond, proposal_period, bounty_bond, bounty_forgiveness_period
{"ChangeConfig": {"config": {"name": "…", "purpose": "…", "metadata": ""}}}           // 📄
{"FactoryInfoUpdate": {"factory_info": {"factory_id": "sputnikv2.testnet", "auto_update": false}}}  // 📄 opt out of factory upgrades
"Vote"                                                                                // ✅ signalling poll (unit variant = bare string)
```
- `AddMemberToRole` with a **non-existent role** or a non-Group role does not panic: it logs `ERR_ROLE_NOT_FOUND:<role>` / `ERR_ROLE_WRONG_KIND:<role>`, and the proposal is still `Approved` (a silent no-op) ✅ source ([policy.rs#L292-305](https://github.com/near-daos/sputnik-dao-contract/blob/2b0f34a3860460f285307ec2ccf36345acbe05a2/sputnikdao2/src/policy.rs#L292-L305)). Adding an existing member is a no-op (HashSet).

### R5. `add_proposal(proposal: ProposalInput) -> u64` `#[payable]` ✅
([2b0f34a proposals.rs#L535-589](https://github.com/near-daos/sputnik-dao-contract/blob/2b0f34a3860460f285307ec2ccf36345acbe05a2/sputnikdao2/src/proposals.rs#L535-L589); [7764926 #L486-536](https://github.com/near-daos/sputnik-dao-contract/blob/7764926cfd3c47f62b5fcde231c251f3c3892887/sputnikdao2/src/proposals.rs#L486-L536))
1. `assert_eq!(attached_deposit, policy.proposal_bond, "ERR_MIN_BOND")` checks **equality**.
   - v3.31 message: `panicked at 'assertion failed: \`(left == right)\`\n  left: \`1\`,\n right: \`0\`: ERR_MIN_BOND', sputnikdao2/src/proposals.rs:491:9`.
   - v3.2 (Rust 1.86): `assertion \`left == right\` failed: ERR_MIN_BOND …`. Match on the substring `ERR_MIN_BOND`.
2. Validation: `ChangePolicy` must be `Current` (`ERR_INVALID_POLICY`); `Transfer{token_id:"", msg:Some}` → `ERR_BASE_TOKEN_NO_MSG`; `SetStakingContract` once only.
3. Permission `can_execute_action(caller, kind, AddProposal)` → `ERR_PERMISSION_DENIED`.
4. id = `last_proposal_id`, then `+= 1`. **Returns a u64 JSON number** (`0`, `1`, …). `locked_amount += deposit`.
   **No description length limit.** The caps are protocol-level (args ≤ 4 MiB, tx ≤ 1.5 MiB), so cap it in Rulebot/relayer.
- Gas: 2.1 Tgas burnt in the DAO, 2.5-2.8 Tgas total. **3 Tgas prepaid is enough** ✅.

### R6. `act_proposal`: exact signatures
| Code | Signature | Notes |
|---|---|---|
| v3.31 (`sputnikv2.testnet` DAOs) | `act_proposal(id: u64, action: Action, memo: Option<String>)` ([#L540](https://github.com/near-daos/sputnik-dao-contract/blob/7764926cfd3c47f62b5fcde231c251f3c3892887/sputnikdao2/src/proposals.rs#L540)) | Unknown args are **ignored** (✅ tested with `proposal` + `memo`). No kind check |
| 278adc7 (testnet global `Ea8t…`) and v3.2 (mainnet) | `#[deny_unknown_arguments] act_proposal(id: u64, action: Action, proposal: ProposalKind, memo: Option<String>)` ([2b0f34a #L593-696](https://github.com/near-daos/sputnik-dao-contract/blob/2b0f34a3860460f285307ec2ccf36345acbe05a2/sputnikdao2/src/proposals.rs#L593-L696); ABI in [spike abi/](../spikes/sputnik-rulebot/abi/sputnikdao2-v3.2-2b0f34a.mainnet.abi.json)) | Missing `proposal` or any extra arg → `Smart contract panicked: Failed to deserialize input from JSON.` ✅. Kind ≠ stored kind (structural `==`; HashSet order irrelevant; `msg` absent ≡ null) → `ERR_WRONG_KIND` ✅ |

- **Portable call (✅ both)**: `{"id": 7, "action": "VoteApprove", "proposal": <kind exactly as proposed or as returned by get_proposal>, "memo": "optional, logged as 'Memo: …'"}`.
- Order of checks (v3.2): load (`ERR_NO_PROPOSAL`) → log action → permission (`ERR_PERMISSION_DENIED`) → kind (`ERR_WRONG_KIND`) → by action:
  - `AddProposal` → `ERR_WRONG_ACTION`.
  - `RemoveProposal` → delete.
  - `Vote*` requires `InProgress` (`ERR_PROPOSAL_NOT_READY_FOR_VOTE`), then `update_votes` (`ERR_ALREADY_VOTED` on a second vote by the same account), then a status recompute.
  - `Finalize` (see R7).
  - `MoveToHub` → no-op.
- The vote result is **not** returned. On `Approved`, execution is a detached promise. **The tx succeeds even if the payout fails**, so re-read `get_proposal(id).status`.

### R7. Status computation and threshold math ✅ source + spike
`proposal_status(proposal, roles, total_supply)` ([policy.rs#L380-434](https://github.com/near-daos/sputnik-dao-contract/blob/2b0f34a3860460f285307ec2ccf36345acbe05a2/sputnikdao2/src/policy.rs#L380-L434)), identical in v3.31:
1. Assert the status is `InProgress|Failed`, else `ERR_PROPOSAL_NOT_IN_PROGRESS`.
2. If `submission_time + proposal_period < block_timestamp` → **`Expired`** (checked first).
3. For each role in `roles`: on a vote, `roles` is **only the voter's roles that grant this action**; on `Finalize` it is **all roles**. The steps per role:
   - `Everyone` is skipped.
   - `total = group.len()` for a RoleWeight Group, else the delegated `total_supply`.
   - `threshold = max(quorum, to_weight(total))`.
   - If `approve ≥ threshold` → `Approved`, else if `reject ≥ threshold` → `Rejected`, else if `remove ≥ threshold` → `Removed`. Otherwise go to the next role.
4. Otherwise the status is unchanged.

`to_weight` ([#L98-106](https://github.com/near-daos/sputnik-dao-contract/blob/2b0f34a3860460f285307ec2ccf36345acbe05a2/sputnikdao2/src/policy.rs#L98-L106)) is `Weight(w) → min(w, total)` and `Ratio(n,d) → min(n·total/d + 1, total)` (integer division).

| Members (RoleWeight, `[1,2]`) | 1 | 2 | 3 | 4 | 5 | 6 | 30 |
|---|---|---|---|---|---|---|---|
| Approvals (or rejections) needed | 1 | **2 (both)** | 2 | 3 | 3 | 4 | 16 |

- The rulebot role (1 member) needs 1 with `[1,1]` (`min(2,1)`), `[1,2]` or `"1"`. **If a 2nd account enters the rulebot role, `[1,1]` needs 2**, while `"1"` lets either approve alone.
- **A single role reaching its threshold decides**, regardless of other roles' votes ✅ (test e: member Reject, then rulebot Approve → Approved).
- `total` is the role size **at evaluation time**, so in-flight thresholds move as members join or leave ✅ (test h: 3 → 4). Ties never resolve; they expire.
- **Finalize** ([#L665-685](https://github.com/near-daos/sputnik-dao-contract/blob/2b0f34a3860460f285307ec2ccf36345acbe05a2/sputnikdao2/src/proposals.rs#L665-L685)) recomputes over all roles:
  - `Approved` → execute (again). This is the **retry path for `Failed`** ✅ (test b5).
  - `Expired` → reject and return the bond ✅ (test x4).
  - Anything else → `ERR_PROPOSAL_NOT_EXPIRED_OR_FAILED`.
  - 🚨 A role with `total = 0` (empty Group, or `Member`/`TokenWeight` with no delegation) and `quorum 0` has threshold 0, so `Finalize` approves **any** InProgress proposal with zero votes ✅ (test j). `quorum: "1"` blocks it ✅ (spike 1b).
- **Expiry** ✅ (tests x*): a `Vote*` after the period stores the vote **and** status `Expired`, the tx is OK and nothing executes. Then `Finalize` → `ERR_PROPOSAL_NOT_IN_PROGRESS`. `proposal_period` is read from the **current** policy, so shortening it expires older open proposals at once.

### R8. Execution, callback, failure, retry ✅
`internal_execute_proposal` ([#L352-471](https://github.com/near-daos/sputnik-dao-contract/blob/2b0f34a3860460f285307ec2ccf36345acbe05a2/sputnikdao2/src/proposals.rs#L352-L471)):
- **Transfer (NEAR)**: `Promise::transfer(amount)`.
- **Transfer (FT, msg None)**: `ft_transfer(receiver_id, amount, memo=Some(description))` with **1 yocto** and static gas `GAS_FOR_FT_TRANSFER = 10 Tgas`.
- **Transfer (FT, msg Some)**: `ft_transfer_call(receiver_id, amount, memo, msg)` with the same 1 yocto and 10 Tgas.
- Every promise is followed by `.then(self.on_proposal_callback(proposal_id), 10 Tgas)`.
- Policy, membership and config kinds are synchronous state changes, followed by a 0-NEAR "bond return" transfer to the proposer.

Status flow: the vote stores `Approved` immediately. The callback then:
- re-confirms `Approved` and returns the bond, if the promise succeeded;
- otherwise sets **`Failed`** ([#L473-498](https://github.com/near-daos/sputnik-dao-contract/blob/2b0f34a3860460f285307ec2ccf36345acbe05a2/sputnikdao2/src/proposals.rs#L473-L498)).

| Case | Result (tested) |
|---|---|
| FT `ft_transfer` to an unregistered receiver | `The account X is not registered`. 1 yocto refunded, **Failed**, tokens stay in the DAO. Register, then `Finalize` → Approved + paid ✅ |
| NEAR to a non-existent named account | `AccountDoesNotExist`, refund to the DAO, **Failed** ✅ |
| `msg` set, v3.31 | the token gets only 10 Tgas → panic (`attempt to subtract with overflow` in near-contract-standards 3.1.0), **Failed** ✅ |
| `msg` set, 278adc7/v3.2 (gas weight 1 passes the remaining gas) | `ft_transfer_call` runs. If the receiver has no `ft_on_transfer` or refunds, the token logs `Refund …`, returns `"0"`, and the proposal is **Approved although nothing was delivered** ✅. Worked with 100 Tgas on `act_proposal` (12.6 burnt); the minimum was not measured |
| Failed and not retried within `proposal_period` | Finalize → `Expired` ✅ |

There is no other retry path: re-voting a `Failed` proposal → `ERR_PROPOSAL_NOT_READY_FOR_VOTE` ✅.

### R9. Storage and bonds ✅
- With bond 0, the proposer attaches nothing, and **the DAO account's own balance pays every byte**: proposals, votes, policy growth, and the 20-entry action logs on v3.2/278adc7.
  Proposals are never deleted except by `RemoveProposal`/`VoteRemove`. Testing at zero float: `LackBalanceForState {account_id: <dao>, amount: "2270000000000000000000"}`.
- Measured bytes:

| Item | v3.31 (`sputnikv2.testnet`) | 278adc7 / v3.2 |
|---|---|---|
| Transfer proposal | 194 B (desc 30 chars) ≈ `101 + len(desc) + len(proposer) + len(receiver) + len(token_id)` | 261 B (desc 32 chars) |
| First vote of a role | +97 B | +159 B |
| Each extra vote | +(5 + len(account id)) B | ≈ +(5 + len) + 62 B while the log fills |
| Auto-approved spend | ≈ 0.0029 NEAR | ≈ 0.0042 NEAR |

- **Float**: keep **≥ 0.5 NEAR** per DAO on testnet (~120-170 requests). Alert or top up when `get_available_amount` < 0.1 NEAR. On mainnet, start at 0.1-0.25 NEAR.
  A NEAR `Transfer` proposal can spend the float. Pot holds USDC, so the Rulebot must never propose NEAR transfers.
- `get_available_amount() = balance − storage·1e19 − locked_amount` (bonds) ✅.

### R10. Views and response shapes ✅ live
```jsonc
get_config()            → {"name":"potspike-dao-svuw","purpose":"…","metadata":""}
get_policy()            → Policy (R3); HashSet/HashMap order is arbitrary
get_last_proposal_id()  → 22                         // = number of ids ever issued (next id)
get_proposal({"id":0})  → ProposalOutput             // panics ERR_NO_PROPOSAL if removed/unknown
get_proposals({"from_index":0,"limit":50}) → [ProposalOutput]   // ids from_index..min(last, from+limit); removed ids skipped (page can be short)
get_available_amount()  → "219569999999999999999995"   get_locked_storage_amount() → "5406420000000000000000000"
get_factory_info()      → {"factory_id":"sputnikv2.testnet","auto_update":true}
get_actions_log()       → [{"account_id","proposal_id":"0","action":"VoteApprove","block_height":"274092676"}]   // 278adc7/v3.2 only, last 20
// ProposalOutput v3.31:
{"id":0,"proposer":"rulebot…","description":"…","kind":{"Transfer":{"token_id":"","receiver_id":"…","amount":"10000000000000000000000","msg":null}},
 "status":"Approved","vote_counts":{"rulebot":[1,0,0]},"votes":{"rulebot…":"Approve"},"submission_time":"1792582330862957254"}
// ProposalOutput 278adc7/v3.2: vote_counts values are STRINGS ["1","0","0"], plus "last_actions_log":[{"block_height":"274092626"}]
```
- `status` ∈ `InProgress | Approved | Rejected | Removed | Expired | Moved | Failed`. `votes` values ∈ `Approve | Reject | Remove`. `submission_time` is in ns (string).
- **Parse `vote_counts` as `number | string`** to support both generations.
- Expiry is lazy on chain, so derive it in the UI: `InProgress` with `submission_time + proposal_period < now` → show "Expired". Trezu does exactly this (`getProposalStatus`: Approved → "Executed") ✅ source.

### R11. Logs, events, indexing ✅ source/live
- **No NEP-297 `EVENT_JSON` in Sputnik.** Plain logs only:
  - `Memo: <memo>` (act_proposal)
  - `Updating existing role in the policy:<role>` / `Adding new role to the policy:<role>`
  - `Successfully updated the policy parameters.` / `…default vote policy.`
  - `ERR_ROLE_NOT_FOUND:<role>`, `ERR_ROLE_WRONG_KIND:<role>` (logs, not panics)
  - `Contract state version: V2` (on `new`)
- The FT contract logs `Transfer <amt> from <dao> to <recv>` and `Memo: <description>`. Refunds log `Refund …`.
- Feed strategy: poll `get_last_proposal_id` and fetch the new/updated ids with `get_proposal`/`get_proposals`. On 278adc7/v3.2, `get_actions_log` (last 20 actions DAO-wide) is a cheap change detector. Tx hashes come from an account tx API (→ infra).

## Snippets
Tested (near-cli-rs 0.30.1, testnet; the spike signed offline, see [env.sh](../spikes/sputnik-rulebot/env.sh)):
```bash
# create via the official testnet factory (5.40642 NEAR minimum for the spike policy; attach ~5.5 + float)
ARGS=$(jq -c '{config:{name:"Lisbon Trip",purpose:"Pot",metadata:""}, policy:.}' policy.json | base64 | tr -d '\n')
near contract call-function as-transaction sputnikv2.testnet create json-args "{\"name\":\"lisbon-trip-x7k2\",\"args\":\"$ARGS\"}" \
  prepaid-gas '300 Tgas' attached-deposit '5.5 NEAR' sign-as $SPONSOR network-config testnet sign-with-legacy-keychain send
# OR cheap: own account + testnet global contract (account must be created first, ~0.1 NEAR incl. float)
near contract deploy $DAO use-global-hash Ea8tHXFSQVszVwGASyzAfLq65DjcRDhkfab4FcPaRpgD with-init-call new \
  json-args "$(jq -c '{config:{name:"Lisbon Trip",purpose:"Pot",metadata:""}, policy:.}' policy-hardened.json)" \
  prepaid-gas '100 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-legacy-keychain send
# propose (bond 0 → attach exactly 0) and auto-approve (portable args: always pass `proposal`)
K='{"Transfer":{"token_id":"usdc.pot.testnet","receiver_id":"leo.testnet","amount":"84000000","msg":null}}'
near contract call-function as-transaction $DAO add_proposal json-args "{\"proposal\":{\"description\":\"Groceries\",\"kind\":$K}}" \
  prepaid-gas '10 Tgas' attached-deposit '0 NEAR' sign-as $RULEBOT network-config testnet sign-with-legacy-keychain send   # → 7
near contract call-function as-transaction $DAO act_proposal json-args "{\"id\":7,\"action\":\"VoteApprove\",\"proposal\":$K}" \
  prepaid-gas '50 Tgas' attached-deposit '0 NEAR' sign-as $RULEBOT network-config testnet sign-with-legacy-keychain send
near contract call-function as-read-only $DAO get_proposal json-args '{"id":7}' network-config testnet now   # status must be "Approved"
```
Rulebot-side interface (⚠️ not compiled; shapes ✅ from the ABI and live calls; → contracts owns the real code):
```rust
#[ext_contract(ext_sputnik)]
pub trait Sputnik {
    fn add_proposal(&mut self, proposal: ProposalInput) -> u64;                 // attach exactly policy.proposal_bond (0)
    fn act_proposal(&mut self, id: u64, action: Action, proposal: ProposalKind, memo: Option<String>); // ignored extra on v3.31
    fn get_proposal(&self, id: u64) -> ProposalOutput;
    fn get_policy(&self) -> Policy;
}
// Gas plan (measured): add_proposal 10 Tgas; act_proposal VoteApprove+ft_transfer 50 Tgas (min ~23-26 on v3.31);
// with msg (ft_transfer_call) on v3.2: ≥100 Tgas. Never use msg on v3.31.
```

## Gotchas & failure modes
1. **Two APIs.** `sputnikv2.testnet` DAOs (v3.31) differ from mainnet (v3.2):
   - `act_proposal` args;
   - `vote_counts` as numbers vs strings;
   - no `last_actions_log`/`get_actions_log`;
   - static 10 Tgas FT calls (msg is impossible);
   - panic text format: `panicked at 'MSG', file:line` vs `panicked at file:line: MSG`.
   Match on `ERR_*` substrings ✅.
2. **Success ≠ paid.** `act_proposal` tx OK can mean `Approved`, `Failed` (payout failed), `Expired`, or (msg) Approved but refunded. Always read `get_proposal(id).status`, and for FT check `storage_balance_of(receiver)` **before** proposing (`ft_transfer` needs a registered receiver) ✅.
3. **No Finalize, no retry.** The plan's policy leaves Failed payouts stuck until they expire ✅. Use the R3 policy.
4. **The Rulebot is an unlimited spender.** Its one vote approves any transfer, including member-created ones and after member rejects ✅. It can also add **any** account to **any** role (e.g. a 2nd `rulebot`, or itself into `member`).
   Rulebot code must: (a) vote only on ids it just created; (b) whitelist kinds `Transfer` and `AddMemberToRole{role:"member"}`; (c) enforce caps and budgets; (d) never propose NEAR transfers.
5. **Race:** between the Rulebot's `add_proposal` and its `act_proposal`, members can vote. If rejects reach the majority first, the rulebot vote fails `ERR_PROPOSAL_NOT_READY_FOR_VOTE`. Handle it in the callback (⚠️ theoretical; ~1-2 blocks).
6. **The empty-role Finalize bypass** (R7) ✅. Keep `quorum ≥ 1`, never create empty Groups (e.g. "organizers" with 0 people in a rules editor), and don't use `Member(U128)`/TokenWeight roles.
7. **Thresholds move**: joins raise the bar for open requests ✅. A 2-member Pot needs both. The requester's approval is not implicit: the app should send the requester's `VoteApprove` right after an over-cap request (→ product-ux, web).
8. **Prepaid gas is reserved up front**: a 0.1 NEAR account cannot sign a 100 Tgas call (`NotEnoughBalance`) ✅. The relayer pays this in meta-txs.
9. **The DAO float is spendable and griefable**: bond 0 means any member can spam `add_proposal` with huge descriptions, and each byte costs the DAO. Rate-limit and cap args in the relayer (→ relayer).
10. **Factory auto-update**: the factory owner (`sputnikv2.testnet`, `sputnik-dao.near`, or our own factory for global-contract DAOs) can replace DAO code immediately ✅ source. Disclose it, or vote `FactoryInfoUpdate{auto_update:false}`.
11. **RPC quirks**:
    - Panics from `assert_eq!` contain raw newlines, so the RPC JSON has **unescaped control characters** and strict parsers (`jq`, `JSON.parse`) fail. Sanitize before parsing ✅.
    - `rpc.testnet.near.org` intermittently returns `-429` with "THIS ENDPOINT IS DEPRECATED" (→ infra).
    - near-cli-rs's built-in RPC rate-limits. Offline signing with explicit `--nonce/--block-hash` avoids it.
12. **`version()` is useless** for detection (`"2.3.1"` everywhere). Use `view_account.global_contract_hash`/`code_hash`, or probe `get_actions_log` ✅.

## Costs, limits, latencies (✅ measured on testnet unless noted)
| Item | Value |
|---|---|
| DAO creation via `sputnikv2.testnet` | **5.40642 NEAR** locked (540,642 B) + 0.015 NEAR gas (89.1 Tgas). Failed attempts cost 0.0012-0.0089 NEAR |
| DAO via the testnet global contract `Ea8t…` | **0.0121 NEAR** storage (1,210 B incl. 1 key) + 3.1 Tgas (deploy + `new`) |
| Mainnet creation | floor 0.01 NEAR; Trezu attaches 0.09; fresh Trezu DAO 2,252 B; 16.2 Tgas (live mainnet tx, read-only) |
| `add_proposal` | 2.5-2.8 Tgas total (≈0.00025 NEAR); prepaid ≥ 3 Tgas |
| Auto-approve (rulebot) | NEAR 6.5-7.1 Tgas · FT 8.8 Tgas (prepaid needed: >22, ≤26 Tgas on v3.31) · AddMember 3.8 Tgas · FT with msg on 278adc7 12.6 Tgas (100 attached) |
| Member vote (no execution) | 2.8-3.0 Tgas; final vote executing a policy change 3.9 Tgas |
| Proposal storage | ≈0.003 NEAR (v3.31) / ≈0.0042 NEAR (v3.2) per auto-approved spend |
| Protocol 87 limits | storage 1e19 yocto/B; max prepaid gas 1,000 Tgas; tx ≤ 1,572,864 B; args ≤ 4 MiB; gas price 1e8 yocto/gas (0.0001 NEAR/Tgas) |
| Latency | `send_tx` `wait_until: EXECUTED_OPTIMISTIC`: `add_proposal` **1.8 s**, `act_proposal` + NEAR payout + callback **3.6 s** (1 sample each, g1 DAO, txs `HCqxBum4…`, `B4h5Pam…`). The full Rulebot chain in one tx (request → add → callback → act → payout → callback) is ⚠️ ≈ 4-7 s (estimate) |
| Whole spike | 113 logged txs, ≈0.062 NEAR gas |

## Open questions / needs a human
- **Decision (contracts + lead): testnet DAO deployment path.**
  - (A) `sputnikv2.testnet` `create`: canonical `<slug>.sputnikv2.testnet` ids, listed in the factory, ~5.45 NEAR plus float per Pot (the relayer needs ~6 NEAR per demo Pot), v3.31 API.
  - (B) Pot's own factory deploying the testnet global contract `Ea8t…` as `<slug>.<pot-factory>.testnet`: ~0.012 NEAR plus float, mainnet-like API (`proposal` required, string `vote_counts`, actions log), and it matches the mainnet clip.
  I lean **B**. Trezu can't show testnet either way. → contracts, infra.
- **Human: testnet NEAR budget.** Path A needs ≥ 6 NEAR per Pot (judges creating Pots × 6 NEAR). Faucet accounts give 10 NEAR each. → relayer (`accounts-onboarding.md`).
- **Human: demo names.** `lisbon-trip` is free on both factories today. Reserving it before Nov 1 would mean creating the DAO pre-hackathon, which may conflict with the "no pre-existing work" stance. Otherwise use a random suffix (`lisbon-trip-x7k2`).
- → contracts: the Rulebot must handle the `add_proposal → act_proposal` race and pre-check FT registration (`storage_balance_of`). Its callback should read `get_proposal` to report `Approved`/`Failed` to the feed. Pin `FactoryInfo` (`auto_update:false`?) for our own factory.
- → contracts: `near-workspaces`/`near-sandbox` tests need the wasm from chain (`res/` was removed). Pull it with `get_code` from `sputnikv2.testnet` or `view_global_contract_code Ea8t…` (both ✅ downloadable).
- → product-ux / web: show "x of y approvals" from the **current** member count; prompt the requester to approve their own over-cap request; tie handling ("needs 4 of 6, 3 for, 3 against: expires in 7 days").
- → relayer: relayed `act_proposal` should prepay 50 Tgas (FT) / 100 Tgas (msg); cap `description` length; per-DAO proposal rate limits (bond 0 spam drains the float).
- → infra: parse `vote_counts` as number | string; sanitize RPC JSON control chars; poll `get_actions_log` where available.
- ⚠️ Untested here: `RemoveMemberFromRole`, `ChangeConfig`, `FactoryInfoUpdate`, `VoteRemove`, and mainnet-side behaviour (read-only only).

## Sources
- https://github.com/near-daos/sputnik-dao-contract (main @ `5434a59`; tags 2.0.0/3.0.0; PRs #217 kind arg, #221 deny_unknown_arguments, #223 gas pass-through, #226 actions log, #232 global contracts, #233 2-week update delay): source of every ✅-source claim; accessed 2026-10-21
- Permalinks used: [2b0f34a (mainnet DAO + factory)](https://github.com/near-daos/sputnik-dao-contract/tree/2b0f34a3860460f285307ec2ccf36345acbe05a2), [7764926 (testnet factory default)](https://github.com/near-daos/sputnik-dao-contract/tree/7764926cfd3c47f62b5fcde231c251f3c3892887), [278adc7 (testnet global `Ea8t…`)](https://github.com/near-daos/sputnik-dao-contract/tree/278adc713e795f95a6da4d3007c7e03e8120f153): versions/semantics; accessed 2026-10-21
- Testnet RPC `https://rpc.testnet.fastnear.com` (+ `test.rpc.fastnear.com`): factory views, `view_account`, `view_code`, `view_global_contract_code`, `EXPERIMENTAL_protocol_config` (protocol 87); accessed 2026-10-21
- Mainnet RPC `https://rpc.mainnet.fastnear.com` (read-only): `sputnik-dao.near` views, `contract_source_metadata`, global code `DtHZ…`, DAO `8rzrd.sputnik-dao.near` `__contract_abi`/`get_proposal`/`get_actions_log`; accessed 2026-10-21
- NearBlocks mainnet API `https://api.nearblocks.io/v1/account/8rzrd.sputnik-dao.near/txns` + tx `3xUd3J2neP5iwYVS3aWXMGpUZyeTxhgANhGoRzdi9pFA`: Trezu creation deposit 0.09 NEAR, policy, `act_proposal` with `proposal`; accessed 2026-10-21
- https://docs.near.org/primitives/dao: factories `sputnikv2.testnet`/`sputnik-dao.near`, "6 NEAR" testnet, exact-bond rule, "default 0.1 NEAR" (contradicted by source), `act_proposal {id, action}` only (outdated for v3.2), global hash `Ea8t…` example; accessed 2026-10-21
- crates.io `near-account-id` 2.5.0 (`sub_account` = `format!("{name}.{parent}").parse()`, MAX_LEN 64): name rules; accessed 2026-10-21
- Spike 1 evidence: [../spikes/sputnik-rulebot/RESULTS.md](../spikes/sputnik-rulebot/RESULTS.md) (102 testnet txs, 2026-10-21)

## Review corrections (2026-10-21)

From the security review's fact check ([../plan/review-security.md](../plan/review-security.md) §4, F-04a). The body above is unchanged.
- **"Protocol 87 limits":** testnet moved to **protocol 88** (nearcore 2.14.0-rc.5) on 2026-10-21; the limits listed (storage cost, 1,000 Tgas max prepaid gas, tx and args sizes, gas price) are unchanged. **Mainnet is still 86**, so the pins stay.
