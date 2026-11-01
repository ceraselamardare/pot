// THROWAWAY: compiles+runs the server snippet from kb/meta-tx-relayer.md verbatim
import { deserialize } from 'borsh';                 // pin borsh@2.0.0
import { sha256 } from '@noble/hashes/sha2.js';      // pin @noble/hashes@2.2.0
import { Account, SCHEMA, PublicKey, actions, base64Decode, baseEncode, encodeDelegateAction, encodeSignedDelegate } from 'near-api-js';
const safeJson = (b: number[]) => { try { return JSON.parse(new TextDecoder().decode(Uint8Array.from(b))); } catch { return null; } };

export function decode(b64: string) {
  const bytes = base64Decode(b64);
  const sd: any = deserialize(SCHEMA.SignedDelegate, bytes);
  const re = encodeSignedDelegate(sd);                               // reject non-canonical encodings
  if (re.length !== bytes.length || re.some((b, i) => b !== bytes[i])) throw new Error('non-canonical');
  const da = sd.delegateAction, kv = Object.keys(da.publicKey)[0];  // 'ed25519Key' | 'secp256k1Key'
  return {
    sd, senderId: da.senderId as string, receiverId: da.receiverId as string,
    nonce: BigInt(da.nonce), maxBlockHeight: BigInt(da.maxBlockHeight),
    publicKey: `${kv === 'ed25519Key' ? 'ed25519' : 'secp256k1'}:${baseEncode(Uint8Array.from(da.publicKey[kv].data))}`,
    calls: da.actions.map((a: any) => a.functionCall ? { method: a.functionCall.methodName, gas: BigInt(a.functionCall.gas),
      deposit: BigInt(a.functionCall.deposit), args: safeJson(a.functionCall.args) }
      : { other: Object.keys(a)[0] }),
  };
}
// validate(d): 1) allowlist + caps (no RPC)  2) rate limit  3) signature:
//   const ok = PublicKey.from(d.publicKey).verify(sha256(encodeDelegateAction(d.sd.delegateAction)),
//                                                 Uint8Array.from(Object.values(d.sd.signature)[0].data));
// 4) head = (await provider.viewBlock({finality:'final'})).header.height;  require head+10 < maxBlockHeight <= head+600
// 5) ak = await provider.viewAccessKey({accountId: d.senderId, publicKey: d.publicKey, finalityQuery:{finality:'optimistic'}});
//    require d.nonce > ak.nonce && d.nonce > pendingNonce(sender,pk); if ak.permission !== 'FullAccess': 1 call, deposit 0, receiver+method match
export async function submit(relayer: Account, d: ReturnType<typeof decode>) {
  const res = await relayer.signAndSendTransaction({ receiverId: d.senderId, actions: [actions.signedDelegate(d.sd)],
    waitUntil: 'EXECUTED_OPTIMISTIC', throwOnFailure: false });
  const top = res.status as any;                         // {Failure} => delegate rejected on-chain (still paid ~0.00008 NEAR)
  const inner = res.receipts_outcome.find((r: any) => 'Failure' in r.outcome.status); // inner panic hides here
  return { txHash: res.transaction_outcome.id, outcome: top.Failure || inner ? 'failed' : 'success',
           error: top.Failure ?? (inner?.outcome.status as any)?.Failure };
}

// --- harness (throwaway): sign a delegate with U1 (no submit), decode with the KB snippet, verify signature ---
import { teraToGas } from 'near-api-js';
import { ROOT, WRAP, account } from './lib.ts';
import { signDelegateSimple } from './client.ts';
const U1 = account(`u1.${ROOT}`);
const { b64 } = await signDelegateSimple(U1, WRAP, [actions.functionCall('ft_transfer', { receiver_id: ROOT, amount: '1' }, teraToGas('30'), 1n)]);
const d = decode(b64);
const ok = PublicKey.from(d.publicKey).verify(sha256(encodeDelegateAction(d.sd.delegateAction)), Uint8Array.from((Object.values(d.sd.signature as any)[0] as any).data));
console.log(JSON.stringify({ senderId: d.senderId, receiverId: d.receiverId, nonce: String(d.nonce), calls: d.calls.map((c: any) => ({ ...c, gas: String(c.gas), deposit: String(c.deposit) })), sigOk: ok }));
void submit;
