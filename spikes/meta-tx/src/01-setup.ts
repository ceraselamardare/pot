// THROWAWAY spike 3 setup: R (relayer, faucet account) creates U1 (named sub-account, 0.05 NEAR, full-access key),
// R pays storage_deposit on wrap.testnet for U1 (and itself), U1 wraps 0.01 NEAR with its own (non-relayed) tx.
import { KeyPair, actions, nearToYocto, teraToGas } from 'near-api-js';
import { ROOT, WRAP, account, saveKey, nearState, ftBalance, summarize, printSummary, appendLog, fmtNear, ms } from './lib.ts';

const R = account(ROOT);
const U1_ID = `u1.${ROOT}`;

async function main() {
  console.log('R before', fmtNear((await nearState(ROOT)).amount));
  if (!(await nearState(U1_ID)).exists) {
    const kp = KeyPair.fromRandom('ed25519');
    saveKey(U1_ID, kp);
    const t0 = ms();
    const res = await R.signAndSendTransaction({
      receiverId: U1_ID,
      actions: [actions.createAccount(), actions.transfer(nearToYocto('0.05')), actions.addFullAccessKey(kp.getPublicKey())],
      waitUntil: 'FINAL',
    });
    const s = summarize(res);
    printSummary(`create ${U1_ID} (+0.05 NEAR, 1 FAK) latency=${ms() - t0}ms`, s);
    appendLog('setup', { step: 'create-u1', hash: s.hash, gas: s.gas, burnt: s.burnt, ms: ms() - t0 });
  }
  const u1 = await nearState(U1_ID);
  console.log(`U1 state: amount=${fmtNear(u1.amount)} storage_usage=${u1.storage} bytes`);

  // storage_deposit on wrap.testnet for U1 and R, paid by R (registration_only)
  for (const who of [U1_ID, ROOT]) {
    const bal = await R.provider.callFunction({ contractId: WRAP, method: 'storage_balance_of', args: { account_id: who } });
    if (bal) { console.log(`${who} already registered on ${WRAP}`, bal); continue; }
    const t0 = ms();
    const res = await R.signAndSendTransaction({
      receiverId: WRAP,
      actions: [actions.functionCall('storage_deposit', { account_id: who, registration_only: true }, teraToGas('30'), nearToYocto('0.00125'))],
      waitUntil: 'FINAL',
    });
    const s = summarize(res);
    printSummary(`R pays storage_deposit for ${who} on ${WRAP} latency=${ms() - t0}ms`, s);
    appendLog('setup', { step: `storage-${who}`, hash: s.hash, gas: s.gas, burnt: s.burnt, ms: ms() - t0 });
  }

  // U1 wraps 0.01 NEAR itself (plain tx paid by U1) so it has wNEAR to move in the relayed test
  const U1 = account(U1_ID);
  if ((await ftBalance(WRAP, U1_ID)) === 0n) {
    const t0 = ms();
    const res = await U1.signAndSendTransaction({
      receiverId: WRAP,
      actions: [actions.functionCall('near_deposit', {}, teraToGas('10'), nearToYocto('0.01'))],
      waitUntil: 'FINAL',
    });
    const s = summarize(res);
    printSummary(`U1 near_deposit 0.01 latency=${ms() - t0}ms`, s);
    appendLog('setup', { step: 'u1-near-deposit', hash: s.hash, gas: s.gas, burnt: s.burnt, ms: ms() - t0 });
  }
  console.log(`U1 wNEAR=${await ftBalance(WRAP, U1_ID)} NEAR=${fmtNear((await nearState(U1_ID)).amount)}`);
  console.log('R after', fmtNear((await nearState(ROOT)).amount));
}
main().catch((e) => { console.error(e); process.exit(1); });
