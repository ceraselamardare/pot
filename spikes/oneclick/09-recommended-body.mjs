// THROWAWAY. Batch 9: the exact quote body recommended in kb/intents-1click.md (Snippet 1), dry, no key,
// on all four origin chains. Recipient pot.near (exists, NOT USDC-registered) to show withdrawFee.
import { call, saveAll, A, inMin, sleep } from './lib.mjs';
import { verifyQuoteSignature } from '@defuse-protocol/one-click-sdk-typescript';

for (const [chain, asset] of [['base', A.BASE_USDC], ['arb', A.ARB_USDC], ['eth', A.ETH_USDC], ['sol', A.SOL_USDC]]) {
  const body = {
    dry: true, swapType: 'FLEX_INPUT', slippageTolerance: 100,
    originAsset: asset, depositType: 'ORIGIN_CHAIN',
    destinationAsset: A.NEAR_USDC, amount: '150000000',
    recipient: 'pot.near', recipientType: 'DESTINATION_CHAIN',
    refundTo: 'pot.near', refundType: 'INTENTS',
    deadline: inMin(120), referral: 'pot',
  };
  const rec = await call(`q9-recommended-${chain}`, { method: 'POST', path: '/v0/quote', body });
  const b = rec.response.body; const q = b?.quote ?? {};
  console.log(`${chain}: HTTP ${rec.response.status} ${rec.response.ms}ms minAmountIn=${q.minAmountIn} amountOut=${q.amountOutFormatted} minAmountOut=${q.minAmountOut} timeEstimate=${q.timeEstimate} refundFee=${q.refundFee} withdrawFee=${q.withdrawFee} fees=${JSON.stringify(b?.quoteRequest?.appFees)} sigValid=${b?.signature ? verifyQuoteSignature(b) : '-'}`);
  await sleep(300);
}
saveAll('batch09.json');
