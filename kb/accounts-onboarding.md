# Accounts and sponsored onboarding
> Owner: relayer. Last verified: 2026-10-21. Legend: ✅ verified · 📄 docs-only · ⚠️ unverified/conflicting

## TL;DR
- ✅ **A new user account needs 0 NEAR.** One ed25519 full-access key (FAK) makes a 182-byte account, and NEP-448 "zero-balance accounts" (≤ 770 bytes) need no storage stake. The relayer pays all gas **and** all attached deposits of relayed actions, including the 1 yocto. All five creation variants were tested with 0 NEAR, followed by a relayed 1-yocto `ft_transfer` from the new account. [RESULTS §3b](../spikes/meta-tx/RESULTS.md)
- ✅ **Creating any account costs the payer about 0.007 NEAR** since protocol 85 (`account_creation_charge = 0.007 N`, burnt from the signer's gas refund). Measured: named sub-account 0.00709-0.00711, implicit (even a 0-yocto transfer) 0.00711, `testnet.create_account` 0.00745 NEAR.
- ✅ **Full sponsored onboarding = about 0.0085 NEAR per user**: create (0.0071) + FT `storage_deposit` (0.00125 deposit + 0.00019 gas). That is about 6× cheaper than the plan's 0.05 + 0.00125. Latency was **3.8-7.9 s to FINAL** (median ~5 s) with both txs sent in parallel, which fits the plan's "3-8 s".
- ✅ Three ways to create an account, all working on testnet: (a) **named sub-account** of a parent the relayer signs for (`CreateAccount + AddKey`); (b) **implicit** 64-hex = hex(ed25519 pubkey), created by any `Transfer` (0 yocto works); (c) **top-level `.testnet`** via the registrar contract `testnet.create_account({new_account_id, new_public_key})` with 0 deposit (this is what NEAR Auth's relayer does).
- Recommendation: **(a) named sub-accounts** such as `u-<8char>.pot-<team>.testnet`, created by the relayer as parent. They are cheap, readable in Trezu/NEAR explorers, and can't collide. Use (c) only if NEAR Auth requires its own account model (→ auth).
- ✅ A NEAR Auth / MPC key is just `AddKey(mpcPublicKey, FullAccess)`: put it in the creation tx, pass it as `new_public_key` to the registrar, or add it later with a **relayed delegate AddKey** signed by an existing FAK. It must be **full-access** or the user cannot attach the 1 yocto that FT transfers need.
- ⚠️ **Testnet NEAR**: the near-cli-rs faucet gives **10 NEAR per new account** (measured). The plan's 50 NEAR is mostly eaten by Pot creation, not gas: one Sputnik DAO on `sputnikv2.testnet` locks **5.6 NEAR** (measured, full code deploy). → Ask organizers or NEAR DevRel for testnet NEAR (human), or sweep several faucet accounts into the relayer.

## Plan check

| Plan claim | Status |
|---|---|
| C6 Costs: "New user about 0.05 NEAR plus 0.00125 NEAR USDC storage" | ❌ The user needs **0 NEAR**; the real cost is the 0.007 NEAR creation charge plus 0.00125 storage plus about 0.0002 gas, ≈ **0.0085 NEAR** ✅ measured |
| C3 Phase 1: "NEAR Auth login with a relayer-funded account (0.05 testnet NEAR plus USDC storage)" | ❌ don't fund 0.05. Fund 0; the relayer pays per action |
| C5 Flow 1: "'Setting up your Pot account' (relayer funds and registers USDC, 3-8 s)" | ✅ 3.8-7.9 s to FINAL with create + `storage_deposit` in parallel; ≈ 2.5 s to EXECUTED_OPTIMISTIC |
| C3 Phase 0: "a relayer funded with about 50 testnet NEAR" | ⚠️ the faucet gives 10 NEAR per account. 50 NEAR ≈ 8 Pots at 5.6 NEAR/DAO; users and actions are cheap (see Costs) |
| C6 `/api/onboard` "create + fund account, usdc storage_deposit" | ✅ but drop "fund". It is two parallel relayer txs: create (+ key) and `storage_deposit{account_id, registration_only:true}` on the token |
| Key findings: "NEP-366 … account must exist" | ✅ a delegate from a non-existent sender gives `AccountDoesNotExist`, and the relayer still pays 0.000082 NEAR. Create the account first (EXECUTED_OPTIMISTIC is enough) |

## Reference

### Storage and balance rules ✅
- `storage_amount_per_byte = 1e19` yocto (0.00001 NEAR/B; 100 kB = 1 NEAR). `num_bytes_account = 100`, `num_extra_bytes_record = 40` (live `EXPERIMENTAL_protocol_config`, testnet and mainnet).
- Fresh account with **1 ed25519 FAK = 182 B** = 100 (account) + 40 (record) + 33 (borsh pubkey) + 9 (nonce u64 + FullAccess tag). Measured on all five variants. A secp256k1 key costs 32 B more.
- FC keys add receiver and method strings: U1 with 1 FAK + 2 FC keys = **466 B**; U2Z with 1 FAK + 1 FC key {DAO, [act_proposal]} = **342 B** ✅.
- **Zero-balance account (NEP-448)**: `storage_usage ≤ 770` ⇒ no balance required (`runtime/runtime/src/verifier.rs:25, 77-89`). Above 770 B the whole usage must be staked (0.0077+ NEAR), so keep users to ≤ ~4 keys.
- **Account creation charge** (protocol ≥ 85, testnet 87 and mainnet 86): `account_creation_charge = 7e21` yocto. The receipt gas is bought at `min_gas_purchase_price = 1e9`, and when a receipt brings an account into existence the runtime keeps up to 0.007 NEAR of the price surplus instead of refunding it to the **signer** (`runtime/runtime/src/lib.rs:1359-1395`, `runtime_configs/85.yaml`). Measured burnt: `F1Kbe6W5…` 7.525 Tgas → 0.0070325 NEAR at the new account receipt.
- New access-key nonce = `(block_height − 1) × 1e6` (`runtime/runtime/src/access_keys.rs:46`). The first delegate's nonce is about `h·1e6 + 1`, never 1, so read it from chain (`createSignedMetaTransaction` does).

### Account ID rules ✅
- 2-64 chars; `a-z 0-9 - _`, `.` separates levels. `CreateAccount` of `x.parent` needs **predecessor == parent** (`actions.rs` `action_create_account`: `CreateAccountNotAllowed`). A top-level ID shorter than 65 chars can only be created by `registrar` (`CreateAccountOnlyByRegistrar`), so `.testnet` names go through the `testnet` contract.
- Implicit: `hex(ed25519_pubkey)` (64 chars) via `keyToImplicitAddress(pk)`. The first `Transfer` to it, of any amount including 0, creates it with that key as FAK.
- Protocol 87 also adds `0u…` "universal accounts" (`UniversalStateInit`) and has ETH-implicit `0x…` accounts. Neither is needed for Pot.

### Variants compared (measured 2026-10-21, relayer pays everything)

| | (a) Named sub-account `u-…<parent>` | (b) Implicit `hex(pk)` | (c) Top-level `<name>.testnet` |
|---|---|---|---|
| How | relayer (= parent, or holds parent key) sends `[CreateAccount, AddKey(pk, FullAccess)]` (+ optional `Transfer`) | relayer sends `Transfer(0)` to `hex(pk)` | relayer calls `testnet.create_account({new_account_id, new_public_key})`, 0 deposit, 60 Tgas |
| Gas / NEAR burnt | 8.34 Tgas / **0.0070920** (no Transfer); 8.57 T / 0.0071150 (with Transfer) | 8.57 T / **0.0071150** | 12.39 T / **0.0074524** |
| Storage / balance | 182 B / 0 | 182 B / 0 | 182 B / 0 |
| Create + register (parallel, to FINAL) | 4273 ms (0 NEAR), 3760 ms (0.01) | 5731 ms (0 yocto), 7869 ms (1 yocto) | 5020 ms |
| Pros | readable; namespaced under our app; ID independent of key (rotate keys freely); can't be front-run | no parent key needed; ID derivable from key before creation (good for MPC-derived keys) | user-chosen `.testnet` name; matches NEAR Auth relayer default |
| Cons | relayer must sign as parent; IDs reveal "Pot user" | 64-hex in UI; ID bound to the first key; anyone can create it by sending 0 | name squatting/collisions; slightly more gas; on mainnet the registrar is `near` (⚠️ deposit rules not checked) |
| Tx | [JEMnNUjx…](https://testnet.nearblocks.io/txns/JEMnNUjxkETR79zSWoqJQJhRpdVWzmN8FABo7vnKvKy), [us1HunHh…](https://testnet.nearblocks.io/txns/us1HunHh5UyoFJvQPz5gwAjiByyB5xUtDzS5ZD4GdXN) | [DNz8hbLY…](https://testnet.nearblocks.io/txns/DNz8hbLYXWd3SmqrdwSW9ajdaKWu5YScpr8wZ1bp2nHM), [F1Ce72De…](https://testnet.nearblocks.io/txns/F1Ce72DeN44q62MyAdLnpAFi76pqX2cgenERhrB6Hxn5) | [8uKaidst…](https://testnet.nearblocks.io/txns/8uKaidstB38WcZ7hCXFiAo88vzQpiHVBDBC2FrxXqiMM) |

### NEAR Auth / MPC key (→ auth for derivation details)
- NEAR Auth's relayer `/create-account` calls `{accountContractId}.create_account({ new_account_id, new_public_key })` with 300 Tgas and **0 deposit**; `accountContractId` is `testnet` on testnet and `near` on mainnet (`Peersyst/fast-auth` `apps/relayer/src/modules/relayer/relayer.service.ts`, `.env.testnet`). The key is the MPC-derived key for path `"{guard_id}#{sub}"` (`contracts/fa/src/lib.rs` `sign_request_*`) ⚠️ not tested here.
- For our own named accounts: `[CreateAccount, AddKey(mpcPk, FullAccess)]`. To add the MPC key to an existing account gaslessly, use a relayed delegate `AddKey` signed by an existing FAK ✅ ([55MeUHUo…](https://testnet.nearblocks.io/txns/55MeUHUoHdRimbbMLhPHERJxkhhwvpjCc96N7MiJ1taa), [BZrXBetk…](https://testnet.nearblocks.io/txns/BZrXBetkh7tgnXiU6ENQE7xH2tzhjtwgZz16BhTsUsNh)).

## Snippets (tested: `spikes/meta-tx/src/05-onboarding.ts`, near-api-js 7.3.1)
```ts
import { Account, PublicKey, actions, keyToImplicitAddress, nearToYocto, teraToGas } from 'near-api-js';
// relayer: Account for the PARENT (or a MultiKeySigner holding the parent's keys)
async function onboard(relayer: Account, userPk: string, accountId: string, usdc: string) {
  const create = relayer.signAndSendTransaction({            // (a) named sub-account, 0 NEAR
    receiverId: accountId,                                  // e.g. `u-${nanoid(8)}.${relayer.accountId}` (≤ 64 chars)
    actions: [actions.createAccount(), actions.addFullAccessKey(PublicKey.from(userPk))],
    waitUntil: 'EXECUTED_OPTIMISTIC',
  });
  const register = relayer.signAndSendTransaction({          // FT registration can precede account existence
    receiverId: usdc,
    actions: [actions.functionCall('storage_deposit', { account_id: accountId, registration_only: true }, teraToGas('30'), nearToYocto('0.00125'))],
    waitUntil: 'EXECUTED_OPTIMISTIC',
  });
  const [c, r] = await Promise.all([create, register]);     // same Account instance => NonceManager hands out 2 nonces
  return { createTx: c.transaction_outcome.id, registerTx: r.transaction_outcome.id };
}
// (b) implicit:   receiverId: keyToImplicitAddress(userPk), actions: [actions.transfer(0n)]
// (c) .testnet:   receiverId: 'testnet', actions: [actions.functionCall('create_account',
//                   { new_account_id: 'name.testnet', new_public_key: userPk }, teraToGas('60'), 0n)]   // returns true
```
Funding the relayer from faucet accounts (⚠️ human decision on faucet etiquette): `near account create-account sponsor-by-faucet-service <x>.testnet autogenerate-new-keypair save-to-legacy-keychain network-config testnet create` (10 NEAR), then `near account delete-account <x>.testnet beneficiary <relayer>.testnet network-config testnet sign-with-legacy-keychain send` (syntax checked with near-cli-rs 0.30.1 `--help`, not executed).

## Gotchas & failure modes
1. **Parent signer**: `CreateAccount` for `u-x.parent` must come from `parent`. Make the relayer account the parent (e.g. `pot-<team>.testnet` relays and creates `u-*.pot-<team>.testnet`), or keep the parent's key in the relayer key pool.
2. **The first delegate right after creation**: the client reads the access key (optimistic). Wait for the creation tx's EXECUTED_OPTIMISTIC (~2.5 s) before signing, or the delegate fails with `Access key … does not exist`. The nonce is about `height·1e6`, not 0.
3. **Implicit isn't cheaper any more**: a 0-yocto transfer that creates an implicit account also pays the 0.007 NEAR creation charge.
4. **770 B cliff**: each extra FAK is +82 B and FC keys are +80-160 B. Past 770 B a zero-balance account must stake for **all** its storage. Without NEAR, adding keys starts failing (balance below storage requirement). Keep keys few, or top up 0.01 NEAR if a flow adds many keys.
5. **Users signing outside the relayer**: an account with 0 NEAR cannot pay for its own txs. A NEAR Connect wallet user (own NEAR) is unaffected. Pot-created users must always go through `/api/relay`.
6. **Creation charge is per created account, in any receipt**: sponsored onboarding of N users costs ≥ 0.007·N NEAR even if creation fails late. Rate-limit `/api/onboard` per verified email or IP.
7. **Mainnet**: the same 0.007 charge applies (mainnet is at protocol 86 ≥ 85). ⚠️ The mainnet registrar `near` deposit rules were not checked.
8. RPC: `rpc.testnet.near.org` answers `-429 "THIS ENDPOINT IS DEPRECATED"`, and the free FastNear tier rate-limits (→ infra; see [meta-tx-relayer.md](meta-tx-relayer.md#gotchas--failure-modes)).

## Costs, limits, latencies (measured vs documented)

| Item | Measured (testnet 2026-10-21) | Plan / docs |
|---|---|---|
| Create account (any variant) | ✅ **0.00709-0.00745 NEAR** (8.3-12.4 Tgas) | protocol: 0.007 N `account_creation_charge` 📄 (yaml) |
| FT registration (`storage_deposit`, registration_only) | ✅ 0.00125 deposit + 0.00019 NEAR gas (2.12 Tgas) | plan 0.00125 ✅ |
| **Onboarding total (0-NEAR named account + USDC registration)** | ✅ **0.0085312 NEAR** | plan 0.05125 ❌ |
| Onboarding latency (parallel txs, to FINAL) | ✅ 3760-7869 ms (n=5) | plan 3-8 s ✅ |
| First relayed action from a new account | ✅ 3672-4494 ms to FINAL; user NEAR Δ = 0 | — |
| Fresh account storage | ✅ 182 B (0.00182 NEAR if it weren't zero-balance) | — |
| Zero-balance limit | ✅ 770 B (source) | NEP-448 📄 |
| Faucet (near-cli-rs `sponsor-by-faucet-service` → `helper.nearprotocol.com/account`) | ✅ **10 NEAR** per new account, 3.7 s ([Ff6DeUDy…](https://testnet.nearblocks.io/txns/Ff6DeUDyw5wZyu84EWseWoiQKeyvywvj3kSmagZeeJzz)); rate limit ⚠️ unknown | — |
| near-faucet.io (community, captcha) | ⚠️ "max 10 NEAR" per request (secondary source); the 2022 contract source has 20 NEAR max and 1 h gap | NEAR Docs lists it 📄 |
| Budget for 50 testnet NEAR | ⚠️ model: 1,000 users × 0.0085 = 8.5 NEAR; 10k actions × 0.0005 ≈ 5 NEAR; **each Pot's DAO 5.6 NEAR** (→ sputnik: a global-contract factory would cut this) | plan: "about 50" |

## Open questions / needs a human
- **Needs a human**: get about 50+ testnet NEAR for the relayer. Options: (1) ask the NEAR HACKATHON organizers or NEAR DevRel for a testnet grant; (2) near-faucet.io (captcha, ~10 NEAR); (3) create ~5 faucet accounts with near-cli-rs and `delete-account` them into the relayer (this agent created only one, per the rules). Decide whether (3) is acceptable.
- → sputnik: DAO creation on `sputnikv2.testnet` deployed full code (540,351 B, 5.6 NEAR attached; [EuJaVvaE…](https://testnet.nearblocks.io/txns/EuJaVvaE82RSymxBXB1qW4uvCqKkEV5SvPkZHA2JKv7x)). Is there a testnet factory that uses global contracts (the `main` source does: `MINIMAL_DEPOSIT` 0.01 NEAR)? That decides the relayer budget.
- → auth: which account model does NEAR Auth testnet give us: registrar `.testnet` (relayer pays 0.00745), our named sub-accounts, or implicit? Is the MPC key added as **FullAccess**? Can we pick the account ID?
- → product-ux: account IDs are hidden in the UI (plan C5), so `u-<random>.pot-<team>.testnet` is fine. Confirm "Settings → Advanced" shows it.

## Sources
- https://github.com/near/nearcore/blob/1441cd3ad4581109649e29609b87f874540b0a84/runtime/runtime/src/verifier.rs#L25-L89 : zero-balance limit 770 B, storage stake check: 2026-10-21
- https://github.com/near/nearcore/blob/1441cd3ad4581109649e29609b87f874540b0a84/runtime/runtime/src/lib.rs#L1030-L1070 and #L1355-L1395 : created-account detection, `account_creation_charge` taken from the gas refund: 2026-10-21
- https://github.com/near/nearcore/blob/1441cd3ad4581109649e29609b87f874540b0a84/core/parameters/res/runtime_configs/85.yaml : `account_creation_charge: 0.007 N`, `min_gas_purchase_price: 1e9`, `action_create_account` fees: 2026-10-21
- https://github.com/near/nearcore/blob/1441cd3ad4581109649e29609b87f874540b0a84/core/primitives-core/src/version.rs : `AccountCostIncrease` = protocol 85, `UniversalAccounts` = 87: 2026-10-21
- https://github.com/near/nearcore/blob/1441cd3ad4581109649e29609b87f874540b0a84/runtime/runtime/src/access_keys.rs#L46-L50 : initial access-key nonce `(h-1)·1e6`: 2026-10-21
- https://github.com/near/nearcore/blob/1441cd3ad4581109649e29609b87f874540b0a84/runtime/runtime/src/actions.rs (fn `action_create_account`) : parent/registrar rules: 2026-10-21
- `EXPERIMENTAL_protocol_config` on https://rpc.testnet.fastnear.com and https://rpc.mainnet.fastnear.com : `storage_amount_per_byte`, `account_creation_charge`, `min_gas_purchase_price`, `account_creation_config {min_allowed_top_level_account_length: 65, registrar_account_id: "registrar"}`: 2026-10-21
- https://github.com/near/NEPs/pull/448 : NEP-448 zero-balance accounts (referenced in nearcore `verifier.rs`): 2026-10-21
- https://github.com/Peersyst/fast-auth (commit 8f84383) `apps/relayer/src/modules/relayer/relayer.service.ts`, `apps/relayer/.env.testnet` : NEAR Auth `/create-account` → `testnet.create_account`, 0 deposit: 2026-10-21
- https://docs.near.org/getting-started/faucet : NEAR Docs faucet page (built-in faucet + near-faucet.io): 2026-10-21
- https://github.com/flmel/near-testnet-faucet `src/settings.rs` : community faucet contract limits (20 NEAR, 1 h; 2022 code): 2026-10-21
- https://www.diadata.org/map/web3-builder-hub/near-faucets/ : secondary claim near-faucet.io max 10 NEAR: 2026-10-21
- ~/Library/Application Support/near-cli/config.toml (near-cli-rs 0.30.1) : `faucet_url = https://helper.nearprotocol.com/account`: 2026-10-21
- [spikes/meta-tx/RESULTS.md](../spikes/meta-tx/RESULTS.md) : measured costs, storage, latencies, tx hashes: 2026-10-21

## Review corrections (2026-10-21)

From the security review's fact check ([../plan/review-security.md](../plan/review-security.md) §4, F-04a, F-10). The body above is unchanged.
- Where this file says "testnet 87": testnet moved to **protocol 88** (nearcore 2.14.0-rc.5) on 2026-10-21. The facts that matter here are unchanged and re-verified live: `account_creation_charge` is 0.007 NEAR on both networks, and the zero-balance limit is 770 B (`verifier.rs:25`). Mainnet is still 86.
