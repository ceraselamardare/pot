// THROWAWAY spike: "browser side" of a NEP-366 meta transaction with near-api-js 7.3.1.
// The user's key signs a DelegateAction; the result is borsh-encoded + base64 for transport to /api/relay.
import {
  Account,
  buildDelegateAction,
  encodeSignedDelegate,
  base64Encode,
  type Action,
  type SignedDelegate,
} from 'near-api-js';

/** Variant A (one call): nonce = access_key.nonce + 1, maxBlockHeight = head(optimistic) + ttl. */
export async function signDelegateSimple(user: Account, receiverId: string, actions: Action[], ttl = 120) {
  const { signedDelegate, delegateHash } = await user.createSignedMetaTransaction({ receiverId, actions, blockHeightTtl: ttl });
  return { signedDelegate, delegateHash, b64: base64Encode(encodeSignedDelegate(signedDelegate)) };
}

/** Variant B (explicit): lets the caller pick nonce / maxBlockHeight (used by negative tests). */
export async function signDelegateManual(
  user: Account,
  receiverId: string,
  actions: Action[],
  opts: { nonce?: bigint; maxBlockHeight?: bigint; ttl?: number } = {},
): Promise<{ signedDelegate: SignedDelegate; b64: string; nonce: bigint; maxBlockHeight: bigint }> {
  const signer = user.getSigner();
  if (!signer) throw new Error('no signer');
  const publicKey = await signer.getPublicKey();
  const [ak, block] = await Promise.all([
    user.provider.viewAccessKey({ accountId: user.accountId, publicKey, finalityQuery: { finality: 'optimistic' } }),
    user.provider.viewBlock({ finality: 'final' }),
  ]);
  const nonce = opts.nonce ?? BigInt(ak.nonce) + 1n;
  const maxBlockHeight = opts.maxBlockHeight ?? BigInt(block.header.height) + BigInt(opts.ttl ?? 120);
  const delegateAction = buildDelegateAction({ senderId: user.accountId, receiverId, actions, nonce, maxBlockHeight, publicKey });
  const { signedDelegate } = await signer.signDelegateAction(delegateAction);
  return { signedDelegate, b64: base64Encode(encodeSignedDelegate(signedDelegate)), nonce, maxBlockHeight };
}
