// THROWAWAY: type-check of the client snippet from kb/meta-tx-relayer.md (not executed)
declare const RPC_URL: string, accountId: string, secretKey: `ed25519:${string}`, USDC: string, RULEBOT: string;
import { Account, JsonRpcProvider, KeyPairSigner, actions, teraToGas, encodeSignedDelegate, base64Encode } from 'near-api-js'; // 7.3.1
const provider = new JsonRpcProvider({ url: RPC_URL });
const user = new Account(accountId, provider, KeyPairSigner.fromSecretKey(secretKey)); // any Signer (FAK needed for 1 yocto)
const { signedDelegate } = await user.createSignedMetaTransaction({
  receiverId: USDC,
  actions: [actions.functionCall('ft_transfer_call',
    { receiver_id: RULEBOT, amount: '150000000', msg: JSON.stringify({ pot: 'lisbon' }) }, teraToGas('150'), 1n)],
  blockHeightTtl: 120, // ~67 s at 555 ms/block
});
await fetch('/api/relay', { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ signedDelegate: base64Encode(encodeSignedDelegate(signedDelegate)) }) });

export {};
