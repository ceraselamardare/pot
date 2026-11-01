// THROWAWAY: type-check of the onboarding snippet from kb/accounts-onboarding.md (not executed)
import { Account, PublicKey, actions, keyToImplicitAddress, nearToYocto, teraToGas } from 'near-api-js';
// relayer: Account for the PARENT (or a MultiKeySigner holding the parent's keys)
async function onboard(relayer: Account, userPk: string, accountId: string, usdc: string) {
  const create = relayer.signAndSendTransaction({            // (a) named sub-account, 0 NEAR
    receiverId: accountId,                                  // e.g. `u-${nanoid(8)}.${relayer.accountId}` (≤ 64 chars)
    actions: [actions.createAccount(), actions.addFullAccessKey(PublicKey.from(userPk))],
    waitUntil: 'EXECUTED_OPTIMISTIC',
  });
  const register = relayer.signAndSendTransaction({          // FT registration can precede account existence
    receiverId: usdc,
    actions: [actions.functionCall('storage_deposit', { account_id: accountId, registration_only: true }, teraToGas('30'), nearToYocto('0.00125'))],
    waitUntil: 'EXECUTED_OPTIMISTIC',
  });
  const [c, r] = await Promise.all([create, register]);     // same Account instance => NonceManager hands out 2 nonces
  return { createTx: c.transaction_outcome.id, registerTx: r.transaction_outcome.id };
}
// (b) implicit:   receiverId: keyToImplicitAddress(userPk), actions: [actions.transfer(0n)]
// (c) .testnet:   receiverId: 'testnet', actions: [actions.functionCall('create_account',
//                   { new_account_id: 'name.testnet', new_public_key: userPk }, teraToGas('60'), 0n)]   // returns true

export { onboard };
