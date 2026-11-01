// THROWAWAY Phase 0 spike relayer for NEAR Auth (testnet only). Never copy into the product.
// Usage (from spikes/near-auth):
//   node relay.mjs derive --sub "google-oauth2|123"          read-only: path, MPC-derived ed25519 key, implicit account
//   node relay.mjs create --pk ed25519:... [--name u-ab12]  relayer creates <name>.<relayer> with that key as FULL ACCESS + 0.02 NEAR
//   node relay.mjs serve                                     HTTP on localhost:3001, POST /relay {guardId,verifyPayload,signPayload} | {signedDelegateB64}
//   node relay.mjs relay --file sigreq.json                  same as POST /relay, from a file
// Relayer key: .keys/relayer.json {"account_id","private_key"} or ~/.near-credentials/testnet/$RELAYER_ACCOUNT_ID.json
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { Account, actions, JsonRpcProvider, KeyPair, KeyPairSigner, keyToImplicitAddress, KeyType, PublicKey, SCHEMA, Signature } from "near-api-js";
import { deserialize } from "borsh";

const CFG = { rpc: process.env.RPC ?? "https://rpc.testnet.fastnear.com", fastAuth: "fast-auth.testnet", mpc: "v1.signer-prod.testnet",
  guardId: "jwt#https://login.testnet.fast-auth.com/", signGas: 300_000_000_000_000n, signDeposit: 1n, port: 3001, origin: "http://localhost:3000" };
const NEP366_PREFIX = 2 ** 30 + 366;
const provider = new JsonRpcProvider({ url: CFG.rpc });
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const now = () => performance.now();
const link = (h) => `https://testnet.nearblocks.io/txns/${h}`;

function relayer() {
  let creds;
  try { creds = JSON.parse(readFileSync(new URL("./.keys/relayer.json", import.meta.url))); }
  catch {
    if (!process.env.RELAYER_ACCOUNT_ID) throw new Error("no relayer key: create .keys/relayer.json {account_id, private_key} or export RELAYER_ACCOUNT_ID (legacy keychain file)");
    creds = JSON.parse(readFileSync(`${homedir()}/.near-credentials/testnet/${process.env.RELAYER_ACCOUNT_ID}.json`));
  }
  return new Account(creds.account_id, provider, new KeyPairSigner(KeyPair.fromString(creds.private_key)));
}
async function derive(sub) {
  const path = `${CFG.guardId}#${sub}`; // = provider.getPath()
  const pk = await provider.callFunction({ contractId: CFG.mpc, method: "derived_public_key", args: { path, predecessor: CFG.fastAuth, domain_id: 1 } });
  return { path, publicKey: pk, implicitAccount: keyToImplicitAddress(pk) };
}

async function relayWalletDelegate(b64) { // near-connect wallet.signDelegateActions() output: base64 borsh SignedDelegate
  const t0 = now();
  const sd = deserialize(SCHEMA.SignedDelegate, Buffer.from(b64, "base64"));
  const sig = sd.signature.ed25519Signature?.data; if (!sig) throw new Error("only ed25519 wallet keys handled in this spike");
  const tx = await relayer().signAndSendTransaction({ receiverId: sd.delegateAction.senderId, waitUntil: "EXECUTED_OPTIMISTIC", throwOnFailure: false,
    actions: [actions.signedDelegate({ delegateAction: sd.delegateAction, signature: new Signature({ keyType: KeyType.ED25519, data: Uint8Array.from(sig) }) })] });
  return { ok: !("Failure" in (tx.status ?? {})), senderId: sd.delegateAction.senderId, metaTx: link(tx.transaction.hash), metaStatus: tx.status, ms: { metaTx: Math.round(now() - t0) } };
}

async function relay(req) {
  if (req.signedDelegateB64) return relayWalletDelegate(req.signedDelegateB64);
  const t = { start: now() };
  if (req.guardId !== CFG.guardId) throw new Error(`guard not allowed: ${req.guardId}`);
  const bytes = Uint8Array.from(req.signPayload);
  if (Buffer.from(bytes.slice(0, 4)).readUInt32LE(0) !== NEP366_PREFIX) throw new Error("signPayload is not a NEP-366 delegate action");
  const da = deserialize(SCHEMA.DelegateAction, bytes.slice(4)); // spike: no receiver/method allowlist (the product MUST have one)
  const acct = relayer();
  // 1) relayer -> fast-auth.testnet.sign(): guard verifies the Auth0 JWT (fatxn == sign_payload), MPC signs sha256(payload)
  const signTx = await acct.signAndSendTransaction({ receiverId: CFG.fastAuth, waitUntil: "EXECUTED_OPTIMISTIC", throwOnFailure: false,
    actions: [actions.functionCall("sign", { guard_id: req.guardId, verify_payload: req.verifyPayload, sign_payload: Array.from(bytes), algorithm: "eddsa" }, CFG.signGas, CFG.signDeposit)] });
  t.sign = now();
  const sv = signTx.status?.SuccessValue;
  const res = sv ? JSON.parse(Buffer.from(sv, "base64").toString()) : null; // {"scheme":"Ed25519","signature":[64 bytes]} or null
  const logs = signTx.receipts_outcome.flatMap((r) => r.outcome.logs);
  if (!res?.signature) return { ok: false, step: "sign", signTx: link(signTx.transaction.hash), status: signTx.status, logs };
  // 2) relayer -> sender: SignedDelegate (NEP-366); relayer pays gas, inner actions run as the user
  const signature = new Signature({ keyType: KeyType.ED25519, data: Uint8Array.from(res.signature) });
  const metaTx = await acct.signAndSendTransaction({ receiverId: da.senderId, waitUntil: "EXECUTED_OPTIMISTIC", throwOnFailure: false,
    actions: [actions.signedDelegate({ delegateAction: da, signature })] });
  t.meta = now();
  const burnt = (tx) => tx.receipts_outcome.reduce((s, r) => s + BigInt(r.outcome.tokens_burnt), BigInt(tx.transaction_outcome.outcome.tokens_burnt));
  return { ok: !("Failure" in (metaTx.status ?? {})), senderId: da.senderId, receiverId: da.receiverId,
    signTx: link(signTx.transaction.hash), metaTx: link(metaTx.transaction.hash), metaStatus: metaTx.status, logs,
    ms: { mpcSignTx: Math.round(t.sign - t.start), metaTx: Math.round(t.meta - t.sign), total: Math.round(t.meta - t.start) },
    yoctoBurnt: { signTx: burnt(signTx).toString(), metaTx: burnt(metaTx).toString() } };
}

const cmd = process.argv[2];
if (cmd === "derive") console.log(await derive(arg("sub")));
else if (cmd === "create") {
  const pk = arg("pk") ?? (await derive(arg("sub"))).publicKey;
  const acct = relayer();
  const newId = `${arg("name", "u-" + Math.random().toString(36).slice(2, 6))}.${acct.accountId}`;
  const tx = await acct.signAndSendTransaction({ receiverId: newId, waitUntil: "EXECUTED_OPTIMISTIC", actions: [
    actions.createAccount(), actions.transfer(BigInt(arg("yocto", "20000000000000000000000"))), // 0.02 NEAR
    actions.addFullAccessKey(PublicKey.from(pk))] });
  console.log({ created: newId, key: pk, tx: link(tx.transaction.hash), status: tx.status });
} else if (cmd === "relay") console.log(JSON.stringify(await relay(JSON.parse(readFileSync(arg("file")))), null, 2));
else if (cmd === "serve") {
  createServer(async (q, s) => {
    s.setHeader("Access-Control-Allow-Origin", CFG.origin); s.setHeader("Access-Control-Allow-Headers", "content-type");
    if (q.method === "OPTIONS") return s.end();
    if (q.method !== "POST" || q.url !== "/relay") { s.statusCode = 404; return s.end(); }
    let body = ""; for await (const c of q) body += c;
    try { const out = await relay(JSON.parse(body)); s.statusCode = out.ok ? 200 : 502; s.end(JSON.stringify(out, (_, v) => (typeof v === "bigint" ? v.toString() : v))); }
    catch (e) { s.statusCode = 500; s.end(JSON.stringify({ ok: false, error: String(e?.message ?? e) })); }
  }).listen(CFG.port, "localhost", () => console.log(`relay listening on http://localhost:${CFG.port}`));
} else console.log("commands: derive | create | serve | relay (see header)");
