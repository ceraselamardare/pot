// THROWAWAY Phase 0 spike: NEAR Auth (FastAuth) testnet login + delegate-action signing.
// Never import or copy into the product. Serve ONLY on http://localhost:3000 (shared client's allowed callback).
import { Buffer } from "buffer";
(globalThis as any).Buffer ??= Buffer; // near-api-js 5 (inside the provider) may expect a global Buffer
import { JavascriptProvider } from "@fast-auth-near/javascript-provider";
import { actions, buildDelegateAction, JsonRpcProvider, keyToImplicitAddress, PublicKey, type DelegateAction } from "near-api-js";
import { NearConnector } from "@hot-labs/near-connect";

const CFG = {
  clientId: "np8paqIpMWmNbzT4xAvOOapZBjsOpptl", // public shared testnet demo client (docs.auth.near.org/resources/testnet)
  domain: "login.testnet.fast-auth.com",
  fastAuth: "fast-auth.testnet", // NOT fast-auth-beta-001.testnet (React SDK default) -> different derived keys
  mpc: "v1.signer-prod.testnet",
  rpc: "https://rpc.testnet.fastnear.com",
  relay: "http://localhost:3001",
  ttlBlocks: 600, // maxBlockHeight = head + 600 (~6-10 min) to survive popup + MPC + relay
};
const provider = new JavascriptProvider({ network: "testnet", clientId: CFG.clientId });
const rpc = new JsonRpcProvider({ url: CFG.rpc });
const $ = <T extends HTMLElement = HTMLButtonElement>(id: string) => document.getElementById(id) as T;
const T: Record<string, number> = {}; // timings (ms)
let state: { path?: string; pk?: string; da?: DelegateAction; sigReq?: any; walletSd?: string } = {};
// testnet + signDelegateActions filter => Meteor / Intear / Ledger / NEAR CLI (live manifest, 2026-10-21)
const connector = new NearConnector({ network: "testnet", features: { signDelegateActions: true } });

function log(msg: string, obj?: unknown) {
  const line = `[${new Date().toISOString().slice(11, 23)}] ${msg}` + (obj === undefined ? "" : "\n" + JSON.stringify(obj, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  $("out").textContent = line + "\n\n" + $("out").textContent;
  console.log(msg, obj ?? "");
}
const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
$("mode").textContent = standalone ? "installed PWA (standalone)" : "browser tab";
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {}); // installability only
const sinceClick = (k: string) => (T[k] = Math.round(performance.now() - (T._click ?? 0)));
const click = () => (T._click = performance.now());

async function afterLogin(how: string) {
  const user = await (provider as any).getUserId?.().catch(() => null);
  state.path = await provider.getPath(); // jwt#https://login.testnet.fast-auth.com/#<sub>
  // Same as FastAuthSigner.getPublicKey(): view call on the MPC contract (returns a STRING "ed25519:...")
  state.pk = (await rpc.callFunction({ contractId: CFG.mpc, method: "derived_public_key",
    args: { path: state.path, predecessor: CFG.fastAuth, domain_id: 1 } })) as string;
  const implicit = keyToImplicitAddress(state.pk);
  if (!$<HTMLInputElement>("sender").value) $<HTMLInputElement>("sender").value = implicit;
  let exists = false;
  try { await rpc.viewAccount({ accountId: implicit }); exists = true; } catch { /* not created yet */ }
  log(`logged in via ${how}`, { user, path: state.path, derivedPublicKey: state.pk, implicitAccount: implicit, implicitExists: exists, timingsMs: T });
}

$("loginPopup").onclick = async () => {
  click();
  try { await provider.login(); sinceClick("loginPopupMs"); await afterLogin("popup"); }
  catch (e: any) { log("popup login failed: " + (e?.error ?? "") + " " + (e?.message ?? e)); }
};
$("loginRedirect").onclick = async () => {
  sessionStorage.setItem("t_redirect", String(Date.now()));
  await provider.login({ redirectUri: location.origin }); // navigates away
};
$("logout").onclick = async () => { await provider.logout({ logoutParams: { returnTo: location.origin } } as any); };

$("prepare").onclick = async () => {
  if (!state.pk) return log("log in first");
  const senderId = $<HTMLInputElement>("sender").value.trim();
  const receiverId = $<HTMLInputElement>("receiver").value.trim() || senderId;
  try {
    const ak = await rpc.viewAccessKey({ accountId: senderId, publicKey: state.pk, finality: "final" } as any);
    state.da = buildDelegateAction({
      senderId, receiverId, actions: [actions.transfer(1n)], // 1 yocto: needs a FULL-ACCESS key (the MPC key is one)
      nonce: BigInt(ak.nonce) + 1n, maxBlockHeight: BigInt((ak as any).block_height) + BigInt(CFG.ttlBlocks),
      publicKey: PublicKey.from(state.pk),
    });
    log("delegate prepared (now tap Approve; built BEFORE the tap so the popup opens inside the user gesture)", state.da);
  } catch (e: any) {
    log(`no access key ${state.pk} on ${senderId} yet: run \`node relay.mjs create\` or fund the implicit account first`, String(e?.message ?? e));
  }
};

$("sign").onclick = async () => {
  if (!state.da) return log("prepare first");
  click();
  try {
    // v7 DelegateAction passed to the provider's near-api-js 5 encoder: byte-identical (tested offline), so the cast is safe.
    await provider.requestDelegateActionSignature({ delegateAction: state.da as any });
    sinceClick("approvePopupMs");
    const { signatureRequest } = await provider.getSignatureRequest();
    state.sigReq = { ...signatureRequest, signPayload: Array.from(signatureRequest.signPayload as any) };
    const claims = JSON.parse(atob(signatureRequest.verifyPayload.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    log("approved; signature request ready", { guardId: signatureRequest.guardId, jwtBytes: signatureRequest.verifyPayload.length,
      jwtLifetimeSec: claims.exp - claims.iat, aud: claims.aud, sub: claims.sub, scope: claims.scope, fatxnBytes: claims.fatxn?.length,
      signPayloadBytes: state.sigReq.signPayload.length, timingsMs: T });
    (window as any).sigReq = state.sigReq; // copy(JSON.stringify(sigReq)) in devtools for the CLI path
  } catch (e: any) { log("approval failed: " + (e?.error ?? "") + " " + (e?.message ?? e)); }
};

$("relay").onclick = async () => {
  if (!state.sigReq) return log("approve first");
  click();
  try {
    const r = await fetch(CFG.relay + "/relay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(state.sigReq) });
    const body = await r.json();
    sinceClick("relayRoundTripMs");
    log(r.ok ? "relayed" : "relay error", { ...body, timingsMs: T });
  } catch (e: any) { log("relay unreachable (is `node relay.mjs serve` running?) " + (e?.message ?? e)); }
};

$("wcConnect").onclick = async () => {
  click();
  try { const w = await connector.connect(); sinceClick("walletConnectMs"); log(`wallet connected: ${w.manifest.id}`, { accounts: await w.getAccounts(), timingsMs: T }); }
  catch (e: any) { log("wallet connect failed: " + (e?.message ?? e)); }
};
$("wcSign").onclick = async () => {
  click();
  try {
    const w = await connector.wallet();
    const [{ accountId }] = await w.getAccounts();
    const receiverId = $<HTMLInputElement>("receiver").value.trim() || accountId;
    const { signedDelegateActions } = await w.signDelegateActions({ delegateActions: [{ receiverId, actions: [{ type: "Transfer", params: { deposit: "1" } }] as any }] });
    state.walletSd = signedDelegateActions[0]; sinceClick("walletSignMs");
    log("wallet signed delegate (base64 borsh SignedDelegate)", { accountId, receiverId, b64Chars: state.walletSd.length, timingsMs: T });
  } catch (e: any) { log("wallet signDelegateActions failed: " + (e?.message ?? e)); }
};
$("wcRelay").onclick = async () => {
  if (!state.walletSd) return log("wallet-sign first");
  click();
  const r = await fetch(CFG.relay + "/relay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signedDelegateB64: state.walletSd }) });
  const body = await r.json(); sinceClick("walletRelayMs"); log(r.ok ? "wallet delegate relayed" : "relay error", { ...body, timingsMs: T });
};

// Redirect return: isLoggedIn() also completes the Auth0 code exchange (?code=&state=)
(async () => {
  const t = sessionStorage.getItem("t_redirect");
  if (await provider.isLoggedIn()) {
    if (t) { T.loginRedirectMs = Date.now() - Number(t); sessionStorage.removeItem("t_redirect"); history.replaceState(null, "", "/"); }
    await afterLogin(t ? "redirect" : "existing session");
  } else log("not logged in (note: the SDK keeps tokens in memory, so a reload = logged out)");
})();
