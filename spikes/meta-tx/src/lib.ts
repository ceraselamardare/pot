// THROWAWAY Phase 0 spike helper (spike 3: NEP-366 relayer). Never import or copy into the product.
// Testnet only. Keys live in ../.keys/ (gitignored) or ~/.near-credentials/testnet/ (legacy keychain).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, type KeyPairString } from 'near-api-js';

export const RPC = process.env.NEAR_RPC ?? 'https://rpc.testnet.fastnear.com';

// near-api-js 7.3.1 does not retry HTTP 429 (only 500/503/408), and the free FastNear tier sometimes answers
// HTTP 200 with a JSON-RPC error code -429. Wrap fetch so the spike survives shared-IP rate limits.
export const rpcStats = { calls: 0, retried429: 0 };
const origFetch = globalThis.fetch;
globalThis.fetch = async (input: any, init?: any) => {
  for (let i = 0; ; i++) {
    rpcStats.calls++;
    const res = await origFetch(input, init);
    const text = await res.text();
    const limited = res.status === 429 || /"code":\s*-429/.test(text);
    if (limited && i < 9) { rpcStats.retried429++; await new Promise((r) => setTimeout(r, 800 * 1.6 ** i)); continue; }
    return new Response(text, { status: res.status, statusText: res.statusText, headers: res.headers });
  }
};
export const provider = new JsonRpcProvider({ url: RPC });
export const ROOT = 'potspike-relay-yoqw.testnet'; // faucet account = relayer R
export const WRAP = 'wrap.testnet';
export const KEYS_DIR = path.resolve(import.meta.dirname, '../.keys');
const LEGACY_DIR = path.join(os.homedir(), '.near-credentials', 'testnet');

export const ms = () => Number(process.hrtime.bigint() / 1_000_000n);
export const nb = (hash: string) => `https://testnet.nearblocks.io/txns/${hash}`;
export const fmtNear = (yocto: bigint) => {
  const neg = yocto < 0n; const v = neg ? -yocto : yocto;
  const s = v.toString().padStart(25, '0');
  return `${neg ? '-' : ''}${s.slice(0, -24)}.${s.slice(-24)} NEAR`;
};

export function loadKey(accountId: string): KeyPairString {
  for (const p of [path.join(KEYS_DIR, `${accountId}.json`), path.join(LEGACY_DIR, `${accountId}.json`)]) {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8')).private_key as KeyPairString;
  }
  throw new Error(`no key for ${accountId}`);
}

export function saveKey(accountId: string, kp: KeyPair, suffix = '') {
  fs.mkdirSync(KEYS_DIR, { recursive: true });
  const file = path.join(KEYS_DIR, `${accountId}${suffix}.json`);
  fs.writeFileSync(file, JSON.stringify({ account_id: accountId, public_key: kp.getPublicKey().toString(), private_key: kp.toString() }));
  return file;
}

export function account(accountId: string, key?: KeyPairString) {
  return new Account(accountId, provider, KeyPairSigner.fromSecretKey(key ?? loadKey(accountId)));
}

export async function nearState(accountId: string) {
  try {
    const v = await provider.viewAccount({ accountId, blockQuery: { finality: 'final' } });
    return { exists: true, amount: BigInt(v.amount), storage: v.storage_usage, height: v.block_height };
  } catch (e: any) {
    return { exists: false, amount: 0n, storage: 0, height: 0, err: String(e?.message ?? e).slice(0, 120) };
  }
}

/** Balance after late gas-refund receipts land: wait_until=FINAL does not wait for refund receipts. */
export async function settledNear(accountId: string, polls = 12) {
  let prev = await nearState(accountId);
  for (let i = 0; i < polls; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const cur = await nearState(accountId);
    if (cur.amount === prev.amount && cur.height !== prev.height) return cur;
    prev = cur;
  }
  return prev;
}

export async function ftBalance(token: string, accountId: string): Promise<bigint> {
  const r = await provider.callFunction({ contractId: token, method: 'ft_balance_of', args: { account_id: accountId } });
  return BigInt((r as string) ?? '0');
}

export async function view<T = unknown>(contractId: string, method: string, args: Record<string, unknown> = {}) {
  return (await provider.callFunction({ contractId, method, args })) as T;
}

/** Summarise an RPC tx response: hash, gas, tokens burnt, every receipt + its status, failures. */
export function summarize(res: any) {
  const hash: string = res.transaction_outcome?.id ?? res.transaction?.hash;
  const rows: { id: string; executor: string; gas: bigint; burnt: bigint; status: string; logs: string[] }[] = [];
  const push = (o: any, id: string) => rows.push({
    id, executor: o.executor_id, gas: BigInt(o.gas_burnt), burnt: BigInt(o.tokens_burnt),
    status: JSON.stringify(o.status).slice(0, 220), logs: o.logs ?? [],
  });
  push(res.transaction_outcome.outcome, res.transaction_outcome.id);
  for (const r of res.receipts_outcome ?? []) push(r.outcome, r.id);
  const gas = rows.reduce((a, r) => a + r.gas, 0n);
  const burnt = rows.reduce((a, r) => a + r.burnt, 0n);
  const failures = rows.filter((r) => r.status.includes('Failure'));
  return { hash, link: nb(hash), status: JSON.stringify(res.status).slice(0, 300), gas, burnt, rows, failures };
}

export function printSummary(label: string, s: ReturnType<typeof summarize>) {
  console.log(`\n### ${label}\n  tx: ${s.link}\n  final status: ${s.status}\n  gas burnt total: ${(Number(s.gas) / 1e12).toFixed(3)} Tgas, tokens burnt: ${fmtNear(s.burnt)}`);
  for (const r of s.rows) console.log(`   - ${r.id.slice(0, 8)} @${r.executor} gas=${(Number(r.gas) / 1e12).toFixed(3)}T burnt=${fmtNear(r.burnt)} ${r.status}${r.logs.length ? ' logs=' + JSON.stringify(r.logs).slice(0, 200) : ''}`);
  if (s.failures.length) console.log(`  !! ${s.failures.length} failing receipt(s)`);
}

export function appendLog(name: string, data: unknown) {
  const dir = path.resolve(import.meta.dirname, '../out');
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, `${name}.jsonl`), JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)) + '\n');
}
