// THROWAWAY spike 3a: U1 signs a delegate `ft_transfer` (exactly 1 yocto attached) on wrap.testnet; R relays it.
// Measures who pays the 1 yocto and the gas (yocto-exact balances), gas burnt, latency, and decode/validate on the "server".
import { actions, teraToGas } from 'near-api-js';
import { ROOT, WRAP, account, nearState, ftBalance, summarize, printSummary, appendLog, fmtNear, ms, provider, rpcStats } from './lib.ts';
import { signDelegateSimple } from './client.ts';
import { decodeSignedDelegate, validate, submit, type Policy } from './relayer.ts';

export const POLICY: Policy = {
  rules: [
    { receiver: WRAP, methods: ['ft_transfer', 'ft_transfer_call'], maxDeposit: 1n, maxGas: teraToGas('100') },
  ],
  minTtlBlocks: 5,
  maxTtlBlocks: 600,
  rate: { windowMs: 60_000, max: 20 },
};

const U1_ID = `u1.${ROOT}`;
const R = account(ROOT);
const U1 = account(U1_ID);

async function snapshot() {
  const [u, r, uw, rw] = await Promise.all([nearState(U1_ID), nearState(ROOT), ftBalance(WRAP, U1_ID), ftBalance(WRAP, ROOT)]);
  return { uNear: u.amount, rNear: r.amount, uW: uw, rW: rw };
}

async function main() {
  const before = await snapshot();
  const pk = await U1.getSigner()!.getPublicKey();
  const akBefore = await provider.viewAccessKey({ accountId: U1_ID, publicKey: pk, finalityQuery: { finality: 'final' } });

  // ---- client (browser) ----
  const t0 = ms();
  const amount = '1000000000000000000000'; // 0.001 wNEAR
  const { b64, signedDelegate } = await signDelegateSimple(U1, WRAP, [
    actions.functionCall('ft_transfer', { receiver_id: ROOT, amount, memo: 'pot spike 3a' }, teraToGas('30'), 1n),
  ]);
  const tSigned = ms();
  console.log(`client: signed delegate in ${tSigned - t0}ms; base64 length=${b64.length} chars; nonce=${signedDelegate.delegateAction.nonce} (ak nonce was ${akBefore.nonce}); maxBlockHeight=${signedDelegate.delegateAction.maxBlockHeight}`);

  // ---- server (/api/relay) ----
  const rpc0 = rpcStats.calls;
  const d = decodeSignedDelegate(b64);
  const v = await validate(d, POLICY, provider);
  const tValid = ms();
  console.log(`server: decoded sender=${d.senderId} receiver=${d.receiverId} calls=${JSON.stringify(d.calls, (_k, x) => (typeof x === 'bigint' ? x.toString() : x))}`);
  console.log(`server: validate -> ${JSON.stringify(v)} in ${tValid - tSigned}ms (${rpcStats.calls - rpc0} RPC calls)`);
  if (!v.ok) throw new Error(v.reason);
  const res = await submit(R, d, 'EXECUTED_OPTIMISTIC');
  const tExec = ms();
  const s = summarize(res);
  const fin = await provider.viewTransactionStatus({ txHash: s.hash, accountId: ROOT, waitUntil: 'FINAL' });
  const tFinal = ms();
  printSummary(`relayed ft_transfer (1 yocto) U1 -> R on ${WRAP}`, summarize(fin));
  const after = await snapshot();
  const akAfter = await provider.viewAccessKey({ accountId: U1_ID, publicKey: pk, finalityQuery: { finality: 'final' } });

  const out = {
    hash: s.hash,
    latency: { sign_ms: tSigned - t0, validate_ms: tValid - tSigned, submit_to_executed_optimistic_ms: tExec - tValid, submit_to_final_ms: tFinal - tValid, total_ms: tFinal - t0 },
    deltas: {
      user_near_yocto: (after.uNear - before.uNear).toString(),
      relayer_near_yocto: (after.rNear - before.rNear).toString(),
      user_wnear: (after.uW - before.uW).toString(),
      relayer_wnear: (after.rW - before.rW).toString(),
    },
    gas_burnt: summarize(fin).gas.toString(),
    tokens_burnt: summarize(fin).burnt.toString(),
    ak_nonce: { before: akBefore.nonce.toString(), delegate: signedDelegate.delegateAction.nonce.toString(), after: akAfter.nonce.toString() },
  };
  console.log(JSON.stringify(out, null, 2));
  console.log(`relayer cost = ${fmtNear(before.rNear - after.rNear)} (incl. 1 yocto deposit + gas; wNEAR received is separate)`);
  appendLog('02-relay-ft-transfer', out);
}
main().catch((e) => { console.error(e); process.exit(1); });
