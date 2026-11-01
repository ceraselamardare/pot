# sdk notes: `@pot/sdk` (X-03 v0, X-04, F-03)

> Written 2026-10-22 by the sdk engineer. Sources: decisions.md Rev 7 (§8), contracts-spec.md, frontend-architecture.md §1.4/§3/§4/§13, api-spec.md, implementation-plan X-03/X-04/F-03, test-plan U-01…U-11 and PR-02/PR-04, kb/meta-tx-relayer.md, kb/sputnik-dao.md, kb/backend-infra.md.
> **Reconciled against the implemented contract source** (`contracts/pot-hub/src/{types,views,events,errors,kinds,prorata,ledger,lib}.rs`, read 00:30-00:57). `contracts/abi/` is still empty and `notes/contracts.md` is an interim stub, so there was no ABI to diff against yet (see "Reconciliation").

## Status

| Check | Result |
|---|---|
| `pnpm --filter @pot/sdk typecheck` | clean |
| `pnpm --filter @pot/sdk lint` | clean |
| `pnpm --filter @pot/sdk test` | **124 passed**, 8 skipped (the testnet file, env-gated), 11 files (incl. `reconcile.test.ts`: error codes + event names vs the contract source) |
| `pnpm --filter @pot/sdk test:testnet` (`POT_SDK_TESTNET=1`) | **8/8 passed** against live testnet (read-only views only) |
| `pnpm --filter @pot/sdk test:node` (plain Node 22.22.2, type stripping) | 3/3: root, `/sign` (near-api-js) and `/testing` all load and run |
| root `pnpm test` | 440 passed, 9 skipped (web + sdk) |
| root `pnpm typecheck` | **sdk passes; `apps/web` fails** with 11 errors in the backend agent's in-progress code (route handlers typed `(req: Request, routeCtx?: {params: Promise<undefined>})` vs Next's `RouteHandlerConfig`, and `server/live/relay.live.test.ts` casting to `ProcessEnv`). None involve `@pot/sdk`; web doesn't import it yet. Not mine to fix (apps/web is off-limits) |

**No dependency was added.** near-api-js 7.3.1 stays the optional peer + dev dependency. The SignedDelegate decoder is a strict built-in borsh reader instead of adding `borsh`.

## Package layout and entry points

```
packages/pot-sdk/
  package.json        exports ".", "./api" (new), "./sign", "./testing"; version 0.1.0
  scripts/gen-prorata-vectors.ts   regenerates the PR-02 parity file (node, type stripping)
  src/
    config.ts money.ts encoding.ts validate.ts rules.ts invite.ts
    types/   ids hub hub-raw dao usdc events errors intents signer api
    read/    rpc.ts (failover client) parse.ts views.ts (+ tests, testnet.integration.test.ts)
    actions/ gas.ts kinds.ts build.ts
    math/    prorata.ts approvals.ts expiry.ts decide.ts  vectors/prorata.json, prorata-random.json
    sign/    encode.ts delegate.ts nonce.ts signer.ts invite.ts   (the ONLY near-api-js importer)
    testing/ mock-chain.ts fixtures.ts mock-signer.ts
```

- `"@pot/sdk"` has **zero runtime dependencies** (WebCrypto and `fetch` only). Safe on first-load routes and in RSC.
- `"@pot/sdk/sign"` imports near-api-js. Load it with a dynamic `import()` in the browser (D-42); scripts and the server import it directly.
- `"@pot/sdk/testing"` has no near-api-js (it uses WebCrypto Ed25519 for invite signatures).
- `"@pot/sdk/api"` is the X-04 wire-types file. It is also re-exported as the namespace `Api` from the root, because its ids are plain strings and would clash with the branded root `AccountId`.

## Public API: what the frontend and backend import

### `@pot/sdk` (root)

**Config and ids**
- `SdkConfig`, `testnetConfig(root, overrides?)`, `TESTNET_RPC_URLS` (FastNEAR, then dRPC).
- `daoIdFromSlug`, `slugFromDaoId`, `isPotDao`, `explorerTxUrl`, `explorerAccountUrl`.
- Branded `AccountId`, `DaoId`, `Slug`, `PublicKeyStr` and `Viewed<T>`, with the `as*`/`is*` helpers.

**Money (U-03, PR-04)**
- `Micro` (bigint), `MAX_AMOUNT`.
- Parsing: `parseUsdInput("84.50")` (keypad; ≤ 2 dp by default; null when invalid), `dollars(84)`, `micro()`, `parseMicroStr`.
- Formatting: `formatUsd(m)` gives "$1,234.50", floored to the cent with two decimals everywhere. `formatUsdShort` gives "$150" or "$84.50" for sentences and buttons. `formatUsd(m, {sign: "in" | "out"})` gives "+ $150.00" or "− $84.00" (U+2212).
- Tabular helpers: `formatUsdParts` (sign / whole / fraction, for hero layouts) and `alignTabular` (FIGURE SPACE padding for columns).

**Validators (U-11)**, which mirror the hub:
- `isValidSlug` / `slugError`, `isValidPotName`, `isValidEmoji` (≤ 16 UTF-8 bytes, so the family emoji is rejected, as the hub does), `hasForbiddenChars` (control and Cf, ZWJ/VS16 allowed);
- `displayNameError`, `noteTextError`, `isValidRequestRef`;
- `newOpKey()` / `isOpKey` (Crockford base32, also a valid `request_ref`).

**Rules:** `rulesToRaw`/`rulesFromRaw`, `rulesToWire`/`rulesFromWire`, `presetRules`, `validateRules` (the twin of the hub's `validate_rules`), `PRESET_RULES`, `HUB_LIMITS`, `RESERVED_SLUGS`.

**Types**
- Hub domain types (camelCase): `PotView`, `PotSummary`, `MemberView`, `RulesView`, `SpendPreview`, `ClosePreview`, `RequestView`, `InviteView`, `SubjectView`, `ConfigView` and the outcomes.
- Their snake_case contract twins: `Raw*` in `hub-raw.ts`.
- DAO: `Policy`, `PolicySummary`, `Proposal`, `RawProposal`, `ProposalKind` (kept verbatim), `DaoAction`, `VoteAction`, `KindLabel`.
- USDC: `FtMetadata`, `StorageBalance`.
- Events: `HubEvent` (typed per event name, from `events.rs`), `parseEventLog`, `formatEventLog`, `isHubEvent`.
- Errors: `HUB_ERROR_CODES` (= `errors.rs`), `DAO_ERROR_CODES`, `SYNTHETIC_ERROR_CODES`, `errorCodeFromText(text)` (api-spec §1.3: the first `ERR_*` token, else `RECEIVER_NOT_REGISTERED` / `INSUFFICIENT_FUNDS` / `OUT_OF_GAS` / `BAD_CALL` / `UNKNOWN`), `refusedCode`.
- Intents: `ActionIntent`, `CallAction`, `CallSpec`, `ActionIntentWire`.
- Signer: `PotSigner`, `Prepared`, `SignedPayload`, `SignerKind`, `Readiness` (type-only; frontend-architecture §4.1).

**Read (U-01, U-02)**
- `createRpcClient({urls, timeoutMs=4000, stickyMs=60000, budget={perMinute:100,burst:10} | false, headers?, fetch?, onFailover?})`. It throws `BannedRpcUrlError` for `*.near.org` and `*.lava.build`.
  - Failover triggers: network/TypeError, timeout, HTTP 408/429/5xx, a JSON-RPC `-429` (also as HTTP 200 or a top-level body), and node errors.
  - No failover on `UNKNOWN_ACCOUNT`, `NO_CONTRACT_CODE`, a missing key or method, or panics. These throw `RpcViewError{code, errorCode}`, e.g. `errorCode: "ERR_POT_NOT_FOUND"`.
  - Stickiness: 60 s, then it probes the primary.
  - Budget: a FIFO token bucket.
  - Parsing is lenient about control characters.
- `createChainViews(cfg, rpc?)` → `ChainViews {hub, dao, usdc, account}`, and every call returns `{value, blockHeight}`:
  - `hub`: `getConfig`, `getPot`, `getPotsOf`, `getMembers(pot, balance?)`, `getRules`, `previewSpend`, `previewClose`, `getRequests` (limit capped at 50), `getRequest`, `getInvite`, `getProposalSubject`;
  - `dao`: `getPolicy` (→ `PolicySummary` with `members`, `rulebot`, `threshold`, `quorum`, `proposalPeriodNs` and `raw`), `getProposals`, `getProposal` (**null on `ERR_NO_PROPOSAL`**), `getLastProposalId`, `getActionsLog`;
  - `usdc`: `balanceOf`, `isRegistered`, `storageBalanceOf`, `metadata`;
  - `account`: `accessKey` (optimistic; null when missing; nonce as bigint), `head`.
- `createPotSdk(cfg, rpcOpts?)` = views + `rpc` + `build(intent, opts?)`.
- Parsers and mappings: `parsePotView` … `parseProposal`, `mapRequestStatus(status, {payoutSeen?})`, `toSpendPreviewReason`.

**Actions (U-06, U-07)**
- `buildCall(intent, cfg, {direct?, daoFloat?})` → `CallSpec`. The exact args key order, gas and deposit are tested string-for-string against contracts-spec and api-spec §3.1:

  | Intent | Gas (Tgas) | Deposit |
  |---|---|---|
  | `add_money` (`usdc.ft_transfer_call`, msg `{"pot":dao}`, no memo) | 100 | **1 yocto** |
  | `request_spend` | 150 | 0 |
  | `vote`: Transfer / AddMemberToRole | **exactly 100** (from `kind`) | 0 |
  | `vote`: FunctionCall (close, rules) | **exactly 300** (from `kind`) | 0 |
  | `join` | 100 | 0 |
  | `create_pot` | 300 | 0 |
  | `add_invite` / `revoke_invite` | 30 each | 0 |
  | `rotate_invite` (one delegate, two actions) | 30 each | 0 |
  | `set_rules` | 30 | 0 |
  | `propose_rules` | 100 | 0 |
  | `propose_close` | 150 | 0 |
  | `retry_payout` | 100 | 0 |
  | `add_device_key` (AddKey FullAccess) | — | — |

  - `{direct: true}` attaches the rev4 hub cost on the six hub-funded methods: `create_pot` = dao_float + 0.02 NEAR, `join` 0.02, `request_spend` 0.06, `add_invite` 0.005, `propose_rules` 0.06, `propose_close` 0.15.
- Gas and deposits: `GAS`, `GAS_TGAS`, `voteGas(kind)`, `directDeposit(method)`, and `RELAY_POLICY`, the R1-R11 deposit and gas-range table for the relayer's static checks. `buildSync(cfg, pot, pid)` is for the relayer's 50 Tgas `sync`.
- Kinds, byte-identical to `kinds.rs`: `transferKind`, `joinKind`, `closeKind`, `rulesKind`, the `*Description` helpers, `kindsEqual` (Sputnik's ==), `kindLabel`, `decodeCloseKind` and `decodeRulesKind` (so the Approve sheet renders what is actually voted on, rev4 M-10).
- `intentToWire` / `intentFromWire` for demo relay bodies.

**Math (U-04, U-05, U-10)**
- `prorata(balance, contributions, lastContributor)` returns `{payouts, dust, dustTo} | null`; `shareOf`.
- `approvalsNeeded(n, [1,2], quorum)`, `tallyStatus`.
- `expiresAtMs`, `isExpired`, `effectiveStatus` (InProgress past its period reads as Expired).
- `decideSpend` / `previewSpendDecision`: the twin of `PotHub::decide`, for instant local RulePreview.

**Invites (D-08, root, WebCrypto)**
- Message: `joinMessage` / `joinMessageBytes` = `pot-join:v1:<dao>:<joiner>`.
- Keys and secrets: `generateInviteSeed`, `seedToSecret` / `secretToSeed` (43-char base64url).
- Links: `buildInviteLink` / `parseInviteLink` (`/j/<slug>?i=<b58>#<secret>`), `invitePkToParam` / `FromParam`.
- `isJoinSignatureFormat`: padded base64, 88 chars.
- WebCrypto: `webCryptoInviteKey`, `signJoinWebCrypto`, `verifyJoinWebCrypto`, `ed25519VerifyWebCrypto`.

### `@pot/sdk/sign` (near-api-js 7.3.1)
- **Delegates**
  - `buildDelegate`, `signDelegate(signer, {senderId, call, nonce, maxBlockHeight})` → `{signedDelegate, signedDelegateBase64, delegateHash}`;
  - `delegateActionBytes` (the NEP-461-prefixed bytes for NEAR Auth `signPayload`), `encodeSignedDelegateBase64`, `verifySignedDelegate`;
  - `decodeSignedDelegate(b64 | bytes)` is a strict, canonical borsh decoder. It rejects trailing bytes, bad tags, invalid UTF-8, and action tags ≥ 8 (Delegate/DelegateV2).
  - `delegateSigningBytes`, `delegateHash`, `NEP461_PREFIX_BYTES`.
- **Nonces:** `nextNonce`, `maxBlockHeightFor` (TTL 200; 600 for NEAR Auth), `delegateWindowError` (relayer window head+10 < mbh ≤ head+600), `NonceTracker`, `SigningQueue` (FIFO per key, one in flight, 30 s timeout).
- **Signers:**
  - `HashSigner(publicKey, signHash)` is the near-api-js `Signer` base for the web's WebCrypto adapter. It produces delegates byte-identical to `KeyPairSigner`.
  - `KeyPairPotSigner({accountId, secretKey, chain, cfg})` is a full `PotSigner` for tests and scripts: `prepare` reads the nonce and height from `chain.account`, and `sign` returns the `/api/relay` body.
  - `relayBody`, `SignerNotReadyError`.
- **Invites (noble):** `generateInvite`, `inviteKeyFromSeed`, `signJoin(seedOrSecret, dao, joiner)` → `{invitePk, signature}`, `verifyJoin`. These are byte-identical to the WebCrypto path.

### `@pot/sdk/testing` (F-03)
- **`lisbonTrip(state)`** returns `{chain, ids, invite, proposals}`, an independent MockChain clone at each D-61 state:

  | State | DAO balance | Pot status |
  |---|---|---|
  | `pre_leo` | $300 (Maya + Sam; Leo invited) | open |
  | `seeded` | $450 (Maya, Sam, Leo, no spends; the README / demo-pool state) | open |
  | `after_instant` | $366 ($84 groceries, instant) | open |
  | `vote_pending` | $366 ($300 boat, 1 of 2 with Maya's own approval) | open |
  | `vote_approved` | $66 | open |
  | `close_proposed` | $66 (Maya's own close approval cast) | closing |
  | `closed` | $0 ($22.00 each) | closed |

  - The states are built by running the D-61 script through the mock, so each fixture is a real executor state.
  - Also exported: `LISBON` (accounts under `potapp`, refs, memos), `LISBON_STATES` and `LISBON_EXPECTED`.
- **`MockChain`** implements `ChainViews` and executes CallSpecs as relayer + chain would:
  - `relay(sender, call)` / `relayIntent(sender, intent)` → `RelayOk | Err` (the api-spec shapes);
  - `handleRelayBody(sessionAccount, RelayReq)` accepts demo bodies **and** real signed delegates. It decodes them, checks the signature with WebCrypto and the key, nonce and expiry, and rejects with `sender_mismatch`, `nonce_used`, `expired`, `ttl_too_long`, `key_not_found` or `bad_signature`.
  - It mirrors the hub:
    - `decide()`, the §2.4 ledger, the sync mapping, invite rules, the close math, and the check order with real `ERR_*` codes;
    - refusals as `REFUSED_*` errors.
  - It mirrors Sputnik:
    - vote math (thresholds move as members join);
    - `ERR_ALREADY_VOTED`, `ERR_WRONG_KIND`, `ERR_PERMISSION_DENIED` and `ERR_PROPOSAL_NOT_READY_FOR_VOTE`;
    - lazy expiry, Failed payouts with Finalize retry, and atomic close batches.
  - It mirrors the relayer's static policy and R11 pre-flight: `receiver_not_allowed`, `method_not_allowed`, `deposit_cap`, exact-gas `gas_cap`, `args_invalid`, `proposal_not_tracked`, `not_a_member`, `already_voted`, `proposal_not_open`, `pot_unknown`, `pot_closed` and `slug_taken`.
  - The relayer's `sync` after votes and failed payouts runs automatically, as its own logged tx.
  - Controls: `fund`, `faucet`, `createAccount`, `registerUsdc` / `unregisterUsdc` (to simulate payout failures), `advanceTime` / `advanceBlocks`, `setPaused`, `setRelayPolicy(false)` (to reach the contracts' own panics), `clone`, `txLog`, `eventLog`.
- **`MockSigner(chain, account)`** is a `PotSigner` (kind `demo`) whose `send(intent)` goes prepare → sign → `handleRelayBody`. The frontend can run every flow on it before testnet.

## Mismatches with the specs (and what the sdk does)

**Contract (implemented) vs contracts-spec, mirrored by the sdk and the mock**
1. **`PotView` gains `open_rules_proposal` and `closing_in_flight`.** `closed_at_ms` is null until closed, and `PotSummary` includes Closed Pots. The sdk maps them to `openRulesProposal` and `closingInFlight`.
2. **`preview_close.dust_to` is nullable** (null when there's nothing to refund).
3. **`balance_estimate` ignores close payouts.** A closed Pot still reports the pre-close figure ($66 in the demo). **The UI must use `usdc.ft_balance_of(dao)` or `status`, not `balanceEstimate`, after a close.**
4. **`busy_until_ms` = now + 60 s on every contribution and instant spend, and it is never cleared early.** So `propose_close` within 60 s of money moving fails with `ERR_POT_BUSY`, and `preview_close.blocked_reason` is `busy`. Demo flows that close right after a spend must wait a minute or show "try again in a minute".
5. **`join`:**
   - a non-ed25519 `invite_pk` gives `ERR_INVITE_NOT_FOUND` (the spec lists `ERR_INVITE_PK_INVALID` only for `add_invite`);
   - `ERR_PAUSED` is checked first;
   - `ft_on_transfer` checks open before paused, and amount 0 gives `ERR_AMOUNT_TOO_LARGE`.
6. **`on_spend_checked` has an extra refusal:** under the `members` payee rule, an instant spend to a payee who isn't in the live DAO Group is refused with `not_in_dao_group`.
7. **`SpendOutcome`** can also carry the statuses `approving`, `expired` and `removed`, and the refusal `unknown_request`.
8. **`create_pot` trims the name before validating it.**

**Spec-to-spec choices the sdk made**

9. **`create_pot` gas = 300 Tgas.** That is the frontend-architecture §1.4, api-spec R2 default and U-06. contracts-spec §3.2 says 150 and allows ≤ 300.
10. **frontend-architecture §1.4 types are extended, not replaced.** The §1.4 field names are kept (`totalIn`, `memberCount`, `account`, `closeProposalId`, `dustTo`, `myContribution`), and every contract field is added.
    - `PotView.seq` is required.
    - `getRules` returns `RulesView | null`; §1.4 said `Rules`.
    - `SpendPreview` adds `hubReason`, and `RequestView` adds `hubStatus`.
    - `'paid'` only comes from `mapRequestStatus(s, {payoutSeen: true})`, because a view can't know about the payout.
    - Additive views: `hub.getConfig`, `usdc.storageBalanceOf`/`metadata`, `account.head`, and `PolicySummary.rulebot`/`raw`.
11. **`PotSigner.Prepared` gains a required `opId`,** which becomes the relay `idempotencyKey`; it equals `requestRef` for spends. Web adapters must set it (`newOpKey()`).
12. **`rotate_invite` intent** gains the optional `expiresAtMs`/`maxUses` of the new link.
13. **Naming:** api-spec names the wire event `PotEvent`. It is exported as `Api.PotEvent` (and from `@pot/sdk/api`). The typed on-chain events are `HubEvent`.
14. **New synthetic code `CLOSE_FAILED`** for a `propose_close` whose final value is `{ok:false}` (nothing_to_refund, add_failed). api-spec §1.3 has none. The backend may adopt it or map that case to `UNKNOWN`.
15. **`errorCodeFromText`** finds `ERR_` tokens with a lookbehind, not `\b`. The RPC debug-escapes newlines inside `panic_msg` ("…:1:1:\nERR_X"), which defeats `\b`.
16. **The `create_pot` args always include `"float": null`,** plus `rules`, `invite_pk` and `emoji` as null when absent. This is the contracts-spec example shape. The relayer's zod schema must accept the null keys.
17. **The kb's `g1.potspike-dao-svuw.testnet`** (the only Ea8t global-code DAO) **no longer exists**; the Rev 7 sweep deleted it. The testnet integration test reads `potspike-dao-svuw.sputnikv2.testnet` (v3.31) instead. Until our hub creates a Pot, there is no live 278adc7 DAO to read `get_actions_log` or string `vote_counts` from. Both are covered by unit tests with spec payloads.
18. **The sdk lint's D-32 ban** matches `lava.build` and the near.org host anywhere in a string literal, test titles included. Tests build those URLs from parts.

## Reconciliation status (contracts)

| Item | Status |
|---|---|
| View JSON (`views.rs`) | ✅ `hub-raw.ts` mirrors every field; parsers tested on the contracts-spec §4 payloads |
| Events (`events.rs`) | ✅ `HubEventDataMap` mirrors all 14 variants |
| Error codes (`errors.rs`) | ✅ `HUB_ERROR_CODES` = the 48 constants |
| Kinds + descriptions (`kinds.rs`) | ✅ byte-identical; the kinds.rs unit-test strings are asserted in `actions/build.test.ts` |
| Pro-rata (`prorata.rs`) | ✅ V1-V7 from `contracts/tests/vectors/prorata.json` (copied to `src/math/vectors/`; a test asserts the two stay equal) + 2,000-run fast-check |
| PR-02 parity file | `src/math/vectors/prorata-random.json` (500 seeded cases, same schema, ≈ 1 MB). **P1: point a Rust test at it.** Regenerate with `node packages/pot-sdk/scripts/gen-prorata-vectors.ts` |
| `decide()` / ledger / sync / join / close check order | ✅ mirrored in `math/decide.ts` and MockChain (re-checked against `lib.rs` at 00:57) |
| ABI (`contracts/abi/pot_hub.json`) | ⏳ not produced yet. When it lands, diff it against `types/hub-raw.ts` and the method arg names in `actions/build.ts` |
| `notes/contracts.md` | ⏳ an interim stub so far |

## What the backend and frontend need to know

**Backend (relayer, routes)**
- Import wire types from `@pot/sdk/api` (or `Api.*`). They replace the local copies in `apps/web/server/relay/types.ts` and `server/chain/hub.ts`. `REASON_HTTP_STATUS` gives the default status per reason.
- Relay pipeline: `decodeSignedDelegate` (canonical by construction) → `verifySignedDelegate` → `RELAY_POLICY` / `voteGas(kind)` for the static checks → `kindsEqual(args.proposal, get_proposal.kind)` for R11 → `errorCodeFromText` + `refusedCode` to classify → `parseEventLog` / `isHubEvent` for trusted events.
- Server reads use `createRpcClient({urls, budget: false, headers: u => u.includes("fastnear") ? {Authorization: \`Bearer ${key}\`} : undefined})`.
- The demo path is `intentFromWire(body.demo.intent)` → `buildCall` → `KeyPairPotSigner` with the persona key (or `signDelegate` with your own nonce lease).
- `buildSync` is for the after-vote `sync`.

**Frontend**
- Replace the local copies (`lib/client/money.ts`, `rules.ts`, `mock/fixtures.ts`) with `formatUsd`/`parseUsdInput`, `approvalsNeeded`/`effectiveStatus`, and `lisbonTrip()` + `MockSigner`.
- The heartbeat compares `PotView.seq`; settle ops by `Viewed.blockHeight ≥ executedAtBlock`.
- Build the WebCrypto device signer as `new HashSigner(pk, h => subtle.sign("Ed25519", key, h))` inside the lazy chunk.
- After a close, show the balance from `usdc.balanceOf(dao)`, not `balanceEstimate`.
- Handle `ERR_POT_BUSY` (close within 60 s of money moving).
- The Approve sheet should render `decodeCloseKind` / `decodeRulesKind` / the Transfer kind of the proposal itself, and act only when `getProposalSubject(...).live`.

## Not done / follow-ups
- **X-03 v1 (P1, Nov 6):** regenerate or verify types from `cargo near abi` once it exists.
- **MockChain does not model** NEAR balances and sponsorship (`ERR_DEPOSIT_REQUIRED`, `ERR_HUB_LOW_BALANCE`, prepay), gas burn (except the < 35 Tgas contribution bounce), relayer quotas, or the early two-phase `request_spend` answer. It returns one final answer.
- `alignTabular` assumes every string has the same punctuation layout. Real column alignment still needs CSS `tabular-nums`.
