// THROWAWAY probe of usdc.fakes.testnet (shared community test token): is `mint` public? is `burn` public
// (can a third party burn someone else's balance)? Only touches balances of OUR spike accounts.
// Deliberately does NOT call set_decimals / set_token_name / set_icon (would affect every user of the shared token).
import { actions, nearToYocto, teraToGas } from 'near-api-js';
import { ROOT, account, summarize, printSummary, appendLog, view } from './lib.ts';

const FAKE = 'usdc.fakes.testnet';
const U1_ID = `u1.${ROOT}`;
const R = account(ROOT);
const bal = async (a: string) => view<string>(FAKE, 'ft_balance_of', { account_id: a });

for (const who of [ROOT, U1_ID]) {
  if (!(await view(FAKE, 'storage_balance_of', { account_id: who }))) {
    printSummary(`storage_deposit ${who}`, summarize(await R.signAndSendTransaction({ receiverId: FAKE, actions: [actions.functionCall('storage_deposit', { account_id: who, registration_only: true }, teraToGas('30'), nearToYocto('0.00125'))], waitUntil: 'FINAL' })));
  }
}
const step = async (label: string, method: string, args: object) => {
  const res = await R.signAndSendTransaction({ receiverId: FAKE, actions: [actions.functionCall(method, args, teraToGas('30'), 0n)], waitUntil: 'FINAL', throwOnFailure: false });
  const s = summarize(res);
  printSummary(label, s);
  const out = { label, hash: s.hash, status: s.status, r: await bal(ROOT), u1: await bal(U1_ID) };
  console.log(JSON.stringify(out));
  appendLog('08-fake-usdc', out);
};
console.log('before', await bal(ROOT), await bal(U1_ID));
await step('R mints 1.000000 to itself', 'mint', { account_id: ROOT, amount: '1000000' });
await step('R mints 5.000000 to U1 (third-party mint)', 'mint', { account_id: U1_ID, amount: '5000000' });
await step('R burns 1.000000 of U1 (third-party burn!)', 'burn', { account_id: U1_ID, amount: '1000000' });
