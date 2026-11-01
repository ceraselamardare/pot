// THROWAWAY spike 3b: sponsored onboarding variants, all paid by R. For each: cost (tokens burnt), latency to FINAL,
// storage bytes of the new account. Then R pays storage_deposit on wrap.testnet for the new account, R sends it 0.001 wNEAR,
// and the new (possibly 0-NEAR) account does a relayed 1-yocto ft_transfer back to R.
import { KeyPair, actions, keyToImplicitAddress, nearToYocto, teraToGas } from 'near-api-js';
import { ROOT, WRAP, account, nearState, settledNear, summarize, printSummary, appendLog, ms, provider, saveKey, fmtNear, ftBalance } from './lib.ts';
import { signDelegateSimple } from './client.ts';
import { decodeSignedDelegate, submit } from './relayer.ts';

const R = account(ROOT);
const ser = (x: unknown) => JSON.stringify(x, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));

type Variant = { name: string; id: (kp: KeyPair) => string; tx: (id: string, kp: KeyPair) => Promise<any> };
const VARIANTS: Variant[] = [
  {
    name: 'named sub-account, 0 NEAR (CreateAccount+AddKey)',
    id: () => `u2z${Date.now() % 100000}.${ROOT}`,
    tx: (id, kp) => R.signAndSendTransaction({ receiverId: id, actions: [actions.createAccount(), actions.addFullAccessKey(kp.getPublicKey())], waitUntil: 'FINAL' }),
  },
  {
    name: 'named sub-account, 0.01 NEAR (CreateAccount+Transfer+AddKey)',
    id: () => `u2f${Date.now() % 100000}.${ROOT}`,
    tx: (id, kp) => R.signAndSendTransaction({ receiverId: id, actions: [actions.createAccount(), actions.transfer(nearToYocto('0.01')), actions.addFullAccessKey(kp.getPublicKey())], waitUntil: 'FINAL' }),
  },
  {
    name: 'implicit account, Transfer 0 yocto',
    id: (kp) => keyToImplicitAddress(kp.getPublicKey()),
    tx: (id) => R.signAndSendTransaction({ receiverId: id, actions: [actions.transfer(0n)], waitUntil: 'FINAL', throwOnFailure: false }),
  },
  {
    name: 'implicit account, Transfer 1 yocto',
    id: (kp) => keyToImplicitAddress(kp.getPublicKey()),
    tx: (id) => R.signAndSendTransaction({ receiverId: id, actions: [actions.transfer(1n)], waitUntil: 'FINAL' }),
  },
  {
    name: 'top-level .testnet via registrar `testnet`.create_account, 0 deposit',
    id: () => `potspike-relay-yoqw-t${Date.now() % 10000}.testnet`,
    tx: (id, kp) => R.signAndSendTransaction({
      receiverId: 'testnet',
      actions: [actions.functionCall('create_account', { new_account_id: id, new_public_key: kp.getPublicKey().toString() }, teraToGas('60'), 0n)],
      waitUntil: 'FINAL', throwOnFailure: false,
    }),
  },
];

async function onboard(v: Variant) {
  const kp = KeyPair.fromRandom('ed25519');
  const id = v.id(kp);
  saveKey(id, kp);
  const r0 = await settledNear(ROOT);
  const t0 = ms();
  // account creation and token registration in parallel (FT contracts accept registering a not-yet-existing id)
  const [res, reg] = await Promise.all([
    v.tx(id, kp),
    R.signAndSendTransaction({
      receiverId: WRAP,
      actions: [actions.functionCall('storage_deposit', { account_id: id, registration_only: true }, teraToGas('30'), nearToYocto('0.00125'))],
      waitUntil: 'FINAL',
    }),
  ]);
  const t1 = ms();
  const s = summarize(res); const sr = summarize(reg);
  printSummary(`${v.name}: ${id}`, s);
  printSummary(`storage_deposit for ${id}`, sr);
  const st = await nearState(id);
  const r1 = await settledNear(ROOT);
  const out: any = {
    variant: v.name, account_id: id, create_tx: s.link, storage_tx: sr.link, create_status: s.status, create_failures: s.failures.map((f) => f.status),
    exists: st.exists, storage_usage: st.storage, balance: st.amount,
    create_tokens_burnt: s.burnt, create_gas: s.gas, storage_deposit_tokens_burnt: sr.burnt,
    relayer_total_delta: r1.amount - r0.amount, parallel_create_and_register_ms: t1 - t0,
  };
  if (st.exists) {
    // fund 0.001 wNEAR from R and have the new account send 1 unit back via a relayed delegate (relayer pays 1 yocto + gas)
    await R.signAndSendTransaction({ receiverId: WRAP, actions: [actions.functionCall('ft_transfer', { receiver_id: id, amount: '1000000000000000000000' }, teraToGas('30'), 1n)], waitUntil: 'FINAL' });
    const U = account(id);
    const u0 = await settledNear(id);
    const t2 = ms();
    const { b64 } = await signDelegateSimple(U, WRAP, [actions.functionCall('ft_transfer', { receiver_id: ROOT, amount: '1' }, teraToGas('30'), 1n)]);
    const rr = await submit(R, decodeSignedDelegate(b64), 'FINAL');
    const t3 = ms();
    const sx = summarize(rr);
    printSummary(`first relayed ft_transfer from ${id}`, sx);
    const u1 = await settledNear(id);
    Object.assign(out, { first_relay_tx: sx.link, first_relay_status: sx.status, first_relay_failures: sx.failures.map((f) => f.status), first_relay_ms: t3 - t2, user_near_delta_on_relay: u1.amount - u0.amount, user_wnear: await ftBalance(WRAP, id) });
  }
  console.log(ser(out));
  appendLog('05-onboarding', out);
}

async function main() {
  const only = process.argv[2];
  for (const v of VARIANTS) if (!only || v.name.includes(only)) await onboard(v);
  console.log(`R now ${fmtNear((await settledNear(ROOT)).amount)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
