// THROWAWAY spike 3e (substitute for the DAO vote, see RESULTS.md): least-privilege function-call key signs a 0-deposit
// delegate end to end. Stand-in for Sputnik `act_proposal` (0 deposit): hello.near-examples.testnet.set_greeting.
//  1. U1 (full-access key) adds FC key {receiver: hello.near-examples.testnet, methods: [set_greeting]} via a relayed AddKey.
//  2. The FC key signs a delegate set_greeting (0 deposit) -> validator accepts (FC permission matches) -> R relays -> success.
import { KeyPair, actions, nearToYocto, teraToGas } from 'near-api-js';
import { ROOT, account, summarize, printSummary, appendLog, provider, saveKey, view } from './lib.ts';
import { signDelegateSimple } from './client.ts';
import { decodeSignedDelegate, validate, submit, type Policy } from './relayer.ts';

const HELLO = 'hello.near-examples.testnet';
const U1_ID = `u1.${ROOT}`;
const R = account(ROOT);
const U1 = account(U1_ID);
const POLICY: Policy = { rules: [{ receiver: HELLO, methods: ['set_greeting'], maxDeposit: 0n, maxGas: teraToGas('30') }], minTtlBlocks: 5, maxTtlBlocks: 600, rate: { windowMs: 60_000, max: 20 } };

const fcKp = KeyPair.fromRandom('ed25519');
saveKey(U1_ID, fcKp, '.fc-hello');
const add = await signDelegateSimple(U1, U1_ID, [actions.addFunctionCallAccessKey(fcKp.getPublicKey(), HELLO, ['set_greeting'], nearToYocto('0.25'))]);
printSummary('relayed AddKey(FC hello [set_greeting])', summarize(await submit(R, decodeSignedDelegate(add.b64), 'FINAL')));

const U1fc = account(U1_ID, fcKp.toString());
const greeting = `pot spike 3e gasless FC-key call ${new Date().toISOString()}`;
const { b64 } = await signDelegateSimple(U1fc, HELLO, [actions.functionCall('set_greeting', { greeting }, teraToGas('10'), 0n)]);
const d = decodeSignedDelegate(b64);
const v = await validate(d, POLICY, provider);
console.log('[validator]', JSON.stringify(v));
const s = summarize(await submit(R, d, 'FINAL'));
printSummary('FC-key-signed delegate set_greeting (0 deposit)', s);
const now = await view(HELLO, 'get_greeting');
const out = { hash: s.hash, status: s.status, failures: s.failures.length, burnt: s.burnt.toString(), gas: s.gas.toString(), greeting_set: now === greeting };
console.log(JSON.stringify(out));
appendLog('07-fc-key', out);
