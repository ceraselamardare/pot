# NEAR Auth (FastAuth): SDKs, account model, signing, testnet config, iOS/Android PWA OAuth
> Owner: auth. Last verified: 2026-10-21. Legend: ✅ verified · 📄 docs-only · ⚠️ unverified/conflicting

## TL;DR
- **How it works (✅ source + on-chain).** The user logs in with Auth0. **Every signature then opens a fresh Auth0 popup or redirect.** In it an Auth0 Action shows a form, "*{app name}* wants to sign a DelegateAction", with Approve/Deny buttons, and mints a **60-second** RS256 JWT whose `fatxn` claim holds the exact bytes to sign. Someone, in practice our relayer, then calls `fast-auth.testnet.sign(...)`. The guard checks the JWT on-chain, and the MPC (`v1.signer-prod.testnet`) Ed25519-signs `sha256(bytes)` for the key at path `jwt#https://login.testnet.fast-auth.com/#<sub>`. **No key is held locally** (the SDK keeps no private key).
- **Testnet works end to end** (✅ on-chain).
  - There are successful `sign` calls through 2026-09-26 from **Google** (`google-oauth2|`) and **email/passkey** (`auth0|`) logins: 15 blocks ≈ **7.4-9.2 s**, ≈ **0.0045 NEAR** each.
  - It covers **Pot's exact "Add money" shape.** A third-party dApp (youtick) used NEAR Auth to sign a **NEP-366 delegate carrying `ft_transfer_call` with 1 yocto on testnet USDC** from the MPC-derived implicit account. Its own relayer executed it 15 s after the `sign` tx: [sign](https://testnet.nearblocks.io/txns/BBgP2hWuT4iws8PuZ8i32YK8FSd2x62wK51ShGnLxu2f) → [meta-tx](https://testnet.nearblocks.io/txns/8EEfWDjk3EJNNCWFgeoKCczq1m2vxvJ6SQ15tJz3yW87), 2026-09-22.
  - The guard's 2 RSA keys equal the live JWKS, and the contracts are unpaused (`version` 1.0.0).
- 🚫 **The shared testnet client will not work from a deployed Pot.** The public client `np8paqIpMWmNbzT4xAvOOapZBjsOpptl` allows callbacks **only `http://localhost:3000` (root path) and `https://example.fast-auth.com`** (✅ probed). `*.vercel.app`, other ports, `127.0.0.1` and `/callback` paths all return 403 "Callback URL mismatch". A hosted demo needs the NEAR Auth team to whitelist our origin or issue us a client. **That's a human action, so start it now.**
- **Login methods on the testnet tenant** (✅ tenant config and login page): **Google** (on Auth0 *development keys*), **email + password** (open signup), and **passkeys**. **No Apple, no email OTP or magic link.** The app name users see is **"Example"**.
- **Accounts:** NEAR Auth **never creates accounts**. A login deterministically maps to an MPC public key: `derived_public_key({path, predecessor:"fast-auth.testnet", domain_id:1})`, a view call (✅). **We can create `u-xyz.<our-root>.testnet` with that key as a full-access key**, server-side, with no user signature, or just fund the implicit account `hex(pk)`.
- **Signing:** transactions ✅ and **NEP-366 delegate actions ✅** (`requestDelegateActionSignature`). **NEP-413 ❌**: PR #112 was still open on 2026-10-20 and is not on npm. There is **no public NEAR Auth relayer for third parties**, and the React SDK hard-codes `https://localhost:3001/...` plus `fast-auth-beta-001.testnet` (a different key namespace). Use our own relayer (→ relayer).
- **SDK quality is low** (✅ installed and type-checked):
  - The d.ts files import a missing `./provider` (TS2307), so the types fall back to `any`.
  - `browser-sdk` pulls `react-native-auth0` and **`react-native@0.88`** (325 packages, 205 MB).
  - Bundles carry a near-api-js 5 copy: the provider alone is **540 KB min / 167 KB gz**.
  - Tokens are cached in memory only, so a reload logs the user out.
  - The popup has a fixed 60 s timeout, and you can't pass a pre-opened popup.
  - **Recommendation:** write a ~40-line wrapper over `@auth0/auth0-spa-js` (same wire protocol).
- **Recommended Pot design: "NEAR Auth root key + device session key."**
  1. One NEAR Auth popup handles login.
  2. The server verifies the Auth0 ID token, derives the MPC key and creates the account with **two full-access keys**: the MPC key (recovery) and a browser-generated device key.
  3. Every action is a delegate **signed locally with no popup**, then goes through our relayer.
  4. NEAR Auth MPC signing is used only to `AddKey` on a new device. Mainnet NEAR Auth signing on the auth.near.org/status 24 h snapshot of 2026-10-10 was **100% AddKey**, which is the same pattern.
  - This meets P-1 (≤3 taps, <30 s) and keeps Pot's "instant" moments. Using NEAR Auth signing **per action** costs ≥1 extra approve tap, ~10-20 s per action, and an "Example wants to sign a DelegateAction" screen showing raw JSON.
- **Installed iOS PWA: evidence conflicts, so we have to test it.**
  - Apple (WWDC23): `window.open` "will always open in the web app regardless of scope", and OAuth to a third-party domain stays in the web app "through heuristics".
  - web.dev: on iOS `open()` "returns null", and out-of-scope pages open in an **SFSafariViewController with storage isolated from the PWA**.
  - A Sept 2026 field report saw OAuth complete in SFSafariViewController without the session reaching the PWA, and fixed it with `window.open` from the gesture.
  - Android WebAPK: out-of-scope pages open in a Custom Tab that closes back into the PWA (📄).
  - Spike checklist §D/§E covers both platforms.
- **Is it viable for the judged demo? Only with fallbacks.** (a) Get our origin whitelisted before Nov 1; otherwise NEAR Auth runs only on `localhost:3000` (fine for a recorded video). (b) Always ship the plan's labeled **demo login** (server-held testnet keys) for judges, plus **NEAR Connect**. Rate limits are not the main risk: the free tenant allows 300 Authentication-API req/min tenant-wide and testnet traffic is tiny. The real risks are the origin whitelist, the shared "Example" branding, Google dev keys, and no SLA.

## Plan check
| Claim in the original plan | Status |
|---|---|
| "NEAR Auth signs with Google, Apple, email, or passkeys via Auth0 and MPC" [18] | ⚠️ True for mainnet docs. **Testnet shared client:** Google ✅ (`google-oauth2|` subs sign on-chain); email+password ✅ (`auth0|` subs sign on-chain; passkeys share this `auth0|` DB connection); passkeys offered on the login page but not tested by us; Apple ❌; email OTP/magic link ❌. "Email" means password signup, not passwordless. |
| Testnet `fast-auth.testnet` uses a "public, shared demo credential"; mainnet "is gated" [19][20][21] | ✅ both. **But** the shared credential only accepts `http://localhost:3000` and `https://example.fast-auth.com` as callbacks, so it can't serve `pot-<team>.vercel.app` ❌ |
| C3 Phase 0: "apply now for NEAR Auth mainnet access" | ✅ still valid (human action). Form: https://form.typeform.com/to/VWHjf3HV. Lead time is not documented ⚠️. **Also ask for a testnet client (or whitelisting) for our domain.** |
| P-1 "Link to signed in in 3 steps or fewer, median under 30 s; no seed phrase; relayer-funded account" | ⚠️ Feasible with Google or passkey **if our origin is whitelisted**. Email+password signup is ≥4 steps. NEAR Auth does not fund or create accounts; we do (✅ possible: the derived key is public via a view call). |
| C5 "All actions gasless via the NEP-366 relayer" (with NEAR Auth) | ✅ technically. It's proven on testnet by a third party: a NEAR Auth-signed delegate with `ft_transfer_call` + 1 yocto (testnet USDC) was relayed and executed (2026-09-22, links in TL;DR). ❌ for UX: each NEAR Auth-signed action adds a popup, an Approve tap and ~10-20 s. Use device session keys (TL;DR). |
| C3 Spike 3: "a meta transaction carrying 1 yoctoNEAR from a funded user account" | ✅ observed on-chain for a NEAR Auth MPC key: delegate `ft_transfer_call` deposit=1, executed via a relayer (→ relayer: still run spike 3 for our own relayer and device keys) |
| C5 Flow 1 "Setting up your Pot account (relayer funds and registers USDC, 3-8 s)" | ✅ Server-side creation needs no user signature (verify the ID token, derive the key, `CreateAccount+Transfer+AddKey`). |
| C9 "NEAR Auth testnet down → NEAR Connect plus labeled demo login" | ✅ Keep it. The likelier failure is **"origin not whitelisted"** and not "down". |
| C2 "Passkeys come through NEAR Auth" | ⚠️ Passkeys are on Auth0 Universal Login (RP = `login.testnet.fast-auth.com`). Untested in an installed iOS PWA. |
| Part A pins `@fast-auth-near/browser-sdk`, `@fast-auth-near/javascript-provider` | ✅ browser-sdk **1.4.2** (2026-07-24), javascript-provider **1.4.1** (2026-06-09). React SDK 1.3.1: don't use (localhost relayer, beta contract). Prefer the thin wrapper (Snippets §1). |
| C5 "creation sponsored by `pot-factory`, limited to 3 Pots per verified email per day" | ⚠️ Email+password signups on the shared tenant show no evidence of required email verification. Read `email_verified` from the ID token (not tested). |
| [36] "Relayer & meta-transactions - NEAR Auth" (implies a NEAR Auth relayer) | ❌ The docs only describe the concept and point to NEAR's reference relayer. There is no hosted relayer for integrators. Run our own (the plan already does). |

## Reference
### Deployed contracts (✅ RPC `view_account` and view calls, 2026-10-21)
| Role | Testnet | Mainnet (📄) | Testnet state |
|---|---|---|---|
| NEAR Auth entry | `fast-auth.testnet` | `fast-auth.near` | `version`="1.0.0", `owner`=`fast-auth-admin.testnet`, `paused`=false, `mpc_address`=`v1.signer-prod.testnet`, `mpc_domain_id`=1, `mpc_key_version`=0, `get_guard("jwt")`=`jwt.fast-auth.testnet` |
| JWT guard router | `jwt.fast-auth.testnet` | `jwt.fast-auth.near` | guards: `"https://login.testnet.fast-auth.com/"`→`auth0.jwt.fast-auth.testnet`, `"https://fast-auth.testnet.swe.at"`→`sweat.jwt.fast-auth.testnet`, `"https://securetoken.google.com/near-mobile-99e38"`→`fa-firebase-guard-001.testnet` |
| Auth0 guard | `auth0.jwt.fast-auth.testnet` | `auth0.jwt.fast-auth.near` | 2 RSA-2048 keys (e=65537) == JWKS kids `LNPfzjbR4nX1k3LLOiCkm`, `UCoJR8zvMKACwbQxLOlro`; keys last set 2026-01-21 |
| MPC | `v1.signer-prod.testnet` | `v1.signer` | `version` 3.17.0, Running, domains 0 (CaitSith/secp256k1), **1 (Frost/Ed25519)**, 2 (CKD), 3 (ForeignTx), threshold 11 |
| React SDK's testnet entry (avoid) | `fast-auth-beta-001.testnet` (own router `jwt.fast-auth-beta-001.testnet`) | — | **Derives different keys** for the same login |

- ✅ The guard id in signature requests is **`jwt#https://login.testnet.fast-auth.com/`**: the router keys guards by issuer URL. The docs' `jwt#auth0` examples are wrong for the deployment.
- ✅ The guard ignores `predecessor`, so **anyone can submit `sign`**, including our relayer.

### Auth0 / testnet credential (✅ `/.well-known/*`, `/client/<id>.js`, `/authorize` probes; no credentials submitted)
| Item | Value |
|---|---|
| Domain / issuer | `login.testnet.fast-auth.com` / `https://login.testnet.fast-auth.com/` (custom domain of tenant `fast-auth-testnet`, `fast-auth-testnet.us.auth0.com`) |
| Shared clientId | `np8paqIpMWmNbzT4xAvOOapZBjsOpptl` (app name shown: **"Example"**), tenant plan **free** |
| signingAudience (Auth0 API = guard account) | `auth0.jwt.fast-auth.testnet` (mainnet `auth0.jwt.fast-auth.near`) |
| JWKS | `https://login.testnet.fast-auth.com/.well-known/jwks.json` (RS256) |
| Allowed callbacks | ✅ `http://localhost:3000` (and `/`, `/?any=query`), `https://example.fast-auth.com` (root). ❌ `localhost:5173/3001/8080/4200/5174/8000/3002`, `127.0.0.1:3000`, `https://localhost:3000`, `/callback` paths, `*.vercel.app`, `auth.near.org`, `docs.auth.near.org`, `fast-auth.com` |
| Connections | `Username-Password-Authentication` (signup ✅, password min 8, "good" policy), `google-oauth2` (**Auth0 dev keys**: banner "should not be used in production"). Login page: "Continue" (email), "**Continue with a passkey**", "Continue with Google". Signup: email or Google. |
| Mainnet defaults (📄) | domain `login.auth.near.org`, audience `https://api.auth.near.org`, signingAudience `auth0.jwt.fast-auth.near`; docs list a "shared" mainnet clientId `dsurLc47fOcWme5PkYeClBvuW0tYrmgW` but also say "there is no shared mainnet clientId" (⚠️ conflicting; whitelisting required) |

### Account model and key derivation
- ✅ `path = "jwt#https://login.testnet.fast-auth.com/#" + sub` (`provider.getPath()`). `sub` is the Auth0 subject, e.g. `google-oauth2|…`, `auth0|…`. It must not contain `#` and must be ≤256 chars (contract check).
- ✅ `pk = v1.signer-prod.testnet.derived_public_key({ path, predecessor: "fast-auth.testnet", domain_id: 1 })` returns the **string** `"ed25519:…"`. Example: sub `google-oauth2|123456789` gives `ed25519:4ePu6MJVtv74NDZvT7DeqUdL6j9saHHx5YTsTscbNTyJ` and implicit account `36277114ff69e350b58e85a3e04020e8e41700786ed5be1d61a4fc62ca144431`. The same path with predecessor `fast-auth-beta-001.testnet` gives `ed25519:7CUDgW32…`. `domain_id: 0` gives a secp256k1 key.
- ✅ NEAR Auth creates **no** account. The SDK's `createAccount()` only builds `testnet.create_account({new_account_id, new_public_key})` (top-level `.testnet` accounts). Our options:
  1. **Named sub-account (recommended):** the relayer, as parent `pot-<team>.testnet`, sends `CreateAccount + Transfer(0.05 NEAR) + AddKey(mpcPk, FullAccess) [+ AddKey(devicePk, FullAccess)]` to `u-<id>.pot-<team>.testnet`. One tx, no user signature.
  2. **Implicit account:** transfer to `hex(mpcPk)`; the account is created with the MPC key as its full-access key.
- ⚠️ **Key stability risk:** the Auth0 Action source says "the `sub` is still the raw Google identifier until **D13 (hashed sub)** lands". A hashed `sub` changes the path and the derived key, and the MPC key would stop matching accounts created earlier. Device keys would keep working, but recovery would break.

### Signing flow and exact payloads (✅ source; on-chain samples decoded)
1. App builds a `DelegateAction` with `{senderId, receiverId, actions, nonce: accessKey(mpcPk).nonce+1, maxBlockHeight: head+600, publicKey: mpcPk}`.
2. `provider.requestDelegateActionSignature({ delegateAction, redirectUri? })` calls `auth0.loginWithPopup` (or `loginWithRedirect` if `redirectUri` is set) with `authorizationParams = { audience: "auth0.jwt.fast-auth.testnet", scope: "transaction:sign", delegateAction: encodeDelegateAction(da).join(",") }`. Use the `transaction` key for full transactions. The popup uses `response_mode=web_message` and `redirect_uri = window.location.origin`.
3. The Auth0 post-login Action (`packages/auth0/src/actions/authorize-app.action.js`) denies if audience and payload don't pair up. It strips `profile`, `email` and `offline_access`, then renders the **DELEGATE_ACTION_FORM**: heading "{{app name}} wants to sign a DelegateAction", Sender ID, Receiver ID, Max Block Height, actions JSON, and **Approve / Deny** buttons. It sets `fatxn` = the byte array. If the user picks "denied", it calls `api.access.deny("User rejected the signing request")`.
4. The signing JWT (✅ decoded from on-chain `verify_payload`): header `{alg:"RS256", typ:"JWT"}`, claims `iss, sub, aud: ["auth0.jwt.fast-auth.testnet", "https://fast-auth-testnet.us.auth0.com/userinfo"], azp: <clientId>, scope: "openid transaction:sign", iat, exp, fatxn: number[]`, with **`exp − iat = 60`**. Size ≈ 820 B + 4.35 × payload bytes (1.6 KB for 179 B, 4.0 KB for 738 B). The guard rejects JWTs over 7168 B, so **keep sign_payload ≲ 1.4 KB**.
5. `provider.getSignatureRequest()` calls `getTokenSilently({audience})`, which hits the cache because spa-js caches under the requested scope `openid profile email transaction:sign` with expiry adjustment 0. It returns `{ user:{userId}, signatureRequest:{ guardId:"jwt#https://login.testnet.fast-auth.com/", verifyPayload:<JWT>, signPayload:number[] } }`.
6. The relayer calls `fast-auth.testnet.sign({ guard_id, verify_payload, sign_payload, algorithm:"eddsa" })` with **gas 300 Tgas and deposit ≥1 yocto** (forwarded to MPC and refunded). The receipt chain is fast-auth, router, guard (RSA ≈15-16 Tgas), callback, `v1.signer-prod.testnet.sign` (yield/resume), then `on_sign_callback`. The final `SuccessValue` is base64 JSON **`{"scheme":"Ed25519","signature":[64 bytes]}`**, or `null` if the guard or MPC failed (the deposit is refunded either way).
7. The relayer builds `actions.signedDelegate({ delegateAction: borsh.deserialize(SCHEMA.DelegateAction, payload.slice(4)), signature: Signature{ED25519, sig} })` and sends a tx **whose receiver is `delegate.senderId`**. The Peersyst reference relayer passes a client-supplied `receiver_id` here, so callers must send the *sender*.
- ✅ Encoding check (offline, `scratchpad/auth/skew`): an `ft_transfer_call` delegate built with **near-api-js 7.3.1** encodes to **byte-identical** output via the provider's near-api-js 5 encoder (249 B, NEP-461 prefix `6e010040` = 2³⁰+366). Passing v7 objects to the provider is therefore safe (TS needs `as any`). The decode→SignedDelegate round trip is byte-identical too.
- ❌ **NEP-413:** not in SDK 1.4.x or the tenant. PR #112 "Feat/nep413 sign message" adds `requestMessageSignature` plus a `NEP413_FORM`, and was still open on 2026-10-20. Authenticate users to our backend with the **Auth0 ID token** (JWKS) instead.

### SDK API (✅ published d.ts and README; source at GitHub `main`)
- `new JavascriptProvider({ network: "testnet"|"mainnet", clientId, domain?, signingAudience? })` creates `new Auth0Client({domain, clientId, authorizationParams:{}})` (memory cache, no refresh tokens, no `checkSession`).
  - `login(options?: Omit<PopupLoginOptions|RedirectLoginOptions,"authorizationParams"> & {redirectUri?}, forceSelectAccount?)` → `{userId}`. Passing `redirectUri` gives the redirect flow; `forceSelectAccount` sets `prompt=login`.
  - `logout(LogoutOptions?)`
  - `isLoggedIn()`: also completes a redirect callback (`?code&state`)
  - `getPath()`
  - `requestTransactionSignature({transaction, redirectUri?, ...})` / `requestDelegateActionSignature({delegateAction, redirectUri?, ...})` → `{userId}`
  - `getSignatureRequest()`
  - Errors: `JavascriptProviderError("USER_NOT_LOGGED_IN")` from `getPath`.
- `new FastAuthClient(provider, connection /* near-api-js 5 Connection */, { fastAuthContractId, mpcContractId })` has `login`, `logout` (bug: passes the args array as one argument) and `getSigner()`, which throws `FastAuthClientError("USER_NOT_LOGGED_IN")`.
- `FastAuthSigner` methods:
  - `getPublicKey(alg="ed25519")`: typed `PublicKey`, but **returns a string** at runtime.
  - `createAccount(id, {gas=300T, deposit=0, algorithm})`: builds an Action.
  - `requestTransactionSignature`, `requestDelegateActionSignature`, `getSignatureRequest`.
  - `createSignAction(req, {gas=300T, deposit=0n /* docs pass 1n */})`
  - `sendTransaction(tx, FastAuthSignature, alg)`
  - `FastAuthSignature.fromBase64(b64).recover("ed25519")` returns a 64-byte Buffer.
- React SDK 1.3.1 (`@fast-auth-near/react-sdk`): `<FastAuthProvider providerConfig={{provider}} connection network>` plus `useFastAuth`, `useIsLoggedIn`, `useSigner`, `usePublicKey`. **Relayer URL is hard-coded `https://localhost:3001/api/relayer/fast-auth`, the testnet contract is `fast-auth-beta-001.testnet`, and it depends on `near-api-js ^4`.** ❌ for Pot.

### Installed-PWA behaviour (popup vs redirect)
| Platform | Popup (`loginWithPopup`, `window.open` → postMessage) | Redirect (`loginWithRedirect`) |
|---|---|---|
| iOS Safari tab | 📄 opens a new tab and posts back; must run in the tap handler | 📄 works (same storage) |
| **iOS Home-Screen web app (iOS 26 default for every Home-Screen site)** | ⚠️ Apple WWDC23: "Links loaded through window.open will always open in the web app regardless of scope" and "If you want to ensure your OAuth flows do not open in the user's default browser, you can use window.open". web.dev: "When you call `open()` within a PWA window on iOS … it returns `null`". Sept 2026 field fix: `window.open('about:blank')` synchronously in the gesture, then navigate it. | ⚠️ Out-of-scope URLs open in **SFSafariViewController "isolated from your PWA storage"** (web.dev). OAuth may complete there without reaching the PWA (field report, 2026-09-25). Apple says third-party OAuth stays in the web app "through heuristics". |
| Android Chrome WebAPK | 📄 `window.open` opens an in-app Custom Tab (web.dev). Opener/postMessage untested. | 📄 out-of-scope pages open in a Custom Tab that **closes and hands the in-scope URL back to the PWA window** (web.dev) |
- ✅ auth0-spa-js 2.28.4 `loginWithPopup` calls `openPopup('')` **synchronously, before any await**. The NEAR Auth provider methods also reach it synchronously. So the popup opens inside the tap **as long as the DelegateAction is built before the tap** (nonce and block fetched in advance). The provider can't accept a pre-opened `popup` or a longer `timeoutInSeconds` (60 s default); our thin wrapper can.
- Plan for both: popup first. Detect standalone with `matchMedia('(display-mode: standalone)')` or `navigator.standalone`, and fall back to redirect plus persisted state if the popup fails (`PopupOpenError` or `PopupTimeoutError`). Final choice comes from spike §D/§E.

## Snippets
**§1 Thin NEAR Auth client (recommended; 📄 untested: needs a real login; protocol copied from provider 1.4.1 source)**
```ts
"use client"; // Next.js still evaluates client modules during SSR, so touch window only inside functions (below)
import { Auth0Client } from "@auth0/auth0-spa-js";                     // 2.28.x; lazy-load this module (~64 KB gz)
import { encodeDelegateAction, type DelegateAction } from "near-api-js"; // 7.3.1 (byte-identical to the SDK's encoder)
const DOMAIN = "login.testnet.fast-auth.com", SIGNING_AUD = "auth0.jwt.fast-auth.testnet";
export const GUARD_ID = `jwt#https://${DOMAIN}/`;
let client: Auth0Client | undefined;
const nearAuth = () => (client ??= new Auth0Client({ domain: DOMAIN, clientId: process.env.NEXT_PUBLIC_NEAR_AUTH_CLIENT_ID!,
  authorizeTimeoutInSeconds: 180,   // SDK default 60 s is too short for first-time signup
  cacheLocation: "localstorage",    // SDK uses memory → every reload = logged out
  authorizationParams: { redirect_uri: window.location.origin } }));
export async function login(popup?: Window) {                            // call synchronously from the tap handler
  await nearAuth().loginWithPopup({}, popup ? { popup } : undefined);
  const c = (await nearAuth().getIdTokenClaims())!;                     // c.__raw = ID token for our backend
  return { sub: c.sub!, path: `${GUARD_ID}#${c.sub}`, idToken: c.__raw, emailVerified: c.email_verified };
}
export async function approveDelegate(da: DelegateAction, popup?: Window) { // da prebuilt BEFORE the tap
  const bytes = Array.from(encodeDelegateAction(da));
  await nearAuth().loginWithPopup({ authorizationParams: { audience: SIGNING_AUD, scope: "transaction:sign", delegateAction: bytes.join(",") } },
    popup ? { popup } : undefined);
  const jwt = await nearAuth().getTokenSilently({ authorizationParams: { audience: SIGNING_AUD } }); // valid 60 s
  return { guardId: GUARD_ID, verifyPayload: jwt, signPayload: bytes };  // POST to /api/relay within ~50 s
}
// Errors: user closes popup → {error:"cancelled", message:"Popup closed"} (✅ observed); timeout → PopupTimeoutError; blocked → PopupOpenError.
```
**§2 Server: derive the user's key (✅ tested: `node relay.mjs derive`)**
```ts
const pk = await provider.callFunction({ contractId: "v1.signer-prod.testnet", method: "derived_public_key",
  args: { path: `jwt#https://login.testnet.fast-auth.com/#${sub}`, predecessor: "fast-auth.testnet", domain_id: 1 } }); // "ed25519:…"
```
Before trusting `sub`, verify the ID token's RS256 signature with JWKS (`jose.createRemoteJWKSet(new URL("https://login.testnet.fast-auth.com/.well-known/jwks.json"))`), `iss === "https://login.testnet.fast-auth.com/"`, `aud === clientId` and `exp` (📄 standard OIDC; not run).

**§3 Relay a NEAR Auth signature request (✅ syntax-checked; offline decode round trip ✅; not run on-chain)**: see `spikes/near-auth/relay.mjs` `relay()`, about 25 lines. It validates `guardId` and the NEP-366 prefix, calls `sign` (300 Tgas, 1 yocto, `waitUntil:"EXECUTED_OPTIMISTIC"`), parses `{"signature":[…]}`, builds `actions.signedDelegate`, and sends to `senderId`.

**§4 Device session key (📄 design; → relayer and web)**: generate Ed25519 in the browser (near-api-js `KeyPair.fromRandom("ed25519")` kept in IndexedDB, or WebCrypto Ed25519 non-extractable if supported, ⚠️ check browser support). Sign `sha256(encodeDelegateAction(da))` locally and send the same `SignedDelegate` to `/api/relay`. On a new device, NEAR Auth `approveDelegate(AddKey(newDevicePk, FullAccess))` once (≈15-25 s).

## Gotchas & failure modes
- 🚫 **Callback mismatch on anything except `http://localhost:3000`**. The dev server must run on **port 3000** (Vite's default is 5173 and gets rejected). The docs' `redirectUri: origin + "/callback"` fails on the shared client.
- **Every on-chain action is a fresh Auth0 round trip with a consent form.** On the shared client it reads "**Example** wants to sign a DelegateAction" with raw JSON. You can't change the branding without your own client: the app name, logo and description come from the client registration made at whitelisting.
- **The JWT lives 60 s.** If the `sign` tx isn't included by `exp` (block time), it fails with "Token expired" and the user must approve again. A failed `sign` still costs ≈0.0045 NEAR (sample: guard rejection, 89.9 Tgas). **Validate off-chain before spending:** RS256 against JWKS, `exp > now+15s`, `aud`, `iss`, `fatxn == signPayload`, `sub` belongs to the session, plus a receiver/method allowlist on the decoded delegate (→ relayer).
- The **nonce and `maxBlockHeight` are frozen inside the approved bytes**. A nonce race (two pending actions on the same key) or an expired `maxBlockHeight` means re-approval. Serialize NEAR Auth-signed actions per user.
- **Popup blockers:** build the delegate (RPC nonce and block) *before* the user taps. Any `await` before `requestDelegateActionSignature` can cost the user gesture, especially on iOS Safari.
- **Session restore:** the stock provider keeps tokens in memory, so after a reload `isLoggedIn()` is false. Silent `checkSession` can't fix it: Safari ITP blocks the third-party iframe, and Auth0 dev keys break `prompt=none` for Google. Keep Pot's own session (an httpOnly cookie after verifying the ID token) and treat NEAR Auth as a signer only.
- **Google uses Auth0 dev keys on a custom domain.** Auth0 documents that dev keys "cannot be used with custom domains", that SSO and `prompt=none` don't work, and that "Redirect Actions fail". On-chain evidence nonetheless shows Google-login signatures succeeding in Sept 2026 ✅, so expect quirks: repeated account picker, no SSO between popups.
- **Types:** both packages' `dist/index.d.ts` import `./provider`, which isn't shipped. With `skipLibCheck:false` you get TS2307. With `skipLibCheck:true` (the Next default) the return types silently become `any` (✅ probe).
- **Dependency bloat:** `npm i @fast-auth-near/browser-sdk@1.4.2 @fast-auth-near/javascript-provider@1.4.1` installs **325 packages (205 MB)**, including `react-native-auth0@5.11.2` → `react-native@0.88.0` (peer auto-install). The browser bundle doesn't import them. Expect pnpm peer warnings.
- **near-api-js 5 inside:** the provider imports `near-api-js/lib/transaction` from v5.1.1 (CJS, not tree-shaken), which costs +103 KB gz compared with the thin client. Vite warns `Module "util" has been externalized` (from near-api-js 7's `is-my-json-valid` → `generate-function`); the build still succeeds.
- **SSR:** `new JavascriptProvider()` constructs `Auth0Client`, which touches `window`, `location` and `crypto`. Create it only in a client component (e.g. in `useEffect` or with `dynamic(..., { ssr:false })`).
- **Bundler shims (✅ found in the spike):** in the browser the provider's near-api-js 5 tree (`@near-js/crypto` v1 → `randombytes/browser.js`) throws **`ReferenceError: global is not defined`** unless the bundler defines `global` → `globalThis`. The spike's Vite config also needed `resolve.alias: { buffer: "buffer/" }` plus a `globalThis.Buffer` shim. → web: check Next 16 / Turbopack. The thin client (Snippets §1) avoids this whole tree.
- **Docs vs code inconsistencies:**
  - Docs' `import { buildDelegateAction } from "near-api-js/lib/transaction"` doesn't exist in near-api-js 5.1.1 (✅ checked). It lives in `@near-js/transactions`.
  - Docs' guard id `jwt#auth0` differs from the deployed `jwt#https://<domain>/`.
  - The React SDK's testnet contract differs from the docs.
  - docs.near.org still has a stale "FastAuth is deprecated; a revamped version … is in the works" page.
- **Gas:** the `sign` tx shows ~112-119 Tgas `gas_burnt`, but ≈60-70 Tgas of that is system refund receipts (`predecessor=system`, 7.5 Tgas each, `tokens_burnt=0`). The real charge is ≈0.0045 NEAR, about 45 Tgas at 1e8 yocto/gas. Of that, **≈0.00075 NEAR is the 1-yocto deposit-refund transfer receipt** that `fast-auth.testnet` sends back.
- **Redirect variant:** `requestDelegateActionSignature({redirectUri})` navigates away and its promise never resolves. On return, `provider.isLoggedIn()` exchanges the code into the **in-memory** cache, so `getSignatureRequest()` must run in that same page load (persist the pending delegate in `sessionStorage` first). With the shared client, `redirectUri` must be exactly `http://localhost:3000` (root).
- **No SLA:** Peersyst can change the shared tenant at any time. Mainnet MPC health was 94% on one day in Oct (status page), and the landing page showed 24 h 99.2% on 2026-10-21.

## Costs, limits, latencies (measured vs documented)
| Metric | Value | Status |
|---|---|---|
| `fast-auth.testnet.sign` latency (tx inclusion → final callback) | **15 blocks, 7.4-9.2 s** (median ≈9.0 s, n=15 successful eddsa, 2026-09-23…26) | ✅ archival RPC |
| Testnet block time | 0.580 s avg over 1000 blocks (head 274,091,487) | ✅ |
| Cost per `sign` (paid by caller) | 0.0043-0.0046 NEAR (`tokens_burnt` sum); failed guard check ≈0.0045 NEAR | ✅ |
| Guard RSA verification | ≈15-16 Tgas receipt | ✅ |
| Signing JWT lifetime | 60 s (`exp−iat`) | ✅ |
| JWT size | 1.6-4.0 KB for 179-738 B payloads; hard cap 7168 B, so payload ≲1.4 KB | ✅ / 📄 cap |
| Popup timeout | 60 s (spa-js `DEFAULT_AUTHORIZE_TIMEOUT_IN_SECONDS`), not configurable through the provider | ✅ source |
| Third-party sign → relayed meta-tx (youtick, testnet) | `sign` tx at 15:25:01 → meta-tx with delegate `ft_transfer_call` included 15:25:16 UTC (**15 s**), success | ✅ nearblocks |
| End-to-end per NEAR Auth-signed action | popup + approve (user, ~3-10 s est.) + 9 s MPC + ~1-2 s meta-tx ≈ **15-25 s** | ⚠️ estimate; measure in spike |
| Login (Google, popup) | not measured (needs a human) | ⚠️ spike §B |
| Shared tenant rate limits (free plan) | Authentication API **300 burst / 300 per min tenant-wide**; `POST /oauth/token` 30/s; `/usernamepassword/login` 5/s; `/userinfo` 5/min per user | 📄 Auth0 docs |
| Testnet usage (who else shares it) | `fast-auth.testnet`: 165 txns lifetime; last `sign` 2026-09-26 | ✅ nearblocks |
| Mainnet health (context) | landing 2026-10-21: 24 h 3,958 ok / 33 failed (99.2%), 30,130 sign events/7 d, 7 relayers; status page snapshot 2026-10-10: 94% MPC, signed actions 100% `AddKey` | ✅ auth.near.org |
| Bundle (min / gzip) | provider 1.4.1 alone 540 / 167 KB; browser-sdk+provider 609 / 184 KB; auth0-spa-js 224 / 64 KB; near-api-js 7 subset 173 / 56 KB; thin client (auth0-spa-js + near-api-js 7 subset) 398 / 120 KB; spike page total 765 / 238 KB (incl. near-connect) | ✅ esbuild/vite |
| Popup reaches Universal Login from `http://localhost:3000` | ✅ headless Chromium 2026-10-21: popup → `/u/login/identifier` ("Log in \| Example"), redirect also works; closing the popup gives `{error:"cancelled"}` | ✅ spike smoke test |

## Open questions / needs a human
1. **(Human, now)** Ask the NEAR Auth / Peersyst team to **whitelist Pot's origins on the testnet client**, or issue a dedicated testnet `clientId`: callback and web origin `https://pot-<team>.vercel.app` plus preview URLs, app name "Pot", logo. Also submit the **mainnet form** (https://form.typeform.com/to/VWHjf3HV) with exact HTTPS callback, logout and web-origin URLs, a 256×256 logo, MAU bracket and contact email. Lead time is unknown. Ask about D13 (hashed `sub`) timing and testnet SLA during Nov 1-18.
2. **(Human, spike)** Run `spikes/near-auth/README.md`: Google, email and passkey login times, the approve-popup UX, a relayed delegate, and above all **installed-PWA behaviour on iPhone (iOS 26) and Android**. iOS standalone can only be tested via `https://example.fast-auth.com` added to the Home Screen, or after whitelisting.
3. **Decision (lead):** adopt the "MPC root key + device session key" model? It's recommended. If not, accept a popup + ~15-25 s per action.
4. → relayer: the relayer must accept three inputs that all end in one `SignedDelegate`: `{guardId, verifyPayload, signPayload}` (NEAR Auth: call `fast-auth.testnet.sign` first, 300 Tgas, 1 yocto), a device-key-signed delegate, and a wallet `signedDelegateActions` b64. Validate the JWT off-chain before paying ~0.0045 NEAR. Budget ≈0.005 NEAR per NEAR Auth action plus meta-tx gas. Also test whether <300 Tgas on `sign` works (cheaper) and whether 0 deposit is accepted by `v1.signer-prod.testnet` (it likely isn't: MPC requires ≥1 yocto).
5. → web: client-only Auth0 init; lazy-load the auth bundle (~64 KB gz thin, 167 KB gz SDK); browser support for WebCrypto Ed25519 non-extractable keys; standalone detection plus popup→redirect fallback; Pot's own session cookie.
6. → contracts: device keys must be **full-access** because NEP-141 `ft_transfer_call` needs 1 yocto, and FunctionCall keys can't attach deposits even inside delegates (→ relayer spike 3). If Rulebot/DAO methods are 0-deposit, a FunctionCall device key on a single router contract is a safer option to evaluate.
7. → product-ux: the copy for the one-time "Verify it's you" popup on a new device. The approval screen language (raw JSON, "Example") is not controllable on the shared client. Email+password users may have `email_verified=false`.

## Sources
- https://docs.auth.near.org/llms-full.txt (all 31 pages; sitemap lastmod 2026-07-07/08): architecture, contracts, SDK reference, testnet credentials, apply form fields: 2026-10-21
- https://docs.auth.near.org/resources/testnet, …/resources/networks, …/home/apply, …/protocol/concepts/auth0, …/protocol/concepts/relayer, …/protocol/concepts/jwt, …/protocol/concepts/mpc, …/sdks/javascript-provider, …/sdks/react-sdk: specific claims cited above: 2026-10-21
- https://github.com/Peersyst/fast-auth (raw `main`): `packages/providers/javascript/src/{provider,types,utils/index}.ts`, `packages/sdks/browser/src/signers/signer.ts`, `packages/sdks/react/src/providers/{fast-auth.provider.tsx,utils/contracts.ts}`, `packages/sdks/react/src/core/relayer/relayer.ts`, `packages/auth0/src/actions/authorize-app.action.js`, `packages/auth0/src/forms/delegate_action/delegate_action_form_base.json`, `contracts/fa/src/{lib,external_contracts}.rs`, `contracts/jwt-guards/auth0-guard/src/lib.rs`, `apps/relayer/src/modules/relayer/relayer.service.ts`, `examples/spa/*`: 2026-10-21 (last main commit 8f843834ed, 2026-09-25)
- https://github.com/Peersyst/fast-auth/pull/112: NEP-413 PR open: 2026-10-21
- npm `@fast-auth-near/{browser-sdk 1.4.2, javascript-provider 1.4.1, react-sdk 1.3.1, react-native-provider 1.6.1, firebase-provider 1.3.0}` (`npm view` + installed `dist/index.d.ts`): 2026-10-21
- Testnet RPC `https://rpc.testnet.fastnear.com` view calls (`version`, `owner`, `paused`, `mpc_*`, `get_guard`, `get_public_keys`, `derived_public_key`, `state`): 2026-10-21
- Archival RPC `https://archival-rpc.testnet.near.org` `EXPERIMENTAL_tx_status` for `sign` txs, e.g. https://testnet.nearblocks.io/txns/FzULQ33cjnR4HFc9iBGzR5V8oScLhJuUKAHqeixjFgLE and https://testnet.nearblocks.io/txns/Aw75JRVq8ENXb14aJ4ERoWuFKPgztAzV2w6zp99uLad1 (latency, gas, JWT claims): 2026-10-21
- https://api-testnet.nearblocks.io/v1/account/fast-auth.testnet/txns-only (activity list, count 165): 2026-10-21
- Third-party NEAR Auth delegate relayed on testnet: https://testnet.nearblocks.io/txns/BBgP2hWuT4iws8PuZ8i32YK8FSd2x62wK51ShGnLxu2f (`sign`, `auth0|` sub, payload = delegate `ft_transfer_call` deposit 1 on `3e2210e1…afcb8af` from implicit `9db6cbd9…`) → https://testnet.nearblocks.io/txns/8EEfWDjk3EJNNCWFgeoKCczq1m2vxvJ6SQ15tJz3yW87 (relayer `video-relayer-v1-260907.youtick-dev-v3.testnet`, DELEGATE_ACTION success): 2026-10-21
- https://login.testnet.fast-auth.com/.well-known/openid-configuration, …/.well-known/jwks.json, …/client/np8paqIpMWmNbzT4xAvOOapZBjsOpptl.js, `/authorize` probes (302 vs 403 "Callback URL mismatch"), `/u/login/identifier` and `/u/signup/identifier` page text: 2026-10-21
- https://auth0.com/docs/authenticate/identity-providers/social-identity-providers/devkeys: dev-key limitations: 2026-10-21
- https://auth0.com/docs/troubleshoot/customer-support/operational-policies/rate-limit-policy/rate-limit-configurations/free-public: free tenant limits: 2026-10-21
- `@auth0/auth0-spa-js@2.28.4` `src/Auth0Client.ts` (`loginWithPopup` opens the popup synchronously; `isAuthenticated` reads the cache only), `src/cache/cache-manager.ts` (scope subset match, expiry adjustment 0), `src/constants.ts` (60 s popup timeout): 2026-10-21
- https://developer.apple.com/videos/play/wwdc2023/10120/ (transcript: `window.open`, OAuth heuristics, cookie separation): 2026-10-21
- https://web.dev/learn/pwa/windows (iOS `open()` returns null; SFSafariViewController isolated storage; Android Custom Tab hand-back): 2026-10-21
- https://github.com/warren-wyn-dev/wynteam/pull/663 (2026-09-25 field report on iOS PWA Google OAuth and SFSafariViewController): 2026-10-21
- https://auth.near.org/ and https://auth.near.org/status (mainnet metrics, AddKey 100%): 2026-10-21
- https://docs.near.org/chain-abstraction/fastauth-sdk (stale deprecation page): 2026-10-21
- Offline tests in scratchpad `auth/skew/{skew,roundtrip}.mjs` (near-api-js 7.3.1 vs 5.1.1 encoding equality; SignedDelegate round trip): 2026-10-21

## Review corrections (2026-10-21)

From the security review's fact check ([../plan/review-security.md](../plan/review-security.md) §4, F-06, F-15). The body above is unchanged.
- **The `sign` deposit is 1 yocto, proven on chain** (testnet tx `FzULQ33cjnR4HFc9iBGzR5V8oScLhJuUKAHqeixjFgLE`, 2026-09-26, "MPC signing successful"; `fast-auth` refunds the deposit on guard failure, MPC failure and success). No 2 NEAR reserve is needed.
- **Privacy:** a `sign` call's logs and args publish `path: "jwt#https://login.testnet.fast-auth.com/#google-oauth2|<Google sub>"` on chain, and the signed payload names the account, so the Google subject id becomes public and linked to that account (here: the new-device `AddKey` flow).
- **A device-bound OIDC `nonce` isn't possible with auth0-spa-js 2.28.4:** it generates its own nonce (`Auth0Client.ts:566`) and `getAuthorizeParams` spreads it after the caller's parameters (`Auth0Client.utils.ts:88-102`), so a caller's `nonce` is overwritten. To bind the ID token to a device key, call `/authorize` directly (Authorization Code + PKCE with your own `nonce`) and exchange the code at `/oauth/token`; the snippet in §1 can keep auth0-spa-js for signing approvals, whose `fatxn` claim already binds the bytes.
