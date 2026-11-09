# NEAR features Pot uses, in detail

The [README](../README.md#built-on-near) has the one-line version. Each row here says what the feature does in Pot,
where it is in the code and how to check it ("J-n" refers to the [judging guide](judging-guide.md)).

| NEAR feature | How Pot uses it | Where | Check it |
|---|---|---|---|
| **Sputnik DAO v2** | Every Pot is its own DAO that holds the money. Policy: a `member` role (majority) and a `rulebot` role held only by the Pot Hub (1 of 1). In new Pots (policy v3) members can only vote; every proposal is filed by the hub, so every money move goes through the Pot's rules and shows in the app | `contracts/pot-hub/src/policy.rs` | J-7 `get_policy` |
| **Global contracts** (NEP-591) | Each DAO is created with `UseGlobalContract` by the hash of the official Sputnik code (0.0121 NEAR per Pot, against about 5.4 NEAR through the old Sputnik factory) | `create_pot` in `contracts/pot-hub/src/lib.rs` | J-7 `view-account-summary` |
| **Named sub-accounts + locked accounts** | A Pot is `<slug>.pots.potprev.testnet`, a person `u-<8>.users.potprev.testnet`. Pots and the token have **no access keys**: only their code can move money | `lib.rs` (create), `server/features/wallet`, `server/session` | J-7 `list-keys` |
| **Cross-contract calls and callbacks** | The hub files and approves DAO proposals, forwards money, reads DAO state, and records anything only in `#[private]` callbacks after the call succeeded | `lib.rs`, `wave4.rs`, `security.rs` | `cargo test` (unit and sandbox tests) |
| **NEP-141 / NEP-145 token** | Dollars are a 6-decimal USDC-style token. Money comes in with `ft_transfer_call` → the hub's `ft_on_transfer` (only from that token) and is forwarded to the Pot | `contracts/test-usdc`, `ft_on_transfer` in `lib.rs` | J-7 `ft_balance_of` |
| **NEP-366 meta transactions** | People hold 0 NEAR. They sign delegate actions in the browser; our relayer checks a per-method allowlist (receiver, method, exact args, deposit, gas), per-person and per-IP quotas, then pays gas and deposits | `apps/web/server/relay/` | relayer tests: `pnpm test` |
| **NEP-448 zero-balance accounts** | New accounts cost ≈ 0.0085 NEAR in total, paid by the relayer | `server/features/wallet`, `registration.ts` | [Costs](costs.md) |
| **NEAR Auth (MPC)** | "Continue with Google": Auth0 login, the account's key derived by NEAR's MPC network, then a device key so each action doesn't need a popup | `apps/web/lib/signing/near-auth/`, `server/session/` | works on `localhost:3000` only (see Limitations) |
| **NEAR Connect + NEP-413** | "Continue with a NEAR wallet" ("I have a NEAR wallet" when Google is offered too): wallet picker, sign-in by a signed message bound to this site's host (no transaction) | `apps/web/lib/signing/near-connect/` | J-9 |
| **NEAR Intents (1Click API)** | "Add from another app or exchange": many networks and coins, with **real live quotes** from 1Click (`FLEX_INPUT`); on testnet the transfer itself is simulated and labeled "Test" | `apps/web/server/features/oneclick/` | Add money → "Another app or exchange" |
| **NEAR AI Cloud** | "Scan receipt": a model running in a TEE reads the photo; our server checks that the reply's signed text is bound to our exact request and the model's answer, and the signature itself can be verified in NEAR's Verification Center (linked from the receipt). The first 16 hex characters (64 bits) of the saved receipt's SHA-256 go on chain in the spend's `request_ref` | `apps/web/server/features/receipts/` | Spend → "Scan receipt" |
| **NEP-297 events** | Every hub action emits a `pot` event the app reads for its feed | `contracts/pot-hub/src/events.rs` | any tx on nearblocks |
| **`env::ed25519_verify`** | Invite links and pay-by-link claims are ed25519 signatures checked on chain (domain-separated; a claim is bound to the account that receives it) | `lib.rs` (join), `wave4.rs` (claim_link) | `cargo test` |
| **FastNEAR RPC** | All reads, with a dRPC failover | `packages/pot-sdk/src/read/rpc.ts`, `apps/web/server/chain/rpc.ts` | — |

## Track hints used

| Hint (track) | Where |
|---|---|
| SPUTNIK DAO (social) | every Pot is a Sputnik DAO from the official code by global hash, with a two-role policy (J-7) |
| TREZU (social) | not used on testnet: Trezu is mainnet-only. The app's Advanced screen shows the "On-chain rules" panel from `get_policy`, plus explorer links |
| NAMED ACCOUNTS (social) | readable ids: `<slug>.pots.<root>` for Pots, `u-<8>.users.<root>` for people |
| STABLECOINS (realworld) | every amount is in dollars, held as a 6-decimal USDC-style token |
| NEAR INTENTS (realworld) | "Add money from another app or exchange": many networks and coins through the 1Click API (`FLEX_INPUT`), with real live quotes; the transfer is **simulated on testnet** (labeled "Test"); each deposit has a details sheet (coin, rate, timeline) |
| META TRANSACTIONS (realworld) | every user action is a relayed NEP-366 delegate |
