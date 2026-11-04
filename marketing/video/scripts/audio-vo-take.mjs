// Generate VO takes (ElevenLabs eleven_v4 with timestamps) + Scribe v2 QA transcripts. Cached by path.
//   node --env-file=../.env scripts/audio-vo-take.mjs --voice emma --take 1 [--ids s01-hook,s02-front | --all]
//        [--set main|fallback] [--round v3] [--tag "[warm, smiling]"] [--stability 0.45] [--similarity 0.75]
//        [--seed 7] [--no-stt]
// Writes public/audio/vo/_takes/<id>.<voice>[.<round>[-fb]].t<take>.mp3 (+ .alignment.json, .meta.json from the
// helper) and <that>.stt.json (Scribe v2 transcript). Never regenerates an existing take (delete it or bump --take).
// --set fallback speaks the line's `fallback` text (file tag "-fb"); --round keeps a new script round's takes apart
// from older takes of the same id (the cache is keyed by path).
// Runs strictly sequentially (the account allows 3 concurrent requests; other agents share it).
import { readFile } from "node:fs/promises";
import { stt, tts } from "./lib/eleven.mjs";
import { readJsonIfExists } from "./lib/_shared.mjs";

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const flag = (name) => args.includes(`--${name}`);

const cfg = JSON.parse(await readFile(new URL("./audio-lines.json", import.meta.url), "utf8"));
const voice = opt("voice", "emma");
const voiceId = cfg.voices[voice];
if (!voiceId) throw new Error(`unknown voice ${voice}`);
const take = Number(opt("take", "1"));
const tag = opt("tag", "");
const stability = Number(opt("stability", cfg.voiceSettings.stability));
const similarity = Number(opt("similarity", cfg.voiceSettings.similarity_boost));
const seed = Number(opt("seed", cfg.seeds[(take - 1) % cfg.seeds.length]));
const ids = flag("all") ? cfg.lines.map((l) => l.id) : String(opt("ids", "")).split(",").filter(Boolean);
if (!ids.length) throw new Error("pass --ids a,b or --all");

const ttsText = (l) => l.tts ?? l.text;
// --text: a punctuation-only variant of ONE line's TTS text (pauses/phrasing). The words must stay identical.
const textOverride = opt("text", "");
const set = opt("set", "main");
if (!["main", "fallback"].includes(set)) throw new Error("--set main|fallback");
const round = opt("round", "");
const fileTag = [round, set === "fallback" ? "fb" : ""].filter(Boolean).join("-");
const wordsOf = (s) => s.replace(/\[[^\]]*\]/g, " ").toLowerCase().replace(/[^a-z0-9' -]/g, " ").replace(/[-\s]+/g, " ").trim();
if (textOverride && ids.length !== 1) throw new Error("--text works with exactly one --ids line");
let spent = 0;
for (const id of ids) {
  const i = cfg.lines.findIndex((l) => l.id === id);
  if (i < 0) throw new Error(`unknown line ${id}`);
  const line = cfg.lines[i];
  const outPath = `public/audio/vo/_takes/${id}.${voice}${fileTag ? "." + fileTag : ""}.t${take}.mp3`;
  const base = set === "fallback" ? line.fallback : ttsText(line);
  if (!base) throw new Error(`${id} has no ${set} text`);
  const body = textOverride || base;
  if (wordsOf(body) !== wordsOf(base)) throw new Error(`--text changes the words of ${id}: "${body}"`);
  const text = tag ? `${tag} ${body}` : body;
  const r = await tts({
    text,
    voiceId,
    modelId: cfg.model,
    outputFormat: cfg.outputFormat,
    voiceSettings: { stability, similarity_boost: similarity },
    previousText: i > 0 ? ttsText(cfg.lines[i - 1]) : undefined,
    nextText: i < cfg.lines.length - 1 ? ttsText(cfg.lines[i + 1]) : undefined,
    seed,
    outPath,
  });
  const meta = await readJsonIfExists(`${outPath}.meta.json`);
  const cost = Number(meta?.response?.headers?.["character-cost"] ?? 0);
  if (!r.cached) spent += cost;
  let sttNote = "stt skipped";
  if (!flag("no-stt")) {
    const s = await stt({ filePath: outPath, outPath: `${outPath}.stt.json` });
    sttNote = `stt: "${s.transcript?.text ?? ""}"`;
  }
  console.log(`${id} ${voice}${fileTag ? " " + fileTag : ""} t${take} ${r.cached ? "cached" : "generated"} ${r.durationSec?.toFixed(2)} s cost=${cost} | ${sttNote}`);
}
console.log(`TTS credits spent this run (character-cost headers): ${spent}`);
