// THROWAWAY. Batch 6: read-only GET /v0/status on PUBLIC deposit addresses listed on explorer.near-intents.org
// (other people's historical swaps), to capture real status payload shapes and measure delivery times.
// Timing = origin-chain deposit block time (public RPC) -> status.updatedAt (when 1Click marked it final).
// No funds, no writes. Input: out/explorer-candidates.json [{depositAddress, depositMemo, tag}]
import { readFileSync, writeFileSync } from 'node:fs';
import { call, sleep } from './lib.mjs';

const OUT = new URL('./out/', import.meta.url).pathname;
const candidates = JSON.parse(readFileSync(OUT + 'explorer-candidates.json', 'utf8'));

const EVM_RPC = { base: 'https://mainnet.base.org', arb: 'https://arb1.arbitrum.io/rpc', eth: 'https://ethereum-rpc.publicnode.com' };
const SOL_RPC = 'https://api.mainnet-beta.solana.com';

async function rpc(url, method, params) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  return (await r.json()).result;
}
function chainOf(assetId) {
  const m = /^nep141:(base|arb|eth|sol)[-.]/.exec(assetId || '');
  return m ? m[1] : (assetId?.startsWith('nep141:') ? 'near?' : 'other');
}
async function originTime(chain, hash) {
  try {
    if (EVM_RPC[chain]) {
      const rc = await rpc(EVM_RPC[chain], 'eth_getTransactionReceipt', [hash]);
      if (!rc) return null;
      const b = await rpc(EVM_RPC[chain], 'eth_getBlockByNumber', [rc.blockNumber, false]);
      return new Date(parseInt(b.timestamp, 16) * 1000).toISOString();
    }
    if (chain === 'sol') {
      const tx = await rpc(SOL_RPC, 'getTransaction', [hash, { maxSupportedTransactionVersion: 0, encoding: 'json' }]);
      return tx?.blockTime ? new Date(tx.blockTime * 1000).toISOString() : null;
    }
  } catch { return null; }
  return null;
}
const short = (s) => (typeof s === 'string' && s.length > 14 ? s.slice(0, 6) + '…' + s.slice(-4) : s);

const rows = [];
for (const c of candidates) {
  const qs = 'depositAddress=' + encodeURIComponent(c.depositAddress) + (c.depositMemo ? '&depositMemo=' + encodeURIComponent(c.depositMemo) : '');
  const rec = await call('s6-' + c.tag, { path: '/v0/status?' + qs });
  const b = rec.response.body;
  if (rec.response.status !== 200) { rows.push({ tag: c.tag, http: rec.response.status, body: b }); continue; }
  const qr = b.quoteResponse?.quoteRequest ?? {}; const q = b.quoteResponse?.quote ?? {}; const sd = b.swapDetails ?? {};
  const chain = chainOf(qr.originAsset);
  const oHash = sd.originChainTxHashes?.[0]?.hash;
  const oTime = oHash ? await originTime(chain, oHash) : null;
  const secs = (a, z) => (a && z ? Math.round((Date.parse(z) - Date.parse(a)) / 1000) : null);
  rows.push({
    tag: c.tag, status: b.status, originChain: chain, swapType: qr.swapType, depositType: qr.depositType, recipientType: qr.recipientType, refundType: qr.refundType,
    origin: qr.originAsset, dest: qr.destinationAsset,
    amountIn: q.amountInFormatted, minAmountIn: q.minAmountIn, deposited: sd.depositedAmountFormatted, amountOut: sd.amountOutFormatted,
    refunded: sd.refundedAmountFormatted, refundReason: sd.refundReason, refundFee: sd.refundFee, withdrawFee: sd.withdrawFee,
    quoteAt: b.quoteResponse?.timestamp, reqDeadline: qr.deadline, quoteDeadline: q.deadline, timeWhenInactive: q.timeWhenInactive, timeEstimate: q.timeEstimate,
    originTx: short(oHash), originTxAt: oTime, updatedAt: b.updatedAt,
    depositToFinalSec: secs(oTime, b.updatedAt), quoteToFinalSec: secs(b.quoteResponse?.timestamp, b.updatedAt),
    nOriginTx: sd.originChainTxHashes?.length, nDestTx: sd.destinationChainTxHashes?.length, nNearTx: sd.nearTxHashes?.length, nIntent: sd.intentHashes?.length,
    deadlineExtendedH: qr.deadline && q.deadline ? Math.round((Date.parse(q.deadline) - Date.parse(qr.deadline)) / 3600e3) : null,
  });
  await sleep(400);
}
writeFileSync(OUT + 'batch06-real-status-summary.json', JSON.stringify(rows, null, 2));
for (const r of rows) console.log(JSON.stringify(r));
