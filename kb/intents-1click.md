# NEAR Intents 1Click API: any-chain deposits for Pot (P-7)
> Owner: intents. Last verified: 2026-10-21; origins and "any coin" re-measured 2026-11-04 (see "More origins and any coin"). Legend: ✅ verified · 📄 docs-only · ⚠️ unverified/conflicting

## TL;DR
1. ✅ **No JWT needed for Pot's flow today.** `GET /v0/tokens`, `POST /v0/quote` (`dry:true`) and `GET /v0/status` all work anonymously. The fee actually injected for USDC→USDC is **1 bp** (`appFees:[{recipient:"5880ad2b…47dd",fee:1}]`), not the documented "+25 bps unauthenticated fee". ETH→USDC gets 20 bps. A *bad* key returns `401 Invalid token`; there is no anonymous fallback. Keys are self-serve (Partner Portal: email/Google/GitHub). The SDK README's Google Form is closed.
2. ✅ **2026-11-04 update: 15 origin networks, any coin** (section "More origins and any coin" below). The HOT-bridge chains are back (no active Shield incident; Polygon/Optimism/Avalanche/TON quote fine); BSC still has a $1,000 minimum, Tron $100, Stellar needs MEMO deposits; Bitcoin quotes don't verify with the documented signing key. *Original 2026-10-21 finding:* **Origins: Base, Arbitrum, Ethereum, Solana only.** The USDC ids are below. All HOT-bridge chains (Polygon, Optimism, BSC, Avalanche, TON, Stellar, Monad, XLayer, ADI, Scroll) have had active Shield incidents since 2026-10-18. Tested: Polygon and Optimism return `Quoting for this pair is not available`; BSC returns `Temporary swap limits: minimum swap amount is $1,000`. The recommended request body (Snippet 1) returns 201 on all four Pot chains.
3. ✅ **Measured speed** (origin tx mined → `SUCCESS` on NEAR, p50, n=8 each, real swaps Oct 19–21): **Arbitrum 18.5 s, Base 29 s, Solana 42.5 s, Ethereum 83.5 s**. The quote's `timeEstimate` (25/35/20/45 s) understates Solana and Ethereum about 2×. The user's own send time (exchange withdrawals) dominates.
4. ✅ **Delivery to the member's NEAR account** (`recipientType: DESTINATION_CHAIN`, `recipient: <member>`) is a plain NEP-141 USDC `ft_transfer` from `intents.near`. **1Click registers USDC storage itself** if the account is unregistered: it adds `storage_deposit` 0.00125 NEAR to the withdrawal and charges it as `withdrawFee: "6467"` ≈ $0.0065 (verified on-chain). A **named** recipient must exist (else `400 "Internal server error"`); implicit 64-hex ids are accepted even before they exist.
5. ✅ **Keep the plan's two-step design** (deliver to member → member's relayed `ft_transfer_call` to Rulebot). `customRecipientMsg` does deliver via `ft_transfer_call(msg)` (seen on mainnet). But the receiver sees **`sender_id = "intents.near"`**, not the member. The API labels it "HIGHLY EXPERIMENTAL", and the verifier makes **no refund** if the call fails. So it fails trustless attribution and risks loss; it is a Phase 3 option only.
6. ✅ **Use `FLEX_INPUT`, not EXACT_INPUT/EXACT_OUTPUT.**
   - EXACT_INPUT refunds *any* shortfall at the deadline, even 1 base unit. Real exchange-fee shortfalls got refunded: 5.939 of 6.0 and 1,219.70 of 1,221.79.
   - EXACT_OUTPUT asks for +1% (`amountIn = minAmountIn/(1−slippage)`) and refunds the excess minus `refundFee`, or nothing when the excess < `refundFee` (Ethereum `refundFee` 0.30 USDC).
   - FLEX_INPUT 150 @ 100 bps accepts **≥148.50**, with no upper cap.
7. ✅ **Refunds: `refundType:"INTENTS"`, `refundTo:<member NEAR account>`** gives `refundFee 0` and needs no origin address from the user, who may be sending from an exchange. Meteor Wallet does exactly this on mainnet. Refunds then sit in the member's `intents.near` balance, and recovering them is a Phase 3 flow.
8. ✅ **Deadlines:** a refund (`REFUNDED`) lands **8–87 s after the request `deadline`** (20/20 samples). The server keeps the address watched until **request deadline + 72 h** (`quote.deadline` = `timeWhenInactive`; 58/58 samples). `FAILED` had `refundedAmount 0` in 6/6 samples, so FAILED means manual support. `KNOWN_DEPOSIT_TX` was never observed, and quotes go `PENDING_DEPOSIT → PROCESSING` directly.
9. ✅ **No testnet**: the FAQ says "There is no testnet deployment and no plans for one". Build the simulator below so it returns the *same JSON shapes*, and label it clearly.
10. ✅ **Operations:** a public Shield status JSON exists (`GET https://partners.near-intents.org/api/shield/public/status`, undocumented). In the last week it showed Base (100 min, Oct 15) and Ethereum (33 min, Oct 17) pauses. Check it before offering a network. The Oct 1 incident is confirmed (details in Reference).

## Plan check
| Claim in the original plan | Verdict | Notes |
|---|---|---|
| Base URL `https://1click.chaindefuser.com`; `/v0/tokens`, `/v0/quote`, `/v0/deposit/submit`, `/v0/status` | ✅ confirmed | Spec `version 0.1.10`. New: `/v0/generate-intent`, `/v0/submit-intent`, `/v0/any-input/withdrawals`, `/v0/orders*`, `/v0/auth/*`, `/v0/account/*` (not needed by Pot). No webhooks; polling only. |
| Statuses `PENDING_DEPOSIT, KNOWN_DEPOSIT_TX, PROCESSING, SUCCESS, INCOMPLETE_DEPOSIT, REFUNDED, FAILED` | ✅ confirmed | Same 7 in spec and SDK 0.1.26. Docs: terminal = SUCCESS, REFUNDED, FAILED. KNOWN_DEPOSIT_TX not observed in 1,089 explorer rows. |
| "Without a JWT you pay the extra 0.25% unauthenticated fee" | ❌ corrected (measured) / ⚠️ docs conflict | Docs still say +25 bps (fees page: "Without API key: Additional 0.25% (25 bps) on every non-ANY_INPUT quote"). The examples repo says 0.1%. **Measured on dry quotes: 1 bp on USDC routes, 20 bps on ETH→USDC, appFee 50 split 25/25, appFee 480 accepted (docs: rejected).** Budget the worst case: 25 bps = $0.375 per $150. |
| SDK README: JWT "required for most endpoints" | ❌ corrected | SDK 0.1.26 works with `OpenAPI.TOKEN` unset. The README's Google Form is closed: "API Key Management has been moved to NEAR Intents Partners Portal". |
| "Mainnet-only" | ✅ confirmed | FAQ: "There is no testnet deployment and no plans for one." |
| Oct 1 incident: 23 failed deposits Sept 29–Oct 1, ≈$3.8M ghost funds, identified 08:04 UTC, paused 29 min later, 11 networks halted, funds returned Oct 2, feature removed Oct 7 after a HackenProof report; postmortem by Alex Shevchenko shared Oct 16 | ✅ confirmed (secondary + GitHub) | Attack window Sep 29 16:14 → Oct 1 05:54 UTC; paused 08:33; hotfix Oct 2 20:31 UTC; feature removal = near/intents PR #374 "fix(verifier): remove notifications on deposits", merged 2026-10-07. New: automatic pause on the solvency invariant. The 11 networks were BSC, Polygon, TON, Optimism, Avalanche, Stellar, Monad, XLayer, ADI, Scroll, Plasma. **10 of them are still paused** (Shield incidents since Oct 18). Some headlines say "$380,000"; that is a typo for $3.8M. |
| Phase 0 / Recommendation 2: "apply now for the 1Click JWT; lead times unknown" | ❌ corrected | No application or form. Self-serve sign-up at partners.near-intents.org (email/Google/GitHub). ToS §2.7 reserves the right to KYB. Not required for Pot. Still worth 5 minutes of a human's time (see Open questions). |
| P-7: "1Click quote to the member's NEAR account; QR and address; stepper maps statuses; on SUCCESS auto Add to Pot; deposit/submit called when the hash is known" | ✅ with notes | `deposit/submit` is only possible when Pot itself knows the origin tx hash (in-app wallet send). For QR/exchange sends it doesn't, and measured settlement is fast without it. "SUCCESS" means USDC is in the member's account, not yet in the Pot: add a 5th stepper step. |
| C5 flow 2: "Send exactly 150 USDC on Base" | ⚠️ change | With FLEX_INPUT: "Send 150 USDC on Base" plus "at least 148.50". "Exactly" invites EXACT_INPUT, which refunds 149.90 arriving after an exchange fee. |
| C5: "Converting to Pot dollars (usually 1-3 minutes, estimate)" | ❌ corrected | Measured after the transfer is mined: "usually under a minute" on Base/Arbitrum/Solana, "about 1–2 minutes" on Ethereum. |
| C5: INCOMPLETE_DEPOSIT "Send $X more or get a refund" | ⚠️ change | There is no refund action in the API. The refund happens automatically ~1 min after the deadline, so copy must say when. |
| C5: REFUNDED "Your money went back to [refund address]" | ⚠️ change | With the recommended `refundType: INTENTS` it goes to the member's NEAR Intents balance, not an address on Base. |
| C5: "FAILED or 20 minutes silent → Taking longer than usual" | ⚠️ change | Settlement p50 is 18–84 s, so warn at **5 min in PROCESSING**. FAILED is not auto-refunded (0/6), so it needs a support path with `depositAddress` + `correlationId`. |
| C6: `/api/oneclick` quote with JWT server-side, status polling, deposit/submit | ✅ confirmed | CORS is `*`, so browser calls would work. Keep the server route anyway: signature verification, persistence, Shield check, and an optional future key. |
| C6: "Trustless attribution: deliver to the member's own account, then relayed `ft_transfer_call`" | ✅ confirmed | It is the only option where Rulebot sees the member as `sender_id` (`customRecipientMsg` shows `intents.near`). |
| C6: "USDC on mainnet: confirm the contract from `/v0/tokens`" | ✅ | `17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1`, 6 decimals (`nep141:` prefix in 1Click). |
| C6: "0.00125 NEAR USDC storage" per new user | ✅ | `storage_balance_of` = `{"total":"1250000000000000000000"}`. For 1Click deliveries, 1Click pays it itself (deducted from the output). |
| Part D: `oneclick-client.ts` (quote, status, backoff) shared | ✅ | See Snippets. |
| B8/C9: "1Click outage (Oct 1 precedent)" | ✅ + add | Add a Shield status check per chain (outages happen weekly, including on Base and Ethereum). |
| C8 video: "adds $150 from Base, mainnet clip sped up with timer" | ✅ easy | Base deposit → NEAR in about 30 s (measured), so the clip barely needs speeding up. Arbitrum (≈18 s) is faster still. |
| C3 Phase 2: "on testnet a clearly labeled simulated deposit" | ✅ required | No 1Click testnet. Spec in Reference → Testnet. |

## Reference
Raw evidence (requests, responses, scripts): [../spikes/oneclick/RESULTS.md](../spikes/oneclick/RESULTS.md). "Measured" = live API on 2026-10-21 11:23–12:15 UTC, no JWT, no funds moved.

### Base URL, auth, rate limits
- ✅ `https://1click.chaindefuser.com` (Cloudflare). OpenAPI: `https://1click.chaindefuser.com/docs/v0/openapi.yaml` (`info.version: 0.1.10`, ~1.9 MB).
- 📄 Auth header: `X-API-Key: <partner JWT>` ("recommended"). `Authorization: Bearer <JWT>` is "legacy" but accepted (✅ both return 401 for a garbage token). Separately, a `User-Session` bearer from `/v0/auth/authenticate` is only for confidential balances/history.
- ✅ Without a key: tokens, dry quotes for EXACT_INPUT/EXACT_OUTPUT/FLEX_INPUT, and status all work. 📄 Non-dry anonymous quotes are documented as allowed ("use the authenticated fee schedule instead of the extra 0.25% unauthenticated fee"); not tested here. Key-only: `ANY_INPUT` (`400 Swap type is not available for unauthorized requests`), `confidentiality: basic|advanced` (`401 User authentication is required for confidential intent quotes`), generate/submit-intent (📄), and the Explorer API (✅ `MISSING_TOKEN`).
- ✅ Rate limit headers (anonymous): `x-ratelimit-limit-unauth: 1200`, `x-ratelimit-remaining-unauth`, `x-ratelimit-reset-unauth: 60`, i.e. **1,200 requests / 60 s per IP**. Limits with a key are not documented. 📄 Explorer API: 1 request / 5 s per partner. 📄 ToS §2.8 says limits may also be set in headers or the portal.
- ✅ How to get a key: https://partners.near-intents.org → sign up (email, Google or GitHub via WorkOS AuthKit at signin.near-intents.org) → organization → API keys (`/api-keys`, `key_type` e.g. `SHIELD`). Lead time is not verified (no account created). ToS: accepting the Terms happens on key generation *and* on any API use.

### Endpoints Pot uses
| Method | Path | Auth | Purpose | Notes |
|---|---|---|---|---|
| GET | `/v0/tokens` | none | asset list | ✅ 200 array; keys `assetId, decimals, blockchain, symbol, price, priceUpdatedAt, contractAddress?, coingeckoId?`; optional `?ondoTokens=` |
| POST | `/v0/quote` | optional | quote (+ deposit address if `dry:false`) | ✅ **201** on success; 400 `{message, correlationId, timestamp, path}` or `{message, error, statusCode, timestamp, path}`; 401 |
| GET | `/v0/status?depositAddress=…[&depositMemo=…]` | optional | swap status | ✅ 200 / 404 `Deposit address X not found` / 400 `Deposit address should be not empty` / 401 on a bad key |
| POST | `/v0/deposit/submit` | optional | `{txHash, depositAddress, nearSenderAccount?, memo?}` → same shape as status | 📄 not called (not read-only). Optional; speeds detection. |
| GET | partners.near-intents.org `/api/shield/public/status` | none | live chain/bridge incidents | ✅ undocumented (from the status page bundle); may change |

### `POST /v0/quote` request (✅ spec + live)
| Field | Req | Values / notes for Pot |
|---|---|---|
| `dry` | ✓ | `true` = preview, with no `depositAddress`/`deadline`/`timeWhenInactive` in the response. `false` only when the member taps "Get address". |
| `swapType` | ✓ | `EXACT_INPUT` \| `EXACT_OUTPUT` \| `FLEX_INPUT` \| `ANY_INPUT` (partners). **Pot: `FLEX_INPUT`.** |
| `slippageTolerance` | ✓ | bps. FLEX: the band applies to both in and out (`minAmountIn = amount×(1−s)`). Pot: `100` (accepts ≥148.50 for 150). |
| `originAsset` / `destinationAsset` | ✓ | asset ids (table below). Destination = NEAR USDC. |
| `depositType` | ✓ | `ORIGIN_CHAIN` (deposit address on the origin chain) \| `INTENTS` \| `CONFIDENTIAL_INTENTS` |
| `amount` | ✓ | integer string in base units (`"150000000"` = 150 USDC). `"150.5"` → 400. |
| `refundTo` / `refundType` | ✓ | `ORIGIN_CHAIN` (address on the origin chain, validated: `refundTo is not valid`) \| `INTENTS` (NEAR account inside intents.near; ✅ `refundFee 0`) \| `CONFIDENTIAL_INTENTS` |
| `recipient` / `recipientType` | ✓ | `DESTINATION_CHAIN` (= NEAR account for NEAR assets) \| `INTENTS` \| `CONFIDENTIAL_INTENTS` |
| `deadline` | ✓ | ISO time. The refund starts here if not completed. Past → 400. Dry accepted 2 min … 30 days. Server watches the address until +72 h. |
| `depositMode` | | `SIMPLE` (default; all 4 Pot chains) \| `MEMO` (Stellar/XRP/TON) |
| `referral` | | lowercase channel id. Pot: `"pot"`, which makes swaps filterable at `explorer.near-intents.org/?referral=pot` (✅ filter exists) |
| `quoteWaitingTimeMs` | | default 0. ✅ 3000 adds 3 s with no gain on stables. |
| `appFees[]` | | `{recipient, fee(bps int)}`. Total ≤ 500 bps after 1Click's share. Pot: omit. |
| `customRecipientMsg` | | ⚠️ "HIGHLY EXPERIMENTAL": makes the NEAR withdrawal `ft_transfer_call(msg)`. "Funds will be lost if … insufficient storage_deposit or if the recipient does not implement ft_on_transfer". |
| `insured` | | ✅ `true` → +2 bps to `protectionreserve.sputnik-dao.near` |
| `confidentiality` | | `public` (default) \| `basic` \| `advanced` (invite-only, needs a key) |
| `connectedWallets[]`, `sessionId`, `virtualChainRecipient`, `virtualChainRefundRecipient`, `rebates[]` | | not needed |

### Quote response (✅ live)
`{ correlationId, timestamp, signature: "ed25519:…", quoteRequest: {…echo incl. injected appFees and defaults}, quote: {…} }`
`quote`: `amountIn, amountInFormatted, amountInUsd, minAmountIn, amountOut, amountOutFormatted, amountOutUsd, minAmountOut, timeEstimate (s, after the deposit is confirmed), refundFee (origin units), withdrawFee (destination units, already deducted)`. When `dry:false` it adds `depositAddress, depositMemo?, deadline (= request deadline + 72 h, "deposit address becomes inactive and funds may be lost"), timeWhenInactive (same value, "address becomes cold")`. `chainDepositAddresses[]` appears only for `ANY_INPUT`.
Verify before display: `verifyQuoteSignature(response)` (SDK ≥0.1.24; default key `ed25519:reYaWhvwu8Jzo3WUM3zhn6VrhuMEF4eADL17qtRVifc`). ✅ 47/47 dry quotes valid; a tampered one fails. Store the whole response plus signature ("must be saved … to resolve any disputes").

### `GET /v0/status` response (✅ real payloads)
`{ correlationId, status, updatedAt, quoteResponse: {timestamp, signature, quoteRequest, quote}, swapDetails: {...} }`
`swapDetails`: `depositedAmount(+Formatted,+Usd)`, `intentHashes[]`, `nearTxHashes[]`, `amountIn(+…)`, `amountOut(+…)`, `slippage`, `refundedAmount(+…)`, `refundReason`, `refundFee`, `withdrawFee`, `originChainTxHashes[{hash, explorerUrl}]` (deposit **and** refund txs), `destinationChainTxHashes[{hash, explorerUrl}]` (NEAR delivery tx), `referral?`. `explorerUrl` was `""` in every sample, so build links yourself. On REFUNDED, `amountIn/amountOut/slippage` are `null`. On INCOMPLETE rows `updatedAt` is refreshed continuously (≈ now).

| Status | Meaning (docs) | Observed (✅ 2026-10-21) | Terminal? |
|---|---|---|---|
| `PENDING_DEPOSIT` | awaiting deposit | fresh quotes; `swapDetails.depositedAmount null`. 195 such quotes were created within ~4 s, and 0 of 60 watched for 20 min were ever funded, so integrators create non-dry quotes as previews. | no |
| `KNOWN_DEPOSIT_TX` | deposit tx detected | never seen (likely only after `deposit/submit`) | no |
| `PROCESSING` | swap executing | between detection and NEAR delivery | no |
| `SUCCESS` | delivered | `amountOut` = what the member got; `destinationChainTxHashes[0].hash` = NEAR tx | yes |
| `INCOMPLETE_DEPOSIT` | below required amount | ORIGIN_CHAIN 0.011218 of 0.011219 stuck since March (deadline 2027); INTENTS-type 0.675/0.9 still INCOMPLETE 6 days after its deadline | no (waits for top-up or deadline) |
| `REFUNDED` | returned to `refundTo` | 8–87 s after the request deadline; `refundedAmount = deposited − refundFee` | yes |
| `FAILED` | error | 6/6 `refundedAmount 0`, e.g. intent executed but the destination withdrawal failed (→ Tron) | yes (manual) |

`refundReason` seen: `NO_LIQUIDITY` (10/20), `PARTIAL_DEPOSIT` (5), `AMOUNT_LESS_THAN_MIN_AMOUNT_OUT` (4; includes FLEX below band), `AMOUNT_MORE_THAN_BALANCE` (1); `null` otherwise.

### Asset ids (✅ `/v0/tokens`, 2026-10-21)
| Chain | assetId | Dec | Token contract on chain |
|---|---|---|---|
| NEAR (destination) | `nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1` | 6 | `17208628…33a1` |
| Base | `nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near` | 6 | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Arbitrum | `nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near` | 6 | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` |
| Ethereum | `nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near` | 6 | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |
| Solana | `nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near` | 6 | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
Others: Gnosis `nep141:gnosis-0x2a22…76f0.omft.near` (6); Polygon/OP/Avalanche/BSC(18 dec)/Stellar(7 dec)/Monad/XLayer USDC are `nep245:v2_1.omni.hot.tg:*` (HOT bridge, currently paused); Aptos, Sui, Hypercore also exist. Do **not** show `sUSDC`, `steakUSDC`, `gtUSDCp`, `sparkUSDC`, `mwUSDC`, `laUSDC`, `USDT0` or `USD1` as "USDC". Fetch `/v0/tokens` at runtime and allow-list these 5 ids.

### Fees (per $150 deposit)
| Item | Measured (✅ dry, no key) | Documented (📄) |
|---|---|---|
| 1Click platform fee, USDC→USDC | 1 bp ($0.015) | no key: +25 bps ($0.375); key: 1 bp (stables, same-asset) / 20 bps |
| Protocol fee | inside the quote | 0.0001% (1 pip) on-chain |
| Origin-side refund fee (`refundFee`) | Base 0.0024, Arb 0.0053, Eth 0.30, Sol 0.283 (quote) / ~0.010 charged; **0 with `refundType: INTENTS`** | – |
| NEAR delivery (`withdrawFee`) | 0 if registered; **0.006467 USDC if not** (= 0.00125 NEAR storage) | – |
| Effective cost EXACT_INPUT 150 | Arb 0.98, Base 1.15, Eth 1.43, Sol 1.92 bps | – |
| Quote improvement | – | 50/50 split of any fill better than the quote, "within about 30 minutes" |
| Minimum amount | Base 0.15 USDC, Eth 0.300001, Sol 0.283802, Arbitrum <0.01 (all dynamic, from `Amount is too low for bridge, try at least N`) | – |
| Insurance (optional) | +2 bps | +2 bps |
Fees are non-refundable, "even if a Transaction fails" (ToS §6.4).

### Delivery semantics on NEAR (✅ on-chain tx `77T1gXCNL6EeUcQwsQb84AzZZSwX4CJa1KiEg7n3pYNC`)
- `recipientType: DESTINATION_CHAIN` + NEAR asset: `intents.near` runs an `ft_withdraw` intent. If the recipient is unregistered it unwraps 0.00125 wNEAR and calls `USDC.storage_deposit({account_id})`, then calls `USDC.ft_transfer` (or `ft_transfer_call` with `customRecipientMsg`). The recipient's `ft_on_transfer` sees `sender_id: "intents.near"`. With `msg`, a failed or partially refunded `ft_on_transfer` is **not** credited back (Verifier docs: "Any string value (including "") → ft_transfer_call → Refund on Failure ❌").
- `recipientType: INTENTS`: credits the member's balance *inside* `intents.near` (`withdrawFee 0`); the member then needs `intents.near::ft_withdraw` (1 yocto, 100 Tgas) to get USDC into their wallet. Not useful for Pot except as a fallback.
- 1Click already delivers straight to Sputnik DAOs (✅ EXACT_OUTPUT 5.0 USDC to `jasn…-dao.near` via `ping-checkout`). A Trezu-style "fund the DAO directly" works, but without member attribution.
- Named account recipients must exist. `pot-hackathon-nonexistent-zz9.near` gives `400 {"message":"Internal server error"}`. Implicit (64-hex) recipients are fine even before they exist.

### Status → UX copy (DepositStepper, C5 flow 2)
Recommended quote: `FLEX_INPUT`, 100 bps, `refundType: INTENTS`, `refundTo = recipient = member.near`, `deadline = now + 2 h`.
| Trigger | Step | Copy (title / sub) | UI |
|---|---|---|---|
| quote OK, `PENDING_DEPOSIT` | 1 Waiting for your transfer | "Send 150 USDC on **Base**" / "We'll accept 148.50 or more. Only USDC, only the Base network. You can close this screen; we'll tell you when it arrives." | network badge, QR + Copy, countdown "Address works for 1:59:12", "I've sent it" (optional) |
| `KNOWN_DEPOSIT_TX` | 2 Transfer spotted | "Transfer spotted" / "Waiting for Base to confirm it" | rarely shown; treat as step 2 |
| `PROCESSING` | 3 Converting | "Converting to Pot dollars" / Base, Arb, Sol: "Usually under a minute"; Eth: "Usually 1–2 minutes" | spinner, elapsed timer |
| `SUCCESS` | 4 Arrived | "$149.98 arrived" / "Adding it to Lisbon Trip…" | auto-start step 5 |
| relayed `ft_transfer_call` → Rulebot | 5 Added to the Pot | "Added to the Pot" + Receipt link | on failure: "Finish adding $149.98" button (funds stay in the member's own account) |
| `INCOMPLETE_DEPOSIT` | 1 (warning) | "$120.00 arrived, which is less than $148.50. Send $28.50 more to the same address by 13:41, or we'll return it automatically after that." | keep QR; show `depositedAmount` |
| `REFUNDED` + `PARTIAL_DEPOSIT` / `AMOUNT_LESS_THAN_MIN_AMOUNT_OUT` | ✕ | "This didn't go through: less than $148.50 arrived. Your $120.00 is safe and wasn't added to the Pot." | "Contact us to get it back" (Phase 3: one-tap "Move it back"). Implementation: funds are in the member's `intents.near` balance; never show that term. |
| `REFUNDED` + `NO_LIQUIDITY` / other | ✕ | "We couldn't convert it right now. Your money is safe and wasn't added to the Pot." | "Try again" / "Contact us" |
| `FAILED` | ⚠︎ | "Something went wrong on our side. Your money is safe; our team will sort it out." | Support link prefilled with depositAddress, correlationId, receipt |
| `PROCESSING` > 5 min, or `PENDING_DEPOSIT` > 15 min after "I've sent it" | ⚠︎ | "Taking longer than usual" / "Transfers from exchanges can take a while. We're still watching this address." | receipt link |
| request `deadline` passed, still `PENDING_DEPOSIT` | expired | "This address has expired. Don't send to it. Get a new one." | hide QR; new quote |
| Shield incident on chain, or quote 400 `Quoting for this pair is not available` | picker | "Base transfers are paused right now. Try Arbitrum or Solana." | disable chip |
Receipt link: `https://explorer.near-intents.org/transactions/<depositAddress>` (✅ 200), plus the NEAR delivery tx `https://nearblocks.io/txns/<destinationChainTxHashes[0].hash>`.

### Testnet: simulated deposit (spec)
There is no testnet 1Click (✅ FAQ). Implement `OneClickLike` twice: `RealOneClick` (mainnet API) and `SimOneClick` (testnet, our server). Both return the **same TypeScript types** (`QuoteResponse`, `GetExecutionStatusResponse` from the SDK), so the DepositStepper is one component.
- `POST /api/sim/oneclick/quote` returns a real-shaped `QuoteResponse`. `depositAddress = "SIMULATED-base-" + 8 hex`, deliberately **not** a valid address. The QR encodes `POT TESTNET DEMO - DO NOT SEND FUNDS`, and every screen carries a pill "Testnet demo: simulated transfer, no real money". Use the real dry quote's numbers when available; otherwise compute FLEX: `amountOut = amount×(1−0.0001)`, `minAmountIn = amount×0.99`.
- `POST /api/sim/oneclick/send {depositAddress, amount, scenario}` is the "Simulate sending 150 USDC" button. Optional autoplay for video.
- `GET /api/sim/oneclick/status?depositAddress=` is driven by server time since `send`:

| Chain profile | PENDING_DEPOSIT after send (origin confirmation + detection) | PROCESSING (swap + NEAR delivery) | Total to SUCCESS | Source |
|---|---|---|---|---|
| Arbitrum | 6 s | 12 s | 18 s | total p50 18.5 s (n=8) |
| Base | 17 s | 12 s | 29 s | total p50 29 s (n=8); one Base→PROCESSING split measured at 29 s |
| Solana | 30 s | 12 s | 42 s | total p50 42.5 s (n=8) |
| Ethereum | 72 s | 12 s | 84 s | total p50 83.5 s (n=8); Eth block→PROCESSING measured 77–99 s (n=4) |
Totals are measured. The PROCESSING ≈ 10–15 s part comes from 1Click swaps funded from Intents balances that deliver on NEAR (quote→SUCCESS 12–48 s) plus `updatedAt` at PROCESSING entry (✅ it stays fixed while PROCESSING), so most of the wait is origin-side confirmation (⚠️ split derived from small samples). Add ±20% jitter. Copy for Ethereum while PENDING: "Ethereum takes about a minute to confirm".
- At `SUCCESS`, the server sends real testnet "USDC (test)" from a faucet account to the member (with `storage_deposit` if unregistered, mirroring 1Click) and puts that real testnet tx hash in `destinationChainTxHashes`. The app then runs the **real** relayed `ft_transfer_call` → Rulebot on testnet.
- Scenarios (`?sim=` or a debug sheet): `ok`; `partial` (120 of 150 → `INCOMPLETE_DEPOSIT`; "send 30 more" → PROCESSING → SUCCESS, or let the shortened 60 s deadline pass → `REFUNDED`/`PARTIAL_DEPOSIT`, `refundFee 0`); `no_liquidity` (PROCESSING 20 s → `REFUNDED`/`NO_LIQUIDITY` at deadline); `failed` (PROCESSING 30 s → `FAILED`, `refundedAmount 0`); `slow` (PROCESSING 6 min → "Taking longer" at 5 min → SUCCESS); `expired` (no send → PENDING past deadline); `paused` (picker shows Base paused).

### Incident context (Oct 1, 2026) and status page
- ✅/⚠️ The deposit-notification feature in `intents.near` was exploited: an attacker contract made notifications fail, so the token contract refunded deposits while the verifier kept the credit. 23 failed deposits (Sep 29 16:14 → Oct 1 05:54 UTC) created ≈$3.8M of unbacked balance, withdrawn via Omni. Identified 08:04 UTC, paused 08:33 UTC (29 min). 11 networks halted. Funds returned Oct 2 (within 36 h); hotfix Oct 2 20:31 UTC. The feature was removed Oct 7 (✅ near/intents PR #374, merged 2026-10-07, after a second critical HackenProof report). New invariant: the contract auto-pauses if internal balances exceed token balances. Postmortem by Alex Shevchenko on X, Oct 16 (primary not fetched: X requires login; facts from CoinDesk, The Defiant, Substack, KuCoin).
- ✅ Status page: https://partners.near-intents.org/shield/status; JSON at `/api/shield/public/status` (see Reference). SHIELD modes: `normal`, `paranoid` (delays), `under_attack` (pause). Quote-time Shield checks are live (📄), which is why quotes on paused chains return 400.

## More origins and any coin (✅ measured 2026-11-04)
Live, read-only: `GET /v0/tokens` + ~90 dry quotes into NEAR USDC with recipient = refundTo = an implicit 64-hex
account (`e2beb9d8…f443b` = sha256("pot: dry-quote recipient (no key, never funded)"), accepted before it exists; a
named recipient must exist). Raw numbers below; recorded responses in
`apps/web/server/features/oneclick/fixtures/{dry-quotes-anycoin,tokens-2026-11-04}.json`.

- **`/v0/tokens`: 215 tokens on 38 chains.** Keys unchanged. TON's native coin is listed as symbol **`GRAM`**
  (`coingeckoId: the-open-network`, `nep245:v2_1.omni.hot.tg:1117_`, 9 dec). HOT-bridge assets are `nep245:v2_1.omni.hot.tg:<chainId>_<id>`.
- **Shield** (`/api/shield/public/status`): 0 active incidents; recently resolved: btc (42 min, Nov 3), hypercore, tron ×2,
  bsc (2 days), eth ×4 and **`scopeValue: "*"`** (everything, 48 min, Oct 29). scopeValue = 1Click's `blockchain` id.
- **Quoted OK ($20 / $1, all 201):** USDC on base/arb/sol/eth/pol/op/avax/sui/aptos; USDT on sol/eth/pol/op/avax/aptos/ton;
  ETH on base/arb/eth/op; SOL, POL, AVAX, SUI, APT, TON(GRAM), XRP, DOGE, ZEC, BTC.
- **Refused:** BSC USDT `Temporary swap limits: minimum swap amount is $1,000`; Tron USDT `… is $100`, checked on the USD value
  sent: 100 USDT (= $99.88) refused, 100.50 USDT ($100.40) and 101 accepted (timeEstimate 80 s) → Pot offers Tron from $101;
  Stellar USDC `Incorrect depositMode for originAsset from stellar chain` (needs `depositMode: MEMO`; not offered).
- **Minimums at $1:** only BTC (`try at least 6400` = sats ≈ $5.02), XRP (`2000000` = 2 XRP ≈ $2.58), ZEC (`100000` = 0.001
  ZEC ≈ $1.32). ⚠️ **The "try at least N" number now comes in base units** for these (no dot), while 2026-10-21's was
  formatted ("0.300001" USDC). Pot parses: a dot → formatted; a whole number ≥ 1,000 → base units; else formatted.
- **timeEstimate (s):** arb 25-27, base 35-37, sol 20-22, eth 45-47, pol/op/avax 35-37, sui/aptos 25-27, xrp 27, ton 65-67,
  doge 127, zec 455, **btc 805**. Pot's typical times: measured p50 for base/arb/sol/eth (kb TL;DR 3), else ≈ 1.5 ×
  timeEstimate ⚠️ (Sol/Eth estimates were ~2× optimistic): pol/op/avax 50 s, tron 120 s (estimate 80), sui/aptos/xrp 40 s, ton 100 s, doge ~3 min,
  zec ~11 min, btc ~20 min.
- **Fees:** USDC/USDT → USDC `appFees` 1 bp (aptos USDC 20 bps); every non-stable coin 20 bps. `withdrawFee` for the
  unregistered dry recipient: **5116-5128** (0.00125 NEAR storage at today's NEAR price; was 6467 on 2026-10-21).
- **Quote latency:** 400-520 ms p50 for both swap types.

### Swap type for coins whose price moves (decision: FLEX_INPUT 300 bps, amount from an EXACT_OUTPUT probe)
The member wants **$X to arrive**. Evidence, ETH on Base, $10 (same pattern for 14 coins at $20):
| Request | amountIn | minAmountIn | amountOut | Notes |
|---|---|---|---|---|
| EXACT_OUTPUT $10, 100 bps | 0.0043647 | 0.0043211 | 10.000000 (min 10.0) | asks +1 %; the excess is **refunded to the member's NEAR Intents balance** (refundType INTENTS) as Base ETH, which only a Phase 3 flow could recover |
| FLEX_INPUT 0.0043, 100 bps | 0.0043 | 0.004257 | 9.9676 (min 9.8679) | no upper cap; any surplus converts |
| FLEX_INPUT 0.0043, 300 bps | 0.0043 | 0.004171 | 9.9482 (min 9.6497) | same estimate within solver noise |
| EXACT_INPUT 0.0043, 100 bps | 0.0043 | 0.0043 | 9.9511 | any shortfall → refund (kb TL;DR 6) |

- **Probe → FLEX:** a dry EXACT_OUTPUT quote for $X; its **`minAmountIn`** is the coin amount that makes $X arrive; rounded up
  to 4 significant digits (people type it) and quoted FLEX_INPUT → amountOut **19.9998-20.0000 of 20.00** on ETH (base, arb,
  op, eth), SOL, POL, AVAX, SUI, APT, TON, XRP, DOGE, BTC; ZEC 19.995. The rounding surplus (≤ 0.1 %) arrives as Pot dollars.
- **Why 300 bps:** FLEX's band applies to the output too (`minAmountOut = out × (1 − s)`); below it the deposit is refunded
  (`AMOUNT_LESS_THAN_MIN_AMOUNT_OUT`) into the member's Intents balance. Crypto moves > 1 % within a 2 h window often; 3 %
  keeps refunds rare, and it also accepts a send up to 3 % short (exchange fees). Stablecoins stay at 100 bps.
- **Copy:** "Send about 0.008621 ETH · About $20.00 arrives" + "Prices move a little. Any difference arrives as a few cents
  more or less in Pot dollars. If the price moves more than 3%, nothing is converted and your money is kept safe."
- **Not chosen:** EXACT_OUTPUT (strands the +1 % excess in the Intents balance), EXACT_INPUT (refunds any shortfall),
  ANY_INPUT (needs a partner key).

### ⚠️ Bitcoin quotes don't verify
Every BTC quote (FLEX 100/300, EXACT_INPUT, EXACT_OUTPUT; dry) fails `verifyQuoteSignature` with the documented key
`ed25519:reYaWhvw…`, **in SDK 0.1.26 itself too** (spikes/oneclick/node_modules), while all 13 other curated coins verify.
Same response shape. Pot: the simulator may use an unverified **dry** BTC quote's numbers for its preview; real mode
refuses it (`quote_failed` cause signature) and hides Bitcoin for 10 min. → **human:** ask 1Click (t.me/near_intents)
whether BTC quotes are signed with another key before offering Bitcoin on mainnet.

### What Pot offers (apps/web/server/features/oneclick/origins.ts)
| Network | Coins (stablecoins first) | Speed shown | Min |
|---|---|---|---|
| Base, Arbitrum | USDC, ETH | under a minute | $1 |
| Solana | USDC, USDT, SOL | under a minute | $1 |
| Ethereum | USDC, USDT, ETH | 1-2 min | $1 |
| Polygon / Optimism / Avalanche (HOT bridge) | USDC, USDT, POL / ETH / AVAX | under a minute | $1 |
| Sui | USDC, SUI | under a minute | $1 |
| Aptos | USDC, USDT, APT | under a minute | $1 |
| TON (HOT bridge) | USDT, TON | 1-2 min | $1 |
| Tron | USDT | 1-2 min | $101 (swap limit $100 on value sent) |
| XRP Ledger | XRP | under a minute | $5 |
| Bitcoin / Dogecoin / Zcash | BTC / DOGE / ZEC | slow: ~20 / ~3 / ~11 min (flagged) | $10 / $1 / $5 |
Left out: BSC ($1,000 limit > Pot's $500 demo cap), Stellar (MEMO), look-alike and vault tokens. The server checks the list
against `/v0/tokens` (cached 1 h; a missing asset or changed decimals hides that coin; no list = fail open), maps Shield
(chain scope, `hot` bridge, `*`), and remembers quote refusals for 10 min (a minimum shows as "From $X"; "not available",
MEMO-only or an unverified signature hides the coin).

## Snippets
All TypeScript; the endpoints and payloads are tested live (dry only). Not product code: rewrite on Nov 1.

**1. Server: get a Pot deposit quote** (this exact body was tested with `dry:true` on Base/Arb/Eth/Sol, 2026-10-21: 201, `minAmountIn 148500000`, `amountOut` 149.96–149.98, `refundFee 0`, signature valid; set `dry:false` only when the member taps "Get address")
```ts
const ONECLICK = 'https://1click.chaindefuser.com';
const USDC = {
  near: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
  base: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near',
  arb:  'nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near',
  eth:  'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near',
  sol:  'nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near',
} as const;

export async function potDepositQuote(chain: 'base'|'arb'|'eth'|'sol', member: string, usd: number, dry: boolean) {
  const body = {
    dry, swapType: 'FLEX_INPUT', slippageTolerance: 100,
    originAsset: USDC[chain], depositType: 'ORIGIN_CHAIN',
    destinationAsset: USDC.near, amount: String(Math.round(usd * 1e6)),
    recipient: member, recipientType: 'DESTINATION_CHAIN',   // member's own NEAR account (named must exist)
    refundTo: member, refundType: 'INTENTS',                  // refundFee 0, no origin address needed
    deadline: new Date(Date.now() + 2 * 3600_000).toISOString(),
    referral: 'pot',
  };
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (process.env.ONECLICK_API_KEY) headers['X-API-Key'] = process.env.ONECLICK_API_KEY; // optional
  const res = await fetch(`${ONECLICK}/v0/quote`, { method: 'POST', headers, body: JSON.stringify(body) });
  const json = await res.json();
  if (res.status !== 201) throw Object.assign(new Error(json.message), { status: res.status, correlationId: json.correlationId });
  // import { verifyQuoteSignature } from '@defuse-protocol/one-click-sdk-typescript'
  if (!verifyQuoteSignature(json)) throw new Error('bad quote signature');
  return json; // persist whole response: correlationId, signature, quote.depositAddress, quote.deadline
}
```
**2. Worker: poll status** (status calls tested on real public addresses)
```ts
const TERMINAL = new Set(['SUCCESS', 'REFUNDED', 'FAILED']);
export async function pollStatus(depositAddress: string, onChange: (s: any) => void) {
  let last = '';
  for (;;) {
    const r = await fetch(`${ONECLICK}/v0/status?depositAddress=${encodeURIComponent(depositAddress)}`);
    if (r.status === 429) { await sleep(30_000); continue; }
    if (r.status === 404) { await sleep(10_000); continue; }          // just created; retry
    const s = await r.json();
    if (s.status !== last) { last = s.status; onChange(s); }
    if (TERMINAL.has(s.status)) return s;
    await sleep(s.status === 'PROCESSING' ? 3_000 : 5_000);         // budget: 1200 req/min/IP anonymous
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
```
**3. Is the chain paused?** (tested; undocumented endpoint, so fail open)
```ts
export async function pausedChains(): Promise<Set<string>> {
  try {
    const r = await fetch('https://partners.near-intents.org/api/shield/public/status', { cache: 'no-store' });
    const j = await r.json();
    return new Set(j.activeIncidents.filter((i: any) => i.scopeType === 'chain').map((i: any) => i.scopeValue)); // 'base','arb','eth','sol',…
  } catch { return new Set(); }
}
```

## Gotchas & failure modes
- **HTTP 201** is success for `POST /v0/quote` (not 200). Two error body shapes (with `correlationId`, or NestJS `{error,statusCode}`). Log `correlationId`.
- **A bad or expired key breaks everything (401)**; it doesn't degrade to anonymous. If you set `ONECLICK_API_KEY`, alert on 401 and retry once without it.
- **Named recipient must exist** before quoting. Otherwise you get `400 "Internal server error"` (misleading). Quote only after onboarding has created the account.
- **EXACT_INPUT is strict**: 1 unit short → `INCOMPLETE_DEPOSIT`, then refund after the deadline. Exchanges often deduct withdrawal fees from the amount, so use FLEX_INPUT.
- **EXACT_OUTPUT charges +slippage** up front and refunds the excess minus `refundFee`. An excess below `refundFee` is kept (Ethereum: 0.30 USDC).
- **`timeEstimate` is optimistic** for Solana and Ethereum (about 2×). Use the measured numbers in copy.
- **SUCCESS ≠ in the Pot.** The member's relayed `ft_transfer_call` is a separate step that can fail; handle "Finish adding".
- **Wrong token** (e.g. USDT or ETH sent to a USDC quote address) or **wrong network** (USDC on Arbitrum sent to a Base address: same `0x` format!): undocumented, likely stuck. ToS §12.4: no recovery requests for user error under **$300**. Mitigate with a big network+token badge and an explicit "choose the Base network in your exchange" hint.
- **Deposit after the request deadline**: the address is watched until +72 h, so ⚠️ presumably refunded (not observed). After +72 h: "funds may be lost". The UI must expire the QR at the deadline.
- **Re-using an address** after SUCCESS: undocumented ⚠️. Copy: "Use this address once."
- **INCOMPLETE can linger** (examples stuck for weeks or months). Don't promise a refund time beyond "after the deadline"; show support after deadline + 10 min.
- **FAILED is not auto-refunded** (0/6 samples). Persist `depositAddress`, `correlationId` and the quote `signature`, and route to support.
- **INTENTS refunds** land in `intents.near` as the *origin-chain* token (e.g. `nep141:base-0x8335…omft.near`), not NEAR USDC. Recovery needs the member to sign: either `intents.near::ft_withdraw` (direct call, 1 yocto), or generate/submit-intent (needs a partner key plus NEP-413, and named accounts must first `add_public_key` on `intents.near`) → Phase 3.
- **`customRecipientMsg`** (if ever used to deliver into Rulebot): `sender_id = intents.near`, attribution must come from `msg`, and Rulebot's `ft_on_transfer` must never panic or return unused tokens (no refund → stuck in `intents.near`).
- **Shield pauses** are per chain and happen weekly. Paused chains fail at quote time; in-flight deposits are delayed.
- **PROCESSING can last months** when the *destination* withdrawal fails. 166 of 182 explorer PROCESSING rows were >7 days old, e.g. 50 USDC (Sol) → ZEC with the intent executed but no destination tx since 2026-05-28. **None were to NEAR USDC.** Still: after 5 min show "Taking longer", after 30 min show support.
- **Cloudflare blocks some User-Agents**: `Python-urllib/3.x` gets **403** on every endpoint (curl, an empty UA and Node `fetch` get 200). Set an explicit UA in non-Node scripts.
- **Look-alike tokens** in `/v0/tokens` (`sUSDC`, vault tokens). Allow-list ids; don't filter by symbol.
- **BSC USDC has 18 decimals, Stellar 7.** Never assume 6 outside the allow-list.
- **ToS duties** (Terms updated Oct 7, 2026):
  - §4.1(e): don't cache or store API data >24 h, except transaction records shown to users.
  - §4.2: end-user terms must release Intents Technology and warn about irreversibility, fees, slippage and bridging risk.
  - §4.1(h): the originating user's address must be unmasked.
  - §10.5: screening can delay or block funds without notice.

## Costs, limits, latencies (measured vs documented)
| Metric | Measured (✅ 2026-10-21) | Documented (📄) |
|---|---|---|
| Fee on 150 USDC Base→NEAR, no key | 1 bp ≈ $0.015 (out 149.982698) | +25 bps ($0.375) |
| Storage auto-registration | $0.006467 (0.00125 NEAR) | – |
| Refund fee (ORIGIN_CHAIN) | Base 0.0024 · Arb 0.0053 · Eth 0.30 · Sol 0.28 quoted / 0.010 charged | – |
| Min deposit | Base 0.15 · Eth 0.30 · Sol 0.284 · Arb <0.01 USDC | – |
| Deposit mined → SUCCESS (p50 / max, n=8) | Arb 18.5/22 s · Base 29/71 s · Sol 42.5/155 s · Eth 83.5/138 s | `timeEstimate` Arb 25 · Base 35 · Sol 20 · Eth 45 s; "allow up to 15 minutes" (Going Live) |
| Refund after request deadline | 8–87 s (n=20) | "refunded by deadline" |
| Address watched until | request deadline + 72 h | "deposit address becomes inactive and funds may be lost" |
| Dry quote latency | p50 377 ms, p90 519 ms (n=47) | – |
| Status latency | p50 64 ms (n=87) | – |
| Anonymous rate limit | 1,200 / 60 s per IP (headers) | not documented for 1Click; Explorer API 1 req / 5 s per partner |
| Mainnet clip budget | $20 deposit ≈ $0.002 fee + origin gas (Base ≈ cents) | plan: "under $50 / $100" ✅ ample |

## Open questions / needs a human
- **Human (5 min, optional):** sign up at https://partners.near-intents.org with the Pot team email (email/Google/GitHub), create an org and an API key, and note any KYB prompt or lead time. It unlocks the Explorer API (receipt history), a Shield key, and protection if the +25 bps anonymous fee is ever enforced. Keep it in Vercel env (`ONECLICK_API_KEY`), never in the client. Accepting the ToS binds the team (also true for anonymous use).
- **Human (Phase 2 clip):** a real mainnet run needs a mainnet NEAR account with a funded relayer (NEAR Auth mainnet is gated, so use a normal wallet account for the clip) and USDC on Base (~$20). Confirm the real (non-dry) quote's fee matches the dry quote (1 bp) and record `depositAddress` and hashes for the README.
- ⚠️ Unverified: what happens to a deposit sent after the request deadline (refund vs. stuck) and to a second deposit after SUCCESS. Ask in https://t.me/near_intents (a human; no posting by agents).
- → **relayer:** 1Click registers USDC storage itself (`withdrawFee 0.006467`), so onboarding's `storage_deposit` is not needed for 1Click deliveries; it is still needed for testnet demo dollars and for the member→Rulebot `ft_transfer_call` path (Rulebot must be registered). The relayer allowlist needs `intents.near` (`ft_withdraw`/`add_public_key`, 1 yocto) only if Phase 3 INTENTS-refund recovery is built.
- → **auth:** are NEAR Auth accounts named or implicit? Named accounts must exist before quoting and need `intents.near::add_public_key` to ever sign intents (refund recovery). Can the NEAR Auth MPC key sign NEP-413 messages?
- → **contracts:** if Phase 3 uses `customRecipientMsg` to deliver into Rulebot, `ft_on_transfer` sees `sender_id = "intents.near"`. Attribution would come from `msg`, so never panic and never return unused amounts. MVP: no change; Rulebot only needs normal `ft_on_transfer` from members.
- → **product-ux:** Pot's Terms must include the §4.2 flow-down (release, no warranty, irreversibility and bridging-risk warning, restricted persons). Show a one-line risk note on the cross-chain screen. Show copy from the status table; drop "exactly".
- → **web:** the QR should encode the plain address (exchange scanners expect it). EIP-681 `ethereum:0x8335…@8453/transfer?address=<deposit>&uint256=150e6` or a Solana Pay `solana:<deposit>?amount=150&spl-token=EPjF…` could prefill wallets ⚠️ (untested). CORS allows browser calls, but route quotes through the server (`/api/oneclick`) so keys, signature checks and persistence stay server-side.
- → **infra:** worker polling budget is 1,200 req/min per IP anonymous (5 s poll ≈ 12 req/min per active deposit → ~100 concurrent). Store deposit records as "transaction history" (ToS 24 h caching exception). No webhooks exist.

## Sources
- https://docs.near-intents.org/llms.txt: page index (API Keys, Going Live, Fees, Swap Types, Changelog): 2026-10-21
- https://docs.near-intents.org/integration/distribution-channels/1click-api/quickstart/making-a-request.md: base URL, flow, status table, deposit/submit optional: 2026-10-21
- https://docs.near-intents.org/integration/distribution-channels/1click-api/authentication.md: "extra 0.25% (25 basis points)", Partner Dashboard, `X-API-Key`/Bearer: 2026-10-21
- https://docs.near-intents.org/resources/fees.md and …/1click-api/fee-config.md: fee table (no key +25 bps; key 20 bps / 1 bp stables), 50/50 split, 500 bps cap, EXACT_OUTPUT fee math: 2026-10-21
- https://docs.near-intents.org/integration/distribution-channels/1click-api/swap-types.md: EXACT_INPUT/EXACT_OUTPUT/FLEX_INPUT/ANY_INPUT deposit handling: 2026-10-21
- https://1click.chaindefuser.com/docs/v0/openapi.yaml: v0.1.10 schemas (QuoteRequest incl. `customRecipientMsg` warning, `insured`, `depositMode`; Quote `deadline`/`timeWhenInactive`; status enum; security schemes): 2026-10-21
- https://docs.near-intents.org/resources/faqs.md: "There is no testnet deployment and no plans for one": 2026-10-21
- https://docs.near-intents.org/changelog/overview.md + entries 2026-09-09 (nine chains $1,000 min), 2026-09-14 (Tron $100), 2026-09-18 (Robinhood `hood`): 2026-10-21
- https://docs.near-intents.org/integration/verifier-contract/deposits-and-withdrawals/withdrawals.md: `msg` ⇒ `ft_transfer_call`, no refund on failure; `ft_withdraw` call: 2026-10-21
- https://docs.near-intents.org/integration/verifier-contract/account-abstraction.md: named accounts need `add_public_key` on `intents.near`: 2026-10-21
- https://docs.near-intents.org/integration/bridging/overview.md: Omni/POA/HOT bridge chain lists: 2026-10-21
- https://docs.near-intents.org/integration/distribution-channels/1click-api/verify-quote-signature.md: signed payload, SDK ≥0.1.24: 2026-10-21
- https://docs.near-intents.org/security-compliance/terms-of-service.md: Terms "Last Updated: October 7, 2026", §2.7 KYB, §2.8 rate limits, §4.1(e)(h), §4.2, §6.4, §10.5, §12.4 ($300), §12.6: 2026-10-21
- https://docs.near-intents.org/security-compliance/shield-incident-api.md and …/proactive-intents-security.md: Shield API, modes: 2026-10-21
- https://docs.near-intents.org/integration/distribution-channels/1click-api/explorer/introduction.md: Explorer API needs JWT, 1 req/5 s: 2026-10-21
- npm `@defuse-protocol/one-click-sdk-typescript@0.1.26` (published 2026-09-22): README (stale JWT claims, Google Form), `dist/index.d.ts`, `dist/index.mjs` (Bearer header, `verifyQuoteSignature`, manager key): 2026-10-21
- https://docs.google.com/forms/d/e/1FAIpQLSdrSrqSkKOMb_a8XhwF0f7N5xZ0Y5CYgyzxiAuoC2g4a2N68g/viewform: redirects to `closedform`, "API Key Management has been moved to NEAR Intents Partners Portal": 2026-10-21
- https://partners.near-intents.org/ (sign-in: email/Google/GitHub) and /sign-in: 2026-10-21
- https://raw.githubusercontent.com/near-examples/near-intents-examples/main/README.md and 1click-example/*.ts: "0.1% fee" claim, 5 s polling, explorer link format: 2026-10-21
- Live API `https://1click.chaindefuser.com` (tokens, 75 dry quotes, 66 status reads; batch 7 polling): 2026-10-21. Details: ../spikes/oneclick/RESULTS.md
- https://explorer.near-intents.org/ (public SSR lists, filters `fromChainId`, `status`, `referral`) and /transactions/<depositAddress>: 2026-10-21
- NEAR mainnet tx 77T1gXCNL6EeUcQwsQb84AzZZSwX4CJa1KiEg7n3pYNC via `EXPERIMENTAL_tx_status` (rpc.mainnet.fastnear.com) and https://nearblocks.io/txns/77T1gXCNL6EeUcQwsQb84AzZZSwX4CJa1KiEg7n3pYNC: storage_deposit + ft_transfer_call by intents.near: 2026-10-21
- https://partners.near-intents.org/shield/status and /api/shield/public/status: active/resolved incidents: 2026-10-21
- https://github.com/near/intents/pull/374: "fix(verifier): remove notifications on deposits", merged 2026-10-07: 2026-10-21
- https://www.coindesk.com/tech/2026/10/01/near-intents-hit-by-usd3-8-million-exploit-as-crypto-s-rough-year-of-hacks-continues: $3.8M, 11 networks list (⚠️ secondary): 2026-10-21
- https://thecoding.substack.com/p/near-intents-ghost-fund-postmortem: attack window, 08:04/08:33, hotfix Oct 2 20:31, v0.4.5 PR #374, invariant auto-pause (⚠️ secondary summary of the X postmortem): 2026-10-21
- https://thedefiant.io/news/security/near-intents-postmortem-links-3-8-million-exploit-to-deposit-bug and https://www.kucoin.com/news/flash/near-intents-releases-post-mortem-report-on-3-8m-vulnerability (search snippets; ⚠️ secondary): 2026-10-21
- Mainnet RPC reads (rpc.mainnet.fastnear.com `view_account`, USDC `storage_balance_of`; mainnet.base.org, arb1.arbitrum.io/rpc, ethereum-rpc.publicnode.com, api.mainnet-beta.solana.com block times): 2026-10-21
