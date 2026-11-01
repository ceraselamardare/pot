// THROWAWAY spike 3e: gasless Sputnik DAO vote. R creates a tiny DAO on sputnikv2.testnet (council = U1 + U2Z, bond 0,
// threshold 1/2 -> needs both votes). Then, all via relayed delegates:
//   1. U1 add_proposal(kind "Vote") with 0 deposit (bond 0)
//   2. U1 act_proposal VoteApprove (full-access key)
//   3. U2Z (0-NEAR zero-balance account) gets a function-call key {receiver: DAO, methods: [act_proposal]} via a relayed AddKey,
//      then votes with that FC key -> proposal becomes Approved.
import { KeyPair, actions, nearToYocto, teraToGas, base64Encode } from 'near-api-js';
import { ROOT, account, summarize, printSummary, appendLog, provider, view, saveKey, ms, nearState } from './lib.ts';
import { signDelegateSimple } from './client.ts';
import { decodeSignedDelegate, validate, submit, type Policy } from './relayer.ts';

const FACTORY = 'sputnikv2.testnet';
const NAME = 'potspike-relay-yoqw';
const DAO = `${NAME}.${FACTORY}`;
const U1_ID = `u1.${ROOT}`;
const U2Z_ID = 'u2z25811.potspike-relay-yoqw.testnet';
const R = account(ROOT);
const POLICY: Policy = {
  rules: [{ receiver: DAO, methods: ['add_proposal', 'act_proposal'], maxDeposit: 0n, maxGas: teraToGas('150') }],
  minTtlBlocks: 5, maxTtlBlocks: 600, rate: { windowMs: 60_000, max: 20 },
};
const ser = (x: unknown) => JSON.stringify(x, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));

async function relay(label: string, signerAcc: ReturnType<typeof account>, receiverId: string, acts: any[]) {
  const t0 = ms();
  const { b64 } = await signDelegateSimple(signerAcc, receiverId, acts);
  const d = decodeSignedDelegate(b64);
  if (receiverId === DAO) {
    const v = await validate(d, POLICY, provider);
    console.log(`[validator] ${label}: ${ser(v)}`);
    if (!v.ok) throw new Error(v.reason);
  }
  const s = summarize(await submit(R, d, 'FINAL'));
  printSummary(`${label} (${ms() - t0}ms)`, s);
  const out = { label, hash: s.hash, status: s.status, failures: s.failures.map((f) => f.status), gas: s.gas, burnt: s.burnt, ms: ms() - t0 };
  appendLog('10-dao-vote', out);
  return s;
}

async function main() {
  if (!(await nearState(DAO)).exists) {
    const policy = {
      roles: [{ name: 'council', kind: { Group: [U1_ID, U2Z_ID] }, permissions: ['*:AddProposal', '*:VoteApprove', '*:VoteReject', '*:VoteRemove'], vote_policy: {} }],
      default_vote_policy: { weight_kind: 'RoleWeight', quorum: '0', threshold: [1, 2] },
      proposal_bond: '0',
      proposal_period: '604800000000000',
      bounty_bond: '0',
      bounty_forgiveness_period: '86400000000000',
    };
    const args = { config: { name: NAME, purpose: 'pot phase-0 relayer spike (throwaway)', metadata: '' }, policy };
    const t0 = ms();
    const res = await R.signAndSendTransaction({
      receiverId: FACTORY,
      actions: [actions.functionCall('create', { name: NAME, args: base64Encode(new TextEncoder().encode(JSON.stringify(args))) }, teraToGas('300'), nearToYocto('5.6'))],
      waitUntil: 'FINAL', throwOnFailure: false,
    });
    const s = summarize(res);
    printSummary(`R creates DAO ${DAO} with 5.6 NEAR (${ms() - t0}ms)`, s);
    appendLog('10-dao-vote', { label: 'create dao', hash: s.hash, status: s.status, failures: s.failures.map((f) => f.status), burnt: s.burnt, gas: s.gas });
  }
  console.log('DAO state', ser(await nearState(DAO)));

  const U1 = account(U1_ID);
  const before = await view<number>(DAO, 'get_last_proposal_id');
  await relay('U1 add_proposal (Vote, 0 deposit) via relayer', U1, DAO, [
    actions.functionCall('add_proposal', { proposal: { description: 'Gasless vote spike: approve?', kind: 'Vote' } }, teraToGas('50'), 0n),
  ]);
  const id = (await view<number>(DAO, 'get_last_proposal_id')) - 1;
  console.log(`proposal id=${id} (last id before=${before})`);
  await relay('U1 act_proposal VoteApprove (FAK) via relayer', U1, DAO, [
    actions.functionCall('act_proposal', { id, action: 'VoteApprove', proposal: 'Vote' }, teraToGas('100'), 0n),
  ]);
  console.log('after U1 vote:', ser(await view(DAO, 'get_proposal', { id })));

  const fc = KeyPair.fromRandom('ed25519');
  saveKey(U2Z_ID, fc, '.fc-dao');
  await relay('U2Z relayed AddKey FC {DAO, [act_proposal]}', account(U2Z_ID), U2Z_ID, [
    actions.addFunctionCallAccessKey(fc.getPublicKey(), DAO, ['act_proposal'], 0n),
  ]);
  await relay('U2Z act_proposal VoteApprove signed by FC key via relayer', account(U2Z_ID, fc.toString()), DAO, [
    actions.functionCall('act_proposal', { id, action: 'VoteApprove', proposal: 'Vote' }, teraToGas('100'), 0n),
  ]);
  const p = await view<any>(DAO, 'get_proposal', { id });
  console.log('final proposal:', ser(p));
  console.log('U2Z state', ser(await nearState(U2Z_ID)));
  appendLog('10-dao-vote', { label: 'final proposal', proposal: p });
}
main().catch((e) => { console.error(e); process.exit(1); });
