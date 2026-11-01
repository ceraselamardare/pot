// Print the ElevenLabs credit balance (free call) and append it to the audio agent's spend ledger.
//   node --env-file=../.env scripts/audio-credits.mjs [label]
// The ledger lives outside the project: AUDIO_LEDGER env (e.g. the session scratchpad), else the OS temp dir.
import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { credits } from "./lib/eleven.mjs";

const label = process.argv[2] ?? "check";
const ledger = process.env.AUDIO_LEDGER ?? join(tmpdir(), "pot-audio-ledger.jsonl");
const c = await credits();
const row = { at: new Date().toISOString(), label, ...c };
await mkdir(dirname(ledger), { recursive: true });
await appendFile(ledger, JSON.stringify(row) + "\n");
console.log(JSON.stringify(row));
