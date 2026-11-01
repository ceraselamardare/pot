// Compose the music bed with ElevenLabs music_v2_5 from scripts/audio-music-plan.json (our own plan: exact chunk
// durations on bar lines, instrumental). Cached by path; never regenerates an existing candidate.
//   node --env-file=../.env scripts/audio-music.mjs gen <seed>          → public/audio/music/_raw/pot-theme.seed<seed>.mp3
//   node --env-file=../.env scripts/audio-music.mjs usage <startIsoTime>  → music credits since then (account-wide)
// Analysis / alignment / normalisation: python3 scripts/audio-tools.py music-check|music-build.
import { readFile } from "node:fs/promises";
import { music, usage } from "./lib/eleven.mjs";

const [cmd, arg] = process.argv.slice(2);
if (cmd === "gen") {
  const seed = Number(arg);
  if (!Number.isInteger(seed)) throw new Error("gen <seed>");
  const plan = JSON.parse(await readFile(new URL("./audio-music-plan.json", import.meta.url), "utf8"));
  const total = plan.chunks.reduce((n, c) => n + c.duration_ms, 0);
  if (total !== 84000 || plan.chunks.some((c) => c.duration_ms % 2000)) throw new Error(`plan must be 84000 ms on 2000 ms bars (got ${total})`);
  const t0 = Date.now();
  const r = await music({ compositionPlan: plan, seed, outPath: `public/audio/music/_raw/pot-theme.seed${seed}.mp3` });
  console.log(`seed ${seed}: ${r.cached ? "cached" : "generated"} ${r.durationSec?.toFixed(3)} s song-id ${r.songId ?? "-"} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
} else if (cmd === "usage") {
  const startMs = arg ? Date.parse(arg) : Date.now() - 3600_000;
  const u = await usage({ startMs });
  const out = {};
  for (const [model, series] of Object.entries(u.usage ?? {})) {
    const vals = Array.isArray(series) ? series : [];
    out[model] = vals.length ? vals[vals.length - 1] : series;
  }
  console.log(JSON.stringify({ since: new Date(startMs).toISOString(), cumulative_credits_by_model: out }, null, 2));
} else {
  console.log("usage: audio-music.mjs gen <seed> | usage <startIsoTime>");
}
