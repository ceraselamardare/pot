// THROWAWAY. Batch 1: dry quotes, NO JWT, USDC on {Base, Arbitrum, Ethereum, Solana} -> USDC on NEAR.
// Pot scenario: member wants exactly $150 to land on their NEAR account (EXACT_OUTPUT) + EXACT_INPUT variant.
import { call, summarizeQuote, saveAll, A, ADDR, inMin, sleep } from './lib.mjs';

const origins = [
  ['base', A.BASE_USDC, ADDR.EVM_REFUND],
  ['arb', A.ARB_USDC, ADDR.EVM_REFUND],
  ['eth', A.ETH_USDC, ADDR.EVM_REFUND],
  ['sol', A.SOL_USDC, ADDR.SOL_REFUND],
];

const base = (originAsset, refundTo, swapType, amount) => ({
  dry: true,
  swapType,
  slippageTolerance: 100,
  originAsset,
  depositType: 'ORIGIN_CHAIN',
  destinationAsset: A.NEAR_USDC,
  amount,
  refundTo,
  refundType: 'ORIGIN_CHAIN',
  recipient: ADDR.NEAR_REGISTERED,
  recipientType: 'DESTINATION_CHAIN',
  deadline: inMin(60),
  referral: 'pot-spike',
});

for (const [chain, asset, refund] of origins) {
  for (const [swapType, amount] of [['EXACT_OUTPUT', '150000000'], ['EXACT_INPUT', '150000000']]) {
    const rec = await call(`q1-${chain}-${swapType.toLowerCase()}-150`, { method: 'POST', path: '/v0/quote', body: base(asset, refund, swapType, amount) });
    console.log(summarizeQuote(rec));
    await sleep(300);
  }
}
saveAll('batch01.json');
