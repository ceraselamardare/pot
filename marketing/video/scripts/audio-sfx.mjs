// Generate the SFX library candidates with ElevenLabs (eleven_text_to_sound_v2, mp3_44100_128). Cached by path.
//   node --env-file=../.env scripts/audio-sfx.mjs [--variant 1] [--names pop,tap] [--prompt-suffix "..."]
// Writes public/audio/sfx/_raw/<name>.v<variant>.mp3 (+ .meta.json). Spec: scripts/audio-sfx.json.
// Post-processing / checks: python3 scripts/audio-tools.py sfx-build. Runs sequentially (shared 3-request limit).
import { readFile } from "node:fs/promises";
import { sfx } from "./lib/eleven.mjs";
import { readJsonIfExists } from "./lib/_shared.mjs";

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const spec = JSON.parse(await readFile(new URL("./audio-sfx.json", import.meta.url), "utf8"));
const variant = Number(opt("variant", "1"));
const names = opt("names", "") ? opt("names").split(",") : Object.keys(spec.sounds);
const suffix = opt("prompt-suffix", "");
let spent = 0;
for (const name of names) {
  const s = spec.sounds[name];
  if (!s) throw new Error(`unknown sfx ${name}`);
  const outPath = `public/audio/sfx/_raw/${name}.v${variant}.mp3`;
  // variants >= 3 are the one-time regeneration of a clearly wrong sound, with its sharper `regen_prompt`
  const base = variant >= 3 && s.regen_prompt ? s.regen_prompt : s.prompt;
  const r = await sfx({
    prompt: suffix ? `${base} ${suffix}` : base,
    durationSec: s.gen,
    promptInfluence: s.influence ?? spec.influence,
    outPath,
  });
  const meta = await readJsonIfExists(`${outPath}.meta.json`);
  const cost = Number(meta?.response?.headers?.["character-cost"] ?? 0);
  if (!r.cached) spent += cost;
  console.log(`${name} v${variant} ${r.cached ? "cached" : "generated"} ${r.durationSec?.toFixed(2)} s cost=${cost}`);
}
console.log(`SFX credits spent this run (character-cost headers): ${spent}`);
