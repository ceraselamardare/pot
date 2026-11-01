# Meta transactions (NEP-366) and the Pot relayer
> Owner: relayer. Last verified: 2026-10-21. Legend: ✅ verified · 📄 docs-only · ⚠️ unverified/conflicting

## TL;DR
- ✅ **"Everything gasless" works on testnet with near-api-js 7.3.1.** The user signs a `DelegateAction`, and `/api/relay` wraps it in a tx `{signer: relayer, receiver: user, actions: [SignedDelegate]}`. Proven for `ft_transfer`, `ft_transfer_call`, Sputnik `add_proposal`/`act_proposal`, and `AddKey`. Results: [spikes/meta-tx/RESULTS.md](../spikes/meta-tx/RESULTS.md).
- ✅ **The relayer pays every attached deposit inside a delegate, including the 1 yocto of `ft_transfer_call`.** The user's balance did not move by even 1 yocto. If the inner call fails, the deposit is refunded to the **user**, not the relayer. A delegate carrying `near_deposit` with 0.01 NEAR drained exactly 0.01 NEAR from the relayer. **Cap deposits per method (1 yocto for FT calls, 0 elsewhere).**
- ✅ **User accounts need 0 NEAR** for relayed actions (the deposit comes from the relayer and NEP-448 makes zero-balance accounts valid). See [accounts-onboarding.md](accounts-onboarding.md).
- ✅ **Money moves need a full-access key (FAK); votes can use a least-privilege key.** A function-call (FC) access key can sign delegates, but only with exactly 1 `FunctionCall`, **0 deposit**, a matching receiver and methods. The allowance is never checked or consumed. So FC keys **cannot** do `ft_transfer(_call)` (`DepositWithFunctionCall`). They **can** do `act_proposal`: a 0-NEAR account voted with an FC key whose allowance is 0.
- ✅ **The top-level tx status hides inner failures.** If the inner `FunctionCall` panics, the tx `status` is still `SuccessValue("")`. Delegate-level failures (expired, bad nonce, key, account missing) do show as top-level `Failure`. Always scan `receipts_outcome`.
- ✅ Rules: one delegate per tx, though other actions may sit next to it in the same tx. Each delegate has a single `receiver_id`, no nested delegates, and any non-delegate action is allowed inside. The sender must exist. The nonce must be > the access-key nonce (**any** higher value works and invalidates lower pending delegates) and < `block_height·1e6`. The delegate expires when `block_height > max_block_height`.
- ✅ Cost per relayed action is **0.00028 NEAR** (`ft_transfer`, 3.06 Tgas), **0.0008 NEAR** (`ft_transfer_call` into a contract), **0.00031-0.00038 NEAR** (Sputnik propose/vote) and **0.000082 NEAR** (any rejected delegate). Latency from submit to EXECUTED_OPTIMISTIC is 2.5 s median; to FINAL it is 4.2 s.
- ✅ Validate **before** submitting (allowlist, deposit and gas caps, expiry window, nonce, key permission, local signature check). Every bad delegate that reaches the chain costs gas. Use a **relayer key pool** on serverless: five lambdas sharing one key took 7.6 s against 2.6 s with a pool.
- ⚠️ No maintained off-the-shelf relayer fits. `near/pagoda-relayer-rs` was last pushed 2025-02-20 and `@near-relay/*` 2024-10. NEAR Auth's relayer is a reference NestJS app you run yourself, and it needs **2 txs per gasless action** (MPC `sign` + relay). → Write `/api/relay` in Next.js (~150 lines, see Snippets).

## Plan check

| Plan claim (the original plan) | Status |
|---|---|
| "NEP-366: one delegate action per transaction, single receiver, account must exist" (Key findings) | ✅ confirmed (nearcore `action_validation.rs:145`; spike: 2 delegates are rejected by RPC; a ghost sender gives `AccountDoesNotExist`). Nuance: other actions *may* accompany the one delegate ([8sev9J1Z…](https://testnet.nearblocks.io/txns/8sev9J1ZYRumHsN5aoyF3TMvwgCkHm7tjKqfiGNz81CD)) |
| C3 Spike 3: "a meta transaction carrying 1 yoctoNEAR **from a funded user account**" | ❌ **corrected**: the 1 yocto (and any deposit) is paid by the **relayer**. User delta was 0 ([Jc8M3vzY…](https://testnet.nearblocks.io/txns/Jc8M3vzYmAwnvvWowFJu4cdYGieCaum8nvtvESUjew9)). The user account does not need funding for this |
| C3 Phase 1: "relayer-funded account (0.05 testnet NEAR plus USDC storage)" | ❌ 0 NEAR suffices; see [accounts-onboarding.md](accounts-onboarding.md) |
| C5/C6 "All actions gasless via the NEP-366 relayer" | ✅ incl. `ft_transfer_call`, `add_proposal` (bond 0), `act_proposal`, `AddKey` |
| C6 `/api/relay` "allowlist: pot-factory, rulebot.*, usdc" | ✅ feasible, but insufficient as stated. It must also pin **methods, args (e.g. `ft_transfer_call.receiver_id ∈ rulebot.*`), deposit caps and gas caps**, and must include the **DAO accounts** for votes. Proposed policy below |
| C6 Costs: "Relayer about 0.001-0.005 NEAR per action (estimate)" | ✅/❌ Simple calls are cheaper than estimated: 0.00028-0.0008 NEAR measured. The Rulebot paths (multi-hop) are ⚠️ estimated at 0.001-0.004 NEAR |
| C9 "Relayer abuse → receiver/method allowlist, per-user daily cap, alert under 5 NEAR" | ✅ plus the **deposit cap** (main drain vector) and signature, nonce and expiry pre-checks |
| C6 "Trustless attribution … If that step fails, funds stay in the member's account" | ✅ `ft_on_transfer` panic → `ft_resolve_transfer` refunds ([G7joFZ8B…](https://testnet.nearblocks.io/txns/G7joFZ8B9DRxnFMsaA6NkKZfXavvWeCjurKvZqpnvUT6)). But the relay response still says success, so the UI must read receipts |
| Part A "@hot-labs/near-connect (0.8.2 seen)" | ❌ npm `latest` = **0.11.4** (2026-05-11). It has `wallet.signDelegateActions({delegateActions:[{receiverId, actions}]}) → {signedDelegateActions: string[]}`, and each wallet advertises `features.signDelegateActions`. → auth |
| Part A "near-api-js" (version unpinned) | ✅ pin **near-api-js 7.3.1** (2026-08-12). It is now a single package; `@near-js/*` are at 2.5.1 but not needed |

## Reference

### Wire format (nearcore master `1441cd3`, 2026-10-21) ✅
```rust
pub struct DelegateAction {           // core/primitives/src/action/delegate.rs
    pub sender_id: AccountId,         // the user; must equal the outer tx receiver_id
    pub receiver_id: AccountId,       // ONE receiver for all inner actions
    pub actions: Vec<NonDelegateAction>, // any Action except Delegate/DelegateV2 (borsh tag 8/14 rejected)
    pub nonce: Nonce,                 // u64, > access_key.nonce, < block_height * 1_000_000
    pub max_block_height: BlockHeight,// u64, valid while block_height <= max_block_height
    pub public_key: PublicKey,        // key on sender_id that signed
}
pub struct SignedDelegateAction { pub delegate_action: DelegateAction, pub signature: Signature }
```
- **Signing (NEP-461 prefix)**: `hash = sha256( u32_le(2^30 + 366) ‖ borsh(DelegateAction) )`, with prefix bytes `6e 01 00 40` (= 1073742190). Then `signature = ed25519_sign(hash)`. The prefix makes a signed delegate impossible to replay as a transaction. ✅ `core/primitives/src/signable_message.rs:18-24`; near-api-js `encodeDelegateAction` adds it. NEP-461 itself was never merged (PR #461 closed); the scheme lives in nearcore. ✅
- **Transport**: `base64(borsh(SignedDelegateAction))` (no prefix), 420 chars for one `ft_transfer` ✅. The borsh layout is `string sender ‖ string receiver ‖ u32 n ‖ n×Action ‖ u64 nonce ‖ u64 max_block_height ‖ u8 key_type ‖ 32B key ‖ u8 sig_type ‖ 64B sig` (ed25519). `Action::FunctionCall` = `u8 2 ‖ string method ‖ Vec<u8> args ‖ u64 gas ‖ u128 deposit`.
- Action tags (nearcore master): CreateAccount 0, DeployContract 1, FunctionCall 2, Transfer 3, Stake 4, AddKey 5, DeleteKey 6, DeleteAccount 7, **Delegate 8**, DeployGlobalContract 9, UseGlobalContract 10, DeterministicStateInit 11, TransferToGasKey 12, WithdrawFromGasKey 13, DelegateV2 14, UniversalStateInit 15 ✅ (`core/primitives/src/action/mod.rs:375`). near-api-js 7.3.1's schema only knows 0-10.
- **`DelegateV2` (gas-key meta txs, NEP-611)** went live in protocol 85 and was **rejected again from protocol 87** (`RejectDelegateV2`). Use V1 only ✅ (`core/primitives-core/src/version.rs:180,184`).

### Execution and validation rules ✅ (nearcore source + spike)

| Rule | Where | Spike evidence |
|---|---|---|
| ≤ 1 `Delegate`/`DelegateV2` action per tx, otherwise `DelegateActionMustBeOnlyOne` (InvalidTx, rejected at RPC, no cost) | `runtime/runtime/src/action_validation.rs:145` | rejected, 0 cost |
| Other actions may share the tx (they also target the user, since tx.receiver = sender_id) | same loop | `[Transfer, Delegate]` ok |
| Inner actions: any except nested delegates; `WithdrawFromGasKey` rejected since protocol 87; ≤ 100 actions | `action_validation.rs:194-212, 232-275` | `AddKey` inside a delegate ok |
| Signature checked against `sha256(prefix‖borsh)` → `DelegateActionInvalidSignature` | `runtime/runtime/src/actions.rs:475` | — |
| `block_height > max_block_height` → `DelegateActionExpired` | `actions.rs:480` | [6nEHfufQ…](https://testnet.nearblocks.io/txns/6nEHfufQj5RKrpUf3Hwh7ZHwCU3HG6q6E6v69DpotZJd) |
| `sender_id ≠ tx.receiver_id` → `DelegateActionSenderDoesNotMatchTxReceiver` | `actions.rs:484` | — |
| Key missing → `DelegateActionAccessKeyError(AccessKeyNotFound)`; account missing → `AccountDoesNotExist` | `actions.rs:586-598` | [2Qj8BvNN…](https://testnet.nearblocks.io/txns/2Qj8BvNNKoqCZEQvKxnYCnadAco8ZLNiy3FGkoA2sekw) |
| `nonce <= ak.nonce` → `DelegateActionInvalidNonce`; `nonce >= height·1e6` → `DelegateActionNonceTooLarge`; on success `ak.nonce := nonce` | `actions.rs:649-665` | replay [FLBktQyd…](https://testnet.nearblocks.io/txns/FLBktQyd9zvdhPd6JTZqNQMsuGynQhjvWbfnsWsSq6gu); jump +1000 ok |
| FC key: exactly 1 action, must be `FunctionCall`, **deposit must be 0** (`DepositWithFunctionCall`), receiver must match, method ∈ list (empty = any). **Allowance not checked or charged** | `actions.rs:673-728` | [8L13LUK9…](https://testnet.nearblocks.io/txns/8L13LUK9ES5pcAyuBNTvnwW959PfQgvVKXW9HiQDWFXB); FC vote ok; allowance unchanged |
| Inner receipt: `predecessor = sender_id` (contracts see the **user**), `signer_id`/`signer_public_key` = **relayer** (gas refunds → relayer) | `actions.rs:501-533` | wrap logs `Transfer … from u1…` |
| **Deposits are prepaid by the relayer**; on inner failure the deposit is refunded to the **sender (user)** | `core/primitives/src/fees.rs:654-662` | user Δ=0, relayer Δ=−(burnt+1); 0.01 NEAR drain test |
| A delegate-level failure returns `Ok` (the tx is included, the relayer pays about 1.27 Tgas) | `actions.rs:475-499` | 0.000082 NEAR each |
| Gas attached to receipts is bought at `max(gas_price, min_gas_purchase_price = 1e9)` (10× the 1e8 gas price) and the surplus is refunded later (protocol ≥ 85) | `fees.rs:534`; `runtime_configs/85.yaml:41` | refunds land after FINAL |

### Errors you will see (RPC JSON) ✅
- Top-level, delegate rejected: `{"Failure":{"ActionError":{"index":0,"kind":"DelegateActionExpired"}}}`, `{"…kind":{"DelegateActionInvalidNonce":{"ak_nonce":274089706000008,"delegate_nonce":274089706000008}}}`, `{"…kind":{"DelegateActionAccessKeyError":"DepositWithFunctionCall"}}`, `{"…kind":{"AccountDoesNotExist":{"account_id":"…"}}}`.
- Inner failure: top-level `{"SuccessValue":""}`, plus a receipt executed by `receiver_id` with `{"Failure":{"ActionError":{"index":0,"kind":{"FunctionCallError":{"ExecutionError":"Smart contract panicked: …"}}}}}`.
- Two delegates: near-api-js throws `DelegateActionMustBeOnlyOneActionError: "Delegate action must be the only action in transaction"`. The message is misleading; the real rule is "only one delegate".

### Protocol parameters (live RPC `EXPERIMENTAL_protocol_config`, 2026-10-21) ✅

| | testnet | mainnet |
|---|---|---|
| protocol / nearcore | 87 / 2.14.0-rc.5 (88 voting) | 86 / 2.13.4 |
| gas price (`gas_price`, block header) | 1e8 yocto/gas = **0.0001 NEAR/Tgas** | 1e8 |
| `min_gas_purchase_price` (prepay price for receipt gas) | 1e9 | 1e9 |
| `delegate_cost` send/exec | 0.2 / 0.2 Tgas | same |
| `max_total_prepaid_gas` per tx | **1,000 Tgas** (not 300) | 1,000 Tgas |
| `burnt_gas_reward` (contract gets % of burnt gas) | **0** (`RemoveGasRewards`, p87) | 30% |

### near-api-js 7.3.1 APIs (published `.d.ts` + `lib/index.js`) ✅ tested

| API | Notes |
|---|---|
| `account.createSignedMetaTransaction({ receiverId, actions, blockHeightTtl = 200, signer? }) → { delegateHash: Uint8Array, signedDelegate: SignedDelegate }` | nonce = `viewAccessKey(optimistic).nonce + 1`, `maxBlockHeight = head(optimistic) + ttl` (`index.js:3789-3836`) |
| `account.createMetaTransaction({ receiverId, actions, blockHeightTtl, publicKey }) → DelegateAction` | unsigned (e.g. to hand bytes to an external signer) |
| `buildDelegateAction({ senderId, receiverId, actions, nonce: bigint, maxBlockHeight: bigint, publicKey: PublicKey })` | manual nonce and expiry |
| `signer.signDelegateAction(da) → { delegateHash, signedDelegate }` | `KeyPairSigner`, `MultiKeySigner`; throws if `da.publicKey` ≠ signer key (`index.js:3210`) |
| `encodeDelegateAction(da)` → prefixed bytes to hash · `encodeSignedDelegate(sd)` → transport bytes | **no `decodeSignedDelegate` export**: use `deserialize(SCHEMA.SignedDelegate, bytes)` from `borsh@2.0.0` (returns plain objects: u64→`bigint`, `[u8]`→`number[]`, enums as `{functionCall:{…}}`, `{ed25519Key:{data}}`). Plain objects re-serialize byte-identically (checked) |
| `actions.signedDelegate({ delegateAction, signature }) → Action` | wrap for the relayer tx |
| `account.relayMetaTransaction(sd)` | = `signAndSendTransaction({receiverId: sd.delegateAction.senderId, actions:[signedDelegate]})`, default `waitUntil: 'EXECUTED_OPTIMISTIC'`, `throwOnFailure: true` (top-level only). Prefer an explicit `signAndSendTransaction` |
| `account.signAndSendTransaction({ receiverId, actions, waitUntil?, throwOnFailure?, signer?, retries = 10 })` | in-process `NonceManager`; on `InvalidNonce` it refetches and retries |
| `MultiKeySigner.fromSecretKeys([k1,k2,…])` | rotates keys per tx (relayer key pool) |
| `PublicKey.from(s).verify(msg, sig)`, `base64Encode/Decode`, `baseEncode`, `teraToGas`, `nearToYocto`, `keyToImplicitAddress`, `SCHEMA`, `KeyType` | all exported from `near-api-js` |
| No `TransactionV1` / gas-key tx builder | gas keys (parallel nonce lanes) are not usable from near-api-js 7.3.1; use a key pool |

### Proposed `/api/relay` contract for Pot (design, built on the tested spike code)
```jsonc
// POST /api/relay   (auth: app session cookie/JWT → userId; rate-limit by userId AND senderId)
{ "signedDelegate": "<base64 borsh SignedDelegateAction>" }        // local/demo keys, NEAR Connect signDelegateActions
// NEAR Auth variant (→ auth to confirm): the relayer itself obtains the MPC signature
{ "delegateAction": "<base64 NEP-461-prefixed borsh DelegateAction>", "nearAuth": { "guardId": "jwt#https://…/", "verifyPayload": "<JWT>", "algorithm": "eddsa" } }
// 200
{ "ok": true, "txHash": "…", "receipt": "https://testnet.nearblocks.io/txns/…", "outcome": "success" | "inner_failed", "error": "Smart contract panicked: …"?, "requestId": "…" }
// 4xx (nothing submitted, nothing spent)
{ "ok": false, "reason": "receiver_not_allowed" | "method_not_allowed" | "deposit_cap" | "expired" | "nonce_used" | "bad_signature" | "key_not_found" | "fc_key_deposit" | "rate_limited", "requestId": "…" }
```

| Receiver | Methods | Max deposit | Max gas | Extra checks |
|---|---|---|---|---|
| test USDC token (e.g. `usdc.pot-<team>.testnet`) | `ft_transfer_call` | **exactly 1 yocto** | 150 Tgas | `args.receiver_id` matches `^[a-z0-9-]+\.rulebot\.pot-<team>\.testnet$` and is in the DB; amount ≤ per-tx cap |
| `*.rulebot.pot-<team>.testnet` | `request_spend`, `join` (+ future) | 0 | 150 Tgas | rulebot in DB; user is a member (or has an invite for `join`) |
| DAOs created by our factory | `act_proposal`, `add_proposal` | 0 (`proposal_bond "0"`) | 150 Tgas | DAO in DB |
| `pot-factory.pot-<team>.testnet` | `create_pot` | **0** (the factory pays from its own float) | 300 Tgas | ≤ 3/day/verified email (plan C5) |
| anything else | — | — | — | reject |

## Snippets

### Client: build and sign a delegate (tested: `spikes/meta-tx/src/client.ts`)
```ts
import { Account, JsonRpcProvider, KeyPairSigner, actions, teraToGas, encodeSignedDelegate, base64Encode } from 'near-api-js'; // 7.3.1
const provider = new JsonRpcProvider({ url: RPC_URL });
const user = new Account(accountId, provider, KeyPairSigner.fromSecretKey(secretKey)); // any Signer (FAK needed for 1 yocto)
const { signedDelegate } = await user.createSignedMetaTransaction({
  receiverId: USDC,
  actions: [actions.functionCall('ft_transfer_call',
    { receiver_id: RULEBOT, amount: '150000000', msg: JSON.stringify({ pot: 'lisbon' }) }, teraToGas('150'), 1n)],
  blockHeightTtl: 120, // ~67 s at 555 ms/block
});
await fetch('/api/relay', { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ signedDelegate: base64Encode(encodeSignedDelegate(signedDelegate)) }) });
```
To pick the nonce yourself (e.g. keep 2 in flight, or cancel pending delegates by jumping it): `buildDelegateAction({...nonce, maxBlockHeight, publicKey})`, then `signer.signDelegateAction(da)` (tested in `signDelegateManual`).

### Server: decode → validate → submit (condensed from the tested `spikes/meta-tx/src/relayer.ts`, which has the full `validate()`)
```ts
import { deserialize } from 'borsh';                 // pin borsh@2.0.0
import { sha256 } from '@noble/hashes/sha2.js';      // pin @noble/hashes@2.2.0
import { Account, SCHEMA, PublicKey, actions, base64Decode, baseEncode, encodeDelegateAction, encodeSignedDelegate } from 'near-api-js';
const safeJson = (b: number[]) => { try { return JSON.parse(new TextDecoder().decode(Uint8Array.from(b))); } catch { return null; } };

export function decode(b64: string) {
  const bytes = base64Decode(b64);
  const sd: any = deserialize(SCHEMA.SignedDelegate, bytes);
  const re = encodeSignedDelegate(sd);                               // reject non-canonical encodings
  if (re.length !== bytes.length || re.some((b, i) => b !== bytes[i])) throw new Error('non-canonical');
  const da = sd.delegateAction, kv = Object.keys(da.publicKey)[0];  // 'ed25519Key' | 'secp256k1Key'
  return {
    sd, senderId: da.senderId as string, receiverId: da.receiverId as string,
    nonce: BigInt(da.nonce), maxBlockHeight: BigInt(da.maxBlockHeight),
    publicKey: `${kv === 'ed25519Key' ? 'ed25519' : 'secp256k1'}:${baseEncode(Uint8Array.from(da.publicKey[kv].data))}`,
    calls: da.actions.map((a: any) => a.functionCall ? { method: a.functionCall.methodName, gas: BigInt(a.functionCall.gas),
      deposit: BigInt(a.functionCall.deposit), args: safeJson(a.functionCall.args) }
      : { other: Object.keys(a)[0] }),
  };
}
// validate(d): 1) allowlist + caps (no RPC)  2) rate limit  3) signature:
//   const ok = PublicKey.from(d.publicKey).verify(sha256(encodeDelegateAction(d.sd.delegateAction)),
//                                                 Uint8Array.from(Object.values(d.sd.signature)[0].data));
// 4) head = (await provider.viewBlock({finality:'final'})).header.height;  require head+10 < maxBlockHeight <= head+600
// 5) ak = await provider.viewAccessKey({accountId: d.senderId, publicKey: d.publicKey, finalityQuery:{finality:'optimistic'}});
//    require d.nonce > ak.nonce && d.nonce > pendingNonce(sender,pk); if ak.permission !== 'FullAccess': 1 call, deposit 0, receiver+method match
export async function submit(relayer: Account, d: ReturnType<typeof decode>) {
  const res = await relayer.signAndSendTransaction({ receiverId: d.senderId, actions: [actions.signedDelegate(d.sd)],
    waitUntil: 'EXECUTED_OPTIMISTIC', throwOnFailure: false });
  const top = res.status as any;                         // {Failure} => delegate rejected on-chain (still paid ~0.00008 NEAR)
  const inner = res.receipts_outcome.find((r: any) => 'Failure' in r.outcome.status); // inner panic hides here
  return { txHash: res.transaction_outcome.id, outcome: top.Failure || inner ? 'failed' : 'success',
           error: top.Failure ?? (inner?.outcome.status as any)?.Failure };
}
```

### Relayer key pool for serverless (tested mode C in `09-concurrency.ts`)
```ts
import { Account, MultiKeySigner } from 'near-api-js';
const relayer = new Account(RELAYER_ID, provider, MultiKeySigner.fromSecretKeys(process.env.RELAYER_KEYS!.split(',') as any));
// or pick keys[random] per invocation; add keys once with actions.addFullAccessKey(pk) in one tx (4 keys ≈ 0.0004 NEAR)
```

### NEAR Auth path (⚠️ untested here; from `Peersyst/fast-auth` `apps/relayer/src/modules/relayer/relayer.service.ts`, → auth)
1. Validate the decoded `DelegateAction` (`deserialize(SCHEMA.DelegateAction, bytes.slice(4))`, because the SDK sends the prefixed bytes) **before** spending anything.
2. `fast-auth contract.sign({guard_id, verify_payload: JWT, sign_payload: <prefixed bytes as number[]>, algorithm})` with 300 Tgas and `NEAR_MPC_DEPOSIT_AMOUNT` (default **2 NEAR**; `on_sign_callback` refunds it). The contract signs `sha256(sign_payload)`, which is exactly the NEP-461 hash.
3. Wrap: `actions.signedDelegate({ delegateAction, signature: new Signature({ keyType: ED25519, data }) })` and submit to the sender. Each gasless NEAR Auth action is therefore **2 txs + MPC latency**.

## Gotchas & failure modes
1. **Deposit drain**: any delegate with `deposit > 0` spends the relayer's NEAR. If the inner call fails, the refund goes to the user, who can repeat the trick. Cap per method; use 1 yocto only on FT calls.
2. **False success**: the relayed tx `status` is `SuccessValue("")` even when the inner call panics ([AjXrZeqU…](https://testnet.nearblocks.io/txns/AjXrZeqUXmb2mGomjP79AkkoDg9dbbNxCUKaNDXkSuuF), [G7joFZ8B…](https://testnet.nearblocks.io/txns/G7joFZ8B9DRxnFMsaA6NkKZfXavvWeCjurKvZqpnvUT6)). Check every receipt, and for FT check the `ft_resolve_transfer` return value (used amount).
3. **Nonce races (user side)**: `createSignedMetaTransaction` uses `ak.nonce + 1`, so two delegates signed before the first lands get the same nonce and the second fails on-chain (costing the relayer). Serialize per key on the client, or track `lastNonce` and use `buildDelegateAction`. The server keeps a short-lived `pendingNonce[sender,pk]`.
4. **Nonce races (relayer side)**: separate serverless instances sharing one relayer key collide on `InvalidNonce`. near-api-js retries up to 10×, which worked but took 7.6 s instead of 2.7 s. Use a key pool.
5. **Cancel trick**: signing any delegate (or tx) with a higher nonce invalidates every pending lower-nonce delegate. This is useful for a "cancel" button.
6. **Expiry**: it is checked when the delegate receipt executes (≥ 1 block after inclusion). Reject on the server if fewer than about 10 blocks remain. near-api-js's default TTL is 200 blocks (~111 s at 555 ms).
7. **FC keys**: they cannot attach the 1 yocto, so a NEAR Connect "sign-in with function-call key" or a passkey-scoped FC key cannot move FT. Their allowance is irrelevant for delegates (never consumed; 0 works), so an FC key with allowance 0 is a key that **only works through the relayer**.
8. **Receipt gas prepay**: the relayer must hold `attached_gas × 1e9` yocto per in-flight tx (150 Tgas → 0.15 NEAR, mostly refunded). Refund receipts are **not** covered by `wait_until: FINAL`, so a balance read right after FINAL can look about 0.006 NEAR low per tx.
9. **No chain id in DelegateAction**: replay across testnet and mainnet is blocked only by per-network key nonces (`nonce < height·1e6`, and heights differ). Don't reuse the same implicit-account key on both networks.
10. **RPC**: near-api-js 7.3.1 doesn't retry HTTP 429 (only 500/503/408). The free FastNear tier 429s under load, sometimes as HTTP 200 with `{"code":-429}`, and `rpc.testnet.near.org` answers `-429 "THIS ENDPOINT IS DEPRECATED"`. Use a keyed provider and `FailoverRpcProvider` (→ infra).
11. `relayMetaTransaction()` can't set `waitUntil` or `throwOnFailure`; use `signAndSendTransaction` with `actions.signedDelegate`.
12. `DelegateActionMustBeOnlyOne` is raised for **two delegates**, not for "delegate plus other actions". The error text says otherwise.

## Costs, limits, latencies (measured vs documented)

| Item | Measured (testnet, 2026-10-21) | Documented / plan |
|---|---|---|
| Relayed 1-yocto `ft_transfer` | ✅ 3.06-3.33 Tgas, **0.000284-0.000288 NEAR** + 1 yocto (n=7) | plan: 0.001-0.005 (estimate) |
| Relayed `ft_transfer_call` → `ft_on_transfer` (Ref) | ✅ 8.9-9.2 Tgas, **0.00080-0.00083 NEAR** | — |
| Relayed Sputnik `add_proposal` / `act_proposal` | ✅ 3.54 T / 0.000309; 3.72-4.44 T / 0.00033-0.00038 NEAR | — |
| Relayed `AddKey` | ✅ 1.48 Tgas, 0.000103 NEAR | — |
| Rejected delegate that reaches the chain | ✅ 1.27 Tgas, **0.000082 NEAR** | — |
| Rulebot contribution / spend (multi-hop) | ⚠️ estimate 15-40 Tgas → 0.0015-0.004 NEAR | — |
| Client sign / server validate | ✅ 120 ms / 161 ms median | — |
| Submit → EXECUTED_OPTIMISTIC / FINAL | ✅ **2.48 s / 4.21 s** median (n=6) | plan UX: "balance updates within 5 s of finality" |
| 5 concurrent relays | ✅ 2.6-2.7 s (shared nonce manager or key pool); 7.6 s (shared key, separate instances) | — |
| **Cost per active user per day** | ⚠️ model: 1 contribution (~0.002) + 1 spend (~0.003) + 3 votes (3×0.00035) ≈ **0.006 NEAR/day**; heavy user (20 actions) ≈ 0.02 NEAR/day. One-time onboarding 0.0085 NEAR | — |
| Relayer float | ⚠️ keep ≥ 10 NEAR on testnet: prepay 0.15 NEAR per in-flight 150 Tgas tx, plus Pot creation (the DAO alone is **5.6 NEAR** on `sputnikv2.testnet`, → sputnik), plus NEAR Auth MPC deposit (2 NEAR per in-flight sign, refunded) | plan: "about 50 testnet NEAR", alert < 5 |

## Other relayer options (Oct 2026)

| Option | Status | Verdict |
|---|---|---|
| `near/pagoda-relayer-rs` (Rust + Redis; allowlists, allowances, FastAuth flags) | ✅ not archived, **last push 2025-02-20**; README roadmap still says "expected early-mid 2024" | ❌ stale; extra infra on Vercel |
| `@near-relay/server` 0.1.8 / `@near-relay/client` 0.1.6 | ✅ last published 2024-10 | ❌ stale; NEAR Docs tutorial still pins near-api-js 3.0.4 |
| NEAR Auth relayer (`Peersyst/fast-auth` `apps/relayer`, NestJS) | ✅ endpoints `/sign-tx`, `/sign-delegate-tx`, `/create-account`; key pool; testnet `fast-auth-beta-001.testnet` + `v1.signer-prod.testnet`. Docs: "Running a relayer means operating a funded NEAR account … put it behind your own authentication and rate limits" | ⚠️ you run it yourself; no allowlist; useful as a reference for the MPC step (→ auth) |
| Hosted relayers | ⚠️ none found that are public or free for NEAR testnet; Trezu sponsors only its own treasury actions (plan) | — |
| NEAR Connect wallets | ✅ API `signDelegateActions` exists (0.11.4); support is per wallet (`features.signDelegateActions`) | → auth: test which wallets actually support it |

## Open questions / needs a human
- **Testnet NEAR for the relayer**: see [accounts-onboarding.md](accounts-onboarding.md#open-questions--needs-a-human). The budget is dominated by DAO creation (5.6 NEAR each on `sputnikv2.testnet`), not by gas.
- → auth: confirm the NEAR Auth payload shapes for `/api/relay` (prefixed `sign_payload`, `algorithm: "eddsa"`), the fast-auth testnet contract and its MPC deposit, end-to-end latency (2 txs + MPC yield/resume), and that the MPC-derived key is added as a **full-access** key (otherwise there is no 1 yocto, so no `ft_transfer_call`). Also confirm which NEAR Connect wallets set `features.signDelegateActions`.
- → contracts: Rulebot and pot-factory must never require a user-attached deposit > 1 yocto (the relayer would pay it). The factory should fund DAO creation from its own balance. Rulebot `ft_on_transfer` must return the unused amount as a U128 string; budget 150 Tgas on `ft_transfer_call`.
- → infra: use a keyed RPC (FastNear paid or other) plus `FailoverRpcProvider` and a custom 429 retry. Use a relayer key pool (`MultiKeySigner`) or a single long-lived worker. Store rate-limit counters, pending nonces and idempotency keys in Postgres/Redis. Alert on relayer balance (< 5 NEAR) and on `receipts_outcome` failures.
- ⚠️ Circle testnet USDC `ft_transfer_call` gas needs were not measured (the spike had no Circle test USDC; the faucet needs a human, see [fungible-tokens-usdc.md](fungible-tokens-usdc.md)).

## Sources
- https://github.com/near/NEPs/blob/master/neps/nep-0366.md : NEP-366 spec (DelegateAction, validation, limitations incl. "deposit is refunded to User", FC-key rules): 2026-10-21
- https://github.com/near/NEPs/pull/461 : NEP-461 prefix proposal (closed, unmerged): 2026-10-21
- https://github.com/near/nearcore/blob/1441cd3ad4581109649e29609b87f874540b0a84/runtime/runtime/src/actions.rs#L454-L740 : `apply_delegate_action`, `validate_delegate_action_key` (expiry, nonce, FC rules, deposit refund comment): 2026-10-21
- https://github.com/near/nearcore/blob/1441cd3ad4581109649e29609b87f874540b0a84/core/primitives/src/fees.rs#L534 and #L654-L662 : receipt gas purchase price; "Relayer pays the deposit but if actions fail, the deposit is refunded to Sender": 2026-10-21
- https://github.com/near/nearcore/blob/1441cd3ad4581109649e29609b87f874540b0a84/runtime/runtime/src/action_validation.rs#L96-L160 : one-delegate rule, DelegateV2 rejection: 2026-10-21
- https://github.com/near/nearcore/blob/1441cd3ad4581109649e29609b87f874540b0a84/core/primitives/src/signable_message.rs#L18-L24 : NEP-461 discriminants (2^30 + 366): 2026-10-21
- https://github.com/near/nearcore/blob/1441cd3ad4581109649e29609b87f874540b0a84/core/primitives-core/src/version.rs#L160-L200 : protocol features (DelegateV2 85, RejectDelegateV2 87, AccountCostIncrease 85, RemoveGasRewards 87): 2026-10-21
- https://github.com/near/nearcore/blob/1441cd3ad4581109649e29609b87f874540b0a84/core/parameters/res/runtime_configs/85.yaml : `min_gas_purchase_price` 1e9, `account_creation_charge` 0.007 N: 2026-10-21
- `https://rpc.testnet.fastnear.com` / `https://rpc.mainnet.fastnear.com` `EXPERIMENTAL_protocol_config`, `gas_price`, `status` : live parameters above: 2026-10-21
- npm `near-api-js@7.3.1` (`lib/index.d.ts`, `lib/account-*.d.ts`, `lib/index.js` lines 2182-2210, 2603-2670, 3210-3230, 3576-3613, 3789-3870, 4149-4155) : APIs, NEP-461 prefix, NonceManager, no 429 retry: 2026-10-21
- https://docs.near.org/chain-abstraction/meta-transactions : "this balance is taken from the relayer"; refund goes to the sender; "The allowance however is not checked": 2026-10-21
- https://docs.near.org/web3-apps/tutorials/meta-transactions : official relayer tutorial (near-api-js 3.0.4, `@near-relay/*`, pagoda-relayer-rs; gas keys "since nearcore 2.13"): 2026-10-21
- https://docs.auth.near.org/protocol/concepts/relayer : NEAR Auth relayer concept, SDK flow names: 2026-10-21
- https://github.com/Peersyst/fast-auth (commit 8f84383, 2026-09-25) `apps/relayer/src/modules/relayer/relayer.service.ts`, `apps/relayer/src/config/near.config.ts`, `contracts/fa/src/lib.rs#L428-L613`, `packages/sdks/react/src/core/signers/signer.ts` : NEAR Auth relayer endpoints, MPC deposit default 2 NEAR, sha256(sign_payload): 2026-10-21
- https://github.com/near/pagoda-relayer-rs (README; GitHub API `pushed_at` 2025-02-20) : reference relayer status: 2026-10-21
- npm `@hot-labs/near-connect@0.11.4` `build/types/index.d.ts`, `skills/near-connect-transactions/SKILL.md` : `signDelegateActions`: 2026-10-21
- npm `@near-relay/server@0.1.8`, `@near-relay/client@0.1.6` (`time.modified` 2024-10) : stale: 2026-10-21
- [spikes/meta-tx/RESULTS.md](../spikes/meta-tx/RESULTS.md) : all measured numbers and tx hashes: 2026-10-21

## Review corrections (2026-10-21)

From the security review's fact check ([../plan/review-security.md](../plan/review-security.md) §4, F-04a, F-06). The body above is unchanged.
- **"Protocol parameters" table:** testnet moved to **protocol 88** (nearcore 2.14.0-rc.5) on 2026-10-21, between ≈ 08:00 and 14:00 UTC; the parameters listed are unchanged. Mainnet is still 86.
- **The MPC `sign` deposit:** the Peersyst reference relayer's default `NEAR_MPC_DEPOSIT_AMOUNT` is 2 NEAR, but **1 yocto is enough**: testnet tx `FzULQ33cjnR4HFc9iBGzR5V8oScLhJuUKAHqeixjFgLE` (2026-09-26) called `fast-auth.testnet.sign` with a 1-yocto deposit and logged "MPC signing successful", and `fast-auth` refunds the deposit on every path. So a relayer needs no NEAR reserve per concurrent `sign`.
