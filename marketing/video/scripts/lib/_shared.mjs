// Shared internals for scripts/lib/eleven.mjs and scripts/lib/openai-image.mjs.
// Zero dependencies (Node >= 22). Nothing here reads an API key at import time,
// and nothing here ever logs one: every error string passes through scrub().

import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { execFile } from "node:child_process";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Read an API key from process.env at call time. Throws a helpful error (without the key) when missing. */
export function requireKey(name) {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `${name} is not set. Run from marketing/video with: node --env-file=../.env <script>.mjs`,
    );
  }
  return v.trim();
}

const SECRET_ENV = ["ELEVENLABS_API_KEY", "OPENAI_API_KEY"];

/** Remove any secret value that might have leaked into a string (defence in depth). */
export function scrub(s) {
  let out = String(s ?? "");
  for (const name of SECRET_ENV) {
    const k = process.env[name]?.trim();
    if (k && k.length > 8) out = out.split(k).join("[redacted]");
  }
  return out.replace(/\b(sk-[A-Za-z0-9_-]{8})[A-Za-z0-9_-]+/g, "$1…[redacted]");
}

/** Build an Error from a non-2xx fetch Response. Marks 429 (non-quota) and 5xx as retryable. */
export async function httpError(res, label) {
  const text = scrub(await res.text().catch(() => ""));
  let detail = text.slice(0, 1500);
  try {
    const j = JSON.parse(text);
    detail = JSON.stringify(j.detail ?? j.error ?? j).slice(0, 1500);
  } catch {
    /* not JSON */
  }
  const err = new Error(`${label}: HTTP ${res.status} ${detail}`);
  err.status = res.status;
  err.detail = detail;
  // Out-of-credits / billing errors are not transient: never retry them (they would just burn time).
  const quota = /insufficient_quota|quota_exceeded|exceeded your current quota|billing|payment_required/i.test(text);
  err.retryable = (res.status === 429 && !quota) || res.status >= 500;
  const ra = Number(res.headers.get("retry-after"));
  if (Number.isFinite(ra) && ra > 0) err.retryAfterMs = Math.min(ra * 1000, 60_000);
  return err;
}

function isTransientNetworkError(err) {
  const code = err?.cause?.code ?? err?.code;
  return (
    (err?.name === "TypeError" && /fetch failed/i.test(err.message)) ||
    ["ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "ETIMEDOUT", "UND_ERR_SOCKET", "UND_ERR_CONNECT_TIMEOUT"].includes(code)
  );
}

/**
 * Run fn with exponential backoff on retryable errors (429 / 5xx / connection failures).
 * A client-side timeout (TimeoutError) is NOT retried: the server may have finished (and billed) the job.
 */
export async function withRetry(fn, { label = "request", attempts = 5, baseMs = 1500, maxMs = 30_000 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn(i);
    } catch (err) {
      lastErr = err;
      const retryable = err?.retryable ?? isTransientNetworkError(err);
      if (!retryable || i === attempts - 1) throw err;
      const backoff = Math.min(maxMs, baseMs * 2 ** i) * (0.75 + Math.random() * 0.5);
      const wait = err.retryAfterMs ?? backoff;
      console.warn(`[${label}] attempt ${i + 1}/${attempts} failed (${err.status ?? err?.cause?.code ?? err.name}); retrying in ${Math.round(wait)} ms`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

/** Tiny in-process semaphore so one script never exceeds a provider's concurrency limit. */
export function semaphore(max) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= max || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn().then(resolve, reject).finally(() => {
      active--;
      next();
    });
  };
  return (fn) => new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    next();
  });
}

/** True when a cached output exists and the caller did not ask to regenerate. */
export function isCached(outPath, force) {
  return !force && !!outPath && existsSync(outPath);
}

/** Write a file atomically (tmp + rename) so a crash never leaves a half file that looks cached. */
export async function writeAtomic(path, data) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.part-${process.pid}`;
  try {
    await writeFile(tmp, data);
    await rename(tmp, path);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
}

export async function writeJson(path, obj) {
  await writeAtomic(path, JSON.stringify(obj, null, 2) + "\n");
}

/**
 * Commit a generated media file plus its sidecars. The media is written to a temp file, probed
 * for duration, the sidecars are written by writeSidecars(durationSec), and only then is the media
 * renamed into place. So "outPath exists" always means "the whole set is complete".
 * @returns {Promise<number|null>} duration in seconds (null when ffprobe cannot read it)
 */
export async function commitOutput(outPath, data, writeSidecars) {
  const tmp = `${outPath}.tmp-${process.pid}`;
  await writeAtomic(tmp, data);
  try {
    const durationSec = await probeDuration(tmp);
    await writeSidecars(durationSec);
    await rename(tmp, outPath);
    return durationSec;
  } finally {
    await rm(tmp, { force: true });
  }
}

export async function readJsonIfExists(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

/** Media duration in seconds via ffprobe (null if ffprobe is missing or the file is not media). */
export function probeDuration(path) {
  return new Promise((resolve) => {
    execFile(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path],
      (err, stdout) => {
        if (err) return resolve(null);
        const d = Number.parseFloat(String(stdout).trim());
        resolve(Number.isFinite(d) ? d : null);
      },
    );
  });
}

/** Keep only response headers useful for provenance / cost tracking (never cookies). */
export function pickHeaders(headers) {
  const out = {};
  for (const [k, v] of headers.entries()) {
    if (/cookie|authorization|api-key/i.test(k)) continue;
    if (/request-id|history-item-id|song-id|cost|credit|character|model|processing-ms|ratelimit/i.test(k)) out[k] = v;
  }
  return out;
}

/** Remove undefined / null fields so request bodies only carry what the caller set. */
export function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null));
}
