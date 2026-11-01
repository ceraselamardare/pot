# Spike 3: NEP-366 relayer + sponsored onboarding (RESULTS)

> THROWAWAY. Ran 2026-10-21 on NEAR **testnet** (protocol 87, nearcore 2.14.0-rc.5, gas price 1e8 yocto/gas, avg block 555 ms).
> Owner: relayer. Never import this code into the product. KB write-ups: [../../kb/meta-tx-relayer.md](../../kb/meta-tx-relayer.md), [../../kb/accounts-onboarding.md](../../kb/accounts-onboarding.md), [../../kb/fungible-tokens-usdc.md](../../kb/fungible-tokens-usdc.md).

## Questions
1. Can a user's NEP-366 delegate carry the **1 yoctoNEAR** that `ft_transfer` / `ft_transfer_call` require, and who pays it and the gas?
2. What does sponsored onboarding cost (named sub-account, implicit, `.testnet` registrar), and how long does it take?
3. Do the negative cases fail safely (expired, replayed nonce, receiver not allowlisted), and what does a failure cost the relayer?
4. What does one relayed action cost, and how fast is it?
5. (optional) Gasless DAO vote.

## Answers (short)
1. **Yes, but the relayer pays the 1 yocto, not the user.** The user's NEAR balance changed by **0 yocto**; the relayer's by exactly `-(tokens_burnt + 1 yocto)`. Deposits inside a delegate always come from the relayer (nearcore `total_deposit`), so a user account needs **0 NEAR**. That contradicts the plan's "1 yocto from a funded user account".
2. **About 0.0085 NEAR per user, 4-6 s.** That is account creation (0.00709-0.00745 NEAR, including the protocol-85 0.007 NEAR `account_creation_charge`), plus 0.00125 NEAR FT storage and 0.00019 NEAR gas. All five variants work with **0 NEAR in the new account** (zero-balance accounts, NEP-448). Creating the account and registering it on the token in parallel takes 3.8-7.9 s to FINAL (median about 5 s).
3. **Yes.** The validator rejects each case before submission. Forced on-chain anyway, each delegate-level failure costs the relayer **0.000082 NEAR (1.27 Tgas)**. Inner-call failures are **hidden in the top-level status**: it is `SuccessValue("")`, so you must check `receipts_outcome`.
4. **0.000284 NEAR (3.06 Tgas) per relayed 1-yocto `ft_transfer`.** `ft_transfer_call` into a contract costs 0.0008 NEAR (8.9-9.2 Tgas), a Sputnik `act_proposal` 0.00033-0.00038 NEAR, and `add_proposal` 0.00031 NEAR. Median latency from submit to EXECUTED_OPTIMISTIC is **2.48 s**; to FINAL it is **4.21 s**.
5. **Done.** In a fresh Sputnik DAO with bond 0, `add_proposal` and two `act_proposal` votes were all relayed. The second voter is a **0-NEAR account signing with a function-call key (allowance 0) restricted to the DAO and `act_proposal`**, and the proposal reached `Approved`.

## Setup

| Role | Account | Notes |
|---|---|---|
| Relayer R (faucet) | `potspike-relay-yoqw.testnet` | near-cli-rs `sponsor-by-faucet-service`, **10 NEAR** ([Ff6DeUDy…](https://testnet.nearblocks.io/txns/Ff6DeUDyw5wZyu84EWseWoiQKeyvywvj3kSmagZeeJzz)); ~9.81 NEAR before the DAO test, ~4.19 NEAR after |
| User U1 | `u1.potspike-relay-yoqw.testnet` | named sub-account, 0.05 NEAR, 1 full-access key (FAK) |
| Onboarded users | `u2z25811.…`, `u2f74523.…`, `d8c8f9a1…ad8a`, `e8490d5c…f36f`, `potspike-relay-yoqw-t2577.testnet` | spike 05 |
| Token | `wrap.testnet` (wNEAR, 24 dec) | `ft_on_transfer` receiver: `ref-finance-101.testnet` |
| DAO | `potspike-relay-yoqw.sputnikv2.testnet` | council = U1 + `u2z25811…`, bond 0, threshold [1,2] |

Stack: Node 22.22, `near-api-js@7.3.1` (only runtime dependency; `borsh@2.0.0` and `@noble/hashes@2.2.0` come in transitively), `tsx`, `typescript`. RPC: `https://rpc.testnet.fastnear.com` behind a 429-retrying `fetch` wrapper (see Gotchas).

Run: `npm i && npx tsx src/01-setup.ts` (then `02`…`10`). Keys are in `.keys/` (gitignored) or `~/.near-credentials/testnet/`. Raw outputs are in `out/*.jsonl` and `out/*.log`.

| File | What |
|---|---|
| `src/client.ts` | **browser side**: `signDelegateSimple` (`createSignedMetaTransaction`) and `signDelegateManual` (`buildDelegateAction` + `signer.signDelegateAction`, custom nonce and expiry) → base64 |
| `src/relayer.ts` | **server side**: `decodeSignedDelegate` (borsh + canonical re-encode check), `validate` (allowlist, deposit and gas caps, rate limit, local signature check, expiry window, key exists, nonce, FC-key rules), `submit` |
| `src/01-*.ts` … `src/10-*.ts` | the experiments below (`03b`, `05b` are small top-ups) |
| `src/zz-kb-*.ts` | compile/run checks of the code snippets pasted into the KB files (server snippet run verbatim: decode + signature check OK) |

## Results

### 3a. Relayed 1-yocto `ft_transfer` (`02-relay-ft-transfer.ts`)
- Tx [Jc8M3vzY…](https://testnet.nearblocks.io/txns/Jc8M3vzYmAwnvvWowFJu4cdYGieCaum8nvtvESUjew9): 3.326 Tgas, 0.000287962942154500 NEAR burnt. Receipts: tx→receipt at R 0.513 T, delegate receipt at U1 0.513 T, `ft_transfer` at wrap 1.853 T, 2 refunds.
- **User NEAR delta = 0 yocto. Relayer NEAR delta = −287962942154500000001 yocto (= burnt + 1).** wNEAR moved U1→R as signed.
- Access-key nonce went from 274089706000001 to 274089706000002, and the delegate used ak+1. The base64 SignedDelegate was **420 chars**.

### 3a'. Relayed `ft_transfer_call` with `ft_on_transfer` (`03-relay-ft-transfer-call.ts`)
Receiver `ref-finance-101.testnet` (Ref exchange, msg `""` = deposit). 100 Tgas attached, 1 yocto.

| Run | Tx | Outcome | Gas / burnt |
|---|---|---|---|
| U1 not registered on Ref | [G7joFZ8B…](https://testnet.nearblocks.io/txns/G7joFZ8B9DRxnFMsaA6NkKZfXavvWeCjurKvZqpnvUT6) | `ft_on_transfer` panicked `E10: account not registered` → `ft_resolve_transfer` refunded everything (log `Refund … to u1…`, returned `"0"`). **Top-level status `SuccessValue("")`** | 8.589 T / 0.000770 NEAR |
| Registered with `registration_only` (min 0.00102) | [9an9KUdg…](https://testnet.nearblocks.io/txns/9an9KUdgWkR88FknygVYKiiU3W7DrJodMv7DJj7EApxH) | `E11: insufficient $NEAR storage deposit` → refunded | 9.218 T / 0.000833 NEAR |
| After a 0.01 NEAR storage top-up | [3VaV9CxY…](https://testnet.nearblocks.io/txns/3VaV9CxY3qYrw8vjjHjEibfB7sX7G4J64XLJUJTbbVCP), [AqQum7zj…](https://testnet.nearblocks.io/txns/AqQum7zjbCcVSW6XmZYhbshfXdY1JKrE6LbETFmja6FY) | `ft_on_transfer` → `"0"` unused; resolve → `"1000000000000000000000"` used; Ref `get_deposits` = 0.002 wNEAR | 8.89-9.05 T / 0.00080-0.00082 NEAR; submit→FINAL 4966 ms |

In every run the user NEAR delta was 0 and the relayer delta was −(burnt + 1 yocto), measured after refunds settled.

### 3b. Sponsored onboarding (`05-onboarding.ts`, R pays everything; account creation and `storage_deposit` sent in parallel)

| Variant | Create tx | Gas | NEAR burnt (create) | Storage | Balance | Create + register (ms) | 1st relayed `ft_transfer` (ms) |
|---|---|---|---|---|---|---|---|
| Named sub-account, **0 NEAR** (CreateAccount + AddKey) | [JEMnNUjx…](https://testnet.nearblocks.io/txns/JEMnNUjxkETR79zSWoqJQJhRpdVWzmN8FABo7vnKvKy) | 8.343 T | 0.007091964925 | 182 B | **0** | 4273 | 3672 ([1AiieF8Y…](https://testnet.nearblocks.io/txns/1AiieF8YJD8TBtQYQLEeS9bVfxiaYbZzjRQpyQT2AFf)) |
| Named sub-account, 0.01 NEAR | [us1HunHh…](https://testnet.nearblocks.io/txns/us1HunHh5UyoFJvQPz5gwAjiByyB5xUtDzS5ZD4GdXN) | 8.573 T | 0.007114989538 | 182 B | 0.01 | 3760 | 4321 |
| Implicit, Transfer **0 yocto** | [DNz8hbLY…](https://testnet.nearblocks.io/txns/DNz8hbLYXWd3SmqrdwSW9ajdaKWu5YScpr8wZ1bp2nHM) | 8.573 T | 0.007114989538 | 182 B | **0** | 5731 | 4356 |
| Implicit, Transfer 1 yocto | [F1Ce72De…](https://testnet.nearblocks.io/txns/F1Ce72DeN44q62MyAdLnpAFi76pqX2cgenERhrB6Hxn5) | 8.573 T | 0.007114989538 | 182 B | 1 yocto | 7869 | 4494 |
| Top-level `.testnet` via `testnet.create_account`, 0 deposit | [8uKaidst…](https://testnet.nearblocks.io/txns/8uKaidstB38WcZ7hCXFiAo88vzQpiHVBDBC2FrxXqiMM) | 12.393 T | 0.007452394103 | 182 B | **0** | 5020 | 4403 |

The wrap.testnet `storage_deposit` for each new account cost 0.00125 NEAR deposit plus 0.000189-0.000191 NEAR gas (2.12 Tgas). The relayer's total for the 0-NEAR named variant was **0.0085312 NEAR**. The 0.05 NEAR U1 creation took 3834 ms to FINAL.

### 3c. Negative tests (`04-negative.ts`, `06-extra.ts`)

| Case | Validator (pre-submit) | Forced on-chain result | Relayer cost |
|---|---|---|---|
| Receiver `usdc.fakes.testnet` not allowlisted | ✅ rejected `receiver … not on allowlist` | not sent | 0 |
| `near_deposit` **0.01 NEAR** inside the delegate | ✅ rejected (method + deposit cap) | [3gcn7337…](https://testnet.nearblocks.io/txns/3gcn73372f2V4SKXnnefVn13csbXoYYiobmUkqq6Yjg9) **succeeded: R paid 0.01 NEAR, U1 received 0.01 wNEAR, U1 NEAR delta 0** (shows the relayer-drain risk) | 0.0102648 NEAR |
| Expired (`max_block_height` = head+2, sent 6 s later) | ✅ rejected `maxBlockHeight 274090320 vs head 274090329` | [6nEHfufQ…](https://testnet.nearblocks.io/txns/6nEHfufQj5RKrpUf3Hwh7ZHwCU3HG6q6E6v69DpotZJd) `Failure: DelegateActionExpired` (top-level) | 0.0000820 NEAR (1.266 T) |
| Replay of an already-used delegate (first use [3RDKr9Ej…](https://testnet.nearblocks.io/txns/3RDKr9EjzuBCzLCw4ZzTLxK4o7kkqKdPDjh8dUtfFeBm)) | ✅ rejected `nonce … <= access key nonce` | [FLBktQyd…](https://testnet.nearblocks.io/txns/FLBktQyd9zvdhPd6JTZqNQMsuGynQhjvWbfnsWsSq6gu) `DelegateActionInvalidNonce {ak_nonce: 274089706000008, delegate_nonce: 274089706000008}` | 0.0000820 NEAR |
| Nonce = ak+1000 | ✅ accepted | [3oBsKNH4…](https://testnet.nearblocks.io/txns/3oBsKNH4qvx43Bw5um1BCLCfKYjYT6jaUyLNfYh1KFq8) success; ak nonce 274089706000008 → **274089706001008** | 0.000286 NEAR |
| Older pending delegate (ak+1) after that jump | ✅ rejected | [5GVtDfJf…](https://testnet.nearblocks.io/txns/5GVtDfJfdQGtqCzHGX4kphjtxMv7imUfYdzoZDC8GZy3) `DelegateActionInvalidNonce` (jumping the nonce cancels pending delegates) | 0.0000820 NEAR |
| Relayed `AddKey` (FC key) inside a delegate | n/a | [55MeUHUo…](https://testnet.nearblocks.io/txns/55MeUHUoHdRimbbMLhPHERJxkhhwvpjCc96N7MiJ1taa) success (non-FunctionCall actions are allowed) | 0.000103 NEAR (1.48 T) |
| **Function-call key + 1 yocto** (`ft_transfer`) | ✅ rejected | [8L13LUK9…](https://testnet.nearblocks.io/txns/8L13LUK9ES5pcAyuBNTvnwW959PfQgvVKXW9HiQDWFXB) `DelegateActionAccessKeyError: DepositWithFunctionCall` | 0.0000820 NEAR |
| Function-call key + 0 deposit (`ft_transfer`) | (accepted by key rules) | [AjXrZeqU…](https://testnet.nearblocks.io/txns/AjXrZeqUXmb2mGomjP79AkkoDg9dbbNxCUKaNDXkSuuF) delegate OK; wrap panicked `Requires attached deposit of exactly 1 yoctoNEAR`; **top-level `SuccessValue("")`** | 0.000231 NEAR |
| Sender account does not exist | ✅ rejected `Access key … does not exist` | [2Qj8BvNN…](https://testnet.nearblocks.io/txns/2Qj8BvNNKoqCZEQvKxnYCnadAco8ZLNiy3FGkoA2sekw) `AccountDoesNotExist`; the 1-yocto deposit came back to R | 0.0000819 NEAR |
| Two `SignedDelegate` actions in one tx | n/a | **rejected by RPC** before inclusion: `DelegateActionMustBeOnlyOne` | 0 |
| `[Transfer(1 yocto) → user, SignedDelegate]` in one tx | n/a | [8sev9J1Z…](https://testnet.nearblocks.io/txns/8sev9J1ZYRumHsN5aoyF3TMvwgCkHm7tjKqfiGNz81CD) success (other actions may accompany one delegate) | ~0.00029 NEAR |

### 3d. Cost and latency per relayed action (`06-extra.ts d 6`, sequential 1-yocto `ft_transfer`)
Hashes: [Fn5zsEUs…](https://testnet.nearblocks.io/txns/Fn5zsEUsMrd9Tt9KgrJ58niWJvqK1HQdHZpo4M9fQkxq), [8j7VXyiQ…](https://testnet.nearblocks.io/txns/8j7VXyiQpJRE9UEeQvmQ3s5APWfcCkqQrS75BQRXNnWJ), [8KkDDftB…](https://testnet.nearblocks.io/txns/8KkDDftBrZ3gDJjddXGRzqAVZ2y4x7DSiqsnoeeV7c8w), [3ySz6QVi…](https://testnet.nearblocks.io/txns/3ySz6QVikmFVMp9wLho38WeShAppcs3E5HQhYroPisgQ), [8Rdi9U48…](https://testnet.nearblocks.io/txns/8Rdi9U48zgZpAVqkzNbahBi9wcJ5cNqCALsNACHEchwn), [8aDKZqn6…](https://testnet.nearblocks.io/txns/8aDKZqn6hiBqW3RUNnLdgBPzFt2BForz2ufwcyfYhubF)

| Metric (n=6) | Median | Range |
|---|---|---|
| Client sign (2 RPC reads) | 120 ms | 85-144 |
| Server validate (2-3 RPC reads + ed25519 verify) | 161 ms | 114-204 |
| Submit → `EXECUTED_OPTIMISTIC` | **2481 ms** | 2309-2886 |
| Submit → `FINAL` | **4214 ms** | 3811-4760 |
| Gas / NEAR burnt | 3.0616 Tgas / **0.000283845 NEAR** (+1 yocto) | constant |

At the 1e8 yocto/gas gas price, 1 Tgas = 0.0001 NEAR.

Concurrency (`09-concurrency.ts`, 5 users and 5 delegates at once):

| Mode | Wall (ms) | Per-tx (ms) | Result |
|---|---|---|---|
| A: one `Account` instance (in-process NonceManager) | 2734 | 2649-2732 | 5/5 |
| B: 5 `Account` instances, **same key** (like 5 serverless invocations) | **7620** | 2781-7620 | 5/5 after `InvalidNonce` retries |
| C: 5 instances, **one key each** (key pool) | 2644 | 2455-2644 | 5/5 |

### 3e. Gasless DAO vote (`10-dao-vote.ts`)

| Step | Tx | Gas / burnt |
|---|---|---|
| R `sputnikv2.testnet.create` with 5.6 NEAR attached (full-code deploy; DAO storage **540,351 B ≈ 5.40 NEAR locked**) | [EuJaVvaE…](https://testnet.nearblocks.io/txns/EuJaVvaE82RSymxBXB1qW4uvCqKkEV5SvPkZHA2JKv7x) | 88.87 T / 0.0151 NEAR + 5.6 NEAR deposit |
| U1 `add_proposal` {kind "Vote"}, 0 deposit (bond "0"), relayed | [7idmKwbP…](https://testnet.nearblocks.io/txns/7idmKwbPtWHqu8oBnGqs6s4jCUtDg6LYLP5u3LfNHPED) | 3.54 T / 0.000309 NEAR |
| U1 `act_proposal` {id 0, "VoteApprove", proposal "Vote"}, FAK, relayed | [8DKQ5mYX…](https://testnet.nearblocks.io/txns/8DKQ5mYXkjxDApBffLpPVMW5Tw63FjNdWGzYJovghfTW) | 3.72 T / 0.000327 NEAR |
| U2Z (0 NEAR) relayed `AddKey` FC {receiver DAO, methods [act_proposal], **allowance 0**} | [BZrXBetk…](https://testnet.nearblocks.io/txns/BZrXBetkh7tgnXiU6ENQE7xH2tzhjtwgZz16BhTsUsNh) | 1.48 T / 0.000103 NEAR |
| U2Z `act_proposal` VoteApprove **signed by the FC key**, relayed → status `Approved` | [ChDaMs1m…](https://testnet.nearblocks.io/txns/ChDaMs1mJTyaFb8K5Bnj7gqZjHxMAVovBrbLnuvsDEfM) | 4.44 T / 0.000377 NEAR |

After the test U2Z had 0 NEAR and 342 bytes of storage, so it is still a zero-balance account.

Extra checks: an FC key {hello.near-examples.testnet, [set_greeting]} signed a 0-deposit delegate that succeeded ([8KAduxCN…](https://testnet.nearblocks.io/txns/8KAduxCN5T9N3eqnA2Dm9V1SPDig78z7ozpNsCqnfhAq), 2.71 T / 0.000226 NEAR). The key's **allowance stayed 0.25 NEAR**, because delegates never consume allowance.

### Side probe: `usdc.fakes.testnet` (`08-fake-usdc-probe.ts`)
R minted 1.0 to itself ([CiFAQ9WF…](https://testnet.nearblocks.io/txns/CiFAQ9WFCQ2c7GxodrLSBis4FqMH2r71dTcGEePnFvuy)) and 5.0 to U1 ([ttM9wnr9…](https://testnet.nearblocks.io/txns/ttM9wnr9aVRaQFyQzpCows9ScChuphqQmNeD28sPmxs)). Then **R burned 1.0 of U1's balance** ([Ehr1JeVH…](https://testnet.nearblocks.io/txns/Ehr1JeVHKCXHnT5KqiDNuih7gZrC4FQBXKpss5EkDGR6)). So `mint` **and** `burn` are open to anyone, and the token is unusable for a judged demo. `set_decimals`, `set_token_name` and `set_icon` were deliberately not called.

## Gotchas found while running
- The free `rpc.testnet.fastnear.com` returned 429s under a shared IP, sometimes as HTTP 200 with JSON-RPC `code -429`. `rpc.testnet.near.org` answered `-429 "THIS ENDPOINT IS DEPRECATED"`. near-api-js 7.3.1 does **not** retry 429 (it retries only 500/503/408); `src/lib.ts` wraps `fetch`.
- `wait_until: FINAL` does **not** wait for gas-refund receipts. A balance read right after FINAL showed the relayer about 0.00575 NEAR poorer than the settled value. The cause is prepaid gas bought at `min_gas_purchase_price` = 1e9 (10× the gas price) and refunded later; `settledNear()` polls until the balance is stable.
- Ref's `storage_deposit {registration_only: true}` registers at the minimum only; depositing a token needs more (`E11`).

## Conclusion
The plan's gasless architecture works on testnet today with near-api-js 7.3.1 and about 150 lines of relayer code. It needs three corrections. (1) The relayer, not the user, pays every attached deposit, including the 1 yocto, so users need 0 NEAR and the relayer must cap deposits. (2) A relayed tx's top-level status hides inner failures. (3) The money path (1 yocto) needs a **full-access** user key, while votes and other 0-deposit calls can use a least-privilege FC key, even one with allowance 0.
