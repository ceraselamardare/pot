# Spike: 1Click API, read-only (Pot P-7 "add money from any chain")

> Owner: intents. Run: 2026-10-21 11:23–12:15 UTC from this machine (macOS, node 22.22). THROWAWAY: never import into the product.
> Rules followed: no funds moved, no deposits, no non-dry quotes, no `POST /v0/deposit/submit`, no sign-ups. Only `GET /v0/tokens`, `POST /v0/quote` with `dry:true`, `GET /v0/status`, public pages and public RPC reads.
> Synthesis and recommendations are in [../../kb/intents-1click.md](../../kb/intents-1click.md).

## Question
1. Does 1Click work **without a JWT** (quote, status, tokens)? What fee does it actually charge?
2. What are the exact asset ids, amounts, fees, minimums and time estimates for USDC on Base, Arbitrum, Ethereum and Solana → USDC on NEAR?
3. How does delivery to a NEAR account work: storage registration, `ft_transfer_call` (`customRecipientMsg`), `INTENTS` vs `DESTINATION_CHAIN`, refunds?
4. What are the real status payloads and real end-to-end timings for the DepositStepper?

## Setup
- `npm i @defuse-protocol/one-click-sdk-typescript@0.1.26` (local, this folder). API spec `https://1click.chaindefuser.com/docs/v0/openapi.yaml` reports `version: 0.1.10`; SDK `OpenAPI.VERSION = "0.1.10"`.
- Base URL `https://1click.chaindefuser.com`. **No JWT/API key was used anywhere.**
- Test recipients (mainnet, checked by RPC `view_account` + USDC `storage_balance_of`, read-only):
  `near` = exists, USDC-registered (`{"total":"1250000000000000000000","available":"0"}`); `pot.near` = exists, **not** registered (`null`); `pot-hackathon-nonexistent-zz9.near` = does not exist; `000…c0ffee` (64-hex implicit) = does not exist.
- Refund placeholders (docs examples, no funds ever sent): EVM `0x2527D02599Ba641c19FEa793cD0F167589a0f10D`, Solana `13QkxhNMrTPxoCkRdYdJ65tFuwXPhL5gLS2Z5Nr6gjRK`.

| Script | What it does | Calls |
|---|---|---|
| `lib.mjs` | fetch wrapper; saves `out/<name>.json` (request, status, latency, rate-limit headers, body) | – |
| `00-explorer-candidates.mjs` | parses public explorer.near-intents.org pages (Next.js flight data) into deposit-address lists for 06/07/08 | 5–14 page GETs |
| `01-core-quotes.mjs` | dry EXACT_OUTPUT/EXACT_INPUT 150 USDC from Base/Arb/Eth/Sol → NEAR USDC | 8 quotes |
| `02-fees-swaptypes.mjs` | fee injection (stable vs non-stable, appFees, insured), FLEX_INPUT, slippage, bad keys | 14 quotes |
| `03-delivery-errors.mjs` | referral effect, recipient validation, INTENTS, `customRecipientMsg`, refund types, amounts, deadlines, malformed | 31 quotes |
| `04-minimums-status.mjs` | per-chain minimums, FLEX per chain, restricted chains, status error shapes | 22 quotes, 7 status, 1 tokens |
| `05-sdk.mjs` | SDK with no token: `getTokens`, `getQuote`, `getExecutionStatus`, `verifyQuoteSignature` | 3 + 47 signature checks |
| `06-real-status.mjs` | `GET /v0/status` on **public** historical deposit addresses listed on explorer.near-intents.org + origin block time from public RPC → real payload shapes and timings | 61 status |
| `07-watch-transitions.mjs` | polls 60 freshly created public PENDING_DEPOSIT quotes every 15 s for 20 min, logs transitions | ~4,800 status |
| `08-processing-split.mjs` | polls 6 public swaps already in PROCESSING every 4 s → splits confirmation time vs processing time | ~400 status |
| `09-recommended-body.mjs` | the exact quote body recommended in the KB, dry, on all 4 chains | 4 quotes |

Run: `cd spikes/oneclick && npm i && node 01-core-quotes.mjs` (etc.). `06`/`07`/`08` first need `node 00-explorer-candidates.mjs history|pending|processing`, which rebuilds the candidate lists from the public explorer pages (see "How the public samples were found").

## 1. `GET /v0/tokens` (no auth) ✅
`HTTP 200`, 52,141 B, 160 ms, `access-control-allow-origin: *`, rate-limit headers:
```
x-ratelimit-limit-unauth: 1200
x-ratelimit-remaining-unauth: 1199
x-ratelimit-reset-unauth: 60
```
205 tokens on 37 chains (live list includes `abs` and `qtc`, which the OpenAPI enum lacks). Entry keys: `assetId, decimals, blockchain, symbol, price, priceUpdatedAt, contractAddress, coingeckoId`.
```json
{"assetId":"nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1","decimals":6,"blockchain":"near","symbol":"USDC","price":0.999435,"priceUpdatedAt":"2026-10-21T11:22:30.560Z","contractAddress":"17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1","coingeckoId":"usd-coin"}
```
| Chain | USDC `assetId` | dec | contract |
|---|---|---|---|
| NEAR | `nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1` | 6 | `17208628…33a1` |
| Base | `nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near` | 6 | `0x833589fcd6edb6e08f4c7c32d4f71b54bda02913` |
| Arbitrum | `nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near` | 6 | `0xaf88d065e77c8cc2239327c5edb3a432268e5831` |
| Ethereum | `nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near` | 6 | `0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48` |
| Solana | `nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near` | 6 | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| Gnosis | `nep141:gnosis-0x2a22f9c3b484c3629090feed35f17ff8f88f76f0.omft.near` | 6 | |
| Polygon | `nep245:v2_1.omni.hot.tg:137_qiStmoQJDQPTebaPjgx5VBxZv6L` | 6 | (HOT bridge) |
| BSC | `nep245:v2_1.omni.hot.tg:56_2w93GqMcEmQFDru84j3HZZWt557r` | **18** | (HOT bridge) |
| Optimism | `nep245:v2_1.omni.hot.tg:10_A2ewyUyDp6qsue1jqZsGypkCxRJ` | 6 | (HOT bridge) |
| Avalanche | `nep245:v2_1.omni.hot.tg:43114_3atVJH3r5c4GqiSYmg9fECvjc47o` | 6 | (HOT bridge) |
| Stellar | `nep245:v2_1.omni.hot.tg:1100_111bzQBB65GxAPAVoxqmMcgYo5oS3txhqs1Uh1cgahKQUeTUq1TJu` | **7** | (HOT bridge) |
| Aptos / Sui / Monad / XLayer / Hypercore | see `out/tokens.json` | 6 / 6 / 6 / 6 / 8 or 6 | |

Look-alikes to filter out of any picker: `sUSDC` on Base/Sol (`nep141:base-0x1c4a…`, `nep141:sol-2dc7…`), `steakUSDC`, `gtUSDCp`, `sparkUSDC`, `mwUSDC`, `laUSDC` (vault receipt tokens), `USDT0`, `USD1`. Also `nep141:usdt.tether-token.near` (USDT on NEAR, 6 dec). wNEAR `nep141:wrap.near` price 5.16 at test time.

## 2. Dry quotes WITHOUT a JWT work ✅ (HTTP **201**, not 200)
Request (batch 1, Base, EXACT_OUTPUT):
```json
POST /v0/quote   (headers: content-type only)
{"dry":true,"swapType":"EXACT_OUTPUT","slippageTolerance":100,
 "originAsset":"nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near","depositType":"ORIGIN_CHAIN",
 "destinationAsset":"nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
 "amount":"150000000","refundTo":"0x2527D02599Ba641c19FEa793cD0F167589a0f10D","refundType":"ORIGIN_CHAIN",
 "recipient":"near","recipientType":"DESTINATION_CHAIN","deadline":"2026-10-21T12:25:16.888Z","referral":"pot-spike"}
```
Response `201`, 519 ms:
```json
{"quote":{"amountIn":"151544248","amountInFormatted":"151.544248","amountInUsd":"151.457716234392","minAmountIn":"150028805",
  "amountOut":"150000000","amountOutFormatted":"150.0","amountOutUsd":"149.914350000000","minAmountOut":"150000000",
  "timeEstimate":35,"refundFee":"2400","withdrawFee":"0"},
 "quoteRequest":{"dry":true,"depositMode":"SIMPLE","swapType":"EXACT_OUTPUT","slippageTolerance":100,"originAsset":"nep141:base-0x8335…omft.near",
  "depositType":"ORIGIN_CHAIN","destinationAsset":"nep141:17208628…33a1","amount":"150000000","refundTo":"0x2527…0f10D","refundType":"ORIGIN_CHAIN",
  "recipient":"near","recipientType":"DESTINATION_CHAIN","deadline":"2026-10-21T12:25:16.888Z","confidentiality":"public","referral":"pot-spike",
  "quoteWaitingTimeMs":0,"insured":false,
  "appFees":[{"recipient":"5880ad2b362620fadf759cbceb1cd5737ce8c6ed7fb8e9942881e6731f9247dd","fee":1}]},
 "signature":"ed25519:4XsZv1WpfNdNb9PXQ1UmYj5vpAZpWsztYRpoZQWhLYxzb9XuBSYTpud84G6DTaSBeKyQrVSqW36FfwaTqQY62H6E",
 "timestamp":"2026-10-21T11:25:17.049Z","correlationId":"6e55c8d4-7f7d-42f0-b4c8-25c342fdbfd1"}
```
Dry responses omit `depositAddress`, `deadline`, `timeWhenInactive` (as documented). The server echoes defaults (`depositMode`, `confidentiality`, `quoteWaitingTimeMs`, `insured`) and **injects its own fee as an `appFees` entry**.

Batch 1 (150 USDC, slippage 100 bps, recipient `near`, 2026-10-21 11:25Z):

| Origin | EXACT_OUTPUT 150 out: `amountIn` / `minAmountIn` | EXACT_INPUT 150 in: `amountOut` / `minAmountOut` | effective cost | `timeEstimate` | `refundFee` | `withdrawFee` |
|---|---|---|---|---|---|---|
| Base | 151.544248 / 150.028805 | 149.982698 / 148.482871 | 1.15 bps | 35 s | 0.0024 USDC | 0 |
| Arbitrum | 151.538317 / 150.022933 | 149.985358 / 148.485504 | 0.98 bps | 25 s | 0.0053 | 0 |
| Ethereum | 151.536790 / 150.021422 | 149.978584 / 148.478798 | 1.43 bps | 45 s | **0.30** | 0 |
| Solana | 151.544248 / 150.028805 | 149.971201 / 148.471488 | 1.92 bps | 20 s | **0.283456** | 0 |

- EXACT_OUTPUT: `amountIn = minAmountIn / (1 − slippage)` exactly (151.544248 = 150.028805 / 0.99). The "real" input is `minAmountIn`; the 1% buffer is refunded after the swap, minus `refundFee` (see real samples in §6).
- Slippage sensitivity (Base, EXACT_OUTPUT 150): slip 0 → `amountIn = minAmountIn = 150.017672`; slip 10 → 150.178984 / 150.028805; slip 50 → 150.782719 / 150.028805.
- FLEX_INPUT 150, slip 100: `minAmountIn 148.5`, `amountOut 149.971201`, `minAmountOut 148.471488` (Base; same shape on Arb/Eth/Sol). Slip 300: `minAmountIn 145.5`.
- 10,000 USDC EXACT_INPUT: out 9,997.98 on every chain (≈2 bps). 1,000,000 USDC: 999,798.01 (dry quote OK).
- `quoteWaitingTimeMs:3000` → 3,070 ms latency, out 149.98233 vs 149.982698 at 0 ms (no gain on stables).

## 3. Fees actually injected without a JWT ✅ (contradicts docs' "+25 bps")
`quoteRequest.appFees` echo (fee recipient `5880ad2b…47dd` = 1Click):

| Case | Echoed `appFees` | Docs claim for no-key |
|---|---|---|
| Base USDC → NEAR USDC (same asset, other chain) | `[{5880ad…, fee:1}]` | 25 |
| Base USDC → NEAR USDT (stable pair) | `[{5880ad…, fee:1}]` | 25 |
| Base ETH (0.06) → NEAR USDC (non-stable) | `[{5880ad…, fee:20}]` | 25 |
| our `appFees:[{near, fee:50}]` | `[{near:25},{5880ad…:25}]` (50 total, 50/50 split) | 50 + 25 = 75 |
| our `appFees:[{near, fee:480}]` | `[{near:240},{5880ad…:240}]` accepted | **rejected** (480+25>500) |
| `insured:true` | `+{protectionreserve.sputnik-dao.near, fee:2}` | +2 bps ✅ |
| no `referral` field | identical to above | – |

So today an unauthenticated request gets the **documented authenticated "generic policy"** (20 bps / 1 bp stables and same-asset / 50-50 split). Dry quotes only; a real quote could differ (not tested: no non-dry quotes).

## 4. Delivery and refund options ✅ (dry quotes)
| Case (Base USDC → NEAR USDC, EXACT_INPUT 150) | Result |
|---|---|
| recipient `pot.near` (exists, **not** USDC-registered) | 201, `withdrawFee: "6467"` (0.006467 USDC ≈ 0.00125 NEAR × $5.16), out 149.968378 |
| recipient `000…c0ffee` (implicit, does not exist) | 201, `withdrawFee: "6467"` |
| recipient `pot-hackathon-nonexistent-zz9.near` (named, does not exist) | **400** `{"message":"Internal server error","correlationId":"47ada132-…","timestamp":…,"path":"/v0/quote"}` |
| recipient `"Not A Near Account!"` / an EVM address | 400 `{"message":"recipient is not valid",…}` |
| `recipientType:"INTENTS"` | 201, `withdrawFee: "0"`, out 149.98233 (stays inside `intents.near`) |
| `customRecipientMsg:"{\"pot\":\"lisbon-trip\"}"` (registered / unregistered) | 201; echoed in `quoteRequest.customRecipientMsg`; unregistered still `withdrawFee 6467` |
| `refundType:"INTENTS", refundTo:"pot.near"` | 201, **`refundFee: "0"`** (vs 0.0024 for ORIGIN_CHAIN) |
| `refundType:"ORIGIN_CHAIN", refundTo:"pot.near"` or a Solana address on a Base quote | 400 `{"message":"refundTo is not valid",…}` |

On-chain proof of the delivery mechanics (mainnet NEAR tx `77T1gXCNL6EeUcQwsQb84AzZZSwX4CJa1KiEg7n3pYNC`, signer `intents.near`, block time 2026-10-21T11:34:50Z, a public Ethereum USDC → NEAR USDC 1Click swap with `withdrawFee 6467`), receipts via `EXPERIMENTAL_tx_status`:
```
intents.near -> wrap.near                 near_withdraw    {"amount":"1250000000000000000000"}
intents.near -> 17208628…33a1 (USDC)      storage_deposit  deposit=0.00125 NEAR {"account_id":"rhea…multica.near","registration_only":null}
intents.near -> 17208628…33a1 (USDC)      ft_transfer_call deposit=1 {"receiver_id":"rhea…multica.near","amount":"10496883230","msg":"{\"w\":[…],\"b\":{\"r\":\"BurrowCollateral\"}}"}
17208628…33a1 -> rhea…multica.near        ft_on_transfer   {"sender_id":"intents.near","amount":"10496883230","msg":"…"}
```
The `ft_withdraw` intent inside `execute_intents` carried `"storage_deposit":"1250000000000000000000"` plus the `msg`. So 1Click **auto-registers** USDC storage (charging it as `withdrawFee`) and `customRecipientMsg` really becomes `ft_transfer_call`, with **`sender_id = intents.near`**, not the end user. Explorer: https://nearblocks.io/txns/77T1gXCNL6EeUcQwsQb84AzZZSwX4CJa1KiEg7n3pYNC

## 5. Errors, minimums, restricted chains, status shapes ✅
Two error body shapes:
```json
{"message":"Amount is too low for bridge, try at least 150000","correlationId":"1c3325dd-…","timestamp":"2026-10-21T11:27:22.376Z","path":"/v0/quote"}
{"message":"recipient should not be empty,recipient must be a string","error":"Bad Request","statusCode":400,"timestamp":"…","path":"/v0/quote"}
```
| Input | HTTP | `message` |
|---|---|---|
| Base 0.01 USDC EXACT_INPUT | 400 | `Amount is too low for bridge, try at least 150000` |
| Base EXACT_OUTPUT 0.01 | 400 | `…try at least 149983` |
| Arbitrum 0.01 USDC | **201** | (works; `refundFee 5300`) |
| Ethereum 0.01 USDC | 400 | `…try at least 300001` |
| Solana 0.01 USDC | 400 | `…try at least 283802` (EXACT_OUTPUT `283772`) |
| `amount:"150.5"` | 400 | `amount must be specified in base units (…)` |
| past `deadline` | 400 | `deadline is not valid` (2 min, 24 h, 30 days all accepted on dry) |
| unknown asset | 400 | `tokenIn is not valid` |
| bad `swapType` | 400 | `swapType must be one of the following values: EXACT_INPUT, EXACT_OUTPUT, FLEX_INPUT, ANY_INPUT` |
| `ANY_INPUT` without key | 400 | `Swap type is not available for unauthorized requests` |
| `confidentiality:"basic"` without key | 401 | `User authentication is required for confidential intent quotes` |
| garbage `X-API-Key` or `Authorization: Bearer` (also on `/v0/status`) | 401 | `{"message":"Invalid token","error":"Unauthorized","statusCode":401,…}` (a bad key does **not** fall back to anonymous) |
| garbage key on `/v0/tokens` | 200 | (ignored) |
| Polygon / Optimism USDC → NEAR USDC, $150 and $1,500, also to INTENTS | 400 | `Quoting for this pair is not available` |
| BSC USDC → NEAR USDC $150 | 400 | `Temporary swap limits: minimum swap amount is $1,000` |

`GET /v0/status`:
```json
GET /v0/status?depositAddress=0x000000000000000000000000000000000000dEaD   -> 404
{"message":"Deposit address 0x000000000000000000000000000000000000dEaD not found","error":"Not Found","statusCode":404,"timestamp":"2026-10-21T11:29:19.511Z","path":"/v0/status?depositAddress=0x000000000000000000000000000000000000dEaD"}
GET /v0/status                                                            -> 400 {"message":"Deposit address should be not empty","error":"Bad Request","statusCode":400,…}
```
Same 404 for random EVM/Solana/garbage strings and with `&depositMemo=123`. CORS preflight on `/v0/quote`, `/v0/status`, `/v0/deposit/submit`: `204`, `access-control-allow-origin: *`, `access-control-allow-headers: content-type,x-api-key,authorization`.

SDK 0.1.26 with **no `OpenAPI.TOKEN`**: `getTokens()` 205 tokens; `getQuote({dry:true,…})` OK; `getExecutionStatus(unknown)` throws `ApiError` `status:404`; `verifyQuoteSignature(dryQuote) === true`; tampered `amountOut` → `false`; **47/47** raw dry quotes from batches 1–4 verify (default key `ed25519:reYaWhvwu8Jzo3WUM3zhn6VrhuMEF4eADL17qtRVifc` hard-coded in the SDK). The SDK sends `Authorization: Bearer <TOKEN>` only when `TOKEN` is set.

Latency (this machine → Cloudflare OTP): dry quote p50 377 ms, p90 519 ms (n=47); 400 errors p50 60 ms; status p50 64 ms (n=87); tokens 160 ms.

## 6. Real swaps: status payloads and timings ✅ (public data, read-only)
**How the public samples were found:** `https://explorer.near-intents.org/?fromChainId=<c>&status=<S>` server-renders the latest swaps in its Next.js flight payload (the documented Explorer API itself needs a JWT: `400 {"code":"Bad Request","error":{"code":"MISSING_TOKEN",…}}`). 1,089 unique rows were parsed (595 `ORIGIN_CHAIN`). `GET /v0/status` was then called on 61 deposit addresses. Addresses below are truncated.

Measured **origin deposit block time (public RPC) → `updatedAt` of SUCCESS**, ORIGIN_CHAIN, delivered on NEAR (`DESTINATION_CHAIN` NEAR asset or `INTENTS`), swaps from 2026-10-19..21:

| Origin | n | min | p50 | max | quote `timeEstimate` | notes |
|---|---|---|---|---|---|---|
| Base USDC | 8 | 26 s | **29 s** | 71 s | 35–37 | 5 to NEAR USDC/USDT 26–31 s; 71 s was → wNEAR |
| Arbitrum USDC | 8 | 17 s | **18.5 s** | 22 s | 25 | 7 to NEAR USDC |
| Ethereum USDC | 8 | 76 s | **83.5 s** | 138 s | 45–47 | estimate is ~2× low |
| Solana USDC | 8 | 37 s | **42.5 s** | 155 s | 20–22 | estimate is ~2× low; 155 s was → wNEAR |

Real **SUCCESS**, Base USDC → NEAR USDC (Meteor wallet: note `refundType: INTENTS` with the user's NEAR account):
```json
{"status":"SUCCESS","updatedAt":"2026-10-21T05:24:59.000Z","correlationId":"bafbfbca-…",
 "swapDetails":{"depositedAmount":"50000000","depositedAmountFormatted":"50.0","depositedAmountUsd":"49.975850000000",
  "intentHashes":["9ETwjk…"],"nearTxHashes":["7chLdr…","8jgB9n…"],
  "amountIn":"50000000","amountInFormatted":"50.0","amountOut":"49899334","amountOutFormatted":"49.899334","slippage":0,
  "refundedAmount":"0","refundedAmountFormatted":"0","refundedAmountUsd":"0","refundReason":null,"refundFee":"0","withdrawFee":"0",
  "originChainTxHashes":[{"hash":"0xc538…18d2","explorerUrl":""}],"destinationChainTxHashes":[{"hash":"8jgB9n…","explorerUrl":""}]},
 "quoteResponse":{"timestamp":"2026-10-21T05:23:24.776Z","signature":"ed25519:2e99…",
  "quoteRequest":{"dry":false,"swapType":"EXACT_INPUT","depositMode":"SIMPLE","slippageTolerance":30,
   "originAsset":"nep141:base-0x8335…omft.near","depositType":"ORIGIN_CHAIN","destinationAsset":"nep141:17208628…33a1","amount":"50000000",
   "refundTo":"marb…7610.near","refundType":"INTENTS","recipient":"marb…7610.near","recipientType":"DESTINATION_CHAIN",
   "deadline":"2026-10-21T05:33:24.743Z","appFees":[{"limitOrderId":null,"recipient":"mete…cold.near","fee":20}],
   "virtualChainRecipient":null,"virtualChainRefundRecipient":null,"referral":"meteor","confidentiality":"public"},
  "quote":{"amountIn":"50000000","minAmountIn":"50000000","amountOut":"49898009","minAmountOut":"49748314",
   "timeWhenInactive":"2026-10-24T05:33:24.743Z","depositAddress":"0x9c9A…5C00","deadline":"2026-10-24T05:33:24.743Z",
   "timeEstimate":35,"refundFee":"0","withdrawFee":"0"}}}
```
Note `quote.deadline` = `timeWhenInactive` = request `deadline` **+ 72 h** (58/58 samples created since Jul 2026).

Real **REFUNDED / PARTIAL_DEPOSIT** (EXACT_INPUT 2.0 quoted, 1.0 sent on Base):
```json
{"status":"REFUNDED","updatedAt":"2026-10-20T20:11:26.000Z",
 "swapDetails":{"depositedAmount":"1000000","amountIn":null,"amountOut":null,"slippage":null,
  "refundedAmount":"997600","refundedAmountFormatted":"0.9976","refundReason":"PARTIAL_DEPOSIT","refundFee":"2400","withdrawFee":"5300",
  "originChainTxHashes":[{"hash":"0xb9f0…ac1e","explorerUrl":""},{"hash":"0x43fd…04e2","explorerUrl":""}],"destinationChainTxHashes":[]},
 "quoteResponse":{"quoteRequest":{"swapType":"EXACT_INPUT","amount":"2000000","refundType":"ORIGIN_CHAIN","deadline":"2026-10-20T20:10:05.000Z",…},…}}
```
(refund 81 s after the request deadline; the refund tx is appended to `originChainTxHashes`).

Real **SUCCESS with excess refund** (EXACT_OUTPUT 5.0 to `jasn…-dao.near`, a Sputnik DAO treasury, referral `ping-checkout`): deposited 5.075421, used `amountIn` 5.024666, `refundedAmount` 0.045455 (= excess − `refundFee` 0.0053), two `originChainTxHashes`, `appFees` `[{fees…:25},{5880ad…:25}]`. Ethereum counterexample: EXACT_OUTPUT 25.0, deposited 25.381175, used 25.126865, **`refundedAmount 0`** (excess 0.254 < `refundFee` 0.30, so it was not refunded).

Real **FAILED** (Arbitrum USDC → TRX, EXACT_INPUT 147.095071): FAILED 42 s after the quote, `intentHashes` present, `amountOut 435.222486`, `destinationChainTxHashes []`, `refundedAmount "0"`, `refundReason null`. All 6 FAILED samples had `refundedAmount 0`.

REFUNDED samples (n=20, ORIGIN_CHAIN, 4 origin chains): `refundReason` = `NO_LIQUIDITY` 10, `PARTIAL_DEPOSIT` 5, `AMOUNT_LESS_THAN_MIN_AMOUNT_OUT` 4, `AMOUNT_MORE_THAN_BALANCE` 1. The refund status lands **8–87 s after the request `deadline`** in all 20. Real exchange-fee-style shortfalls refunded under EXACT_INPUT: 5.939197 of 6.0 (Sol), 28.873186 of 29.01 (Sol), 1,219.704756 of 1,221.785366 (Eth). FLEX_INPUT below band: 3.041951 vs `minAmountIn` 3.249 → `AMOUNT_LESS_THAN_MIN_AMOUNT_OUT`, refundType INTENTS, `refundFee 0`. Actual Solana `refundFee` charged 0.010002–0.010063 USDC (quote said 0.283456).

INCOMPLETE_DEPOSIT samples: ORIGIN_CHAIN 0.011218 of 0.011219 (1 base unit short!) sitting INCOMPLETE since 2026-03-17 with deadline 2027-05-07; INTENTS-type 0.675 of 0.9 wNEAR still INCOMPLETE 6 days after its deadline, `refundedAmount 0`. `updatedAt` on INCOMPLETE rows is refreshed continuously (it is "now", not the transition time).

KNOWN_DEPOSIT_TX: not seen in any of 1,089 explorer rows or 61 status reads (`?status=KNOWN_DEPOSIT_TX` returned other statuses).

## 7. Live transitions (batches 7–9)
**Batch 7** (`07-watch-transitions.mjs`, 11:49:38 → 12:09:38 UTC): 60 public ORIGIN_CHAIN quotes with USDC origin (Arb 30, Base 23, Sol 4, Eth 3), all created at 11:49:0x and seen as `PENDING_DEPOSIT`, polled every 15 s for 20 min. Result: **0/60 changed status** (`done: 0/60 addresses changed status`), all still `PENDING_DEPOSIT`. Together with 195 such quotes created within ~4 s, this shows integrators create non-dry quotes as previews, and most are never funded. It also shows `KNOWN_DEPOSIT_TX` cannot be observed this way. No 429s at ~240 req/min.

**Batch 8** (`08-processing-split.mjs`, 11:58–12:04 UTC): 6 public ORIGIN_CHAIN swaps already in `PROCESSING`, polled every 4 s until terminal. `updatedAt` stayed fixed while PROCESSING, so it marks the transition time:

| Swap (origin → dest) | origin block (RPC) | PROCESSING `updatedAt` | SUCCESS `updatedAt` | block→PROCESSING | PROCESSING→SUCCESS |
|---|---|---|---|---|---|
| Eth USDT → ETH (eth) | 11:56:59 | 11:58:38 | 11:59:01 | 99 s | 23 s |
| Base USDC → ZEC | 11:57:51 | 11:58:20 | 11:59:49 | 29 s | 89 s (ZEC withdrawal) |
| Eth USDC → LTC | 11:56:35 | 11:57:52 | 11:59:49 | 77 s | 117 s |
| Eth USDT → BTC | 11:55:59 | 11:57:28 | 12:03:59 | 89 s | 391 s (BTC withdrawal) |
| Eth USDT → ZEC | 11:55:23 | 11:56:40 | 11:59:33 | 77 s | 173 s |
| Eth ETH → Base ETH | 11:57:11 | (missed) | 11:58:44 | – | total 93 s |
So on Ethereum about 77–99 s pass between the deposit block and 1Click starting to process (origin confirmations); on Base, 29 s (n=1). For NEAR destinations, PROCESSING is short: swaps funded from Intents balances that deliver on NEAR went quote → SUCCESS in 12–48 s.

Long-running PROCESSING: of 182 explorer rows in `PROCESSING`, 166 were >7 days old. Examples: 50 USDC (Sol) → ZEC created 2026-05-28, intent executed (`amountOut 0.0908768`), `destinationChainTxHashes: []`; 0.000127 ETH (Arb) → ETH (Eth) since 2026-06-30. Their `updatedAt` is refreshed (≈ now), and **none were to NEAR USDC**. `Python-urllib/3.14` User-Agent → **403** from Cloudflare on `/v0/*` (curl default / empty UA → 200).

**Batch 9** (`09-recommended-body.mjs`, 12:06Z): the exact body recommended in the KB (FLEX_INPUT, 100 bps, `refundType: INTENTS`, `refundTo = recipient = pot.near` (unregistered), `deadline +2 h`, `referral: "pot"`), dry, no key:
```
base: 201 662ms minAmountIn=148500000 amountOut=149.978005 minAmountOut=148478224 timeEstimate=35 refundFee=0 withdrawFee=6454 fees=[{5880ad…,fee:1}] sigValid=true
arb:  201 701ms minAmountIn=148500000 amountOut=149.97237  minAmountOut=148472646 timeEstimate=25 refundFee=0 withdrawFee=6454 fees=[{5880ad…,fee:1}] sigValid=true
eth:  201 547ms minAmountIn=148500000 amountOut=149.964747 minAmountOut=148465099 timeEstimate=45 refundFee=0 withdrawFee=6454 fees=[{5880ad…,fee:1}] sigValid=true
sol:  201 598ms minAmountIn=148500000 amountOut=149.964747 minAmountOut=148465099 timeEstimate=20 refundFee=0 withdrawFee=6454 fees=[{5880ad…,fee:1}] sigValid=true
```

## 8. Operational status ✅
- Public Shield status JSON (found in the status page bundle; undocumented, no auth): `GET https://partners.near-intents.org/api/shield/public/status` → `{"activeIncidentCount":10,"activeIncidents":[{"id":…,"scopeType":"chain","scopeValue":"pol","status":"active","createdAt":"2026-10-18T11:56:50.133Z",…}, …],"recentlyResolved":[…]}`. Active at 11:32Z: `scroll, adi, xlayer, monad, stellar, avax, op, ton, bsc, pol` (all HOT-bridge chains). Recently resolved: `base` 2026-10-15 08:10→09:50 (100 min), `eth` 10-17 23:23→23:56 (33 min), `btc` 34 min, `tron` 105 min, `hot` bridge 10-15→10-18 (69 h). `GET …/api/shield/public/maintenance-modes` → `[]`. Human page: https://partners.near-intents.org/shield/status
- Documented partner API: `GET https://shield.chaindefuser.com/incident` with a `SHIELD`-type partner key → `{"status":"operational"}` or `{"status":"incidents","incidents":[{"scopeType":"chain","scopeValue":"eth","direction":"withdraw","publicDescription":"…"}]}` (📄, not tested: no key).

## Conclusion
1Click is usable for Pot today **without a JWT**: tokens, dry quotes and status all work. The measured fee is 1 bp on USDC→USDC, not the documented +25 bps. Base/Arbitrum/Solana deposits settle on NEAR in about 20–45 s after the origin tx is mined, and Ethereum in about 85 s. 1Click registers USDC storage for unregistered recipients by itself (about $0.0065). `customRecipientMsg` → `ft_transfer_call` works, but the recipient sees `sender_id = intents.near` and there is no refund on failure. EXACT_INPUT refunds any shortfall (even 1 unit) at the deadline, so Pot should use **FLEX_INPUT**. Pot should also use **`refundType: INTENTS`** to the member's NEAR account. There is no testnet; build a simulator (see KB).

Raw files: `out/q*.json`, `out/s4-*.json`, `out/tokens.json` (our own requests). Third-party status dumps were reduced to the truncated excerpts above and deleted (1Click ToS §4.1(e) limits caching API data to 24 h).
