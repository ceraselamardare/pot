// ElevenLabs helpers for the Pot video: TTS with timestamps, sound effects, music.
// Zero dependencies (Node >= 22, global fetch). Run from marketing/video:
//   node --env-file=../.env scripts/<your-script>.mjs
//
// Rules baked in (see brief/tooling.md):
// - The key is read from process.env.ELEVENLABS_API_KEY at call time and never logged.
// - Every call is cached: if outPath exists it is NOT regenerated unless you pass force: true.
// - Retries with backoff on 429 / 5xx; out-of-credit errors are not retried.
// - Each output gets a provenance sidecar `<outPath>.meta.json` (request params, model, ids, time).
// - At most ELEVENLABS_MAX_CONCURRENCY (default 3) requests run at once inside one process
//   (free plan + pay-as-you-go allows 3 concurrent requests).

import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import {
  commitOutput,
  compact,
  httpError,
  isCached,
  pickHeaders,
  probeDuration,
  readJsonIfExists,
  requireKey,
  semaphore,
  withRetry,
  writeJson,
} from "./_shared.mjs";

export const ELEVEN_BASE = "https://api.elevenlabs.io";

/**
 * Verified defaults for this account (2026-10-22). See brief/tooling.md before changing.
 * - TTS/SFX: mp3_44100_192 is rejected on this plan (403 output_format_not_allowed: Creator tier+).
 * - Music: "auto" returns mp3 48 kHz / 192 kbps stereo for music_v2_5 (verified).
 */
export const ELEVEN_DEFAULTS = Object.freeze({
  ttsModel: "eleven_v4",
  ttsOutputFormat: "mp3_44100_128",
  sfxModel: "eleven_text_to_sound_v2",
  sfxOutputFormat: "mp3_44100_128",
  musicModel: "music_v2_5",
  musicOutputFormat: "auto",
  fps: 60,
});

const limit = semaphore(Number(process.env.ELEVENLABS_MAX_CONCURRENCY) || 3);

async function elevenFetch(path, { method = "POST", query, json, form, label, timeoutMs = 10 * 60_000 }) {
  const url = new URL(path, ELEVEN_BASE);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  return limit(() =>
    withRetry(
      async () => {
        const t0 = Date.now();
        const res = await fetch(url, {
          method,
          headers: {
            "xi-api-key": requireKey("ELEVENLABS_API_KEY"),
            // multipart (form): fetch sets the content-type with its boundary itself.
            ...(json ? { "content-type": "application/json" } : {}),
          },
          body: json ? JSON.stringify(json) : form ?? undefined,
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) throw await httpError(res, label);
        const body = Buffer.from(await res.arrayBuffer());
        return { res, body, latencyMs: Date.now() - t0 };
      },
      { label },
    ),
  );
}

const requestIdOf = (res) => res.headers.get("request-id") ?? res.headers.get("x-request-id");

/**
 * Group the character alignment into words: { text, start, end, startFrame, endFrame, charStart, charEnd }.
 * `text`/`start`/`end` (seconds) match the VoWord type in src/data/vo.ts. Pass maxSec (the real audio
 * duration) to clamp: the last character's end time can overshoot the audio by ~0.1 s.
 * @param {{characters:string[], character_start_times_seconds:number[], character_end_times_seconds:number[]}} alignment
 * @param {number} fps frames per second for startFrame/endFrame (the video is 60 fps)
 * @param {number} [maxSec] clamp all times to this duration
 */
export function wordsFromAlignment(alignment, fps = ELEVEN_DEFAULTS.fps, maxSec) {
  if (!alignment?.characters?.length) return [];
  const { characters: ch, character_start_times_seconds: st, character_end_times_seconds: en } = alignment;
  const words = [];
  let cur = null;
  for (let i = 0; i < ch.length; i++) {
    if (/\s/.test(ch[i])) {
      if (cur) words.push(cur);
      cur = null;
      continue;
    }
    if (!cur) cur = { text: "", start: st[i], end: en[i], charStart: i, charEnd: i };
    cur.text += ch[i];
    cur.end = en[i];
    cur.charEnd = i;
  }
  if (cur) words.push(cur);
  const clamp = (t) => (Number.isFinite(maxSec) ? Math.min(t, maxSec) : t);
  return words.map((w) => {
    const start = clamp(w.start);
    const end = clamp(w.end);
    return { text: w.text, start, end, startFrame: Math.round(start * fps), endFrame: Math.round(end * fps), charStart: w.charStart, charEnd: w.charEnd };
  });
}

/**
 * Shape a tts() result as the VoClip JSON that src/data/vo.ts reads from src/data/vo/<id>.json:
 * { id, file, durationSec, words: [{ text, start, end }] }. `file` is relative to public/.
 */
export function toVoClip(id, file, result) {
  return {
    id,
    file,
    durationSec: result.durationSec,
    words: (result.words ?? []).map(({ text, start, end }) => ({ text, start, end })),
  };
}

/**
 * Text to speech WITH character timestamps.
 * Writes: outPath (audio), `${outPath}.alignment.json` ({text, alignment, normalized_alignment, words}),
 * and `${outPath}.meta.json`.
 *
 * eleven_v4 takes only stability + similarity_boost in voiceSettings (no style / speed / speaker
 * boost, no SSML <break>): steer delivery with punctuation, "..." and audio tags like [excited].
 * previousRequestIds must be < 2 h old and are not supported by eleven_v3.
 *
 * @returns {Promise<{outPath:string, cached:boolean, durationSec:number|null, alignment:object|null,
 *   normalizedAlignment:object|null, words:object[], requestId:string|null}>}
 */
export async function tts({
  text,
  voiceId,
  modelId = ELEVEN_DEFAULTS.ttsModel,
  voiceSettings,
  previousText,
  nextText,
  previousRequestIds,
  nextRequestIds,
  seed,
  languageCode,
  applyTextNormalization,
  outputFormat = ELEVEN_DEFAULTS.ttsOutputFormat,
  fps = ELEVEN_DEFAULTS.fps,
  outPath,
  force = false,
}) {
  if (!text || !voiceId || !outPath) throw new Error("tts: text, voiceId and outPath are required");
  const alignPath = `${outPath}.alignment.json`;
  const metaPath = `${outPath}.meta.json`;

  if (isCached(outPath, force)) {
    const a = await readJsonIfExists(alignPath);
    const m = await readJsonIfExists(metaPath);
    return {
      outPath,
      cached: true,
      durationSec: m?.response?.duration_sec ?? (await probeDuration(outPath)),
      alignment: a?.alignment ?? null,
      normalizedAlignment: a?.normalized_alignment ?? null,
      words: a?.words ?? [],
      requestId: m?.response?.request_id ?? null,
    };
  }

  const body = compact({
    text,
    model_id: modelId,
    voice_settings: voiceSettings,
    previous_text: previousText,
    next_text: nextText,
    previous_request_ids: previousRequestIds?.length ? previousRequestIds : undefined,
    next_request_ids: nextRequestIds?.length ? nextRequestIds : undefined,
    seed,
    language_code: languageCode,
    apply_text_normalization: applyTextNormalization,
  });
  const label = `eleven.tts ${voiceId} ${modelId}`;
  const { res, body: raw, latencyMs } = await elevenFetch(
    `/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps`,
    { query: { output_format: outputFormat }, json: body, label },
  );
  const json = JSON.parse(raw.toString("utf8"));
  if (!json.audio_base64) throw new Error(`${label}: response had no audio_base64`);
  const audio = Buffer.from(json.audio_base64, "base64");
  const requestId = requestIdOf(res);
  const alignment = json.alignment ?? null;
  const normalizedAlignment = json.normalized_alignment ?? null;
  let words = wordsFromAlignment(alignment, fps);

  const probed = await commitOutput(outPath, audio, async (dur) => {
    if (dur) words = wordsFromAlignment(alignment, fps, dur); // clamp to the real audio length
    await writeJson(alignPath, { text, voice_id: voiceId, model_id: modelId, fps, alignment, normalized_alignment: normalizedAlignment, words });
    await writeJson(metaPath, {
      tool: "eleven.tts",
      endpoint: "POST /v1/text-to-speech/{voice_id}/with-timestamps",
      model_id: modelId,
      voice_id: voiceId,
      request: { ...body, output_format: outputFormat },
      response: {
        request_id: requestId,
        headers: pickHeaders(res.headers),
        latency_ms: latencyMs,
        bytes: audio.length,
        duration_sec: dur ?? words.at(-1)?.end ?? null,
        has_alignment: !!alignment,
      },
      created_at: new Date().toISOString(),
    });
  });
  const durationSec = probed ?? words.at(-1)?.end ?? null;
  return { outPath, cached: false, durationSec, alignment, normalizedAlignment, words, requestId };
}

/**
 * Sound effect from a text prompt. Cost: 40 credits per second when durationSec is set.
 * durationSec: 0.5..30 (omit to let the model choose). promptInfluence: 0..1 (default 0.3).
 */
export async function sfx({
  prompt,
  durationSec,
  promptInfluence = 0.3,
  loop = false,
  modelId = ELEVEN_DEFAULTS.sfxModel,
  outputFormat = ELEVEN_DEFAULTS.sfxOutputFormat,
  outPath,
  force = false,
}) {
  if (!prompt || !outPath) throw new Error("sfx: prompt and outPath are required");
  if (durationSec !== undefined && !(durationSec >= 0.5 && durationSec <= 30)) {
    throw new Error("sfx: durationSec must be 0.5..30 (generate 0.5 s and trim for shorter sounds)");
  }
  const metaPath = `${outPath}.meta.json`;
  if (isCached(outPath, force)) {
    const m = await readJsonIfExists(metaPath);
    return { outPath, cached: true, durationSec: m?.response?.duration_sec ?? (await probeDuration(outPath)), requestId: m?.response?.request_id ?? null };
  }
  const body = compact({
    text: prompt,
    duration_seconds: durationSec,
    prompt_influence: promptInfluence,
    loop: loop || undefined,
    model_id: modelId,
  });
  const label = `eleven.sfx ${modelId}`;
  const { res, body: audio, latencyMs } = await elevenFetch("/v1/sound-generation", {
    query: { output_format: outputFormat },
    json: body,
    label,
  });
  const requestId = requestIdOf(res);
  const dur = await commitOutput(outPath, audio, (d) =>
    writeJson(metaPath, {
      tool: "eleven.sfx",
      endpoint: "POST /v1/sound-generation",
      model_id: modelId,
      request: { ...body, output_format: outputFormat },
      response: { request_id: requestId, headers: pickHeaders(res.headers), latency_ms: latencyMs, bytes: audio.length, duration_sec: d },
      created_at: new Date().toISOString(),
    }),
  );
  return { outPath, cached: false, durationSec: dur, requestId };
}

/**
 * Create a music composition plan from a prompt. FREE (no credits), but rate-limited.
 * For music_v2 / music_v2_5 the plan is { chunks: [...] }; for music_v1 it is
 * { positive_global_styles, negative_global_styles, sections }.
 * Pass outPath to cache the plan as JSON (plus `${outPath}.meta.json`).
 */
export async function musicPlan({
  prompt,
  lengthMs,
  modelId = ELEVEN_DEFAULTS.musicModel,
  sourceCompositionPlan,
  outPath,
  force = false,
}) {
  if (!prompt) throw new Error("musicPlan: prompt is required");
  if (outPath && isCached(outPath, force)) return readJsonIfExists(outPath);
  const body = compact({
    prompt,
    music_length_ms: lengthMs,
    model_id: modelId,
    source_composition_plan: sourceCompositionPlan,
  });
  const label = `eleven.musicPlan ${modelId}`;
  const { res, body: raw, latencyMs } = await elevenFetch("/v1/music/plan", { json: body, label });
  const plan = JSON.parse(raw.toString("utf8"));
  if (outPath) {
    await writeJson(`${outPath}.meta.json`, {
      tool: "eleven.musicPlan",
      endpoint: "POST /v1/music/plan",
      model_id: modelId,
      request: body,
      response: { request_id: requestIdOf(res), headers: pickHeaders(res.headers), latency_ms: latencyMs },
      created_at: new Date().toISOString(),
    });
    await writeJson(outPath, plan);
  }
  return plan;
}

/**
 * Generate music from EITHER a prompt OR a composition plan (mutually exclusive).
 * - prompt mode: lengthMs (3000..600000) and forceInstrumental apply; seed is not allowed.
 * - plan mode: total length = sum of chunk duration_ms (each 3000..120000, max 30 chunks); seed
 *   allowed; forceInstrumental is NOT allowed, so for an instrumental put "instrumental" in
 *   positive_styles, "vocals"/"lyrics" in negative_styles and keep each chunk's text to a section
 *   name only, e.g. "[Intro]".
 * Returns { outPath, cached, durationSec, songId, requestId }.
 */
export async function music({
  prompt,
  compositionPlan,
  lengthMs,
  forceInstrumental,
  modelId = ELEVEN_DEFAULTS.musicModel,
  seed,
  storeForInpainting,
  outputFormat = ELEVEN_DEFAULTS.musicOutputFormat,
  outPath,
  force = false,
  timeoutMs = 10 * 60_000,
}) {
  if (!outPath) throw new Error("music: outPath is required");
  if (!!prompt === !!compositionPlan) throw new Error("music: pass exactly one of prompt or compositionPlan");
  if (prompt && lengthMs !== undefined && !(lengthMs >= 3000 && lengthMs <= 600_000)) {
    throw new Error("music: lengthMs must be 3000..600000");
  }
  if (compositionPlan) {
    if (lengthMs !== undefined || forceInstrumental) {
      throw new Error("music: lengthMs / forceInstrumental only apply to prompt mode (plan length = sum of chunk durations)");
    }
    const isV1 = modelId === "music_v1";
    const parts = isV1 ? compositionPlan.sections : compositionPlan.chunks;
    if (!Array.isArray(parts) || !parts.length) {
      throw new Error(`music: ${modelId} expects a plan with ${isV1 ? "sections[] (v1 shape)" : "chunks[] (v2 shape)"}`);
    }
    for (const p of parts) {
      if (p.duration_ms !== undefined && !(p.duration_ms >= 3000 && p.duration_ms <= 120_000)) {
        throw new Error(`music: chunk/section duration_ms must be 3000..120000 (got ${p.duration_ms})`);
      }
    }
  }
  const metaPath = `${outPath}.meta.json`;
  if (isCached(outPath, force)) {
    const m = await readJsonIfExists(metaPath);
    return {
      outPath,
      cached: true,
      durationSec: m?.response?.duration_sec ?? (await probeDuration(outPath)),
      songId: m?.response?.song_id ?? null,
      requestId: m?.response?.request_id ?? null,
    };
  }
  const body = prompt
    ? compact({ prompt, music_length_ms: lengthMs, force_instrumental: forceInstrumental, model_id: modelId, store_for_inpainting: storeForInpainting })
    : compact({ composition_plan: compositionPlan, model_id: modelId, seed, store_for_inpainting: storeForInpainting });
  const label = `eleven.music ${modelId}`;
  const { res, body: audio, latencyMs } = await elevenFetch("/v1/music", {
    query: { output_format: outputFormat },
    json: body,
    label,
    timeoutMs,
  });
  const songId = res.headers.get("song-id");
  const requestId = requestIdOf(res);
  const dur = await commitOutput(outPath, audio, (d) =>
    writeJson(metaPath, {
      tool: "eleven.music",
      endpoint: "POST /v1/music",
      model_id: modelId,
      request: { ...body, output_format: outputFormat },
      response: { request_id: requestId, song_id: songId, headers: pickHeaders(res.headers), latency_ms: latencyMs, bytes: audio.length, duration_sec: d },
      created_at: new Date().toISOString(),
    }),
  );
  return { outPath, cached: false, durationSec: dur, songId, requestId };
}

const AUDIO_MIME = { ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".ogg": "audio/ogg", ".flac": "audio/flac" };

/**
 * Speech to text (Scribe) for QA of generated VO: POST /v1/speech-to-text (multipart), model scribe_v2.
 * Cost (docs, 2026-10): $0.22 per audio hour (≈0.17 credits per audio second); keyterms add 20%.
 * Cached like everything else: if outPath (a JSON file) exists, it is returned without an API call.
 * Writes outPath = { tool, endpoint, model_id, file, request, response: {request_id, headers, latency_ms}, transcript, created_at }.
 * `transcript` is the API body: { language_code, text, words: [{ text, type: word|spacing|audio_event, start, end, logprob }] }.
 * Leave keyterms empty for QA: biasing the recogniser towards the script would hide mispronunciations.
 */
export async function stt({
  filePath,
  modelId = "scribe_v2",
  languageCode = "en",
  timestampsGranularity = "word",
  tagAudioEvents = true,
  noVerbatim,
  keyterms,
  seed,
  outPath,
  force = false,
}) {
  if (!filePath || !outPath) throw new Error("stt: filePath and outPath are required");
  if (isCached(outPath, force)) return { ...(await readJsonIfExists(outPath)), cached: true };
  const data = await readFile(filePath);
  const ext = extname(filePath).toLowerCase();
  const request = compact({
    model_id: modelId,
    language_code: languageCode,
    timestamps_granularity: timestampsGranularity,
    tag_audio_events: tagAudioEvents,
    no_verbatim: noVerbatim,
    seed,
    keyterms: keyterms?.length ? keyterms : undefined,
  });
  const form = new FormData();
  for (const [k, v] of Object.entries(request)) {
    if (Array.isArray(v)) for (const item of v) form.append(k, String(item));
    else form.append(k, String(v));
  }
  form.append("file", new Blob([data], { type: AUDIO_MIME[ext] ?? "application/octet-stream" }), basename(filePath));
  const label = `eleven.stt ${modelId}`;
  const { res, body, latencyMs } = await elevenFetch("/v1/speech-to-text", { form, label });
  const transcript = JSON.parse(body.toString("utf8"));
  const result = {
    tool: "eleven.stt",
    endpoint: "POST /v1/speech-to-text",
    model_id: modelId,
    file: filePath,
    request,
    response: { request_id: requestIdOf(res), headers: pickHeaders(res.headers), latency_ms: latencyMs },
    transcript,
    created_at: new Date().toISOString(),
  };
  await writeJson(outPath, result);
  return { ...result, cached: false };
}

/**
 * Free usage report: credits per model between two times (ms since epoch), for calls with no cost header
 * (music). GET /v1/usage/character-stats?breakdown_type=model&metric=credits&aggregation_interval=cumulative.
 * Returns the API body ({ time: [...], usage: { <model>: [...] } }). Account-wide: other agents' calls on the
 * same models are included, so read it with that in mind.
 */
export async function usage({ startMs, endMs = Date.now(), breakdownType = "model", metric = "credits" }) {
  const { body } = await elevenFetch("/v1/usage/character-stats", {
    method: "GET",
    query: { start_unix: startMs, end_unix: endMs, breakdown_type: breakdownType, metric, aggregation_interval: "cumulative" },
    label: "eleven.usage",
  });
  return JSON.parse(body.toString("utf8"));
}

/** Free account check: tier and credits. Call before/after a batch to measure spend. */
export async function credits() {
  const { body } = await elevenFetch("/v1/user/subscription", { method: "GET", label: "eleven.credits" });
  const s = JSON.parse(body.toString("utf8"));
  return {
    tier: s.tier,
    used: s.character_count,
    limit: s.character_limit,
    remaining: s.character_limit - s.character_count,
    resetsAt: s.next_character_count_reset_unix ? new Date(s.next_character_count_reset_unix * 1000).toISOString() : null,
  };
}
