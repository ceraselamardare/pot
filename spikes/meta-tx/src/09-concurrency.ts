// THROWAWAY spike 3d (relayer throughput): 5 users each sign one delegate (1-yocto ft_transfer); the relayer submits them
// concurrently in three modes:
//   A  one Account instance (shared in-process NonceManager), one key
//   B  five separate Account instances with the SAME key (= five serverless invocations) -> nonce races
//   C  five separate Account instances, each using its own relayer key (key pool) -> no races
import fs from 'node:fs';
import path from 'node:path';
import { Account, KeyPair, KeyPairSigner, actions, teraToGas, type KeyPairString } from 'near-api-js';
import { ROOT, WRAP, KEYS_DIR, account, loadKey, provider, summarize, appendLog, ms, ftBalance } from './lib.ts';
import { signDelegateSimple } from './client.ts';
import { decodeSignedDelegate, submit } from './relayer.ts';

const users = fs.readdirSync(KEYS_DIR)
  .filter((f) => /^(u2[zf]\d+\.|[0-9a-f]{64}\.json$|potspike-relay-yoqw-t\d+\.testnet\.json$)/.test(f) && !f.includes('.fc-'))
  .map((f) => f.replace(/\.json$/, ''));

async function signAll() {
  const out: { user: string; b64: string }[] = [];
  for (const u of users) {
    if ((await ftBalance(WRAP, u)) < 1n) continue;
    const { b64 } = await signDelegateSimple(account(u), WRAP, [actions.functionCall('ft_transfer', { receiver_id: ROOT, amount: '1' }, teraToGas('30'), 1n)]);
    out.push({ user: u, b64 });
  }
  return out;
}

async function run(mode: 'A' | 'B' | 'C', signerFor: (i: number) => Account) {
  const batch = await signAll();
  const t0 = ms();
  const results = await Promise.allSettled(batch.map(async ({ b64 }, i) => {
    const t = ms();
    const res = await submit(signerFor(i), decodeSignedDelegate(b64), 'EXECUTED_OPTIMISTIC');
    return { hash: summarize(res).hash, ms: ms() - t, failures: summarize(res).failures.length };
  }));
  const out = {
    mode, n: batch.length, wall_ms: ms() - t0,
    ok: results.filter((r) => r.status === 'fulfilled').length,
    rejected: results.filter((r) => r.status === 'rejected').map((r: any) => String(r.reason?.message ?? r.reason).slice(0, 160)),
    per_tx: results.map((r: any) => (r.status === 'fulfilled' ? r.value : null)),
  };
  console.log(JSON.stringify(out, null, 1));
  appendLog('09-concurrency', out);
}

const mainKey = loadKey(ROOT);
// mode A: one shared Account
const shared = new Account(ROOT, provider, KeyPairSigner.fromSecretKey(mainKey));
await run('A', () => shared);
// mode B: separate Account per request, same key
await run('B', () => new Account(ROOT, provider, KeyPairSigner.fromSecretKey(mainKey)));
// mode C: key pool. Add 4 extra full-access keys to R once (pool of 5).
const poolFile = path.join(KEYS_DIR, `${ROOT}.pool.json`);
let pool: KeyPairString[];
if (fs.existsSync(poolFile)) pool = JSON.parse(fs.readFileSync(poolFile, 'utf8'));
else {
  const kps = [0, 1, 2, 3].map(() => KeyPair.fromRandom('ed25519'));
  await account(ROOT).signAndSendTransaction({ receiverId: ROOT, actions: kps.map((k) => actions.addFullAccessKey(k.getPublicKey())), waitUntil: 'FINAL' });
  pool = [mainKey, ...kps.map((k) => k.toString() as KeyPairString)];
  fs.writeFileSync(poolFile, JSON.stringify(pool));
}
await run('C', (i) => new Account(ROOT, provider, KeyPairSigner.fromSecretKey(pool[i % pool.length])));
