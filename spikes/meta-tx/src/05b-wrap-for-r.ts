// THROWAWAY: R wraps 0.02 NEAR so it can fund new spike accounts with wNEAR.
import { actions, nearToYocto, teraToGas } from 'near-api-js';
import { ROOT, WRAP, account, summarize, printSummary, ftBalance } from './lib.ts';
const R = account(ROOT);
printSummary('R near_deposit 0.02', summarize(await R.signAndSendTransaction({ receiverId: WRAP, actions: [actions.functionCall('near_deposit', {}, teraToGas('10'), nearToYocto('0.02'))], waitUntil: 'FINAL' })));
console.log('R wNEAR', await ftBalance(WRAP, ROOT));
