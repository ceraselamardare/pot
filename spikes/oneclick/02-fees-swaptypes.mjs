// THROWAWAY. Batch 2: fee behaviour without JWT, swap types, slippage, insured, bad JWT. All dry:true.
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

const cases = [
  // fee injection on a NON-stable route (ETH on Base -> USDC on NEAR), 0.06 ETH
  ['q2-base-eth-to-near-usdc', q({ originAsset: A.BASE_ETH, amount: '60000000000000000' })],
  // stable but not same-asset (Base USDC -> NEAR USDT)
  ['q2-base-usdc-to-near-usdt', q({ destinationAsset: A.NEAR_USDT })],
  // our own appFee of 50 bps, unauthenticated
  ['q2-appfee50-unauth', q({ appFees: [{ recipient: ADDR.NEAR_REGISTERED, fee: 50 }] })],
  // appFee 480 unauth (docs: 480+25 > 500 => rejected)
  ['q2-appfee480-unauth', q({ appFees: [{ recipient: ADDR.NEAR_REGISTERED, fee: 480 }] })],
  // insured swap (+2 bps per spec)
  ['q2-insured', q({ insured: true })],
  // FLEX_INPUT band
  ['q2-flex-input-150', q({ swapType: 'FLEX_INPUT' })],
  ['q2-flex-input-150-slip300', q({ swapType: 'FLEX_INPUT', slippageTolerance: 300 })],
  // EXACT_OUTPUT slippage sensitivity
  ['q2-exact-output-slip0', q({ swapType: 'EXACT_OUTPUT', slippageTolerance: 0 })],
  ['q2-exact-output-slip10', q({ swapType: 'EXACT_OUTPUT', slippageTolerance: 10 })],
  ['q2-exact-output-slip50', q({ swapType: 'EXACT_OUTPUT', slippageTolerance: 50 })],
  // quoteWaitingTimeMs effect
  ['q2-wait3000', q({ quoteWaitingTimeMs: 3000 })],
];

for (const [name, body] of cases) {
  const rec = await call(name, { method: 'POST', path: '/v0/quote', body });
  console.log(summarizeQuote(rec), '| appFees echo:', JSON.stringify(rec.response.body?.quoteRequest?.appFees));
  await sleep(300);
}

// Garbage credentials: does the API reject or ignore them?
for (const [name, headers] of [
  ['q2-bad-xapikey', { 'X-API-Key': 'not-a-real-jwt' }],
  ['q2-bad-bearer', { Authorization: 'Bearer not-a-real-jwt' }],
  ['q2-bad-bearer-jwtshaped', { Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJl' }],
]) {
  const rec = await call(name, { method: 'POST', path: '/v0/quote', body: q(), headers });
  console.log(summarizeQuote(rec));
  await sleep(300);
}
saveAll('batch02.json');
