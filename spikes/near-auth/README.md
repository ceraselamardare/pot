# Spike 2: NEAR Auth testnet login + relayed delegate action (MANUAL checklist for Cerasela)

> THROWAWAY (Phase 0). Testnet only. Never import or copy anything from here into the product.
> Research and background: [`kb/near-auth.md`](../../kb/near-auth.md) and [`kb/near-connect.md`](../../kb/near-connect.md). Record results in [`RESULTS.md`](RESULTS.md).

**The questions (plan C3, Spike 2; P-1):**
1. Can a human log in with Google, email and a passkey on the NEAR Auth testnet, and how long does it take (P-1 asks for a median under 30 s and 3 steps or fewer)?
2. Can a NEAR Auth MPC signature authorize a **NEP-366 delegate action** that **our** relayer submits (gasless)?
3. What does the per-action approve UX feel like, and how long does each action take?
4. Does any of this work in an **installed PWA** on iPhone (iOS 26) and Android?
5. Does the NEAR Connect fallback (Meteor/Intear on testnet) sign delegates that our relayer can submit?

**Already verified by the agent, with no login (2026-10-21):**
- `npm run typecheck` and `npm run build` pass (bundle 765 KB min / 238 KB gz).
- Headless Chromium on `http://localhost:3000`: "Log in (popup)" opens `login.testnet.fast-auth.com/u/login/identifier` (title "Log in | Example"; buttons Continue / Continue with a passkey / Continue with Google). "Log in (redirect)" navigates to the same page. Closing the popup rejects with `{error:"cancelled", message:"Popup closed"}`. "Connect wallet" shows Meteor, Intear, Ledger and NEAR CLI.
- `node relay.mjs derive --sub "google-oauth2|123456789"` returns `ed25519:4ePu6MJV…`. `relay.mjs serve` passes its CORS and validation checks.
- **Not done:** any real login, approval, account creation or relay. That's your part.

## 0. Setup (~5 min)
- Node 22 (no global installs needed). From this folder run `npm install`. It pulls ~325 packages and ~200 MB, including `react-native` (a peer dependency of the NEAR Auth browser SDK). That's expected.
- **Relayer account (testnet; ~10 NEAR from the faucet is plenty).** Use the *legacy* keychain file and **never** `save-to-keychain`:
  ```bash
  npx -y near-cli-rs@0.30.1 account create-account sponsor-by-faucet-service potspike-auth-<4 random a-z>.testnet \
    autogenerate-new-keypair save-to-legacy-keychain network-config testnet create
  export RELAYER_ACCOUNT_ID=potspike-auth-<xxxx>.testnet   # relay.mjs reads ~/.near-credentials/testnet/$RELAYER_ACCOUNT_ID.json
  ```
  Alternative: put `{"account_id":"…","private_key":"ed25519:…"}` in `.keys/relayer.json`, which is gitignored. Never paste keys into docs.
- Terminal A: `npm run dev`. It **must** be on `http://localhost:3000`, the only localhost callback the shared testnet client accepts. Don't use `127.0.0.1` or another port, which give "Callback URL mismatch".
- Terminal B: `node relay.mjs serve`, listening on `http://localhost:3001`.
- Chrome with DevTools open (Console). Keep a stopwatch or screen recording; the page also logs `timingsMs`.

## A. Pre-flight (1 min)
- [ ] Open `http://localhost:3000`. The log says "not logged in", Mode is "browser tab", and the console has no errors (a favicon 404 is fine).

## B. Login methods and P-1 timings (~20 min)
Run each method **3×**: twice in a fresh Incognito window ("first time") and once in a normal window ("returning"). Count **taps after "Log in (popup)"** and time from the tap until the log shows `logged in via popup` (`timingsMs.loginPopupMs`).
- [ ] **Google**: "Continue with Google", then pick your account. Note any consent screen naming *auth0.com*: the tenant uses Auth0 **dev keys** for Google. Record `sub` (it should start with `google-oauth2|`), `derivedPublicKey`, `implicitAccount`.
- [ ] **Email + password**: Sign up, then email, then password (min 8). Is an email verification sent or required? Record the `sub` prefix (`auth0|`?) and whether the page still works without verifying.
- [ ] **Passkey**: "Continue with a passkey" (or create one at signup), then Touch ID / Face ID. Record whether it works and the tap count.
- [ ] Once: **"Log in (redirect)"** with Google. The page reloads and should log `logged in via redirect` with `loginRedirectMs`.
- [ ] Reload the page. Expected: "not logged in", because the SDK keeps tokens in memory. Then "Log in (popup)" again: is it instant (SSO) or a full login? Google dev keys may break SSO.
- [ ] Log out, then log in again with **the same** Google account. The `derivedPublicKey` must be identical (deterministic).

## C. Account creation + relayed delegate action (~15 min)
1. [ ] After a Google login, copy `derivedPublicKey` from the log. Then run:
   `node relay.mjs create --pk <ed25519:…> --name u-<4 chars>`. This creates `u-xxxx.<relayer>` with the MPC key as a **full-access** key and 0.02 NEAR, with **no user signature**. Record the tx link.
2. [ ] In the page: Sender = `u-xxxx.<relayer>`, Receiver = `<relayer>`. Then tap **Prepare**. The log shows the DelegateAction (nonce, maxBlockHeight = head+600).
3. [ ] Tap **Approve in NEAR Auth (popup)**. **Screenshot the approval screen** (expected: "Example wants to sign a DelegateAction", Sender/Receiver/Max Block Height, actions JSON, Approve/Deny). Tap Approve. Record `approvePopupMs`, `jwtLifetimeSec` (expect 60), `jwtBytes`, `signPayloadBytes`.
4. [ ] Within ~45 s, tap **Relay via localhost:3001**. Record `ms.mpcSignTx` (expect ≈9 s), `ms.metaTx`, `ms.total`, `yoctoBurnt`, and both nearblocks links (`signTx`, `metaTx`). On nearblocks, check that the meta tx shows a **1 yocto transfer from `u-xxxx` to the relayer**, with the relayer paying gas.
5. [ ] Repeat steps 2-4 twice more to get three timing samples (Prepare again each time: the nonce increments).
6. [ ] Negative cases:
   - Approve, then **wait more than 70 s** before Relay. Expect `ok:false, step:"sign"`, with the guard rejecting ("Token expired") and the deposit refunded. Record the cost from the signTx link.
   - Tap **Deny** in the popup. Record the error text the app receives.
   - Tap Relay **twice** on the same approval. The second meta-tx should fail with a nonce error. Record it.
7. [ ] Optional (Pot's real shape): repeat with email/passkey logins to confirm each login gets its own key.

## D. iPhone (iOS 26), installed web app (~15 min). The most important unknown
The shared client only accepts `http://localhost:3000` and `https://example.fast-auth.com`, and an iPhone can't reach your Mac's `localhost`. So test with the **official demo** `https://example.fast-auth.com`, which uses the same SDK, the popup flow and the same tenant:
- [ ] **Safari tab:** open `https://example.fast-auth.com`, then Login. Does the popup open as a new tab and return? Time it. Try Google, then a passkey.
- [ ] **Installed:** Share → Add to Home Screen (keep "Open as Web App" on). Launch from the Home Screen, then Login. Record exactly what happens:
  - (a) A sheet or window opens *inside* the web app and the app ends up logged in. ✅
  - (b) The login opens in Safari or a Safari view, and the app never learns about it (spinner forever; the SDK times out after 60 s). ❌
  - (c) Nothing opens (popup blocked or `window.open` returned null). ❌
- [ ] Installed: in the demo, try "Request Transaction Approval" (it may fail for unrelated reasons). Does the **approval popup** open and close back into the app?
- [ ] Installed: a passkey (Face ID) inside the web app. Does it work?
- [ ] Installed: force-quit and relaunch. Still logged in? (Expected: no.)
- If our origin is whitelisted before Nov 1, repeat D against a deployed copy of this page (it detects "installed PWA (standalone)" mode).

## E. Android Chrome, installed PWA (~15 min)
- [ ] Connect the phone by USB with USB debugging on. On the Mac, open `chrome://inspect/#devices` → **Port forwarding**: `3000 → localhost:3000` and `3001 → localhost:3001`. The phone's `http://localhost:3000` now reaches your dev server, which is a secure context.
- [ ] Phone Chrome: open `http://localhost:3000`. Then ⋮ → **Install app** (or Add to Home screen). Launch it from the launcher; the page shows "installed PWA (standalone)".
- [ ] Log in with the popup, then (once) with redirect. Record what happens (Custom Tab? returns to the app?) and the timings.
- [ ] Run C.2-C.4 inside the installed app: approve popup, then relay.

## F. NEAR Connect fallback (optional, ~10 min)
- [ ] Have a **testnet** account in Meteor Wallet (web) or Intear Wallet.
- [ ] Section 4 of the page: **Connect wallet**. Expect only Meteor, Intear, Ledger and NEAR CLI. Then **Wallet signs delegate (1 yocto)** (Receiver = `<relayer>`), then **Relay wallet delegate**. Record the wallet UX, timings and the `metaTx` link. Confirm the relayer paid gas.

## What to record (copy into RESULTS.md)
| Field | Why |
|---|---|
| Per login method: taps, seconds (3 samples), errors, `sub` prefix | P-1 median under 30 s and 3 steps or fewer |
| Approval screen screenshot + text | product-ux: is per-action NEAR Auth signing acceptable? |
| `approvePopupMs`, `ms.mpcSignTx`, `ms.metaTx`, `ms.total`, `yoctoBurnt` | latency/cost per NEAR Auth action (decides "device key" vs per-action MPC) |
| `jwtLifetimeSec`, `jwtBytes`, `signPayloadBytes` | relayer validation (60 s window, 7168 B cap) |
| nearblocks links (create, signTx, metaTx) | proof |
| iOS installed: outcome a/b/c for popup login, approval popup, passkey | PWA viability |
| Android installed: popup/redirect outcomes | PWA viability |
| Wallet fallback: wallet, outcome, `metaTx` | C9 fallback |

## Cleanup
Stop both terminals. The `u-xxxx.<relayer>` accounts can stay (testnet). Don't commit `.keys/` or `dist/` (both gitignored).
