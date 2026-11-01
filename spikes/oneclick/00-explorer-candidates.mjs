// THROWAWAY. Builds the candidate lists used by 06/07/08 from PUBLIC explorer.near-intents.org pages.
// The Explorer API needs a JWT, but the website server-renders the latest swaps into its Next.js flight data
// (self.__next_f.push([...,"<json-escaped text>"])). We decode that text and pull out every JSON object that
// has a "depositAddress". Read-only. Usage:
//   node 00-explorer-candidates.mjs history     -> out/explorer-candidates.json   (for 06-real-status.mjs)
//   node 00-explorer-candidates.mjs pending     -> out/watch-candidates.json      (for 07-watch-transitions.mjs)
//   node 00-explorer-candidates.mjs processing  -> out/watch2-candidates.json     (for 08-processing-split.mjs)
import { writeFileSync } from 'node:fs';
const OUT = new URL('./out/', import.meta.url).pathname;
const mode = process.argv[2] ?? 'history';
const CH = ['base', 'arb', 'eth', 'sol'];
const USDC = new Set([
  'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near',
  'nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near',
  'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near',
  'nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near',
]);
const chainOf = (a) => (/^nep141:(base|arb|eth|sol)[-.]/.exec(a || '') || [])[1] ?? 'other';

function extract(html) {
  const blob = [...html.matchAll(/self\.__next_f\.push\(\[\d+,"((?:[^"\\]|\\.)*)"\]\)<\/script>/g)].map((m) => JSON.parse('"' + m[1] + '"')).join('');
  const out = [];
  for (const m of blob.matchAll(/"depositAddress"/g)) {
    // walk back to the enclosing '{' (depth-aware, ignoring braces inside strings is approximated by JSON.parse below)
    let depth = 0, i = m.index;
    while (--i >= 0) { const c = blob[i]; if (c === '}') depth++; else if (c === '{') { if (depth === 0) break; depth--; } }
    if (i < 0) continue;
    // walk forward to the matching '}' respecting strings
    let j = i, d = 0, inStr = false, esc = false;
    for (; j < blob.length; j++) {
      const c = blob[j];
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true; else if (c === '{') d++; else if (c === '}') { d--; if (d === 0) break; }
    }
    try { const o = JSON.parse(blob.slice(i, j + 1)); if (o.depositAddress && o.status) out.push(o); } catch {}
  }
  return out;
}
async function page(qs) {
  const r = await fetch('https://explorer.near-intents.org/?' + qs, { signal: AbortSignal.timeout(45_000) });
  return extract(await r.text());
}

const rows = new Map();
const add = (list) => list.forEach((o) => rows.set(o.depositAddress + '|' + (o.depositMemo ?? ''), o));
if (mode === 'history') {
  for (const c of CH) for (const s of ['SUCCESS', 'REFUNDED', 'FAILED']) add(await page(`fromChainId=${c}&status=${s}`));
  add(await page('status=INCOMPLETE_DEPOSIT')); add(await page('status=PROCESSING'));
  const oc = [...rows.values()].filter((o) => o.depositType === 'ORIGIN_CHAIN');
  const cands = [];
  for (const c of CH) {
    const ok = oc.filter((o) => o.status === 'SUCCESS' && chainOf(o.originAsset) === c && USDC.has(o.originAsset))
      .sort((a, b) => Number(!(a.destinationAsset.startsWith('nep141:17208628') || a.recipientType === 'INTENTS')) - Number(!(b.destinationAsset.startsWith('nep141:17208628') || b.recipientType === 'INTENTS')));
    ok.slice(0, 8).forEach((o, i) => cands.push({ depositAddress: o.depositAddress, depositMemo: o.depositMemo, tag: `oc-${c}-success-${i}` }));
    oc.filter((o) => o.status === 'REFUNDED' && chainOf(o.originAsset) === c).slice(0, 5).forEach((o, i) => cands.push({ depositAddress: o.depositAddress, depositMemo: o.depositMemo, tag: `oc-${c}-refunded-${i}` }));
  }
  for (const s of ['FAILED', 'PROCESSING', 'INCOMPLETE_DEPOSIT']) oc.filter((o) => o.status === s).slice(0, 3).forEach((o, i) => cands.push({ depositAddress: o.depositAddress, depositMemo: o.depositMemo, tag: `oc-any-${s.toLowerCase()}-${i}` }));
  writeFileSync(OUT + 'explorer-candidates.json', JSON.stringify(cands, null, 1));
  console.log(`${rows.size} rows, ${oc.length} ORIGIN_CHAIN -> ${cands.length} candidates`);
} else {
  const status = mode === 'pending' ? 'PENDING_DEPOSIT' : 'PROCESSING';
  for (const c of CH) add(await page(`fromChainId=${c}&status=${status}`));
  add(await page(`status=${status}`));
  const sel = [...rows.values()].filter((o) => o.status === status && o.depositType === 'ORIGIN_CHAIN' && chainOf(o.originAsset) !== 'other')
    .filter((o) => mode !== 'pending' || USDC.has(o.originAsset))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, mode === 'pending' ? 60 : 20)
    .map((o, i) => ({ depositAddress: o.depositAddress, depositMemo: o.depositMemo, tag: `${mode[0]}-${chainOf(o.originAsset)}-${i}`, origin: o.originAsset, dest: o.destinationAsset, createdAt: o.createdAt }));
  writeFileSync(OUT + (mode === 'pending' ? 'watch-candidates.json' : 'watch2-candidates.json'), JSON.stringify(sel, null, 1));
  console.log(`${rows.size} rows -> ${sel.length} ${status} ORIGIN_CHAIN candidates`);
}
