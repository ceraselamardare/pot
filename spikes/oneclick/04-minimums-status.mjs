// THROWAWAY. Batch 4: per-chain minimums, FLEX_INPUT per chain, temporarily-restricted chains,
// EXACT_OUTPUT to an unregistered recipient, and GET /v0/status error shapes. Read-only / dry only.
import { call, summarizeQuote, saveAll, A, ADDR, inMin, sleep } from './lib.mjs';

const q = (over = {}) => ({
  dry: true,
  swapType: 'EXACT_INPUT',
  slippageTolerance: 100,
  originAsset: A.BASE_USDC,
  depositType: 'ORIGIN_CHAIN',
  destinationAsset: A.NEAR_USDC,
  amount: '150000000',
  refundTo: ADDR.EVM_REFUND,
  refundType: 'ORIGIN_CHAIN',
  recipient: ADDR.NEAR_REGISTERED,
  recipientType: 'DESTINATION_CHAIN',
  deadline: inMin(60),
  ...over,
});

const chains = [
  ['base', A.BASE_USDC, ADDR.EVM_REFUND],
  ['arb', A.ARB_USDC, ADDR.EVM_REFUND],
  ['eth', A.ETH_USDC, ADDR.EVM_REFUND],
  ['sol', A.SOL_USDC, ADDR.SOL_REFUND],
];

const cases = [];
for (const [c, asset, refund] of chains) {
  cases.push([`q4-min-${c}-0.01`, q({ originAsset: asset, refundTo: refund, amount: '10000' })]);
  cases.push([`q4-min-${c}-exact-output-0.01`, q({ originAsset: asset, refundTo: refund, amount: '10000', swapType: 'EXACT_OUTPUT' })]);
  cases.push([`q4-flex-${c}-150`, q({ originAsset: asset, refundTo: refund, swapType: 'FLEX_INPUT' })]);
  cases.push([`q4-${c}-10k`, q({ originAsset: asset, refundTo: refund, amount: '10000000000' })]);
}
// Temporarily restricted chains (changelog 2026-09-09: $1,000 minimum origin->origin on BSC, POL, TON, OP, AVAX, XLM, MON, XLayer, ADI)
cases.push(['q4-pol-usdc-150', q({ originAsset: A.POL_USDC })]);
cases.push(['q4-pol-usdc-1500', q({ originAsset: A.POL_USDC, amount: '1500000000' })]);
cases.push(['q4-op-usdc-150', q({ originAsset: A.OP_USDC })]);
cases.push(['q4-bsc-usdc-150', q({ originAsset: A.BSC_USDC, amount: '150000000000000000000' })]);
// Same restricted chain but delivering into Intents (changelog says deposits to Intents unaffected)
cases.push(['q4-pol-usdc-150-to-intents', q({ originAsset: A.POL_USDC, recipientType: 'INTENTS' })]);
// EXACT_OUTPUT 150 to an unregistered recipient: does amountIn grow by the storage withdrawFee?
cases.push(['q4-exact-output-unregistered', q({ swapType: 'EXACT_OUTPUT', recipient: ADDR.NEAR_UNREGISTERED })]);
cases.push(['q4-exact-output-registered', q({ swapType: 'EXACT_OUTPUT', recipient: ADDR.NEAR_REGISTERED })]);

for (const [name, body] of cases) {
  const rec = await call(name, { method: 'POST', path: '/v0/quote', body });
  console.log(summarizeQuote(rec), '| fees:', JSON.stringify(rec.response.body?.quoteRequest?.appFees ?? null));
  await sleep(250);
}

// GET /v0/status error shapes (no deposit address of ours exists; these are random/invalid)
for (const [name, qs] of [
  ['s4-unknown-evm', 'depositAddress=0x000000000000000000000000000000000000dEaD'],
  ['s4-unknown-evm-random', 'depositAddress=0x7c3b5f2a9e1d4c8b6a0f3e2d1c9b8a7f6e5d4c3b'],
  ['s4-unknown-sol', 'depositAddress=13QkxhNMrTPxoCkRdYdJ65tFuwXPhL5gLS2Z5Nr6gjRK'],
  ['s4-garbage', 'depositAddress=not-an-address'],
  ['s4-with-memo', 'depositAddress=0x000000000000000000000000000000000000dEaD&depositMemo=123'],
  ['s4-missing-param', ''],
]) {
  const rec = await call(name, { method: 'GET', path: '/v0/status' + (qs ? '?' + qs : '') });
  console.log(`${name}: HTTP ${rec.response.status} ${rec.response.ms}ms`, JSON.stringify(rec.response.body).slice(0, 300), JSON.stringify(rec.response.headers));
  await sleep(250);
}
// Bad key on status: does it 401 even for GET?
{
  const rec = await call('s4-bad-key', { method: 'GET', path: '/v0/status?depositAddress=0x000000000000000000000000000000000000dEaD', headers: { 'X-API-Key': 'not-a-real-jwt' } });
  console.log(`s4-bad-key: HTTP ${rec.response.status}`, JSON.stringify(rec.response.body).slice(0, 300));
}
// tokens with a bad key
{
  const rec = await call('t4-tokens-bad-key', { method: 'GET', path: '/v0/tokens', headers: { 'X-API-Key': 'not-a-real-jwt' } });
  console.log(`t4-tokens-bad-key: HTTP ${rec.response.status}`, Array.isArray(rec.response.body) ? `array(${rec.response.body.length})` : JSON.stringify(rec.response.body).slice(0, 200));
}
saveAll('batch04.json');
