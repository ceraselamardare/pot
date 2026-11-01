// OpenAI image helpers for the Pot video (GPT Image 2.5: Sunburst / Flare).
// Zero dependencies (Node >= 22: global fetch, FormData, Blob). Run from marketing/video:
//   node --env-file=../.env scripts/<your-script>.mjs
//
// Rules baked in (see brief/tooling.md):
// - The key is read from process.env.OPENAI_API_KEY at call time and never logged.
// - Cached: if outPath exists nothing is generated unless force: true.
// - Retries with backoff on 429 (rate limit) / 5xx; quota and moderation errors are not retried.
// - Each output gets `<outPath>.meta.json` (prompt, params, model, usage, ids, time; no secrets).
// - Transparent background needs outputFormat "png" or "webp".

import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import {
  commitOutput,
  compact,
  httpError,
  isCached,
  pickHeaders,
  readJsonIfExists,
  requireKey,
  withRetry,
  writeJson,
} from "./_shared.mjs";

export const OPENAI_BASE = "https://api.openai.com";

/** Verified on this account 2026-10-22. See brief/tooling.md. */
export const IMAGE_DEFAULTS = Object.freeze({
  model: "gpt-image-2.5-sunburst", // best quality + edit precision; same token price as Flare
  draftModel: "gpt-image-2.5-flare", // faster, for drafts / quick iterations
  size: "1024x1024",
  quality: "high",
  background: "auto",
  outputFormat: "png",
});

const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

async function openaiFetch(path, { body, label, timeoutMs = 5 * 60_000 }) {
  return withRetry(
    async () => {
      const t0 = Date.now();
      const isForm = body instanceof FormData;
      const res = await fetch(new URL(path, OPENAI_BASE), {
        method: "POST",
        headers: {
          authorization: `Bearer ${requireKey("OPENAI_API_KEY")}`,
          ...(isForm ? {} : { "content-type": "application/json" }),
        },
        body: isForm ? body : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw await httpError(res, label);
      const json = await res.json();
      return { res, json, latencyMs: Date.now() - t0 };
    },
    { label, attempts: 4 },
  );
}

/** outPath for image i of n: "x.png" stays "x.png" for i=0, then "x-2.png", "x-3.png"... */
function nthPath(outPath, i) {
  if (i === 0) return outPath;
  const ext = extname(outPath);
  return `${outPath.slice(0, outPath.length - ext.length)}-${i + 1}${ext}`;
}

async function saveImages({ outPath, json, res, latencyMs, tool, endpoint, request }) {
  const data = json.data ?? [];
  if (!data.length || !data[0].b64_json) throw new Error(`${tool}: response contained no image data`);
  const outPaths = [];
  for (let i = 0; i < data.length; i++) {
    const p = nthPath(outPath, i);
    const buf = Buffer.from(data[i].b64_json, "base64");
    await commitOutput(p, buf, () =>
      writeJson(`${p}.meta.json`, {
        tool,
        endpoint,
        model: request.model,
        request,
        response: {
          request_id: res.headers.get("x-request-id"),
          headers: pickHeaders(res.headers),
          created: json.created,
          background: json.background,
          quality: json.quality,
          size: json.size,
          output_format: json.output_format,
          usage: json.usage ?? null,
          latency_ms: latencyMs,
          bytes: buf.length,
          index: i,
        },
        created_at: new Date().toISOString(),
      }),
    );
    outPaths.push(p);
  }
  return outPaths;
}

/**
 * Generate an image from a prompt.
 * size: "1024x1024" | "1536x1024" | "1024x1536" | "auto" | any "WxH" (multiples of 16, ratio <= 3:1,
 *       655,360..8,294,400 px; above 2560x1440 is experimental).
 * quality: "low" | "medium" | "high" | "xhigh" | "max" | "auto" (xhigh/max only on gpt-image-2.5-*).
 * background: "transparent" | "opaque" | "auto". outputFormat: "png" | "webp" | "jpeg".
 * @returns {Promise<{outPath:string, outPaths:string[], cached:boolean, usage:object|null, latencyMs:number|null}>}
 */
export async function generateImage({
  prompt,
  model = IMAGE_DEFAULTS.model,
  size = IMAGE_DEFAULTS.size,
  quality = IMAGE_DEFAULTS.quality,
  background = IMAGE_DEFAULTS.background,
  outputFormat = IMAGE_DEFAULTS.outputFormat,
  outputCompression,
  moderation,
  n = 1,
  outPath,
  force = false,
}) {
  if (!prompt || !outPath) throw new Error("generateImage: prompt and outPath are required");
  if (background === "transparent" && outputFormat === "jpeg") throw new Error("generateImage: transparent needs png or webp");
  if (isCached(outPath, force)) {
    const m = await readJsonIfExists(`${outPath}.meta.json`);
    return { outPath, outPaths: [outPath], cached: true, usage: m?.response?.usage ?? null, latencyMs: null };
  }
  const request = compact({
    model,
    prompt,
    size,
    quality,
    background,
    output_format: outputFormat,
    output_compression: outputCompression,
    moderation,
    n: n > 1 ? n : undefined,
  });
  const label = `openai.generateImage ${model}`;
  const { res, json, latencyMs } = await openaiFetch("/v1/images/generations", { body: request, label });
  const outPaths = await saveImages({ outPath, json, res, latencyMs, tool: "openai.generateImage", endpoint: "POST /v1/images/generations", request });
  return { outPath, outPaths, cached: false, usage: json.usage ?? null, latencyMs };
}

/**
 * Edit / compose from reference images (up to 16). Use this for style consistency: pass an approved
 * sticker as a reference and describe the new subject in the prompt.
 * images: local file paths (png / jpeg / webp, each < 50 MB). mask: optional PNG path with alpha.
 * inputFidelity: only for gpt-image-1 / 1.5 ("high" | "low"); omit for gpt-image-2 and 2.5.
 */
export async function editImage({
  prompt,
  images,
  mask,
  model = IMAGE_DEFAULTS.model,
  size = IMAGE_DEFAULTS.size,
  quality = IMAGE_DEFAULTS.quality,
  background = IMAGE_DEFAULTS.background,
  outputFormat = IMAGE_DEFAULTS.outputFormat,
  outputCompression,
  inputFidelity,
  moderation,
  n = 1,
  outPath,
  force = false,
}) {
  if (!prompt || !outPath || !images?.length) throw new Error("editImage: prompt, images[] and outPath are required");
  if (images.length > 16) throw new Error("editImage: at most 16 reference images");
  if (background === "transparent" && outputFormat === "jpeg") throw new Error("editImage: transparent needs png or webp");
  if (isCached(outPath, force)) {
    const m = await readJsonIfExists(`${outPath}.meta.json`);
    return { outPath, outPaths: [outPath], cached: true, usage: m?.response?.usage ?? null, latencyMs: null };
  }
  const fields = compact({
    model,
    prompt,
    size,
    quality,
    background,
    output_format: outputFormat,
    output_compression: outputCompression,
    input_fidelity: inputFidelity,
    moderation,
    n: n > 1 ? n : undefined,
  });
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, String(v));
  for (const p of images) {
    const type = MIME[extname(p).toLowerCase()];
    if (!type) throw new Error(`editImage: unsupported reference type ${p} (png/jpeg/webp only)`);
    form.append("image[]", new Blob([await readFile(p)], { type }), basename(p));
  }
  if (mask) form.append("mask", new Blob([await readFile(mask)], { type: "image/png" }), basename(mask));

  const request = { ...fields, images, mask: mask ?? undefined };
  const label = `openai.editImage ${model}`;
  const { res, json, latencyMs } = await openaiFetch("/v1/images/edits", { body: form, label });
  const outPaths = await saveImages({ outPath, json, res, latencyMs, tool: "openai.editImage", endpoint: "POST /v1/images/edits", request });
  return { outPath, outPaths, cached: false, usage: json.usage ?? null, latencyMs };
}
