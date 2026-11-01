// THROWAWAY spike 3a (part 2): relayed `ft_transfer_call` (1 yocto) from U1 on wrap.testnet to ref-finance-101.testnet
// (implements ft_on_transfer; msg "" = deposit into the sender's Ref balance).
//  run 1: U1 NOT registered on Ref -> ft_on_transfer panics -> ft_resolve_transfer refunds everything to U1.
//  run 2: R pays Ref storage_deposit for U1, then the same call succeeds (amount used = all).
import { actions, nearToYocto, teraToGas } from 'near-api-js';
import { ROOT, WRAP, account, nearState, settledNear, ftBalance, summarize, printSummary, appendLog, ms, provider, view } from './lib.ts';
import { signDelegateSimple } from './client.ts';
import { decodeSignedDelegate, validate, submit, type Policy } from './relayer.ts';

const REF = 'ref-finance-101.testnet';
const ALLOWED_FT_RECEIVERS = new Set([REF]); // product: /^[a-z0-9-]+\.rulebot\.pot-<team>\.testnet$/
const POLICY: Policy = {
  rules: [{
    receiver: WRAP, methods: ['ft_transfer_call'], maxDeposit: 1n, maxGas: teraToGas('150'),
    checkArgs: (_m, a) => (ALLOWED_FT_RECEIVERS.has(a?.receiver_id) ? null : `ft receiver ${a?.receiver_id} not allowed`),
  }],
  minTtlBlocks: 5, maxTtlBlocks: 600, rate: { windowMs: 60_000, max: 20 },
};
const U1_ID = `u1.${ROOT}`;
const R = account(ROOT);
const U1 = account(U1_ID);

async function relayOnce(label: string) {
  const before = { u: await settledNear(U1_ID), r: await settledNear(ROOT), uw: await ftBalance(WRAP, U1_ID), refw: await ftBalance(WRAP, REF) };
  const t0 = ms();
  const { b64 } = await signDelegateSimple(U1, WRAP, [
    actions.functionCall('ft_transfer_call', { receiver_id: REF, amount: '1000000000000000000000', msg: '' }, teraToGas('100'), 1n),
  ]);
  const d = decodeSignedDelegate(b64);
  const v = await validate(d, POLICY, provider);
  if (!v.ok) throw new Error(v.reason);
  const t1 = ms();
  const res = await submit(R, d, 'FINAL');
  const t2 = ms();
  const s = summarize(res);
  printSummary(`${label} (submit->FINAL ${t2 - t1}ms)`, s);
  const after = { u: await settledNear(U1_ID), r: await settledNear(ROOT), uw: await ftBalance(WRAP, U1_ID), refw: await ftBalance(WRAP, REF) };
  const out = {
    label, hash: s.hash, final_status: s.status, failing_receipts: s.failures.map((f) => ({ executor: f.executor, status: f.status })),
    gas_burnt: s.gas, tokens_burnt: s.burnt, submit_to_final_ms: t2 - t1, total_ms: t2 - t0,
    user_near_delta: after.u.amount - before.u.amount, relayer_near_delta: after.r.amount - before.r.amount,
    user_wnear_delta: after.uw - before.uw, ref_wnear_delta: after.refw - before.refw,
  };
  console.log(JSON.stringify(out, (_k, x) => (typeof x === 'bigint' ? x.toString() : x), 2));
  appendLog('03-relay-ft-transfer-call', out);
}

async function main() {
  const reg = await view(REF, 'storage_balance_of', { account_id: U1_ID });
  if (!reg) {
    await relayOnce('ft_transfer_call to Ref, U1 NOT registered on Ref (expect refund)');
    const res = await R.signAndSendTransaction({
      receiverId: REF,
      actions: [actions.functionCall('storage_deposit', { account_id: U1_ID, registration_only: true }, teraToGas('30'), nearToYocto('0.0125'))],
      waitUntil: 'FINAL',
    });
    printSummary('R pays Ref storage_deposit for U1', summarize(res));
  }
  await relayOnce('ft_transfer_call to Ref, U1 registered (expect success)');
  console.log('U1 deposits on Ref:', JSON.stringify(await view(REF, 'get_deposits', { account_id: U1_ID })));
}
main().catch((e) => { console.error(e); process.exit(1); });
