// THROWAWAY. Batch 3: referral effect, delivery options (INTENTS, customRecipientMsg, refund to INTENTS),
// recipient validation (unregistered / nonexistent NEAR accounts), and error shapes. All dry:true, no JWT.
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
const noRef = (o) => { const b = q(o); delete b.referral; return b; };

const cases = [
  // does `referral` change fee injection? (batch 1/2 had referral:'pot-spike' only in batch 1)
  ['q3-noref-usdc', noRef({})],
  ['q3-noref-eth', noRef({ originAsset: A.BASE_ETH, amount: '60000000000000000' })],
  ['q3-noref-appfee50', noRef({ appFees: [{ recipient: ADDR.NEAR_REGISTERED, fee: 50 }] })],
  // recipient variants
  ['q3-recipient-unregistered', q({ recipient: ADDR.NEAR_UNREGISTERED })],
  ['q3-recipient-nonexistent-named', q({ recipient: ADDR.NEAR_NONEXISTENT })],
  ['q3-recipient-nonexistent-implicit', q({ recipient: ADDR.NEAR_IMPLICIT_NONEXISTENT })],
  ['q3-recipient-invalid-format', q({ recipient: 'Not A Near Account!' })],
  ['q3-recipient-evm-on-near', q({ recipient: ADDR.EVM_REFUND })],
  // deliver into the user's Intents balance instead of their NEAR wallet
  ['q3-recipienttype-intents', q({ recipientType: 'INTENTS', recipient: ADDR.NEAR_UNREGISTERED })],
  // ft_transfer_call delivery to a contract with a custom msg (Rulebot-style)
  ['q3-custom-msg-registered', q({ recipient: ADDR.NEAR_REGISTERED, customRecipientMsg: JSON.stringify({ pot: 'lisbon-trip' }) })],
  ['q3-custom-msg-unregistered', q({ recipient: ADDR.NEAR_UNREGISTERED, customRecipientMsg: JSON.stringify({ pot: 'lisbon-trip' }) })],
  ['q3-custom-msg-intents-type', q({ recipientType: 'INTENTS', customRecipientMsg: '{"pot":"x"}' })],
  // refund to the member's NEAR Intents account instead of an origin-chain address
  ['q3-refund-intents', q({ refundType: 'INTENTS', refundTo: ADDR.NEAR_UNREGISTERED })],
  // refund address on the wrong chain
  ['q3-refund-near-acct-as-origin', q({ refundType: 'ORIGIN_CHAIN', refundTo: ADDR.NEAR_UNREGISTERED })],
  ['q3-refund-sol-addr-for-base', q({ refundType: 'ORIGIN_CHAIN', refundTo: ADDR.SOL_REFUND })],
  // amounts
  ['q3-amount-1usdc', q({ amount: '1000000' })],
  ['q3-amount-0.10usdc', q({ amount: '100000' })],
  ['q3-amount-0.01usdc', q({ amount: '10000' })],
  ['q3-amount-1unit', q({ amount: '1' })],
  ['q3-amount-decimal', q({ amount: '150.5' })],
  ['q3-amount-1M-usdc', q({ amount: '1000000000000' })],
  ['q3-exact-output-1usdc', q({ swapType: 'EXACT_OUTPUT', amount: '1000000' })],
  // deadlines
  ['q3-deadline-past', q({ deadline: new Date(Date.now() - 60_000).toISOString() })],
  ['q3-deadline-2min', q({ deadline: inMin(2) })],
  ['q3-deadline-24h', q({ deadline: inMin(24 * 60) })],
  ['q3-deadline-30d', q({ deadline: inMin(30 * 24 * 60) })],
  // malformed
  ['q3-missing-recipient', (() => { const b = q(); delete b.recipient; return b; })()],
  ['q3-unknown-asset', q({ originAsset: 'nep141:base-0xdeadbeef.omft.near' })],
  ['q3-bad-swaptype', q({ swapType: 'EXACTLY' })],
  ['q3-same-asset', q({ originAsset: A.NEAR_USDC })],
  ['q3-any-input-unauth', q({ swapType: 'ANY_INPUT', originAsset: '1cs_v1:any', amount: '0', depositType: 'INTENTS', refundType: 'INTENTS', refundTo: ADDR.NEAR_REGISTERED })],
  ['q3-confidential-basic', q({ confidentiality: 'basic' })],
];

for (const [name, body] of cases) {
  const rec = await call(name, { method: 'POST', path: '/v0/quote', body });
  console.log(summarizeQuote(rec), '| fees:', JSON.stringify(rec.response.body?.quoteRequest?.appFees ?? null), rec.response.body?.quote?.customRecipientMsg ? '| customRecipientMsg echoed' : '');
  await sleep(250);
}
saveAll('batch03.json');
