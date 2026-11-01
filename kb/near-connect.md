# NEAR Connect (`@hot-labs/near-connect` + `near-connect-hooks`): the "I have a NEAR wallet" fallback
> Owner: auth. Last verified: 2026-10-21. Legend: ✅ verified · 📄 docs-only · ⚠️ unverified/conflicting

## TL;DR
- ✅ Latest is **`@hot-labs/near-connect@0.11.4`** (published 2026-05-11, zero runtime deps). The plan's "0.8.2" is stale (0.8.2 shipped 2026-01-05). **`near-connect-hooks@1.1.6`** (2026-03-12) depends on `@hot-labs/near-connect ^0.11.1`, `near-api-js ^7` and `function-call-key-plugin`. Pin both on Nov 1. [npm]
- ✅ NEAR Docs (wallet-login tutorial) still recommends `@hot-labs/near-connect` + `near-connect-hooks`. A FastNEAR fork, **`@fastnear/near-connect@0.14.1`** (2026-09-24), adds `connector.addFunctionCallKey()` and gas-key actions. We don't need it for Pot.
- ✅ The wallet list comes from a **remote manifest** that is fetched at runtime (`raw.githubusercontent.com/hot-dao/near-selector/.../manifest.json`, fallback jsDelivr). Wallet code runs in sandboxed iframes. On `network: "testnet"` the connector **hides every wallet whose manifest lacks `features.testnet: true`**.
- ✅ Testnet-capable wallets in today's manifest: **Meteor, Intear, Ledger, Nightly, WalletConnect, Unity, Ethereum wallets, NEAR CLI**. HOT, MyNearWallet, NEAR Mobile, OKX, Hana and Trezu are **not** shown on testnet.
- ✅ The API has **`wallet.signDelegateActions()`**, which returns base64 Borsh `SignedDelegate` strings. Only wallets that declare `signDelegateActions: true` support it. On testnet those are **Meteor, Intear, Ledger and NEAR CLI**, which makes them our gasless path. Confirmed in headless Chromium: `new NearConnector({ network:"testnet", features:{ signDelegateActions:true } }).connect()` renders the "Select wallet" bottom sheet with exactly those 4 (`spikes/near-auth`, 2026-10-21).
- ✅ **NEP-413:** `wallet.signMessage({message, recipient, nonce})` and `connector.connect({ signMessageParams })` (sign-in plus a signed message in one prompt). Use the second for backend session auth of wallet users.
- **Recommendation:** "I have a NEAR wallet" opens near-connect with `network:"testnet"`. If `wallet.manifest.features.signDelegateActions` is true, the wallet signs a delegate and the result goes to the same `/api/relay` as everyone else, so the action is gasless. Otherwise use `signAndSendTransaction` and the user pays their own testnet gas, which is fine.
- ✅ SSR: the `NearConnector` constructor is SSR-safe (it guards `typeof window`; tested constructing it in Node 22). `near-connect-hooks` ships **no `"use client"`**, so import `NearProvider` only from a client component.

## Plan check
| Plan claim | Status |
|---|---|
| "`@hot-labs/near-connect` (0.8.2 per a secondary index) is the connector NEAR Docs recommend" | ❌ version corrected: **0.11.4** is latest (67 versions; 0.8.2 = 2026-01-05). ✅ it is still the NEAR Docs recommendation. |
| "Pin … @hot-labs/near-connect (0.8.2 seen), near-connect-hooks" (Part A) | ❌ pin `@hot-labs/near-connect@0.11.4` + `near-connect-hooks@1.1.6` (hooks need `near-api-js ^7`, so near-api-js 7.3.1 fits) |
| C5: "I have a NEAR wallet" (NEAR Connect) in small text; "All actions gasless via the NEP-366 relayer" | ⚠️ gasless only for wallets with `signDelegateActions` (testnet: Meteor, Intear, Ledger, NEAR CLI). Others pay their own gas. |
| C9: "NEAR Auth testnet down → NEAR Connect plus labeled demo login" | ✅ viable. Meteor/Intear/Ledger/NEAR CLI are offered on testnet (manifest + rendered selector ✅). Actual wallet sign-in and `signDelegateActions` were not click-tested (needs a human wallet: near-auth spike checklist §F). |

## Reference
### Packages (✅ npm, 2026-10-21)
| Package | Version | Notes |
|---|---|---|
| `@hot-labs/near-connect` | 0.11.4 | no deps; repo `hot-dao/near-selector`; ships TanStack "skills" (`skills/near-connect-*`) |
| `near-connect-hooks` | 1.1.6 | deps `near-api-js ^7`, `@hot-labs/near-connect ^0.11.1`, `function-call-key-plugin ^1.0.3`; peers react/react-dom ≥18 |
| `function-call-key-plugin` | 2.1.0 (hooks pull 1.0.4) | local FC-key signing for 0-deposit calls to one contract |
| `@fastnear/near-connect` | 0.14.1 | FastNEAR fork (`addFunctionCallKey`, gas keys). Not needed. |

Install footprint (✅ measured): `npm i @hot-labs/near-connect@0.11.4 near-connect-hooks@1.1.6 near-api-js@7.3.1 react@19 react-dom@19` adds 74 packages and 22 MB of node_modules.

### `new NearConnector(options)` (✅ `build/NearConnector.d.ts`)
```ts
interface NearConnectorOptions {
  network?: "mainnet" | "testnet";
  features?: Partial<WalletFeatures>;          // filter wallets, e.g. { signDelegateActions: true }
  providers?: { mainnet?: string[]; testnet?: string[] };   // RPC URLs
  manifest?: string | { wallets: WalletManifest[]; version: string }; // default: remote GitHub manifest
  excludedWallets?: string[]; autoConnect?: boolean;
  walletConnect?: Promise<AbstractWalletConnect> | AbstractWalletConnect; // required for WalletConnect-only wallets
  footerBranding?: FooterBranding | null;      // null hides the "NEAR Connect" footer
  cspNonce?: string;                           // needed with nonce-based CSP (iframe srcdoc inherits CSP)
  signIn?: { contractId?: string; methodNames?: string[] }; // @deprecated (FC key at sign-in)
}
class NearConnector {
  whenManifestLoaded: Promise<void>; availableWallets: NearWalletBase[]; network; features;
  connect(input?: { walletId?: string; signMessageParams?: {message; recipient; nonce: Uint8Array}; addFunctionCallKey?: AddFunctionCallKeyParams }): Promise<NearWalletBase>;
  disconnect(wallet?): Promise<void>;
  getConnectedWallet(): Promise<{ wallet: NearWalletBase; accounts: Account[] }>;   // restore session on load
  wallet(id?: string | null): Promise<NearWalletBase>;
  selectWallet({ features? }): Promise<string>;
  switchNetwork(network, connectOptions?): Promise<void>;
  use(plugin: WalletPlugin): Promise<void>;
  on/once/off(event, cb); removeAllListeners(event?);
}
```
Events (`EventMap`): `"wallet:signIn" {wallet, accounts, success, source: "signIn"|"signInAndSignMessage"}`, `"wallet:signInAndSignMessage" {wallet, accounts: AccountWithSignedMessage[], success}`, `"wallet:signOut"`, `"selector:manifestUpdated"`, `"selector:walletsChanged"`.

### Wallet (`NearWalletBase`) (✅ `build/types/index.d.ts`)
```ts
signIn(data?: { network?; addFunctionCallKey? }): Promise<Account[]>;            // Account = { accountId; publicKey? }
signInAndSignMessage(data: { network?; addFunctionCallKey?; messageParams }): Promise<AccountWithSignedMessage[]>;
signOut(data?: { network? }): Promise<void>;
getAccounts(data?: { network? }): Promise<Account[]>;
signAndSendTransaction({ network?, signerId?, receiverId, actions: Array<Action | ConnectorAction> }): Promise<FinalExecutionOutcome>;
signAndSendTransactions({ network?, signerId?, transactions: [{ receiverId, actions }] }): Promise<FinalExecutionOutcome[]>;
signMessage({ message, recipient, nonce: Uint8Array, network?, signerId? }): Promise<{ accountId; publicKey; signature }>; // NEP-413
signDelegateActions({ network?, signerId?, delegateActions: [{ receiverId, actions }] }): Promise<{ signedDelegateActions: string[] }>;
```
- `WalletFeatures` keys: `signMessage, signTransaction, signAndSendTransaction, signAndSendTransactions, signInWithoutAddKey, signInAndSignMessage, signInWithFunctionCallKey, signDelegateActions, mainnet, testnet`.
- Action format: either connector actions `{ type: "FunctionCall", params: { methodName, args, gas: "30000000000000", deposit: "1" } }` (recommended, portable) or near-api-js `actions.*` objects (converted by `nearActionsToConnectorActions`).
- ✅ `signedDelegateActions[i]` = `base64(borsh(SignedDelegate))`. Meteor's executor does `base64.encode(serialize(SCHEMA.SignedDelegate, sd))`. The wallet chooses the delegate's `nonce`, `maxBlockHeight` and `publicKey`, so **the relayer must decode and validate it** (sender = signed-in account, receiver/method allowlist).

### Testnet wallet matrix (✅ live manifest v1.1.0, 14 wallets, fetched 2026-10-21)
| id | testnet | signDelegateActions | signInAndSignMessage | platforms |
|---|---|---|---|---|
| meteor-wallet | ✅ | ✅ | ✅ | web, chrome, android, ios |
| intear-wallet | ✅ | ✅ | ✅ | web |
| ledger | ✅ | ✅ | ✅ | (USB/HID) |
| near-cli | ✅ | ✅ | ✅ | desktop CLI |
| nightly-wallet | ✅ | — | ✅ | chrome |
| wallet-connect / unity-wallet | ✅ | — | ✅ | via WalletConnect (needs `walletConnect` client) |
| ethereum-wallets | ✅ | — | — | web (EVM wallets via evm-on-near) |
| hot-wallet, near-mobile | ✗ (hidden) | ✅ | ✅ | mobile/ext/telegram |
| mynearwallet, okx-wallet, hana-wallet, trezu-wallet | ✗ (hidden) | — | varies | web |

### React / Next.js (`near-connect-hooks@1.1.6`) (✅ `dist/*.d.ts`, `dist/useNearWallet.js`)
- `<NearProvider config?={NearConnectorOptions}>`: **the default network is `"testnet"`**. Default RPCs are `https://free.rpc.fastnear.com` (mainnet) and `https://test.rpc.fastnear.com` (testnet). It always registers `createAccessKeyPlugin(...)`.
- `useNearWallet()` returns `{ network, signedAccountId, loading, signIn(params?: {addFunctionCallKey}), signOut, getBalance, getAccessKeyList, viewFunction({contractId, method, args}), callFunction({contractId, method, args, gas?, deposit?}), callFunctionRaw, transfer({receiverId, amount}), addFunctionCallKey, deleteKey, signNEP413Message({message, recipient, nonce}), signAndSendTransaction({receiverId, actions}), signAndSendTransactions, provider, connector }`.
- **There is no delegate hook.** Use `const w = await connector.wallet(); await w.signDelegateActions(...)`.

## Snippets
**Wallet fallback with a gasless-if-possible action** (📄 assembled from the typed API above; not executed against a real wallet):
```tsx
"use client";
import { NearProvider, useNearWallet } from "near-connect-hooks";
// <NearProvider config={{ network: "testnet", footerBranding: null }}> … </NearProvider>

export async function addMoneyWithWallet(connector, args: { usdc: string; rulebot: string; amount: string; pot: string }) {
  const wallet = await connector.wallet();
  const actions = [{ type: "FunctionCall", params: { methodName: "ft_transfer_call",
    args: { receiver_id: args.rulebot, amount: args.amount, msg: JSON.stringify({ pot: args.pot }) },
    gas: "50000000000000", deposit: "1" } }];
  if (wallet.manifest.features?.signDelegateActions) {               // Meteor / Intear / Ledger / NEAR CLI on testnet
    const { signedDelegateActions } = await wallet.signDelegateActions({ delegateActions: [{ receiverId: args.usdc, actions }] });
    return fetch("/api/relay", { method: "POST", body: JSON.stringify({ kind: "signedDelegate", b64: signedDelegateActions[0] }) });
  }
  return wallet.signAndSendTransaction({ receiverId: args.usdc, actions });  // user pays gas
}
```
**Backend session for wallet users (NEP-413):** use `connector.connect({ signMessageParams: { message: "Sign in to Pot", recipient: "pot-<team>.testnet", nonce } })`, then verify the signature server-side. Check that `publicKey` is a full-access key of `accountId` via `view_access_key`. Verification code → relayer/web.

## Gotchas & failure modes
- The **remote manifest is fetched at runtime**. If GitHub raw is blocked or down, the connector falls back to jsDelivr, and if that also fails it ends up with **0 wallets**. For the demo, consider passing a vetted `manifest` object, or at least testing offline behaviour. Manifest changes reach every dApp with no deploy on our side, so a wallet can appear or disappear.
- On `network:"testnet"`, HOT Wallet and MyNearWallet **do not appear**. Copy should not promise them.
- A `signDelegateActions` result can carry **any receiver or method the wallet signed**. The relayer must allowlist (`pot-factory`, `rulebot.*`, `usdc`) and check `delegate.senderId === session.accountId`.
- A wallet's own key might be a function-call key (for example after `signIn` with FC key). FC keys **cannot sign 1-yocto deposits** such as `ft_transfer_call`, even inside a delegate → relayer.
- **CSP:** with nonce-based CSP you must pass `cspNonce`, or the sandbox iframe scripts won't execute.
- `near-connect-hooks` creates the connector in `useMemo` during render. That's fine on the server (constructor is guarded), but the manifest fetch starts at construction. Mount `NearProvider` only on the login/settings routes, or lazy-load it.
- Two forks exist (`@hot-labs/*` vs `@fastnear/*`). Don't mix them, because the hooks import `@hot-labs`.

## Costs, limits, latencies
- Bundle: adding `@hot-labs/near-connect@0.11.4` to the spike page grew the Vite bundle from 708→765 KB min and 224→238 KB gz (≈ +57 KB min / +14 KB gz) (✅ measured). The package is 213 KB unpacked with no deps. Wallet executors load on demand inside sandboxed iframes.
- Selector UX (✅ screenshot at 420×900): bottom sheet "Select wallet" with icon, name and domain per wallet, footer "NEAR Connector" plus "Don't have a wallet?". Hide the footer with `footerBranding: null`.
- Gas: in the delegate path the relayer pays (cost per meta-tx → relayer, meta-tx-relayer.md). In the `signAndSendTransaction` path the user pays testnet gas.

## Open questions / needs a human
- Click-test Meteor (web) and Intear on testnet: connect, `signDelegateActions` → our relay. This is checklist §F in `spikes/near-auth/README.md` and needs a human with a wallet.
- → relayer: accept `{kind:"signedDelegate", b64}` (wallet path) as well as `{signatureRequest}` (NEAR Auth path) and device-key-signed delegates. All three end as the same `SignedDelegate` action. Also sponsor USDC `storage_deposit` for wallet users who join a Pot.
- → web: client-only `NearProvider` mount (no `"use client"` in hooks); decide whether to ship a pinned `manifest` object.

## Sources
- https://www.npmjs.com/package/@hot-labs/near-connect (`npm view`): version 0.11.4, publish times: 2026-10-21
- https://www.npmjs.com/package/near-connect-hooks (`npm view`): 1.1.6, deps: 2026-10-21
- https://www.npmjs.com/package/@fastnear/near-connect (`npm view`): 0.14.1, fork: 2026-10-21
- https://raw.githubusercontent.com/hot-dao/near-selector/main/README.md: API, manifest, sandbox, CSP: 2026-10-21
- https://raw.githubusercontent.com/hot-dao/near-selector/refs/heads/main/repository/manifest.json: live wallet features table: 2026-10-21
- https://raw.githubusercontent.com/fastnear/near-connect/main/README.md: fork features: 2026-10-21
- https://raw.githubusercontent.com/matiasbenary/near-connect-hooks/main/README.md: hooks API: 2026-10-21
- https://raw.githubusercontent.com/matiasbenary/near-access-key-plugin/main/README.md: FC-key plugin rules: 2026-10-21
- Installed `@hot-labs/near-connect@0.11.4` `build/NearConnector.{js,d.ts}`, `build/types/index.d.ts`, `build/SandboxedWallet/index.js` (`signDelegateActions` → `executor.call("wallet:signDelegateActions")`), `skills/near-connect-transactions/SKILL.md`: 2026-10-21
- https://raw.githubusercontent.com/Meteor-Wallet/meteor_wallet_sdk/data-storage/storage/meteor-near-connect-latest.js: `signedDelegateActions` = base64 Borsh SignedDelegate: 2026-10-21
- https://wallet.intear.tech/near-selector.js: Intear `signDelegateActions` implementation: 2026-10-21
- https://docs.near.org/web3-apps/tutorials/wallet-login: NEAR Docs recommendation + snippets: 2026-10-21
