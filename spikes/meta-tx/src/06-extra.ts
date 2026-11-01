// THROWAWAY spike 3c/3d extras:
//  (a) delegate from a sender account that does not exist (force-submitted) -> what fails, who pays
//  (b) two SignedDelegate actions in one tx -> rejected?
//  (c) [Transfer(1 yocto) to user, SignedDelegate] in one tx -> allowed?
//  (d) bench: N sequential relayed 1-yocto ft_transfers -> latency + cost distribution; block time
import { KeyPair, KeyPairSigner, actions, buildDelegateAction, teraToGas, encodeSignedDelegate, base64Encode } from 'near-api-js';
import { ROOT, WRAP, account, settledNear, summarize, printSummary, appendLog, ms, provider } from './lib.ts';
import { signDelegateManual, signDelegateSimple } from './client.ts';
import { decodeSignedDelegate, validate, submit, type Policy } from './relayer.ts';

const U1_ID = `u1.${ROOT}`;
const R = account(ROOT);
const U1 = account(U1_ID);
const ser = (x: unknown) => JSON.stringify(x, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
const ftT = (amount = '1') => actions.functionCall('ft_transfer', { receiver_id: ROOT, amount }, teraToGas('30'), 1n);
const POLICY: Policy = { rules: [{ receiver: WRAP, methods: ['ft_transfer'], maxDeposit: 1n, maxGas: teraToGas('100') }], minTtlBlocks: 5, maxTtlBlocks: 600, rate: { windowMs: 60_000, max: 100 } };

async function partA() {
  const kp = KeyPair.fromRandom('ed25519');
  const ghost = `ghost${Date.now() % 100000}.${ROOT}`;
  const head = BigInt((await provider.viewBlock({ finality: 'final' })).header.height);
  const da = buildDelegateAction({ senderId: ghost, receiverId: WRAP, actions: [ftT()], nonce: 1n, maxBlockHeight: head + 100n, publicKey: kp.getPublicKey() });
  const { signedDelegate } = await new KeyPairSigner(kp).signDelegateAction(da);
  const b64 = base64Encode(encodeSignedDelegate(signedDelegate));
  console.log('[validator] ghost sender:', ser(await validate(decodeSignedDelegate(b64), POLICY, provider)));
  const r0 = await settledNear(ROOT);
  const res = await submit(R, decodeSignedDelegate(b64), 'FINAL');
  const s = summarize(res);
  printSummary(`(a) FORCED delegate from non-existent sender ${ghost}`, s);
  const r1 = await settledNear(ROOT);
  const out = { case: 'a ghost sender', hash: s.hash, status: s.status, burnt: s.burnt, relayer_delta: r1.amount - r0.amount };
  console.log(ser(out)); appendLog('06-extra', out);
}

async function partB() {
  const one = await signDelegateManual(U1, WRAP, [ftT()]);
  const two = await signDelegateManual(U1, WRAP, [ftT()], { nonce: one.nonce + 1n });
  try {
    const res = await R.signAndSendTransaction({ receiverId: U1_ID, actions: [actions.signedDelegate(one.signedDelegate), actions.signedDelegate(two.signedDelegate)], waitUntil: 'FINAL', throwOnFailure: false });
    const s = summarize(res); printSummary('(b) two delegates in one tx', s);
    appendLog('06-extra', { case: 'b two delegates', hash: s.hash, status: s.status });
  } catch (e: any) {
    const msg = String(e?.message ?? e).slice(0, 300);
    console.log('(b) two delegates in one tx -> rejected by RPC:', e?.constructor?.name, msg);
    appendLog('06-extra', { case: 'b two delegates', rejected: true, error: msg, type: e?.constructor?.name });
  }
}

async function partC() {
  const one = await signDelegateSimple(U1, WRAP, [ftT()]);
  const u0 = await settledNear(U1_ID);
  const res = await R.signAndSendTransaction({ receiverId: U1_ID, actions: [actions.transfer(1n), actions.signedDelegate(one.signedDelegate)], waitUntil: 'FINAL', throwOnFailure: false });
  const s = summarize(res); printSummary('(c) [Transfer 1 yocto, SignedDelegate] in one tx', s);
  const u1 = await settledNear(U1_ID);
  const out = { case: 'c transfer+delegate', hash: s.hash, status: s.status, failures: s.failures.length, user_delta: u1.amount - u0.amount };
  console.log(ser(out)); appendLog('06-extra', out);
}

async function partD(n: number) {
  const b0 = await provider.viewBlock({ finality: 'final' });
  const rows: any[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = ms();
    const { b64 } = await signDelegateSimple(U1, WRAP, [ftT()]);
    const t1 = ms();
    const d = decodeSignedDelegate(b64);
    const v = await validate(d, POLICY, provider);
    if (!v.ok) throw new Error(v.reason);
    const t2 = ms();
    const res = await submit(R, d, 'EXECUTED_OPTIMISTIC');
    const t3 = ms();
    const s = summarize(res);
    await provider.viewTransactionStatus({ txHash: s.hash, accountId: ROOT, waitUntil: 'FINAL' });
    const t4 = ms();
    const row = { i, hash: s.hash, sign_ms: t1 - t0, validate_ms: t2 - t1, submit_to_executed_optimistic_ms: t3 - t2, submit_to_final_ms: t4 - t2, total_to_final_ms: t4 - t0, gas: s.gas, burnt: s.burnt, receipts: s.rows.length };
    console.log(ser(row)); rows.push(row); appendLog('06-bench', row);
  }
  const b1 = await provider.viewBlock({ finality: 'final' });
  const blockMs = (Number(BigInt(b1.header.timestamp_nanosec) - BigInt(b0.header.timestamp_nanosec)) / 1e6) / (b1.header.height - b0.header.height);
  const med = (k: string) => { const a = rows.map((r) => Number(r[k])).sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
  const summary = { n, avg_block_ms: Math.round(blockMs), median: { sign_ms: med('sign_ms'), validate_ms: med('validate_ms'), exec_opt_ms: med('submit_to_executed_optimistic_ms'), final_ms: med('submit_to_final_ms'), total_ms: med('total_to_final_ms'), burnt_yocto: med('burnt'), gas: med('gas') } };
  console.log('BENCH', ser(summary)); appendLog('06-bench', { summary });
}

const which = process.argv[2] ?? 'abcd';
if (which.includes('a')) await partA();
if (which.includes('b')) await partB();
if (which.includes('c')) await partC();
if (which.includes('d')) await partD(Number(process.argv[3] ?? 5));
