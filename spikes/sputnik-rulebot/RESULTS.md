# Spike 1: Sputnik DAO + 1-of-1 `rulebot` role (throwaway)

> Owner: sputnik. Run on 2026-10-21, NEAR testnet, protocol 87. Throwaway: never copy into the product.
> Reference doc: [../../kb/sputnik-dao.md](../../kb/sputnik-dao.md).

## Question
Does a single `rulebot` role (1 member, threshold 1/1) finalize **and execute** a proposal on its own, with
`proposal_bond: "0"` so gasless callers attach no deposit? Does the member-majority path work? (Plan C3 Spike 1; go/no-go for design A vs design B.)

## Answer: YES, design A works (with policy hardening)
- One `act_proposal VoteApprove` from the rulebot account executed a NEAR `Transfer`, an FT (`wrap.testnet`) `Transfer` and an `AddMemberToRole` in the same transaction. No member vote was needed, and even a member's `VoteReject` did not block it (only the voter's own roles are evaluated).
- `add_proposal` with 0 deposit works when bond = "0". 1 yocto fails `ERR_MIN_BOND` (exact equality).
- Member path: 2-of-3 approves a `ChangePolicyAddOrUpdateRole`; 4-of-6 approves a transfer; 4-of-6 rejects → `Rejected`.
- The plan's policy needs four fixes. (1) Add `transfer:Finalize` (rulebot) and `*:Finalize` (members), otherwise a `Failed` transfer can never be retried. (2) Set `quorum: "1"` everywhere, otherwise an empty Group role lets any Finalize execute unvoted proposals (proved below). (3) Caps, budgets and the role name must live in the Rulebot. (4) The DAO needs a NEAR float for proposal storage.

## Setup
| What | Value |
|---|---|
| Faucet parent (10 NEAR) | `potspike-dao-svuw.testnet` |
| Sub-accounts | `maya`, `leo`, `priya` (members), `rulebot` (plain account standing in for the Rulebot contract), `recv`, `newbie`, `g1` (all `.potspike-dao-svuw.testnet`) |
| Factory | `sputnikv2.testnet`. Its default DAO code is `AA4nA45vauiac3jdVwJTzSdUP3oj2r1fDaPAb2mHdgcH` = v[3,31], commit `7764926` (2024-08-24), 539,647 bytes |
| DAO (spike 1) | `potspike-dao-svuw.sputnikv2.testnet` (22 proposals at the end) |
| DAO (spike 1b) | `g1.potspike-dao-svuw.testnet`, using the testnet **global contract** `Ea8tHXFSQVszVwGASyzAfLq65DjcRDhkfab4FcPaRpgD` = `sputnikdao2@278adc7` (2025-04-07; same API as the mainnet DAO code). It still has its own full-access key (spike only) |
| FT | `wrap.testnet` (wNEAR, 24 decimals, storage 0.00125 NEAR) |
| Policy | [policy.json](policy.json) (as the task specified) → later + `transfer:Finalize` for rulebot. Recommended: [policy-hardened.json](policy-hardened.json) (tested on g1) |
| Tools | near-cli-rs 0.30.1 signs **offline** (`sign-with-access-key-file … --nonce --block-hash … display`), and `send_tx` (wait_until FINAL) goes over rotated RPCs. Helpers are in [env.sh](env.sh) |

Scripts: [01-accounts.sh](01-accounts.sh), [02-create-dao.sh](02-create-dao.sh), [03-tests.sh](03-tests.sh) (the exact sequence). The full outcomes for each label are in `logs/<label>.json`.
The decoded mainnet DAO ABI (`__contract_abi`, v3.2) is in [abi/](abi/sputnikdao2-v3.2-2b0f34a.mainnet.abi.json).

## Results (tx links: `https://testnet.nearblocks.io/txns/<hash>`; gas = total burnt across all receipts)
### DAO creation on `sputnikv2.testnet` (300 Tgas attached)
| Deposit | Result | Tx | Gas |
|---|---|---|---|
| 0.01 / 0.1 / 1 NEAR | `ERR_NOT_ENOUGH_DEPOSIT:5396790000000000000000000` (factory: `(code_len+32)·1e19`) | [7moVeSU…](https://testnet.nearblocks.io/txns/7moVeSUC8R3Sd1zF842vvF6PdkygjwVBX3CY568PDx4g), [CJhnDky…](https://testnet.nearblocks.io/txns/CJhnDky7c8UJk8cM2bPyZE76mKBzp2KGxPLcAhgw8Y8), [4d5qe6k…](https://testnet.nearblocks.io/txns/4d5qe6kSBSxb1YzADeWZoXVTzHmZTesRY2zcDUrQNR7s) | 12.5 T each (0.0012 NEAR) |
| 5.39679 NEAR (factory floor) | `new` fails `LackBalanceForState {amount: 9630000000000000000000}`; `on_create` → `false` and refunds the deposit | [6TYit2s…](https://testnet.nearblocks.io/txns/6TYit2sz2DePcaeo3NQeuyBasnYpE9yNiPDMieeDGMrW) | 89.7 T (0.0089 NEAR) |
| **5.40642 NEAR** | **OK**: `storage_usage` 540,642 (code 539,647 + 995), free balance 0 | [8Jadvk4…](https://testnet.nearblocks.io/txns/8Jadvk48Krq48cd4f8XvD1XCJMHNrjAmasiCSMvRyvhP) | 89.1 T (0.015 NEAR) |

The minimum working deposit is `storage bytes × 1e19`. It grows with the policy and config size, so budget **≈5.45 NEAR plus a float** per DAO on this factory.

### Spike 1 tests (DAO `potspike-dao-svuw.sputnikv2.testnet`, v3.31)
| # | Test | Outcome | Tx | Gas (T) |
|---|---|---|---|---|
| a0 | rulebot `add_proposal`, 0 deposit, DAO free balance 0 | **FAIL `LackBalanceForState` on the DAO, short 0.00227 NEAR**. The DAO pays proposal storage | [9X4PCrD…](https://testnet.nearblocks.io/txns/9X4PCrDYT3eDpFVvTQDnVXgED3canScXkpM7zMScA9RF) | 2.67 |
| a1 | after a 0.3 NEAR top-up ([9Vxbk…](https://testnet.nearblocks.io/txns/9VxbkTfJyEsDPXn2RopHxAff3jWnsPmENQer1ywW8wX2)): the same call | OK, returns `0` (u64). Storage +194 B | [3q7bxsd…](https://testnet.nearblocks.io/txns/3q7bxsdpHqcNmsPhBEcDdnsgcYhhVZeUQRzJVnFxBKoN) | 2.67 |
| a2 | **one** rulebot `VoteApprove` (`{"id":0,"action":"VoteApprove"}`) | **Approved + executed**. recv 0.10 → 0.11 NEAR, `vote_counts {"rulebot":[1,0,0]}`. Storage +97 B | [Hh8tnFF…](https://testnet.nearblocks.io/txns/Hh8tnFFkT1J4RAzWgjhcJKQztu7qjfpH3TjJMfXgbDUA) | 7.05 |
| b1 | rulebot FT Transfer 0.05 wNEAR → registered `recv` | **Approved + executed** (`ft_transfer` with 1 yocto, memo = description) | [FDhkXGy…](https://testnet.nearblocks.io/txns/FDhkXGyjBfzyNSRi85oAW1fTKHERKh7oVnAKL7SZsxsn) | 8.82 |
| b2 | the same to **unregistered** `priya` | tx **OK**, but `ft_transfer` panics `The account priya… is not registered`. The 1 yocto is refunded and the proposal goes to **`Failed`**. wNEAR stays in the DAO | [3WjorvaN…](https://testnet.nearblocks.io/txns/3WjorvaNbUfwvT8cX5e1SaB7KjkD9bcppg8Tg1Wnobeb) | 7.85 |
| b3 | retry options with the plan's policy | rulebot re-vote: `ERR_PROPOSAL_NOT_READY_FOR_VOTE`. rulebot/maya `Finalize`: `ERR_PERMISSION_DENIED` | [Ds5VEs…](https://testnet.nearblocks.io/txns/Ds5VEsEKpXTjtRpEChnctA8jWtrfAQwcxQU12Z4AiYCm), [2xu4Bp…](https://testnet.nearblocks.io/txns/2xu4BpmhKw8PqxydKwB6941DQQro4nvh4Ufaz3w4fFFc), [7ktvS4…](https://testnet.nearblocks.io/txns/7ktvS4zPnxMSZf3ze6Q97BCXy4dwLcBgCmQBoB7G5KUz) | 2.5 |
| b4 | members add `transfer:Finalize` to the rulebot role (`ChangePolicyAddOrUpdateRole`): maya approves with a v3.2-style `proposal` arg (ignored by v3.31), then leo approves | 2 of 3 → Approved, log `Updating existing role in the policy:rulebot` | [5EwuAS…](https://testnet.nearblocks.io/txns/5EwuAS67qAdcxmqHUMcej4R1Tf13rP3qLidxQJfRV9vm), [77utEX…](https://testnet.nearblocks.io/txns/77utEXvubrR9ZHj9d2tgpccokv9SoitFhyzz6G7m8Acf), [5Sc1a3…](https://testnet.nearblocks.io/txns/5Sc1a3AqZqqLys1kNED8vwwG5Wh7GDMjg8H6RC9thRwj) | 2.8/3.0/3.9 |
| b5 | after `storage_deposit` for priya, rulebot `Finalize` on the Failed proposal | **Failed → Approved**, re-executed, priya +0.04 wNEAR | [3DFTuD…](https://testnet.nearblocks.io/txns/3DFTuDyoSLm1j8pZ48RtfgSznLT4xw5wYRvkzZnCLTvq) | 8.80 |
| c | rulebot `AddMemberToRole(newbie, member)`, then one vote | **Approved**. `get_policy` member group 3 → 4 | [HPPVqM…](https://testnet.nearblocks.io/txns/HPPVqMdomDVpH2nbTd5U2CcVi2wRYQEkNj7wWLbV3J5w), [27cF7M…](https://testnet.nearblocks.io/txns/27cF7MysqtezaX8fhJMHr4mJGCWucT7NNCT1toJu4yjN) | 2.66 + 3.76 |
| e | **maya** proposes 0.1 wNEAR to herself, **maya votes Reject**, then the rulebot approves alone | **Approved + executed** (`vote_counts {"member":[0,1,0],"rulebot":[1,0,0]}`). Sputnik enforces no cap | [8i6YbQ…](https://testnet.nearblocks.io/txns/8i6YbQZXroaXPk3oV4Y5PG9tWZAPVhvUAuQrGEZvr6YC), [7aD2FH…](https://testnet.nearblocks.io/txns/7aD2FHd3Ntj98gLxbhW1gFCA1RPFQ89cTKJzXduu6Zi9), [3EvQZE…](https://testnet.nearblocks.io/txns/3EvQZEnkiujotzyTpHRZ3PXMdT5pGKjSrXGTSUybJ93t) | 8.92 |
| d/h | rulebot proposes and does not vote. maya + leo approve: 2 of 4 → InProgress. 2 members join (6 total). priya approves: 3 → **still InProgress** (bar moved 3 → 4). newbie approves → Approved + paid | in-flight threshold follows the **current** group size | [EWuvkq…](https://testnet.nearblocks.io/txns/EWuvkq261zV6pXj9zaytKLEkXAhsYWRpxmKnQUyLwLhZ), [4Vjsy6…](https://testnet.nearblocks.io/txns/4Vjsy69siBME4KxLpoCB7axpy1fmaEfU99ZiZ5sDNYe7), [3syMxS…](https://testnet.nearblocks.io/txns/3syMxS97tY2YNhgee7xqW8CZWdV1uX7XgmhdLXCBbXFP) | 2.9 / 7.2 |
| d2 | 4 of 6 members `VoteReject` | 3 rejects → InProgress; 4th → **`Rejected`**, nothing paid | [CaVfkQ…](https://testnet.nearblocks.io/txns/CaVfkQr9zX3iyHp5foumT32bb86ap5kH8edcMZuCzS8J) … [8N92T4…](https://testnet.nearblocks.io/txns/8N92T4bupwKdQA9dzQbn8K2wZMZ92orWn5ytNMWRDTav) | 2.9-3.6 |
| f | `add_proposal` with **1 yocto**, bond 0 | `panicked at 'assertion failed: \`(left == right)\` left: \`1\`, right: \`0\`: ERR_MIN_BOND'` (proposals.rs:491) | [GibEqi…](https://testnet.nearblocks.io/txns/GibEqiwEViEgFxy2QVN5uJkUsYXor5DzNRZ94zSveZNo) | 2.61 |
| g | rulebot proposes `ChangePolicyUpdateParameters` / `ChangePolicy` / `FunctionCall`, and rulebot `VoteApprove` on a `Vote` poll | all `ERR_PERMISSION_DENIED` (add: proposals.rs:518, act: :546) | [An4bTK…](https://testnet.nearblocks.io/txns/An4bTK1SUMC5kKgHpGgDH2ChTsC2QRvDDKBkdvpo9Bpn), [9CVYGD…](https://testnet.nearblocks.io/txns/9CVYGDiJ1xka4jYBJEpipjD1hY8247o42u2ZKvC5zK8h), [F3tkMF…](https://testnet.nearblocks.io/txns/F3tkMFZCT7njwMJmLZKnamC5AjNcEtm1qfncaVP2M3qN), [AGoPNG…](https://testnet.nearblocks.io/txns/AGoPNG2MpoPczWCxqGzNpfDoUfRvcgQ1vZgdb2rxzJAs) | 2.5 |
| i | Transfer **with `msg`** (`ft_transfer_call`) | `wrap.testnet` panics `attempt to subtract with overflow` (it gets only the static 10 Tgas) → **Failed** | [5gpUAu…](https://testnet.nearblocks.io/txns/5gpUAu411LRHaoXtPYSgE4c7vUnTvenjPkLkzcM1cdAo) | 8.17 |
| m | minimum prepaid gas for an FT auto-approve | 12/18/22 T → `Exceeded the prepaid gas.`; **26 T OK** (8.85 T burnt). `add_proposal` OK with **3 T** | [9zEhbS…(22T)](https://testnet.nearblocks.io/txns/9zEhbS9DyP6QJjEKhVUcuEZTgvEhBWb4yHpkLrsfoW5N), [8UFbMF…(26T)](https://testnet.nearblocks.io/txns/8UFbMFRrgL9yS5ThWkZw8FWoiLWLn2T33mBfN4Y7UdtG), [HokdhF…](https://testnet.nearblocks.io/txns/HokdhFWVstGrx4xBFgJjhtYqPhRUWuSb6y8RF7VLkTkC) | — |
| x | `proposal_period` set to 120 s (4/6 vote) | Failed + expired → rulebot Finalize → **Expired**. A poll older than 120 s, voted → **Expired** (vote stored) | [HfXyeB…](https://testnet.nearblocks.io/txns/HfXyeBMX3jcQaK5Deyu1q24YBuNrhjZFEy4RwChskiX5), [38CLTW…](https://testnet.nearblocks.io/txns/38CLTW6gCG5dW6kb1Z13YwAbLtyCAy3TMFvsvpW6mAru), [GQtMvz…](https://testnet.nearblocks.io/txns/GQtMvzCw3H8ex1bUB6mGNbf2c7LxaBe4U3XeNQ7j9GBn) | — |
| x9 | rulebot approves a transfer 133 s old | tx **OK**, status **Expired**, nothing paid. Then Finalize → `ERR_PROPOSAL_NOT_IN_PROGRESS` | [HPkRBz…](https://testnet.nearblocks.io/txns/HPkRBznqvEHaLNmsZQrZL3EXSjbgzkgNXjAjvu3TJpxe), [2JffYi…](https://testnet.nearblocks.io/txns/2JffYiFYVr5Rz4AkcHV4kDLDRwuTXPGuNCJzLzLAvW9N) | 2.85 |
| n | NEAR Transfer to a non-existent named account | `AccountDoesNotExist`, refund to the DAO, **Failed** | [62BDvY…](https://testnet.nearblocks.io/txns/62BDvYkMVhMnymg4KshKs2bbKi3PRrD24dbhkSC2LCXp) | 6.46 |
| **j** | add an **empty** Group role (`organizers`, no perms, quorum 0), then the rulebot `Finalize`s a member transfer with **zero votes** | **Approved + executed** (`vote_counts {}`). Role removed afterwards (`ChangePolicyRemoveRole`) | [HpyuuM…](https://testnet.nearblocks.io/txns/HpyuuMRbc1UNLT513pLkf1XWymVPT3shd36SrTr8roQj), [Eb2LgC…](https://testnet.nearblocks.io/txns/Eb2LgCW9HS4u44mrT3QiCVG2ymve8CBvqtrT8kwkek1C), [H3sDkM…](https://testnet.nearblocks.io/txns/H3sDkMyjDyvsVHZ5kiak2WWgoz2xK4Cqv4odNZtN7zro) | 7.02 |

### Spike 1b: DAO on the testnet global contract (mainnet-like API), `g1.potspike-dao-svuw.testnet`
| Test | Outcome | Tx | Gas (T) |
|---|---|---|---|
| `contract deploy … use-global-hash Ea8t… with-init-call new {config, policy}` | OK, log `Contract state version: V2`. `storage_usage` **1,210 B** (0.0121 NEAR; includes 1 access key) | [8aNJW8…](https://testnet.nearblocks.io/txns/8aNJW8xqtuHKWGW6MsVtGdDuK94YawUHDSKALy3KvuEe) | 3.09 |
| rulebot `add_proposal` | OK `0`. Storage +261 B (adds `last_actions_log` + global `actions_log`) | [4T3NJK…](https://testnet.nearblocks.io/txns/4T3NJKUkp63YEwJKFdYpNYBT6YdMT1UPpetJPfXeFqw9) | 2.53 |
| `act_proposal {id, action}` **without** `proposal` | `Smart contract panicked: Failed to deserialize input from JSON.` | [79e66D…](https://testnet.nearblocks.io/txns/79e66DV4ktrVst6Dw9zkhh8xSAeCk92DL6W1qh5ZjfRB) | 1.93 |
| `proposal` with amount +1 yocto | `panicked at sputnikdao2/src/proposals.rs:625:9: ERR_WRONG_KIND` | [7dYkbr…](https://testnet.nearblocks.io/txns/7dYkbrFm5pgR7Vmq494dryuEr8dTMfVNY4azm3rcRrcn) | 2.39 |
| extra arg `skip_execution` | `Failed to deserialize input from JSON.` (`#[deny_unknown_arguments]`) | [7GVytV…](https://testnet.nearblocks.io/txns/7GVytVLVrsLWSQ6Qc2CrMbto4PL87bHZADVgQsMXGYPA) | 1.96 |
| correct `{id, action, proposal}` | **Approved + executed**. `vote_counts {"rulebot":["1","0","0"]}` (strings). Storage +159 B | [6hmssw…](https://testnet.nearblocks.io/txns/6hmssw492F1BkveeaXKJxM3VceGmaVVZRZwbQDRCWKrw) | 6.84 |
| Transfer with `msg` (100 T attached) | `ft_transfer_call` now gets enough gas. The receiver has no contract, so `wrap.testnet` logs `Refund …`, `ft_transfer_call` returns `"0"`, and the proposal is **Approved, but nothing was delivered** | [3RPwZM…](https://testnet.nearblocks.io/txns/3RPwZMVUz5yHVHxc1VvsZCWzizQdY5GYUQRQHUhiouAU) | 12.65 |
| `ChangePolicy` → [policy-hardened.json](policy-hardened.json) + TEMP empty role (2 of 3; `proposal` = kind copied from `get_proposal`) | Approved | [79TcZt…](https://testnet.nearblocks.io/txns/79TcZtZYkjy3cmPAdnNCKSrxjHyiT2ebkNB24EXUDKkH), [GhyxK4…](https://testnet.nearblocks.io/txns/GhyxK499KhNHDvNzB8X3P99ic5zPtpRYAvVKhGRRTii5) | 2.84/4.15 |
| with `quorum "1"`: rulebot `Finalize` on an unvoted transfer | **`ERR_PROPOSAL_NOT_EXPIRED_OR_FAILED`** (bypass blocked) | [519T3C…](https://testnet.nearblocks.io/txns/519T3CHRG8HmzaaQ2gfcYk9ig6b8RMYC1WP7QikxNukJ) | 2.43 |
| with `quorum "1"`: one rulebot `VoteApprove` | **Approved + executed** (auto-approve still works) | [Cb9XdQ…](https://testnet.nearblocks.io/txns/Cb9XdQkc3SezDCgFAu353J7ANjnAcuKqYnTztWhh9HR2) | 7.01 |
| `ChangePolicyRemoveRole {role:"organizers"}` (2 of 3) | Approved | [6bLHpA…](https://testnet.nearblocks.io/txns/6bLHpAZKrorq9vQdyPLQs4c8fyCY7BEpLwqTJKQHmudF), [GNcz7m…](https://testnet.nearblocks.io/txns/GNcz7mz9YujP3qt9DEoNAhTt8nwcvBg6EEfbCGwjxGnL) | 2.6/3.8 |

## Measurements
- **Gas (burnt, all receipts):** `add_proposal` 2.5-2.8 T (2.1 T in the DAO). Auto-approve: NEAR transfer 6.5-7.1 T, FT transfer 8.8 T, AddMemberToRole 3.8 T, plain member vote 2.8-3.0 T, policy change on the final vote 3.9 T.
  Prepaid needed for an FT auto-approve on v3.31: **>22 T and ≤26 T** (static 10 T `ft_transfer` + 10 T callback). Prepay **50 T** (100 T+ when `msg` is set on v3.2/278adc7).
- **DAO storage:** v3.31 adds ≈ 101 + len(description) + len(proposer) + len(receiver_id) + len(token_id) B per Transfer proposal (194 B in a1, 227 B in a0), then +97 B for the first vote of a role (`vote_counts` entry 4 + len(role) + 48, plus `votes` entry) and +(5 + len(account id)) B for each further vote. 278adc7/v3.2 adds +261 B (description 32) and +159 B per vote, while its 20-entry action log fills up.
  An auto-approved spend costs ≈ **0.003 NEAR** (v3.31) / **0.0042 NEAR** (278adc7). The whole spike DAO grew 7,640 B over 22 proposals and ~40 votes (≈ 0.0035 NEAR per proposal).
- **Latency** (`send_tx` `wait_until: EXECUTED_OPTIMISTIC`, g1 DAO, 1 sample each): `add_proposal` **1.8 s** ([HCqxBum4…](https://testnet.nearblocks.io/txns/HCqxBum4KXQV4KkibitXVbsHrswfjPqvzJcPpZwXPDVJ)). `act_proposal` with NEAR payout and callback **3.6 s** ([B4h5Pam…](https://testnet.nearblocks.io/txns/B4h5PamCVadyd8spWVXCrqCXETsp678pQiLpT4Eu8gWB)).
- **Costs:** total gas burnt by the 113 logged txs = **≈0.062 NEAR** (plus ~8 txs not logged: sub-account creation and the first failed attempts). The DAO on `sputnikv2.testnet` locks **5.40642 NEAR**; the DAO on the global contract locks **0.0121 NEAR**.
- **Funding gotcha:** a 0.1 NEAR account cannot prepay 100 Tgas (`NotEnoughBalance`, cost 0.1009 NEAR). Prepaid gas is reserved up front at ~0.0001 NEAR/Tgas.

## Conclusion
Design A (1-of-1 `rulebot` role auto-executing) is **confirmed** on both code generations (v3.31 via `sputnikv2.testnet`, and 278adc7, which matches mainnet v3.2). Design B is not needed.
Ship it with: always pass `proposal` (the stored kind) to `act_proposal`; `quorum "1"`; Finalize permissions; caps, budgets and `role == "member"` checks in the Rulebot; and a DAO NEAR float for proposal storage.
For testnet, prefer the global contract `Ea8t…` (0.012 NEAR per DAO) over the 5.4 NEAR factory, unless the `*.sputnikv2.testnet` name matters (see the KB).

## Leftovers (throwaway)
The DAOs `potspike-dao-svuw.sputnikv2.testnet` (≈0.2 NEAR float, 0.01 wNEAR) and `g1.potspike-dao-svuw.testnet` (hardened policy) are still live and readable. The parent has ≈2.6 NEAR testnet.
Keys are in `~/.near-credentials/testnet/*.potspike-dao-svuw.testnet.json` (legacy keychain). They are never copied here.
