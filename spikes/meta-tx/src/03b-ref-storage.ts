// THROWAWAY: top up U1's Ref storage (registration_only=false) so the next relayed ft_transfer_call succeeds.
import { actions, nearToYocto, teraToGas } from 'near-api-js';
import { ROOT, account, summarize, printSummary, view } from './lib.ts';
const R = account(ROOT);
const REF = 'ref-finance-101.testnet';
const res = await R.signAndSendTransaction({
  receiverId: REF,
  actions: [actions.functionCall('storage_deposit', { account_id: `u1.${ROOT}`, registration_only: false }, teraToGas('30'), nearToYocto('0.01'))],
  waitUntil: 'FINAL',
});
printSummary('R tops up Ref storage for U1 (0.01 NEAR, registration_only=false)', summarize(res));
console.log('storage_balance_of', JSON.stringify(await view(REF, 'storage_balance_of', { account_id: `u1.${ROOT}` })));
