// THROWAWAY Phase 0 spike helper (Pot). Never import into the product.
// Read-only calls only: GET /v0/tokens, POST /v0/quote with dry:true, GET /v0/status.
import { writeFileSync, mkdirSync } from 'node:fs';

export const BASE = 'https://1click.chaindefuser.com';
export const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

export const A = {
  NEAR_USDC: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
  BASE_USDC: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near',
  ARB_USDC: 'nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near',
  ETH_USDC: 'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near',
  SOL_USDC: 'nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near',
  POL_USDC: 'nep245:v2_1.omni.hot.tg:137_qiStmoQJDQPTebaPjgx5VBxZv6L',
  BSC_USDC: 'nep245:v2_1.omni.hot.tg:56_2w93GqMcEmQFDru84j3HZZWt557r',
  OP_USDC: 'nep245:v2_1.omni.hot.tg:10_A2ewyUyDp6qsue1jqZsGypkCxRJ',
  BASE_ETH: 'nep141:base.omft.near',
  NEAR_USDT: 'nep141:usdt.tether-token.near',
};

// Example/placeholder addresses (docs examples). No funds are ever sent anywhere.
export const ADDR = {
  EVM_REFUND: '0x2527D02599Ba641c19FEa793cD0F167589a0f10D',
  SOL_REFUND: '13QkxhNMrTPxoCkRdYdJ65tFuwXPhL5gLS2Z5Nr6gjRK',
  NEAR_REGISTERED: 'near', // exists, USDC storage registered (checked via RPC 2026-10-21)
  NEAR_UNREGISTERED: 'pot.near', // exists, NOT registered for USDC storage
  NEAR_NONEXISTENT: 'pot-hackathon-nonexistent-zz9.near', // does not exist
  NEAR_IMPLICIT_NONEXISTENT: '0000000000000000000000000000000000000000000000000000000000c0ffee',
};

export const inMin = (m) => new Date(Date.now() + m * 60_000).toISOString();

const results = [];

export async function call(name, { method = 'GET', path, body, headers = {} }) {
  const url = BASE + path;
  const h = { 'content-type': 'application/json', ...headers };
  const t0 = performance.now();
  let status, resHeaders = {}, json, text;
  try {
    const res = await fetch(url, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
    status = res.status;
    for (const [k, v] of res.headers) if (/ratelimit|retry-after|content-type|x-correlation|x-request/i.test(k)) resHeaders[k] = v;
    text = await res.text();
    try { json = JSON.parse(text); } catch { json = undefined; }
  } catch (e) {
    status = 'NETWORK_ERROR';
    text = String(e);
  }
  const ms = Math.round(performance.now() - t0);
  const safeHeaders = Object.fromEntries(Object.entries(h).map(([k, v]) => [k, /authorization|api-key/i.test(k) ? '<redacted>' : v]));
  const rec = { name, at: new Date().toISOString(), request: { method, url, headers: safeHeaders, body }, response: { status, ms, headers: resHeaders, body: json ?? text } };
  results.push(rec);
  writeFileSync(OUT + name + '.json', JSON.stringify(rec, null, 2));
  return rec;
}

export function summarizeQuote(rec) {
  const b = rec.response.body;
  if (!(rec.response.status >= 200 && rec.response.status < 300) || !b?.quote) {
    return `${rec.name}: HTTP ${rec.response.status} ${rec.response.ms}ms ${JSON.stringify(b).slice(0, 300)}`;
  }
  const q = b.quote;
  return `${rec.name}: HTTP ${rec.response.status} ${rec.response.ms}ms in=${q.amountInFormatted} (min ${q.minAmountIn}) out=${q.amountOutFormatted} (min ${q.minAmountOut}) inUsd=${q.amountInUsd} outUsd=${q.amountOutUsd} t=${q.timeEstimate}s withdrawFee=${q.withdrawFee ?? '-'} refundFee=${q.refundFee ?? '-'} rl=${rec.response.headers['x-ratelimit-remaining-unauth'] ?? rec.response.headers['x-ratelimit-remaining'] ?? '-'}`;
}

export function saveAll(file) {
  writeFileSync(OUT + file, JSON.stringify(results, null, 2));
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
