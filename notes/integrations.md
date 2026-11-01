# Integrations notes: 1Click deposits, NEAR Connect, NEAR Auth, new-device AddKey

> Written 2026-10-22 by the integrations engineer. Tasks: B-14 + F-21 (D-50), B-10 + F-19, F-14/F-27 + B-07 live
> bits + B-20, B-13. Specs: api-spec §2.1, §2.2, §2.7, §4.3, §4.4, §5.1; frontend-architecture §4.4, §4.5, §5.6, §5.7;
> design-direction 01 §2, §4, §6; kb/intents-1click.md, kb/near-connect.md, kb/near-auth.md. Testnet only; the only
> mainnet traffic is read-only dry quotes to the live 1Click API.

## Status (actual output)

| Command (repo root unless noted) | Result |
|---|---|
| `pnpm typecheck` | web + sdk clean |
| `pnpm lint` | `lint-copy: 752 strings, 0 banned words` · `messages.d.ts is up to date` · eslint clean |
| `pnpm test` | `Test Files 45 passed \| 4 skipped (49)` · `Tests 752 passed \| 21 skipped (773)` |
| `NEXT_DIST_DIR=.next-integ pnpm build` | passes (`/api/oneclick/{chains,quote,simulate,status,status/[id]}`, `/api/session/wallet`, `/api/devices` are ƒ) |
| `cd apps/web && NEXT_DIST_DIR=.next-integ E2E_PORT=3711 pnpm exec playwright test` (mock suite, all 3 projects) | **164 passed, 13 skipped** (the skips are other agents' tests) |
| `cd apps/web && E2E_INT_PORT=3790 pnpm exec playwright test -c e2e/integrations/playwright.config.ts` | **5 passed** |
| `scripts/with-testnet-lock.sh env E2E_TESTNET=1 E2E_PORT=3427 NEXT_DIST_DIR=.next-testnet-int pnpm --filter web exec playwright test -c e2e/testnet/playwright.config.ts deposit.testnet.ts` | **1 passed (1.2m)** |

New tests: `server/features/oneclick/oneclick.test.ts` (31), `server/features/wallet/wallet.test.ts` (8),
`server/features/devices/devices.test.ts` (9), `server/features/nearauth/nearauth.test.ts` (7),
`components/features/deposit/deposit.test.tsx` (8); e2e `e2e/mock/deposit.spec.ts` (6 × 3 projects),
`e2e/integrations/{nearauth,wallet}.int.ts` (5), `e2e/testnet/deposit.testnet.ts` (1).

### Testnet evidence (simulator e2e, 2026-10-22, `https://testnet.nearblocks.io/txns/<hash>`)
- Pot `deposit-trip-pzc9-tega.pots.potprev.testnet`, deposit `dp_01m5gj6p28aprpg8xq0s2q72xm` (Base, $150, scenario ok).
- A dry quote through `POST /api/oneclick/quote` came from the live 1Click API: `amountOut 149980149`, `minAmountIn
  148500000`, correlationId `65e26dd7-588c-41ef-a6b9-dab4e5e95438` (signature verified server-side).
- Simulated delivery, treasury → member, `ft_transfer` 149.985000: `EkUpFGnGEWDDNjX66eT7CqLmnV9o7rcfNMubVLdsEc16`.
- The one tap, the member's relayed `ft_transfer_call` (relay `rl_01M5GJ7TWKZ2G0ZH8ZQCSPVJQ2`):
  `BxZz6sKsEHbKxPHTwu39xB4Aza1w5Jnq4fBsorTrXEUq`. Chain after: Pot `ft_balance_of` = 149985000, member 0, deposit ADDED.
- Cost of a run: 1 dev account + registration (≈ 0.0085 NEAR), 1 Pot (≈ 0.07 NEAR hub float), 2 relayer txs.

## 1. Any-chain deposit (B-14, F-21, D-50)

**Server** `server/features/oneclick/`:
- `assets.ts`: the 4 allow-listed USDC origin ids, labels, measured p50s (18/29/42/84 s), minimums, simulator
  profiles, `stepOf()` (status → step 1-5).
- `client.ts`: the real 1Click API (anonymous; `ONECLICK_API_KEY` optional, dropped for one retry on 401), the kb's
  body (FLEX_INPUT 100 bps, INTENTS refunds to the member, 2 h deadline, `referral: pot`), HTTP 201 = success,
  `chain_paused` / `amount_too_low` (minimum parsed) / `quote_failed`, **quote signature verification** (the SDK's
  `verifyQuoteSignature` re-implemented with @noble + a json-stable-stringify twin; tested on the spike's 4 real
  recorded quotes + tampering), Shield status (60 s cache, fail open).
- `sim.ts` (pure, also used by the browser mock): the simulator timeline from "send" time, ± 20 % deterministic jitter;
  PENDING → KNOWN_DEPOSIT_TX (last 40 % of the wait) → PROCESSING → SUCCESS; `partial` (80 % → INCOMPLETE, top-up →
  converts, else REFUNDED/PARTIAL_DEPOSIT 10 s after a shortened deadline), `no_liquidity`, `failed`, `slow` (6 min
  converting), `expired`.
- `service.ts`: chains, quote (dry = real numbers; non-dry = a `deposit_intent` row), simulate, status (lazy refresh),
  list, delivery, ADDED.
**Routes** (all session, JSON envelope, CSRF on POSTs): `GET /api/oneclick/chains`, `POST /api/oneclick/quote`,
`GET /api/oneclick/status/[id]` (`?relayId=` marks ADDED), `GET /api/oneclick/status?pot=` (additive: the Pot card's
list), `POST /api/oneclick/simulate`.
**Caps (rev4 H-3):** simulated quotes ≤ $500; simulated deliveries ≤ $500 per session subject per UTC day
(`user:` · `xc_sim_usd`; the $150 demo-session cap went with the demo in Rev 9), inside the global `faucet_usd` cap; 20 non-dry quotes
per day, ≤ 5 open deposits per person; dry quotes 300/day. Overrides: `QUOTA_XC_QUOTES`, `QUOTA_XC_DRY`,
`QUOTA_XC_SIM_USD`. `ONECLICK_SIM_PAUSED=base,…` shows the "paused" picker on testnet.
**The simulator** (testnet; `ONECLICK_MODE=real` + mainnet only for the clip): the address is `SIMULATED-<chain>-<8 hex>`,
the QR encodes `POT TESTNET DEMO - DO NOT SEND FUNDS` under a "Test only · Do not send" band, every screen has the
"Testnet demo: simulated transfer, no real money" pill. Its numbers are a real dry quote's (placeholder recipient
`pot.near`; the withdraw fee is given back for an already-registered member) or the FLEX formula offline. At SUCCESS
the server sends real "USDC (test)" from the treasury key pool (`ft_transfer`, 1 yocto; `storage_deposit` first if the
member is unregistered, like 1Click), locked by the relay_log server key `sim:<id>`; until that lands the status stays
PROCESSING ("SUCCESS" means in the member's account). A failed delivery frees the lock and retries on the next poll.
**UI** `components/features/deposit/`: `DepositSheet` (`?sheet=add&src=xc` → network picker with paused/slower rows →
`&d=<id>` address + QR + [Simulate sending $X] as the one marigold, Copy hidden, "Try a problem instead" scenarios;
real mode: [Copy Base address]) · `DepositStepper` (status word, 5 steps with helpers and times, "Taking longer than
usual" at 5 min, incomplete with [Simulate sending $X more], refunded / failed with Contact support, expired with
[Get a new address], [Progress | Details] with the reference, "Your $X arrived" + [Add it to the Pot]) ·
`DepositCards` on the Pot (progress card; arrived card takes the marigold, the hero's Add money turns secondary).
Client: `lib/deposit/` (live API, the browser mock over sim.ts, TanStack hooks polling 3-4 s while moving, `addArrived`).

## 2. NEAR Connect wallet login (B-10, F-19)

- `server/features/wallet/nep413.ts`: the exact NEP-413 bytes (`u32_le(2³¹+413) ‖ borsh{message, nonce[32],
  recipient, callbackUrl: None}`), sha256, ed25519 verify; base64 or `ed25519:base58` signatures. Tested against a
  hand-built byte vector and against near-api-js's own `signNep413Message` with locally generated keys.
- `service.ts` + `POST /api/session/wallet`: message must be "Sign in to Pot", recipient one of our allowed origins'
  hosts, nonce = 8-byte BE ms ‖ 24 random within 5 min, single use (`used_proof` purpose `wallet`), the key must be a
  FullAccess key of the account (`wallet_key_not_full_access`), nothing under `<root>` (rev4). Upserts `app_user` kind
  `wallet` (display name from the account), a `wallet` session; the relayer pays USDC `storage_deposit` once per account
  ever in `after()` (relay_log `register:<account>`, `global/registrations`, sponsor health).
- Client `lib/signing/near-connect/wallet.ts` (lazy `@hot-labs/near-connect`, testnet, `footerBranding: null`):
  `connector.connect({signMessageParams})`, the signed message from the `wallet:signInAndSignMessage` event (fallback
  `signMessage`). `walletSend()`: gasless `signDelegateActions` → the same `/api/relay`; otherwise
  `signAndSendTransaction` with `buildCall(…, {direct: true})` (the wallet pays its gas; a synthetic RelayOk).
  `send()` routes wallet sessions there. UI: `components/features/wallet/WalletSignIn.tsx` ("I have a NEAR wallet").
- E2E: a build flag `NEXT_PUBLIC_E2E_MOCK_WALLET=1` swaps the connector for a local signer (key from
  `localStorage['pot.e2e.wallet']`): NEP-413 sign-in and, since Rev 9, `signDelegateActions` (the testnet tier's only sign-in
  path). `next.config.ts` aliases `pot-e2e-mock-wallet` to it only under that flag (refused on Vercel and mainnet) and to a
  throwing stub otherwise, so a normal build carries none of its code; it also refuses to run outside localhost.

## 3. NEAR Auth login (F-14, F-27, B-07 live bits, B-20)

- `lib/signing/near-auth/oidc.ts` (pure): Authorization Code + PKCE S256 against the tenant directly (auth0-spa-js
  overwrites a caller's nonce, F-15), our nonce = `base64url(sha256(rawPk(device) ‖ challenge))` (= the server's
  `nonceFor`), `response_mode=web_message` (popup) or `query` (redirect), `connection=google-oauth2`, the code
  exchange at `/oauth/token`, the session PoP bytes.
- `lib/signing/near-auth/client.ts`: `prepareNearAuthLogin()` on idle (pending device key + `GET /api/session/challenge`,
  refreshed after 8 min); `startNearAuthLogin()` opens the window **synchronously in the tap**, then /authorize, waits
  for Auth0's `authorization_response` message (origin + state checked), exchanges the code, signs the PoP with the
  pending key, `POST /api/session`, promotes the key. No window → **redirect fallback** (flow kept in sessionStorage);
  `components/features/auth/NearAuthCallback.tsx` on "/" finishes it (code exchange, session or devices) and
  hard-navigates back. `startNearAuthApproval()` = the same flow with the signing audience + `delegateAction` bytes
  (the access token is the 60 s signing JWT).
- UI `components/features/auth/SignInOptions.tsx`: [Continue with Google] / [Join with Google], "More ways"
  (email, passkey on NEAR Auth's pages), "I have a NEAR wallet". Shown on live builds; NEAR Auth only with
  `NEXT_PUBLIC_FLAG_NEAR_AUTH=true` + a client id (hosted builds keep it off until H-01, D-22).
- Server: unchanged verification (JWKS, RS256, iss/aud/azp, challenge MAC + single use, nonce, PoP). New:
  `server/features/nearauth/signing.ts` (signing JWT: RS256 over JWKS, issuer, `aud` ∋ `auth0.jwt.fast-auth.testnet`,
  `azp`, `scope` ∋ `transaction:sign`, `sub` = the session's, ≥ 15 s left, `fatxn` = the exact bytes, ≤ 7,168 B) and
  `fakeIssuer.ts` (a local Auth0-shaped issuer: JWKS, /authorize redirect + web_message, /oauth/token with PKCE,
  signing tokens with `fatxn`) used by vitest and the integrations e2e.
- Manual check with a real Google login on localhost:3000: **notes/near-auth-manual-test.md**.

## 4. New-device AddKey (B-13)

- `server/features/devices/service.ts` + `POST /api/devices` (open to `pending_device` sessions; NEAR Auth only):
  PoP (`pot-device-add-v1`), the signing JWT, the NEP-461 prefix, the strict canonical decode of the DelegateAction
  (`AddKey(devicePk, FullAccess)` only, sender = receiver = the account, signer = the stored MPC key), already-on-chain
  → activate without paying, MPC key nonce / window (`nonce_used`, `expired`, `ttl_too_long`), ≤ 6 device keys,
  quotas (5 devices/user/day, `global/mpc_signs`, a 0.005 NEAR `relay_yocto` pre-charge), rev4 L-7 (re-derive the MPC
  key for the JWT's `sub`), sponsor health, an `mpc_slot:0..1` lease. Then `fast-auth.testnet.sign` (300 Tgas,
  **1 yocto**, D-21) by the relayer pool, the final `{"scheme":"Ed25519","signature":[…]}` → a SignedDelegate that is
  decoded and **signature-checked locally** before the relayed AddKey; relay_log rows `mpc_sign` + `add_key`;
  idempotent per `idempotencyKey`; the device activated and the session rebound.
- Client `lib/devices/confirm.ts` (`requireDeviceConfirmation()`, prepare AddKey bytes from the MPC key's nonce + head
  + 550 blocks via the lazy `lib/signing/near-auth/addKey.ts`, `submitAddDevice()`), UI
  `components/features/devices/ConfirmStep.tsx` ("Confirm it's you": device row, why, what next, [Continue with Google]
  opening the window in the tap, Approved → Adding this device → Done, [Not now]) + `ConfirmStepHost` in the app shell.
  `send()` opens it when a NEAR Auth session's key isn't on chain, then the action resumes (e2e-verified).
- Live: needs a real Google token → **human checklist step 5** in notes/near-auth-manual-test.md.

## Shared files I touched (minimal, additive; re-read right before each edit)

| File | Edit |
|---|---|
| `apps/web/i18n/en.json` (+ regenerated `messages.d.ts`) | 74 keys appended at the end: `xc.*` (deposit; allowlisted), `add.source.other_hint`, `signin.google/more/or/wallet.*`, `auth.callback.working`, `confirm.*` (ⓟ device/why/next/progress/provider/later/wallet_pays) |
| `components/sheets/AddMoneySheet.tsx` | the "Another app or exchange" row is enabled → `openSheet("add", {src: "xc", amount})`; sub = `add.source.other_hint` |
| `components/pot/PotScreen.tsx` | `?src=xc` opens `DepositSheet` instead of the Add sheet; `DepositCards` above the coach card; `addVariant` from `useArrivedDeposit` |
| `components/pot/BalanceHero.tsx` | new optional `addVariant` prop (default primary) so an arrived-deposit card can hold the one marigold |
| `components/app-shell/Shell.tsx` | `SignedOutScreen` renders `<SignInOptions>` on live builds |
| `components/landing/JoinCta.tsx` | live branch renders `<SignInOptions join>`; signing in dispatches `TAP_JOIN {signedIn: true}` |
| `app/page.tsx` | `<NearAuthCallback />` (the redirect island) |
| `app/(app)/layout.tsx` | `<ConfirmStepHost />` inside the SessionGate |
| `lib/client/live/signing.ts` | `send()`: wallet sessions → `walletSend`; a NEAR Auth `needs_device` → `requireDeviceConfirmation()` then retry (old body is `sendOnce`) |
| `lib/client/live/actions.ts`, `lib/client/actions.ts` | `addMoney` options gain `context` (RelayContext) and `onRelayed` (exported `AddMoneyOptions`) |
| `next.config.ts` | `distDir` from `NEXT_DIST_DIR` when set (two Playwright builds in one folder clobbered each other's `.next`) |
| `eslint.config.mjs`, `apps/web/tsconfig.json`, root `.gitignore` | ignore `.next-*` dist dirs |
| relay policy table, `db/schema.ts`, sheet router | **not changed** (deposit_intent, PROOF_PURPOSES `wallet`/`device_add`, RELAY_OPS `mpc_sign`/`add_key`/`sim_delivery` already existed; `src`/`d` were already sheet params) |

## Deviations (with reasons)

1. **No Workflow poller** (`watchDeposit`, api-spec §5.1): `workflow` isn't wired into next.config. The deposit status
   advances lazily when the client polls (stepper 3 s, Pot card 4 s while moving), and the treasury delivery runs in
   `after()`. A person who never reopens the Pot gets the delivery on their next visit. No push yet (X-06 territory).
2. **ADDED via `?relayId=`** on the status route (verified against relay_log: owner, `add_money`, executed, success,
   `recorded: true`, same Pot, after the deposit) instead of the relay route reading `context.depositIntentId` (the
   relay route isn't mine). The client still sends `context.depositIntentId` on the relay. → backend: wiring it in
   `/api/relay` would make ADDED independent of the client.
3. **Additive route** `GET /api/oneclick/status?pot=` (list) for the Pot card across reloads/devices.
4. **Simulator details:** `KNOWN_DEPOSIT_TX` shown for the last 40 % of the confirmation wait (so all 5 steps animate);
   `no_liquidity` refunds after 20 s of converting (not at the 2 h deadline); delivery amount = arrived − 1 bp.
5. **NEP-413:** the signature is verified **before** the nonce is spent (spec order is the reverse), so junk can't burn
   someone's nonce.
6. **NEAR Auth approvals don't use auth0-spa-js** either: the same direct Code + PKCE flow gets the signing JWT (it is
   the code exchange's access token), one code path, fully covered by the fake issuer. `@auth0/auth0-spa-js` stays
   installed and unused.
7. **Wallet self-paid path** returns a synthetic RelayOk (contribution `recorded: true` when the tx shows no failure);
   no `/api/tx/report` (optional route, not built), so those actions get no feed rows or notifications.
8. **Wallet sessions can't open from in-app accounts**: `bad_request` with `why: own_account` (spec: `bad_request`).
9. **e2e tiers:** the mock-source tier runs the stepper on the browser mock (same sim.ts); NEAR Auth and the wallet run in
   a new **integrations tier** (real app in testnet mode + fake RPC + fake issuer + mock wallet, `t_e2e_integrations`
   schema in pot_test), because a mock-data build has no server sessions.

## For other agents

- **Run Playwright with `NEXT_DIST_DIR=.next-<name>`** if someone else's server may be using `.next`.
- **backend:** (a) consider marking `deposit_intent` ADDED from `/api/relay` `context.depositIntentId`; (b) quota names
  `xc_*` live in `server/features/oneclick/service.ts` (`xcLimit`), not `server/quotas.ts`; (c) `deriveMpcKey` is reused
  from `server/session/service.ts`.
- **frontend:** `BalanceHero.addVariant`; `DepositCards` sits under `PotStateCard`; the deposit sheet closes with
  `replaceSheet(null)` (closing never cancels a deposit).

## Human items

- NEAR Auth real login + "Confirm it's you" on localhost:3000: **notes/near-auth-manual-test.md** (≈ 15 min).
- NEAR Connect with a real testnet wallet (Meteor / Intear): sign in, then Add money (gasless `signDelegateActions`).
  Not click-tested (needs a wallet; kb/near-connect.md §open questions).
- Real mainnet 1Click deposit: out of scope (Phase 2 clip, `ONECLICK_MODE=real` on a mainnet build).
