# Spike 2 results: NEAR Auth testnet login + relayed delegate action

> Status: **agent-side checks done (2026-10-21); human run PENDING** (checklist: [README.md](README.md)). Testnet only.

## Question
Does NEAR Auth on testnet let a non-crypto user log in (Google/email/passkey) in ≤3 steps and <30 s median (P-1)? Can its MPC signature authorize a NEP-366 delegate that our relayer submits gaslessly? Does it work in an installed PWA on iOS and Android?

## Setup
- Shared testnet client `np8paqIpMWmNbzT4xAvOOapZBjsOpptl` (domain `login.testnet.fast-auth.com`). Contracts `fast-auth.testnet` → `jwt.fast-auth.testnet` → `auth0.jwt.fast-auth.testnet`; MPC `v1.signer-prod.testnet`.
- Page: `npm run dev` (http://localhost:3000). Relay: `node relay.mjs serve` (near-api-js 7.3.1). Provider `@fast-auth-near/javascript-provider@1.4.1`. Wallet fallback `@hot-labs/near-connect@0.11.4`.
- Relayer account: `potspike-auth-____.testnet` (fill in)

## Agent-side results (no login), 2026-10-21
| Check | Result |
|---|---|
| `tsc --noEmit` / `vite build` | ✅ pass; 765 KB min / 238 KB gz. Needs `define: {global: "globalThis"}` (provider's near-api-js 5 → `randombytes` reads `global`) and `alias buffer → "buffer/"` |
| Popup login from localhost:3000 (headless Chromium) | ✅ opens `login.testnet.fast-auth.com/u/login/identifier`, "Log in \| Example", buttons Continue / Continue with a passkey / Continue with Google |
| Redirect login | ✅ navigates to the same page |
| Close popup | ✅ rejects `{error:"cancelled", message:"Popup closed"}` |
| Wallet selector (testnet, `signDelegateActions`) | ✅ Meteor, Intear, Ledger, NEAR CLI |
| `relay.mjs derive` | ✅ `google-oauth2\|123456789` → `ed25519:4ePu6MJVtv74NDZvT7DeqUdL6j9saHHx5YTsTscbNTyJ` |
| Relay validation (bad guard / non-delegate / missing key) | ✅ rejected before any tx |
| Encoding: near-api-js 7.3.1 DelegateAction vs SDK's v5 encoder | ✅ byte-identical (offline) |
| On-chain reference (others' txs, Sept 2026) | ✅ `sign` = 15 blocks / 7.4-9.2 s / ≈0.0045 NEAR; JWT `exp−iat` = 60 s; `google-oauth2\|` and `auth0\|` subs both sign |
| Third-party delegate relayed (Pot's "Add money" shape) | ✅ NEAR Auth-signed delegate `ft_transfer_call` deposit 1 (testnet USDC) → relayed meta-tx success, 15 s after `sign`: https://testnet.nearblocks.io/txns/BBgP2hWuT4iws8PuZ8i32YK8FSd2x62wK51ShGnLxu2f → https://testnet.nearblocks.io/txns/8EEfWDjk3EJNNCWFgeoKCczq1m2vxvJ6SQ15tJz3yW87 |

## Human results (fill in)
### B. Login
| Method | Run | Taps | Seconds | Errors / notes | `sub` prefix |
|---|---|---|---|---|---|
| Google | 1 (fresh) | | | | |
| Google | 2 (fresh) | | | | |
| Google | 3 (returning) | | | | |
| Email+password | 1-3 | | | | |
| Passkey | 1-3 | | | | |
| Google (redirect) | 1 | | | | |
Median (all methods): ___ s. P-1 (≤3 steps, <30 s): ✅ / ❌

### C. Relayed delegate (1 yocto transfer)
| Run | approvePopupMs | mpcSignTx ms | metaTx ms | total ms | signTx | metaTx |
|---|---|---|---|---|---|---|
| 1 | | | | | https://testnet.nearblocks.io/txns/… | https://testnet.nearblocks.io/txns/… |
| 2 | | | | | | |
| 3 | | | | | | |
- Account created: `u-____.potspike-auth-____.testnet`, tx https://testnet.nearblocks.io/txns/…
- jwtLifetimeSec ___ ; jwtBytes ___ ; signPayloadBytes ___
- Approval screen text / screenshot: …
- Negative cases: expired (>70 s) → … ; Deny → … ; double relay → …

### D. iPhone (iOS __), installed web app via example.fast-auth.com
| Flow | Safari tab | Installed web app (a/b/c) | Notes |
|---|---|---|---|
| Login popup (Google) | | | |
| Login passkey | | | |
| Approval popup | | | |
| Relaunch keeps session? | | | |

### E. Android (Chrome __), installed PWA via port forwarding
| Flow | Outcome | Notes |
|---|---|---|
| Login popup | | |
| Login redirect | | |
| Approve + relay | | |

### F. Wallet fallback
| Wallet | Connect | signDelegateActions | Relayed metaTx |
|---|---|---|---|
| Meteor | | | |
| Intear | | | |

## Conclusion (fill in)
- P-1 achievable with NEAR Auth testnet? …
- Per-action NEAR Auth signing acceptable for Pot UX? Or adopt "MPC root key + device session key"? …
- Installed PWA: popup / redirect / neither? …
- Go/no-go for the judged demo (needs whitelisting of our origin): …
