// THROWAWAY. Batch 5: the published SDK (0.1.26) with NO token: getTokens, dry getQuote,
// getExecutionStatus on an unknown address, and verifyQuoteSignature on dry quotes. Read-only.
import { OpenAPI, OneClickService, QuoteRequest, ApiError, verifyQuoteSignature, quoteHash } from '@defuse-protocol/one-click-sdk-typescript';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const out = new URL('./out/', import.meta.url).pathname;
OpenAPI.BASE = 'https://1click.chaindefuser.com';
// OpenAPI.TOKEN deliberately NOT set.
const log = [];
const t = async (name, fn) => {
  const t0 = performance.now();
  try {
    const r = await fn();
    const ms = Math.round(performance.now() - t0);
    log.push({ name, ok: true, ms, result: r });
    console.log(`${name}: OK ${ms}ms`, typeof r === 'string' ? r : JSON.stringify(r).slice(0, 220));
  } catch (e) {
    const ms = Math.round(performance.now() - t0);
    const info = e instanceof ApiError ? { status: e.status, body: e.body, message: e.message } : { error: String(e) };
    log.push({ name, ok: false, ms, error: info });
    console.log(`${name}: ERR ${ms}ms`, JSON.stringify(info).slice(0, 300));
  }
};

await t('sdk-getTokens', async () => (await OneClickService.getTokens()).length + ' tokens');
let quote;
await t('sdk-getQuote-dry-base-exact-input', async () => {
  quote = await OneClickService.getQuote({
    dry: true,
    swapType: QuoteRequest.swapType.EXACT_INPUT,
    slippageTolerance: 100,
    originAsset: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near',
    depositType: QuoteRequest.depositType.ORIGIN_CHAIN,
    destinationAsset: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
    amount: '150000000',
    refundTo: 'pot.near',
    refundType: QuoteRequest.refundType.INTENTS,
    recipient: 'pot.near',
    recipientType: QuoteRequest.recipientType.DESTINATION_CHAIN,
    deadline: new Date(Date.now() + 3600_000).toISOString(),
  });
  return { quote: quote.quote, signature: quote.signature, timestamp: quote.timestamp, correlationId: quote.correlationId };
});
await t('sdk-verifyQuoteSignature(sdk dry quote)', async () => ({ valid: verifyQuoteSignature(quote), hash: quoteHash(quote) }));
await t('sdk-verifyQuoteSignature(tampered amountOut)', async () => ({ valid: verifyQuoteSignature({ ...quote, quote: { ...quote.quote, amountOut: '999999999' } }) }));
await t('sdk-getExecutionStatus-unknown', async () => OneClickService.getExecutionStatus('0x000000000000000000000000000000000000dEaD'));

// Verify signatures of the raw-fetch dry quotes saved by batches 1-4
let valid = 0, invalid = 0;
for (const f of readdirSync(out).filter((f) => /^q[1-4]-.*\.json$/.test(f))) {
  const rec = JSON.parse(readFileSync(out + f, 'utf8'));
  const b = rec.response.body;
  if (!b?.signature) continue;
  verifyQuoteSignature(b) ? valid++ : (invalid++, console.log('  invalid signature:', f));
}
console.log(`raw dry quotes: ${valid} valid signatures, ${invalid} invalid`);
log.push({ name: 'raw-dry-quote-signatures', valid, invalid });
writeFileSync(out + 'batch05-sdk.json', JSON.stringify(log, null, 2));
