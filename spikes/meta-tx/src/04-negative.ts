// THROWAWAY spike 3c: negative tests. Each case is first run through the server-side validator (must reject),
// then (where useful) FORCE-submitted to testnet to record the on-chain error and what it costs the relayer.
import { KeyPair, actions, nearToYocto, teraToGas } from 'near-api-js';
import { ROOT, WRAP, account, settledNear, ftBalance, summarize, printSummary, appendLog, provider, saveKey, fmtNear } from './lib.ts';
import { signDelegateManual, signDelegateSimple } from './client.ts';
import { decodeSignedDelegate, validate, submit, type Policy } from './relayer.ts';

const POLICY: Policy = {
  rules: [{ receiver: WRAP, methods: ['ft_transfer', 'ft_transfer_call'], maxDeposit: 1n, maxGas: teraToGas('100') }],
  minTtlBlocks: 5, maxTtlBlocks: 600, rate: { windowMs: 60_000, max: 50 },
};
const U1_ID = `u1.${ROOT}`;
const R = account(ROOT);
const U1 = account(U1_ID);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ftT = (amount = '1', deposit = 1n) =>
  actions.functionCall('ft_transfer', { receiver_id: ROOT, amount, memo: 'neg' }, teraToGas('30'), deposit);
const ser = (x: unknown) => JSON.stringify(x, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));

async function force(label: string, b64: string) {
  const r0 = await settledNear(ROOT); const u0 = await settledNear(U1_ID);
  const res = await submit(R, decodeSignedDelegate(b64), 'FINAL');
  const s = summarize(res);
  printSummary(`FORCED on-chain: ${label}`, s);
  const r1 = await settledNear(ROOT); const u1 = await settledNear(U1_ID);
  const out = { label, hash: s.hash, link: s.link, final_status: s.status, errors: s.failures.map((f) => f.status), tokens_burnt: s.burnt, gas: s.gas, relayer_delta: r1.amount - r0.amount, user_delta: u1.amount - u0.amount };
  console.log(ser(out));
  appendLog('04-negative', out);
  return out;
}
async function check(label: string, b64: string) {
  const v = await validate(decodeSignedDelegate(b64), POLICY, provider);
  console.log(`\n[validator] ${label}: ${ser(v)}`);
  appendLog('04-negative', { label: `validator: ${label}`, result: v });
  return v;
}

async function main() {
  // (a) receiver not on allowlist -> rejected server-side, nothing submitted
  const a = await signDelegateSimple(U1, 'usdc.fakes.testnet', [ftT()]);
  await check('receiver usdc.fakes.testnet not allowlisted', a.b64);

  // (b) deposit above cap: near_deposit 0.01 NEAR "from the user" -> the RELAYER would pay it
  const b = await signDelegateSimple(U1, WRAP, [actions.functionCall('near_deposit', {}, teraToGas('10'), nearToYocto('0.01'))]);
  await check('near_deposit 0.01 NEAR (method + deposit cap)', b.b64);
  const w0 = await ftBalance(WRAP, U1_ID);
  await force('near_deposit 0.01 NEAR inside delegate (who pays?)', b.b64);
  console.log(`U1 wNEAR gained: ${(await ftBalance(WRAP, U1_ID)) - w0}`);

  // (c) expired max_block_height
  const head = BigInt((await provider.viewBlock({ finality: 'final' })).header.height);
  const c = await signDelegateManual(U1, WRAP, [ftT()], { maxBlockHeight: head + 2n });
  await sleep(6000);
  await check('expired max_block_height (head+2, waited 6s)', c.b64);
  await force('expired max_block_height', c.b64);

  // (d) reused nonce: relay once OK, then replay the identical bytes
  const d = await signDelegateSimple(U1, WRAP, [ftT()]);
  const ok = await submit(R, decodeSignedDelegate(d.b64), 'FINAL');
  printSummary('first use of delegate (d)', summarize(ok));
  await check('replay of the same signed delegate', d.b64);
  await force('replay of the same signed delegate', d.b64);

  // (e) any higher nonce is accepted (nonce = ak+1000); a pending delegate with a lower nonce is invalidated
  const pending = await signDelegateManual(U1, WRAP, [ftT()]); // nonce = ak+1, not yet sent
  const ak = await provider.viewAccessKey({ accountId: U1_ID, publicKey: await U1.getSigner()!.getPublicKey(), finalityQuery: { finality: 'final' } });
  const e = await signDelegateManual(U1, WRAP, [ftT()], { nonce: BigInt(ak.nonce) + 1000n });
  await check('nonce = ak+1000', e.b64);
  await force('nonce = ak+1000 (expect success)', e.b64);
  const ak2 = await provider.viewAccessKey({ accountId: U1_ID, publicKey: await U1.getSigner()!.getPublicKey(), finalityQuery: { finality: 'final' } });
  console.log(`ak nonce before=${ak.nonce} after=${ak2.nonce}`);
  await check('older pending delegate (nonce ak+1) after jump', pending.b64);
  await force('older pending delegate after nonce jump', pending.b64);

  // (f) function-call access key: add it gaslessly (delegate AddKey to self), then try to use it
  const fcKp = KeyPair.fromRandom('ed25519');
  saveKey(U1_ID, fcKp, '.fc-wrap');
  const addKey = await signDelegateSimple(U1, U1_ID, [actions.addFunctionCallAccessKey(fcKp.getPublicKey(), WRAP, ['ft_transfer'], nearToYocto('0.25'))]);
  await force('relayed AddKey(FunctionCall wrap.testnet [ft_transfer]) - non-FunctionCall action inside a delegate', addKey.b64);
  const U1fc = account(U1_ID, fcKp.toString());
  const f1 = await signDelegateSimple(U1fc, WRAP, [ftT('1', 1n)]);
  await check('FC key + 1 yocto', f1.b64);
  await force('FC key signs ft_transfer with 1 yocto', f1.b64);
  const f2 = await signDelegateSimple(U1fc, WRAP, [ftT('1', 0n)]);
  await force('FC key signs ft_transfer with 0 deposit', f2.b64);
  console.log(`R now ${fmtNear((await settledNear(ROOT)).amount)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
