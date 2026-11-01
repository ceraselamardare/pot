// THROWAWAY. Batch 7: watch PUBLIC, freshly created PENDING_DEPOSIT quotes (other people's, listed on
// explorer.near-intents.org) with read-only GET /v0/status every 15 s for 20 min, and log every status
// transition with local wall-clock time. Purpose: observe real PENDING -> (KNOWN_DEPOSIT_TX) -> PROCESSING ->
// SUCCESS/REFUNDED timings for the DepositStepper. No funds, no writes. ~240 req/min (limit 1200/min unauth).
import { readFileSync, writeFileSync } from 'node:fs';

const OUT = new URL('./out/', import.meta.url).pathname;
const list = JSON.parse(readFileSync(OUT + 'watch-candidates.json', 'utf8'));
const BASE = 'https://1click.chaindefuser.com';
const TERMINAL = new Set(['SUCCESS', 'REFUNDED', 'FAILED']);
const POLL_MS = 15_000, DURATION_MS = 20 * 60_000;
const state = Object.fromEntries(list.map((c) => [c.tag, { ...c, last: null, transitions: [] }]));
const t0 = Date.now();

async function pollOne(s) {
  const qs = 'depositAddress=' + encodeURIComponent(s.depositAddress) + (s.depositMemo ? '&depositMemo=' + encodeURIComponent(s.depositMemo) : '');
  try {
    const res = await fetch(`${BASE}/v0/status?${qs}`);
    if (res.status === 429) return console.log('429 rate limited');
    const b = await res.json();
    if (b.status !== s.last) {
      const sd = b.swapDetails ?? {};
      const tr = { seenAt: new Date().toISOString(), status: b.status, updatedAt: b.updatedAt, deposited: sd.depositedAmountFormatted ?? null, amountOut: sd.amountOutFormatted ?? null, refunded: sd.refundedAmountFormatted ?? null, refundReason: sd.refundReason ?? null, nOriginTx: sd.originChainTxHashes?.length ?? 0, nDestTx: sd.destinationChainTxHashes?.length ?? 0 };
      s.transitions.push(tr);
      if (s.last !== null) console.log(`${s.tag} ${s.last} -> ${b.status} at ${tr.seenAt} (updatedAt ${b.updatedAt}) deposited=${tr.deposited}`);
      s.last = b.status;
    }
  } catch (e) { /* transient */ }
}

while (Date.now() - t0 < DURATION_MS) {
  const active = Object.values(state).filter((s) => !TERMINAL.has(s.last));
  if (!active.length) break;
  await Promise.all(active.map((s, i) => new Promise((r) => setTimeout(() => pollOne(s).then(r), i * 150))));
  writeFileSync(OUT + 'batch07-transitions.json', JSON.stringify(Object.values(state), null, 2));
  await new Promise((r) => setTimeout(r, POLL_MS));
}
const moved = Object.values(state).filter((s) => s.transitions.length > 1);
console.log(`done: ${moved.length}/${list.length} addresses changed status`);
writeFileSync(OUT + 'batch07-transitions.json', JSON.stringify(Object.values(state), null, 2));
