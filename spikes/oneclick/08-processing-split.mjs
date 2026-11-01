// THROWAWAY. Batch 8: for public swaps currently in PROCESSING (listed on explorer.near-intents.org), compare
// origin-chain deposit block time with status.updatedAt (time it entered PROCESSING?) and then poll every 4 s
// until terminal (max 10 min) to split detection time vs processing time. Read-only, no funds.
import { readFileSync, writeFileSync } from 'node:fs';
const OUT = new URL('./out/', import.meta.url).pathname;
const BASE = 'https://1click.chaindefuser.com';
const EVM_RPC = { base: 'https://mainnet.base.org', arb: 'https://arb1.arbitrum.io/rpc', eth: 'https://ethereum-rpc.publicnode.com' };
const SOL_RPC = 'https://api.mainnet-beta.solana.com';
const rpc = async (u, m, p) => (await (await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: m, params: p }) })).json()).result;
const chainOf = (a) => (/^nep141:(base|arb|eth|sol)[-.]/.exec(a || '') || [])[1];
async function blockTime(chain, hash) {
  try {
    if (EVM_RPC[chain]) { const rc = await rpc(EVM_RPC[chain], 'eth_getTransactionReceipt', [hash]); if (!rc) return null; const b = await rpc(EVM_RPC[chain], 'eth_getBlockByNumber', [rc.blockNumber, false]); return parseInt(b.timestamp, 16) * 1000; }
    if (chain === 'sol') { const tx = await rpc(SOL_RPC, 'getTransaction', [hash, { maxSupportedTransactionVersion: 0 }]); return tx?.blockTime ? tx.blockTime * 1000 : null; }
  } catch { return null; }
  return null;
}
const list = JSON.parse(readFileSync(OUT + 'watch2-candidates.json', 'utf8')).filter((c) => Date.now() - Date.parse(c.createdAt) < 30 * 60_000);
const st = {};
for (const c of list) st[c.tag] = { ...c, seen: [] };
const t0 = Date.now();
while (Date.now() - t0 < 10 * 60_000) {
  const active = Object.values(st).filter((s) => !['SUCCESS', 'REFUNDED', 'FAILED'].includes(s.seen.at(-1)?.status));
  if (!active.length) break;
  for (const s of active) {
    try {
      const b = await (await fetch(`${BASE}/v0/status?depositAddress=${encodeURIComponent(s.depositAddress)}${s.depositMemo ? '&depositMemo=' + encodeURIComponent(s.depositMemo) : ''}`)).json();
      const last = s.seen.at(-1);
      if (!last || last.status !== b.status || last.updatedAt !== b.updatedAt) {
        const oh = b.swapDetails?.originChainTxHashes?.[0]?.hash;
        if (oh && !s.originBlockMs) s.originBlockMs = await blockTime(chainOf(b.quoteResponse?.quoteRequest?.originAsset), oh);
        s.seen.push({ at: new Date().toISOString(), status: b.status, updatedAt: b.updatedAt, nOrigin: b.swapDetails?.originChainTxHashes?.length ?? 0 });
        console.log(s.tag, b.status, 'seen', new Date().toISOString().slice(11, 19), 'updatedAt', b.updatedAt?.slice(11, 19), 'originBlock', s.originBlockMs ? new Date(s.originBlockMs).toISOString().slice(11, 19) : '-');
      }
    } catch {}
  }
  writeFileSync(OUT + 'batch08-processing.json', JSON.stringify(Object.values(st), null, 2));
  await new Promise((r) => setTimeout(r, 4000));
}
writeFileSync(OUT + 'batch08-processing.json', JSON.stringify(Object.values(st), null, 2));
console.log('done');
