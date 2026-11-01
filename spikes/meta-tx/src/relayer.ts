// THROWAWAY spike: "server side" of a NEP-366 relayer (/api/relay) with near-api-js 7.3.1.
// decode base64 SignedDelegate -> validate (allowlist, deposit/gas caps, expiry, nonce, key, signature, rate limit) -> submit.
import { deserialize } from 'borsh'; // borsh@2.0.0 (dependency of near-api-js 7.3.1)
import { sha256 } from '@noble/hashes/sha2.js'; // @noble/hashes@2.2.0 (dependency of near-api-js 7.3.1)
import {
  Account,
  PublicKey,
  SCHEMA,
  actions,
  base64Decode,
  baseEncode,
  encodeDelegateAction,
  encodeSignedDelegate,
  type Provider,
  type SignedDelegate,
  type TxExecutionStatus,
} from 'near-api-js';

export type Rule = {
  receiver: string | RegExp; // exact account id or pattern
  methods: string[]; // allowed FunctionCall method names
  maxDeposit: bigint; // yocto per action (1n for ft_transfer_call)
  maxGas: bigint; // per action
  checkArgs?: (method: string, args: any) => string | null; // return reason to reject
};
export type Policy = { rules: Rule[]; minTtlBlocks: number; maxTtlBlocks: number; rate: { windowMs: number; max: number } };

export type Decoded = {
  sd: SignedDelegate; // raw borsh object, re-serializable as-is
  senderId: string;
  receiverId: string;
  nonce: bigint;
  maxBlockHeight: bigint;
  publicKey: string; // "ed25519:..."
  calls: { method: string; args: any; gas: bigint; deposit: bigint }[];
  otherActions: string[]; // names of non-FunctionCall actions (always rejected here)
};

const KEY_PREFIX: Record<string, string> = { ed25519Key: 'ed25519', secp256k1Key: 'secp256k1', mlDsa65Key: 'ml-dsa-65' };
const SIG_FIELD: Record<string, string> = { ed25519Signature: 'ed25519', secp256k1Signature: 'secp256k1', mlDsa65Signature: 'ml-dsa-65' };

export function decodeSignedDelegate(b64: string): Decoded {
  const bytes = base64Decode(b64);
  const raw = deserialize(SCHEMA.SignedDelegate, bytes) as any;
  // canonical-encoding check: re-encoding must give the exact same bytes
  const again = encodeSignedDelegate(raw);
  if (again.length !== bytes.length || again.some((b, i) => b !== bytes[i])) throw new Error('non-canonical encoding');
  const da = raw.delegateAction;
  const pkVariant = Object.keys(da.publicKey)[0];
  const publicKey = `${KEY_PREFIX[pkVariant]}:${baseEncode(Uint8Array.from(da.publicKey[pkVariant].data))}`;
  const calls: Decoded['calls'] = [];
  const otherActions: string[] = [];
  for (const a of da.actions) {
    const kind = Object.keys(a)[0];
    if (kind !== 'functionCall') { otherActions.push(kind); continue; }
    const fc = a.functionCall;
    let args: any = null;
    try { args = JSON.parse(new TextDecoder().decode(Uint8Array.from(fc.args))); } catch { args = '<non-json>'; }
    calls.push({ method: fc.methodName, args, gas: BigInt(fc.gas), deposit: BigInt(fc.deposit) });
  }
  return { sd: raw, senderId: da.senderId, receiverId: da.receiverId, nonce: BigInt(da.nonce), maxBlockHeight: BigInt(da.maxBlockHeight), publicKey, calls, otherActions };
}

const hits = new Map<string, number[]>(); // per-sender sliding window (in-memory; product: Postgres/Redis)

export async function validate(d: Decoded, policy: Policy, provider: Provider): Promise<{ ok: true } | { ok: false; reason: string }> {
  // 1. allowlist (cheap, no RPC) — reject before spending anything
  if (d.otherActions.length) return { ok: false, reason: `only FunctionCall allowed, got ${d.otherActions.join(',')}` };
  if (d.calls.length === 0) return { ok: false, reason: 'no actions' };
  const rule = policy.rules.find((r) => (typeof r.receiver === 'string' ? r.receiver === d.receiverId : r.receiver.test(d.receiverId)));
  if (!rule) return { ok: false, reason: `receiver ${d.receiverId} not on allowlist` };
  let totalGas = 0n;
  for (const c of d.calls) {
    if (!rule.methods.includes(c.method)) return { ok: false, reason: `method ${c.method} not allowed on ${d.receiverId}` };
    if (c.deposit > rule.maxDeposit) return { ok: false, reason: `deposit ${c.deposit} > cap ${rule.maxDeposit} (relayer would pay it)` };
    if (c.gas > rule.maxGas) return { ok: false, reason: `gas ${c.gas} > cap ${rule.maxGas}` };
    const why = rule.checkArgs?.(c.method, c.args);
    if (why) return { ok: false, reason: why };
    totalGas += c.gas;
  }
  if (totalGas > 300_000_000_000_000n) return { ok: false, reason: 'total gas > 300 Tgas' };
  // 2. rate limit per sender
  const now = Date.now();
  const w = (hits.get(d.senderId) ?? []).filter((t) => now - t < policy.rate.windowMs);
  if (w.length >= policy.rate.max) return { ok: false, reason: `rate limit: ${w.length}/${policy.rate.max} in ${policy.rate.windowMs}ms` };
  // 3. signature (NEP-461 prefix + sha256), checked locally so a bad signature never costs gas
  const hash = sha256(encodeDelegateAction(d.sd.delegateAction));
  const sigVariant = Object.keys(d.sd.signature as any)[0];
  const sigBytes = Uint8Array.from((d.sd.signature as any)[sigVariant].data);
  if (SIG_FIELD[sigVariant] !== d.publicKey.split(':')[0]) return { ok: false, reason: 'signature/key type mismatch' };
  if (!PublicKey.from(d.publicKey).verify(hash, sigBytes)) return { ok: false, reason: 'bad signature' };
  // 4. chain state: expiry window, key exists, nonce, permission
  const head = BigInt((await provider.viewBlock({ finality: 'final' })).header.height);
  if (d.maxBlockHeight <= head + BigInt(policy.minTtlBlocks)) return { ok: false, reason: `expired/expiring: maxBlockHeight ${d.maxBlockHeight} vs head ${head}` };
  if (d.maxBlockHeight > head + BigInt(policy.maxTtlBlocks)) return { ok: false, reason: `ttl too long: ${d.maxBlockHeight - head} blocks` };
  let ak;
  try {
    ak = await provider.viewAccessKey({ accountId: d.senderId, publicKey: d.publicKey, finalityQuery: { finality: 'optimistic' } });
  } catch (e: any) {
    return { ok: false, reason: `sender/key not found: ${String(e?.message ?? e).slice(0, 100)}` };
  }
  if (d.nonce <= BigInt(ak.nonce)) return { ok: false, reason: `nonce ${d.nonce} <= access key nonce ${ak.nonce} (replay/used)` };
  if (d.nonce >= head * 1_000_000n) return { ok: false, reason: 'nonce too large (>= height*1e6)' };
  const perm: any = ak.permission;
  if (perm !== 'FullAccess') {
    const fc = perm.FunctionCall;
    if (d.calls.length !== 1) return { ok: false, reason: 'function-call key: exactly 1 action' };
    if (d.calls[0].deposit > 0n) return { ok: false, reason: 'function-call key cannot attach deposit (DepositWithFunctionCall)' };
    if (fc.receiver_id !== d.receiverId) return { ok: false, reason: 'function-call key receiver mismatch' };
    if (fc.method_names.length && !fc.method_names.includes(d.calls[0].method)) return { ok: false, reason: 'function-call key method mismatch' };
  }
  w.push(now);
  hits.set(d.senderId, w);
  return { ok: true };
}

/** Submit: tx signer = relayer, tx receiver = delegate sender, single SignedDelegate action. */
export async function submit(relayer: Account, d: Decoded, waitUntil: TxExecutionStatus = 'FINAL') {
  return relayer.signAndSendTransaction({
    receiverId: d.senderId,
    actions: [actions.signedDelegate(d.sd)],
    waitUntil,
    throwOnFailure: false,
  });
}
