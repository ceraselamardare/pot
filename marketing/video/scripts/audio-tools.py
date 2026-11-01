#!/usr/bin/env python3
"""Audio tools for the Pot video (audio agent). Needs only numpy + ffmpeg/ffprobe. Makes NO API calls.

Run from marketing/video:
  python3 scripts/audio-tools.py analyze <take.mp3> [...]          VO take QA: accuracy (Scribe transcript vs
                                                                   script), pace, pauses, F0, loudness, timing
  python3 scripts/audio-tools.py finalize-vo <id>=<take.mp3> [...]  trim + loudness-normalise chosen takes and
                                                                   write public/audio/vo/<id>.mp3,
                                                                   src/data/vo/<id>.json, src/data/vo-data.ts
  python3 scripts/audio-tools.py sfx-process <name>=<raw.mp3> [...] SFX: trim attack, fade tail, peak -3 dBFS
  python3 scripts/audio-tools.py sfx-analyze <file.mp3> [...]       SFX metrics (onset, peak, RMS, centroid, ...)

Take files are named public/audio/vo/_takes/<id>.<voice>.t<N>.mp3 and carry sidecars from scripts/lib/eleven.mjs:
<take>.alignment.json (ElevenLabs character alignment), <take>.meta.json, and <take>.stt.json (Scribe v2).
"""
import json
import math
import os
import re
import subprocess
import sys
import tempfile

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # marketing/video
LINES = json.load(open(os.path.join(ROOT, "scripts", "audio-lines.json")))
LINE_BY_ID = {l["id"]: l for l in LINES["lines"]}
SR = 44100
# Scratch files go outside the project (AUDIO_TMP or the OS temp dir); reports are kept next to the audio they describe.
TMP = os.environ.get("AUDIO_TMP") or os.path.join(tempfile.gettempdir(), "pot-audio-tmp")
VO_REPORT = os.path.join(ROOT, "public", "audio", "vo", "_takes", "finalize-report.json")
SFX_REPORT = os.path.join(ROOT, "public", "audio", "sfx", "_raw", "sfx-report.json")

# ----------------------------------------------------------------------------------------------- io


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def probe(path):
    p = run(["ffprobe", "-v", "error", "-show_entries", "stream=channels,sample_rate,bit_rate:format=duration",
             "-of", "json", path])
    j = json.loads(p.stdout)
    st = j["streams"][0]
    return {"channels": int(st["channels"]), "sample_rate": int(st["sample_rate"]),
            "bit_rate": int(st.get("bit_rate") or 0), "duration": float(j["format"]["duration"])}


def decode(path, sr=SR, mono=True):
    """float32 samples; shape (n,) when mono else (n, ch)."""
    ch = 1 if mono else probe(path)["channels"]
    cmd = ["ffmpeg", "-v", "error", "-i", path, "-ac", str(ch), "-ar", str(sr), "-f", "f32le", "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    x = np.frombuffer(raw, dtype=np.float32).copy()
    return x if mono else x.reshape(-1, ch)


def write_wav_f32(path, x, sr=SR):
    """Write float32 PCM (n,) or (n, ch) through ffmpeg (no scipy needed)."""
    x = np.asarray(x, dtype=np.float32)
    ch = 1 if x.ndim == 1 else x.shape[1]
    p = subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(sr), "-ac", str(ch), "-i", "-",
                        "-c:a", "pcm_f32le", path], input=x.tobytes(), capture_output=True)
    if p.returncode:
        raise RuntimeError(p.stderr.decode()[-800:])


def encode_mp3(src_wav, dst_mp3, bitrate="192k"):
    os.makedirs(os.path.dirname(dst_mp3), exist_ok=True)
    tmp = dst_mp3 + ".part.mp3"
    p = run(["ffmpeg", "-v", "error", "-y", "-i", src_wav, "-c:a", "libmp3lame", "-b:a", bitrate, "-ar", str(SR),
             tmp])
    if p.returncode:
        raise RuntimeError(p.stderr[-800:])
    os.replace(tmp, dst_mp3)


def loudness(path):
    """EBU R128 integrated loudness (LUFS), loudness range (LU) and true peak (dBTP) via ffmpeg ebur128."""
    p = run(["ffmpeg", "-nostats", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"])
    s = p.stderr
    summ = s[s.rfind("Summary:"):] if "Summary:" in s else s
    I = re.search(r"I:\s+(-?[\d.]+|-inf) LUFS", summ)
    LRA = re.search(r"LRA:\s+(-?[\d.]+) LU", summ)
    TP = re.search(r"True peak:\s+Peak:\s+(-?[\d.]+|-inf) dBFS", summ)
    f = lambda m: (float(m.group(1)) if m and m.group(1) != "-inf" else float("-inf"))
    return {"I": f(I), "LRA": f(LRA), "TP": f(TP)}


def dbfs(v):
    return 20 * math.log10(max(float(v), 1e-12))


# ----------------------------------------------------------------------------------------- text norm

ONES = ("zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen "
        "seventeen eighteen nineteen").split()
TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()


def num_words(n):
    n = int(n)
    if n < 20:
        return [ONES[n]]
    if n < 100:
        return [TENS[n // 10]] + ([ONES[n % 10]] if n % 10 else [])
    if n < 1000:
        return [ONES[n // 100], "hundred"] + (num_words(n % 100) if n % 100 else [])
    if n < 1_000_000:
        return num_words(n // 1000) + ["thousand"] + (num_words(n % 1000) if n % 1000 else [])
    return [str(n)]


ALIASES = {"dow": "dao", "dao": "dao", "ok": "okay"}


def norm_tokens(words):
    """words: list of display words -> list of (token, word_index). Lowercase, numbers and $ spelled out,
    hyphens split, apostrophes dropped, runs of single letters merged (D-A-O -> dao)."""
    out = []
    for wi, w in enumerate(words):
        s = w.lower().replace("\u2019", "'").replace("\u2018", "'")
        s = re.sub(r"\$(\d[\d,]*)(?:\.(\d\d))?", lambda m: f" {m.group(1).replace(',', '')} dollars ", s)
        s = s.replace("'", "")
        s = re.sub(r"[^a-z0-9]+", " ", s)
        for t in s.split():
            if t.isdigit():
                for x in num_words(t):
                    out.append((x, wi))
            else:
                out.append((ALIASES.get(t, t), wi))
    merged, i = [], 0
    while i < len(out):
        j = i
        while j < len(out) and len(out[j][0]) == 1 and out[j][0].isalpha():
            j += 1
        if j - i >= 2:
            merged.append(("".join(t for t, _ in out[i:j]), out[i][1]))
            i = j
        else:
            merged.append(out[i])
            i += 1
    return [(ALIASES.get(t, t), wi) for t, wi in merged]


def levenshtein_align(ref, hyp):
    """Token alignment -> list of (ref_i | None, hyp_j | None), plus (S, D, I)."""
    n, m = len(ref), len(hyp)
    D = np.zeros((n + 1, m + 1), dtype=np.int32)
    D[:, 0] = np.arange(n + 1)
    D[0, :] = np.arange(m + 1)
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            D[i, j] = min(D[i - 1, j] + 1, D[i, j - 1] + 1, D[i - 1, j - 1] + (ref[i - 1] != hyp[j - 1]))
    i, j, pairs, S, Dl, Ins = n, m, [], 0, 0, 0
    while i > 0 or j > 0:
        if i > 0 and j > 0 and D[i, j] == D[i - 1, j - 1] + (ref[i - 1] != hyp[j - 1]):
            S += ref[i - 1] != hyp[j - 1]
            pairs.append((i - 1, j - 1))
            i, j = i - 1, j - 1
        elif i > 0 and D[i, j] == D[i - 1, j] + 1:
            Dl += 1
            pairs.append((i - 1, None))
            i -= 1
        else:
            Ins += 1
            pairs.append((None, j - 1))
            j -= 1
    return pairs[::-1], (S, Dl, Ins)


def script_words(line_id):
    """Display words of the script line: whitespace tokens with at least one letter/digit, edge punctuation
    stripped (internal hyphens/apostrophes kept: Eighty-four, trip's, on-chain)."""
    out = []
    for tok in LINE_BY_ID[line_id]["text"].split():
        if not re.search(r"[A-Za-z0-9]", tok):
            continue
        out.append(re.sub(r"^[^A-Za-z0-9$]+|[^A-Za-z0-9]+$", "", tok))
    return out


# ------------------------------------------------------------------------------------- alignment words


def alignment_words(align_json):
    """Words from the ElevenLabs character alignment of the exact input text: whitespace tokens, audio tags
    ([...]) and punctuation-only tokens dropped; start/end = first/last letter or digit of the token."""
    a = align_json["alignment"]
    ch, st, en = a["characters"], a["character_start_times_seconds"], a["character_end_times_seconds"]
    toks, cur, in_tag = [], None, False
    for i, c in enumerate(ch):
        if c == "[":
            in_tag = True
        if in_tag:
            if c == "]":
                in_tag = False
            continue
        if c.isspace():
            if cur:
                toks.append(cur)
            cur = None
            continue
        if cur is None:
            cur = {"raw": "", "start": None, "end": None}
        cur["raw"] += c
        if c.isalnum():
            if cur["start"] is None:
                cur["start"] = st[i]
            cur["end"] = en[i]
    if cur:
        toks.append(cur)
    return [t for t in toks if t["start"] is not None]


# ------------------------------------------------------------------------------------------ envelope


def envelope(x, sr=SR, win_ms=10.0, hop_ms=2.5):
    win, hop = int(sr * win_ms / 1000), int(sr * hop_ms / 1000)
    n = 1 + max(0, (len(x) - win) // hop)
    idx = np.arange(win)[None, :] + hop * np.arange(n)[:, None]
    rms = np.sqrt((x[idx] ** 2).mean(axis=1) + 1e-20)
    t = (np.arange(n) * hop + win / 2) / sr
    return t, 20 * np.log10(rms + 1e-12), hop / sr


def speech_threshold(db):
    ref = float(np.percentile(db, 95))
    floor = float(np.percentile(db, 3))
    return max(ref - 38.0, floor + 8.0), ref, floor


def silences(t, db, hop, thr, min_ms=60.0):
    """Silent runs (db < thr) of at least min_ms, as [start, end] seconds."""
    quiet = db < thr
    runs, i, n = [], 0, len(db)
    while i < n:
        if quiet[i]:
            j = i
            while j < n and quiet[j]:
                j += 1
            s, e = t[i] - hop / 2, t[j - 1] + hop / 2
            if (e - s) * 1000 >= min_ms:
                runs.append([float(s), float(e)])
            i = j
        else:
            i += 1
    return runs


def speech_span(t, db, thr):
    act = np.where(db >= thr)[0]
    if not len(act):
        return 0.0, 0.0
    return float(t[act[0]]), float(t[act[-1]])


# ---------------------------------------------------------------------------------------------- YIN


def yin_f0(x, sr=16000, fmin=60.0, fmax=500.0, hop_s=0.01, W=400, thresh=0.12):
    tau_min, tau_max = int(sr / fmax), int(sr / fmin)
    L = W + tau_max
    hop = int(hop_s * sr)
    n = 1 + (len(x) - L) // hop
    if n <= 0:
        return np.array([]), np.array([]), np.array([]), np.array([])
    idx = np.arange(L)[None, :] + hop * np.arange(n)[:, None]
    fr = x[idx].astype(np.float64)
    fr = fr - fr.mean(axis=1, keepdims=True)
    N = 1 << int(math.ceil(math.log2(L + W)))
    A = np.fft.rfft(fr, N, axis=1)
    B = np.fft.rfft(fr[:, :W], N, axis=1)
    r = np.fft.irfft(A * np.conj(B), N, axis=1)[:, : tau_max + 1]
    cs = np.concatenate([np.zeros((n, 1)), np.cumsum(fr ** 2, axis=1)], axis=1)
    taus = np.arange(tau_max + 1)
    E0 = cs[:, W][:, None]
    Et = cs[:, taus + W] - cs[:, taus]
    d = E0 + Et - 2 * r
    d[:, 0] = 0
    cm = np.cumsum(d[:, 1:], axis=1)
    dn = np.ones_like(d)
    dn[:, 1:] = d[:, 1:] * taus[1:][None, :] / np.maximum(cm, 1e-12)
    f0 = np.full(n, np.nan)
    conf = np.ones(n)
    for i in range(n):
        row = dn[i]
        cand = np.where(row[tau_min:tau_max] < thresh)[0]
        if len(cand):
            tau = tau_min + cand[0]
            while tau + 1 < tau_max and row[tau + 1] < row[tau]:
                tau += 1
        else:
            tau = tau_min + int(np.argmin(row[tau_min:tau_max]))
        conf[i] = row[tau]
        if 0 < tau < tau_max:
            a, b, c = row[tau - 1], row[tau], row[tau + 1]
            den = a - 2 * b + c
            shift = 0.5 * (a - c) / den if abs(den) > 1e-12 else 0.0
            shift = max(-1.0, min(1.0, shift))
        else:
            shift = 0.0
        f0[i] = sr / (tau + shift)
    rms = np.sqrt((fr[:, :W] ** 2).mean(axis=1))
    t = (np.arange(n) * hop + W / 2) / sr
    return t, f0, conf, rms


def lowpass(x, sr, fc=1000.0):
    """Zero-phase FFT low-pass with a linear taper over fc*0.75..fc*1.25 (pitch-tracking prefilter)."""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / sr)
    g = np.clip((fc * 1.25 - f) / (fc * 0.5), 0, 1)
    return np.fft.irfft(X * g, len(x)).astype(np.float32)


def f0_stats(path):
    """YIN F0 on a 1 kHz low-passed 16 kHz signal (validated: a synthetic 7-semitone glide reads 6.1 st p5-p95;
    stats agree within 0.3 st across window/threshold variants). Voiced = CMNDF minimum < 0.25 and level within
    30 dB of the clip's loud frames; isolated frames and >4 st jumps vs the local median are dropped."""
    x = lowpass(decode(path, sr=16000), 16000)
    t, f0, conf, rms = yin_f0(x)
    if not len(t):
        return {}
    rdb = 20 * np.log10(rms + 1e-12)
    voiced = (conf < 0.25) & (rdb > np.percentile(rdb, 95) - 30)
    f = f0.copy()
    f[~voiced] = np.nan
    # median-filter (5) the voiced track and drop octave jumps / isolated frames
    vals = f.copy()
    for i in range(len(f)):
        w = f[max(0, i - 2): i + 3]
        w = w[~np.isnan(w)]
        if np.isnan(f[i]) or len(w) < 3:
            vals[i] = np.nan
            continue
        med = np.median(w)
        if abs(12 * math.log2(f[i] / med)) > 4:
            vals[i] = np.nan
    v = vals[~np.isnan(vals)]
    if len(v) < 20:
        return {"voiced_frames": int(len(v))}
    med = float(np.median(v))
    st = 12 * np.log2(v / med)
    st = st[np.abs(st) < 12]
    # pitch movement: mean |d st| per 10 ms inside voiced runs
    dv = []
    for i in range(1, len(vals)):
        if not np.isnan(vals[i]) and not np.isnan(vals[i - 1]):
            dv.append(abs(12 * math.log2(vals[i] / vals[i - 1])))
    return {
        "f0_median_hz": round(med, 1),
        "st_sd": round(float(st.std()), 2),
        "st_p5_p95": round(float(np.percentile(st, 95) - np.percentile(st, 5)), 2),
        "st_p10_p90": round(float(np.percentile(st, 90) - np.percentile(st, 10)), 2),
        "st_motion_per_s": round(float(np.mean(dv)) * 100, 1) if dv else None,
        "voiced_s": round(len(v) * 0.01, 2),
    }


# ----------------------------------------------------------------------------------- word timing logic


def stt_words(stt_json):
    return [w for w in stt_json["transcript"]["words"] if w.get("type") == "word"]


def accuracy(line_id, stt_json):
    ref_words = script_words(line_id)
    hyp_words = [w["text"] for w in stt_words(stt_json)]
    ref = norm_tokens(ref_words)
    hyp = norm_tokens(hyp_words)
    pairs, (S, D, I) = levenshtein_align([t for t, _ in ref], [t for t, _ in hyp])
    diffs = []
    for ri, hj in pairs:
        r = ref[ri][0] if ri is not None else None
        h = hyp[hj][0] if hj is not None else None
        if r != h:
            diffs.append(f"{r or '-'}->{h or '-'}")
    joined_equal = "".join(t for t, _ in ref) == "".join(t for t, _ in hyp)
    events = [w["text"] for w in stt_json["transcript"]["words"] if w.get("type") == "audio_event"]
    lowconf = [(w["text"], round(w["logprob"], 2)) for w in stt_words(stt_json) if w.get("logprob", 0) < -1.0]
    return {
        "wer": round((S + D + I) / max(1, len(ref)), 3),
        "subs": S, "dels": D, "ins": I,
        "diffs": diffs,
        "tokenisation_only": bool(diffs) and joined_equal,
        "ok": (not diffs) or joined_equal,
        "audio_events": events,
        "low_confidence": lowconf,
        "transcript": stt_json["transcript"]["text"],
    }


def map_stt_to_script(line_id, stt_json, align_words):
    """Per script word: (start, end, source). Uses Scribe word timestamps (precise, measured on the audio);
    when Scribe merges several script words into one ("Eighty-four dollars" -> "$84"), its span is split in
    proportion to the ElevenLabs alignment durations; unmatched words fall back to the alignment shifted by the
    median alignment-vs-Scribe offset."""
    words = script_words(line_id)
    sw = stt_words(stt_json)
    ref = norm_tokens(words)
    hyp = norm_tokens([w["text"] for w in sw])
    pairs, _ = levenshtein_align([t for t, _ in ref], [t for t, _ in hyp])
    owners = {}  # script word index -> set of stt word idx
    for ri, hj in pairs:
        if ri is not None and hj is not None:
            owners.setdefault(ref[ri][1], set()).add(hyp[hj][1])
    users = {}  # stt word idx -> set of script word idx
    for wi, js in owners.items():
        for j in js:
            users.setdefault(j, set()).add(wi)
    out = [None] * len(words)
    offs = []
    for wi in range(len(words)):
        js = sorted(owners.get(wi, []))
        if not js:
            continue
        if len(js) >= 1 and all(users[j] == {wi} for j in js):
            out[wi] = [sw[js[0]]["start"], sw[js[-1]]["end"], "stt"]
        elif len(js) == 1:
            group = sorted(users[js[0]])
            span_s, span_e = sw[js[0]]["start"], sw[js[0]]["end"]
            if len(align_words) == len(words):
                durs = [max(0.04, align_words[k]["end"] - align_words[k]["start"]) for k in group]
            else:
                durs = [len(words[k]) for k in group]
            tot = sum(durs)
            acc = span_s
            for k, dk in zip(group, durs):
                seg = (span_e - span_s) * dk / tot
                if out[k] is None:
                    out[k] = [acc, acc + seg, "stt-split"]
                acc += seg
        else:
            out[wi] = [sw[js[0]]["start"], sw[js[-1]]["end"], "stt"]
    if len(align_words) == len(words):
        for wi, o in enumerate(out):
            if o is not None and o[2] == "stt":
                offs.append(align_words[wi]["start"] - o[0])
        med = float(np.median(offs)) if offs else 0.0
        for wi in range(len(words)):
            if out[wi] is None:
                out[wi] = [align_words[wi]["start"] - med, align_words[wi]["end"] - med, "align"]
    return words, out


def expected_pauses(line_id):
    """Boundaries (after script word index k) where the script asks for a pause: '…' or '?' inside the line
    (strong), '.' inside the line (sentence), ',' (light)."""
    toks = LINE_BY_ID[line_id]["text"].split()
    exp, k = [], -1
    for i, tok in enumerate(toks):
        has_word = re.search(r"[A-Za-z0-9]", tok)
        if has_word:
            k += 1
        tail = tok if not has_word else re.sub(r"^.*[A-Za-z0-9]", "", tok)
        if k < 0:
            continue
        kind = None
        if "…" in tail or "..." in tail:
            kind = "ellipsis"
        elif "?" in tail:
            kind = "question"
        elif "." in tail or "!" in tail:
            kind = "sentence"
        elif "," in tail:
            kind = "comma"
        if kind and i < len(toks) - 1:
            exp.append((k, kind))
    # dedupe (a standalone "…" after "Pot." makes the same boundary an ellipsis)
    best = {}
    rank = {"ellipsis": 3, "question": 2, "sentence": 1, "comma": 0}
    for k, kind in exp:
        if k not in best or rank[kind] > rank[best[k]]:
            best[k] = kind
    return best


MIN_PAUSE = {"ellipsis": 0.25, "question": 0.18, "sentence": 0.12, "comma": 0.0}

SYL_OVERRIDE = {"every": 2, "everyone": 3, "dao": 3, "leo": 2, "groceries": 3, "hundred": 2, "notification": 5,
                "near": 1, "approved": 2, "approves": 2}


def syllables(word):
    """Heuristic English syllable count (vowel groups, silent -e/-es/-ed), with overrides for script words."""
    total = 0
    for part in re.split(r"[- ]", re.sub(r"[^a-z' -]", "", word.lower())):
        part = part.strip("'").replace("'", "")
        if not part:
            continue
        if part in SYL_OVERRIDE:
            total += SYL_OVERRIDE[part]
            continue
        n = len(re.findall(r"[aeiouy]+", part))
        if n > 1 and part.endswith("e") and not part.endswith(("le", "ee")):
            n -= 1
        elif n > 1 and part.endswith("es") and not part.endswith(("ses", "zes", "ces", "ges", "xes")):
            n -= 1
        elif n > 1 and part.endswith("ed") and not part.endswith(("ted", "ded")):
            n -= 1
        total += max(1, n)
    return total


def frame_centroids(x, t, sr=SR, win_ms=10.0):
    win = int(sr * win_ms / 1000)
    starts = np.clip((t * sr - win / 2).astype(int), 0, max(0, len(x) - win))
    idx = starts[:, None] + np.arange(win)[None, :]
    S = np.abs(np.fft.rfft(x[idx] * np.hanning(win)[None, :], 512, axis=1)) ** 2
    f = np.fft.rfftfreq(512, 1 / sr)
    return (S * f[None, :]).sum(axis=1) / np.maximum(S.sum(axis=1), 1e-20)


class Acoustics:
    """Energy envelope (10 ms RMS, 2.5 ms hop), silence runs (< p95 - 38 dB, >= 60 ms) and a speech-like mask that
    tells breaths from speech: speech = within 30 dB of the loud frames, or within 34 dB with a spectral centroid
    above 5 kHz (s, sh, f). Inhales measured on these takes sit 36-42 dB down with a 2-4 kHz centroid."""

    def __init__(self, x):
        self.x = x
        self.t, self.db, self.hop = envelope(x)
        self.thr, self.ref, self.floor = speech_threshold(self.db)
        self.cent = frame_centroids(x, self.t)
        rel = self.db - self.ref
        self.speechlike = (rel >= -30) | ((rel >= -34) & (self.cent > 5000))
        self.sil = silences(self.t, self.db, self.hop, self.thr)
        self.s0, self.s1 = speech_span(self.t, self.db, self.thr)

    def onset_after(self, t0, max_breath=0.45):
        """First speech-like frame at/after t0, skipping a breath; returns (onset_s, skipped_breath)."""
        i = int(np.searchsorted(self.t, t0))
        j = i
        while j < len(self.t) and not self.speechlike[j]:
            j += 1
        if j >= len(self.t) or self.t[j] - t0 > max_breath:
            return float(t0), False
        return float(max(t0, self.t[j] - 0.004)), j > i + 4

    def speech_end_before(self, t1, floor_t=0.0):
        """End of the last speech-like frame before t1 (drops an exhale/aspiration tail from a word's end)."""
        j = int(np.searchsorted(self.t, t1)) - 1
        while j > 0 and not self.speechlike[j] and self.t[j] > floor_t:
            j -= 1
        return float(min(t1, self.t[j] + 0.004))


def final_times(line_id, path):
    """Word times on the raw take's clock + timing diagnostics.
    1. Scribe word timestamps mapped onto the script words (map_stt_to_script).
    2. Anchors = the first word and every word that starts right after a silence; their start snaps to the measured
       speech onset (breaths skipped) and the previous word ends where the silence starts.
    3. Scribe starts run late by a consonant-dependent amount (measured at the anchors); every non-anchored word is
       shifted earlier by the median anchor offset (erring early is safe: video-leads-audio is detectable only
       from 125 ms, audio-leads-video from 45 ms)."""
    align = json.load(open(path + ".alignment.json"))
    stt = json.load(open(path + ".stt.json"))
    aw = alignment_words(align)
    words, base = map_stt_to_script(line_id, stt, aw)
    x = decode(path)
    ac = Acoustics(x)
    n = len(words)
    anchors = {}
    o, br = ac.onset_after(ac.s0)
    anchors[0] = {"onset": o, "breath": br, "pause_start": None}
    for s, e in ac.sil:
        if not (ac.s0 < s and e < ac.s1):
            continue
        o, br = ac.onset_after(e)
        k = int(np.argmin([abs(base[i][0] - o) for i in range(n)]))
        # a true word onset precedes Scribe's (late) start; an onset after a stop closure inside a word comes after it
        if k == 0 or not (-0.30 <= o - base[k][0] <= 0.03):
            continue
        if k in anchors:
            anchors[k]["pause_start"] = min(anchors[k]["pause_start"], s)
            anchors[k]["onset"] = max(anchors[k]["onset"], o)
            anchors[k]["breath"] = anchors[k]["breath"] or br
        else:
            anchors[k] = {"onset": o, "breath": br, "pause_start": s}
    stt_offs = [base[k][0] - a["onset"] for k, a in anchors.items() if base[k][2] == "stt"]
    off = float(np.median(stt_offs)) if len(stt_offs) >= 2 else (stt_offs[0] if stt_offs else 0.0)
    off = max(0.0, off)  # only correct a late bias
    times = [[b[0] - off, b[1] - off] for b in base]
    for k, a in anchors.items():
        times[k][0] = a["onset"]
        if k > 0 and a["pause_start"] is not None:
            times[k - 1][1] = ac.speech_end_before(a["pause_start"], floor_t=times[k - 1][0] + 0.05)
    # end of speech: the first silence (>= 150 ms) after the last word starts; anything after it is a breath for
    # the next line or a click (seen on s04/s08 takes) and is trimmed away. No such silence -> end of sound.
    ac.speech_end, ac.next_sound = ac.s1, None
    for s_, e_ in ac.sil:
        if s_ > times[-1][0] + 0.05 and (e_ - s_) >= 0.15:
            ac.speech_end, ac.next_sound = s_, (e_ if e_ < len(x) / SR - 0.005 else None)
            break
    times[-1][1] = ac.speech_end_before(ac.speech_end + 0.001, floor_t=times[-1][0] + 0.05)
    for i in range(n):
        if i > 0:
            times[i][0] = max(times[i][0], times[i - 1][0] + 0.02)
        times[i][1] = max(times[i][1], times[i][0] + 0.03)
    for i in range(n - 1):
        times[i][1] = min(times[i][1], times[i + 1][0]) if times[i + 1][0] > times[i][0] + 0.03 else times[i][1]
    diag = {
        "stt_offset_median": round(off, 3),
        "anchors": [
            {"word": words[k], "k": k, "onset": round(a["onset"], 3), "breath": a["breath"],
             "stt_minus_onset": round(base[k][0] - a["onset"], 3),
             "align_minus_onset": round(aw[k]["start"] - a["onset"], 3) if len(aw) == n else None}
            for k, a in sorted(anchors.items())
        ],
        "align_vs_final_nonanchor_median": round(float(np.median(
            [aw[i]["start"] - times[i][0] for i in range(n) if i not in anchors])), 3) if len(aw) == n and n > len(anchors) else None,
    }
    return words, times, anchors, diag, ac


def analyze_take(path, verbose=True):
    base = os.path.basename(path)
    m = re.match(r"(s\d\d-[a-z]+)\.([a-z]+)\.t(\d+)\.mp3$", base)
    line_id, voice, take = (m.group(1), m.group(2), int(m.group(3))) if m else (None, None, None)
    stt = json.load(open(path + ".stt.json"))
    align = json.load(open(path + ".alignment.json"))
    words, times, anchors, diag, ac = final_times(line_id, path)
    n = len(words)
    first_onset = times[0][0]
    span = times[-1][1] - first_onset
    pauses = []
    for k in range(n - 1):
        if (k + 1) in anchors:
            g = times[k + 1][0] - times[k][1]
            if g >= 0.1:
                pauses.append({"after": words[k], "k": k, "sec": round(g, 3)})
    pause_total = sum(p["sec"] for p in pauses)
    gaps = {k: (times[k + 1][0] - times[k][1]) if (k + 1) in anchors else 0.0 for k in range(n - 1)}
    missing = [{"after": words[k], "kind": kind, "sec": round(gaps.get(k, 0.0), 3)}
               for k, kind in expected_pauses(line_id).items() if gaps.get(k, 0.0) < MIN_PAUSE[kind]]
    syl = sum(syllables(w) for w in words)
    acc = accuracy(line_id, stt)
    f0 = f0_stats(path)
    ln = loudness(path)
    res = {
        "take": base, "line": line_id, "voice": voice, "n": take,
        "tts_text": align.get("text"),
        "duration": round(len(ac.x) / SR, 3),
        "speech_start": round(first_onset, 3), "speech_end": round(ac.s1, 3), "speech_span": round(span, 3),
        "words": n, "syllables": syl,
        "wps_span": round(n / span, 2) if span else None,
        "sps_span": round(syl / span, 2) if span else None,
        "wps_articulation": round(n / max(0.1, span - pause_total), 2) if span else None,
        "pauses": pauses, "missing_pauses": missing,
        "timing": diag,
        "accuracy": acc, "f0": f0, "loudness": ln,
        "threshold_db": round(ac.thr, 1),
        "times": [[w, round(a, 3), round(b, 3)] for w, (a, b) in zip(words, times)],
    }
    with open(path + ".qa.json", "w") as fh:
        json.dump(res, fh, indent=2)
    if verbose:
        a = res["accuracy"]
        print(f"{base}: dur {res['duration']:.2f}s span {span:.2f}s | {n} w {res['wps_span']} w/s, {syl} syl "
              f"{res['sps_span']} syl/s (artic {res['wps_articulation']} w/s)"
              f" | acc {'OK' if a['ok'] else 'FAIL'} wer {a['wer']} {a['diffs'] if a['diffs'] else ''}"
              f"{' events ' + str(a['audio_events']) if a['audio_events'] else ''}"
              f"{' lowconf ' + str(a['low_confidence']) if a['low_confidence'] else ''}")
        print(f"   F0 sd {f0.get('st_sd')} st, p10-p90 {f0.get('st_p10_p90')} st, median {f0.get('f0_median_hz')} Hz"
              f" | I {ln['I']} LUFS TP {ln['TP']} dBTP")
        print(f"   pauses {[(p['after'], p['sec']) for p in pauses]}{' MISSING ' + str(missing) if missing else ''}")
        print(f"   timing: stt offset {diag['stt_offset_median']} s; anchors (stt-onset / align-onset): "
              f"{[(an['word'], an['stt_minus_onset'], an['align_minus_onset'], 'breath' if an['breath'] else '') for an in diag['anchors']]}")
    return res


# ------------------------------------------------------------------------------------------ finalize VO


def finalize_vo(pairs, lead=0.05, tail=0.15, target_i=-16.0, max_tp=-1.5):
    os.makedirs(os.path.join(ROOT, "src", "data", "vo"), exist_ok=True)
    tmpdir = TMP
    os.makedirs(tmpdir, exist_ok=True)
    report = []
    for pair in pairs:
        line_id, take_path = pair.split("=", 1)
        qa = analyze_take(take_path, verbose=False)
        words, times, anchors, diag, ac = final_times(line_id, take_path)
        x = ac.x
        # keep `lead` s before the first sound (ac.s0, includes any breath): cut the excess, or pad digital silence
        # when the take starts sooner (ElevenLabs often starts the first consonant within ~10 ms).
        cut0 = ac.s0 - lead
        cut1 = min(len(x) / SR, ac.speech_end + tail, (ac.next_sound - 0.01) if ac.next_sound else 1e9)
        i0, i1 = int(round(cut0 * SR)), int(round(cut1 * SR))
        if i0 >= 0:
            y = x[i0:i1].astype(np.float64)
        else:
            y = np.concatenate([np.zeros(-i0), x[:i1]]).astype(np.float64)
        shift = i0 / SR  # exact: word times move by what was cut (or padded, negative)
        fi, fo = int(0.003 * SR), int(0.04 * SR)
        if i0 > 0:
            y[:fi] *= np.linspace(0, 1, fi)
        y[-fo:] *= np.cos(np.linspace(0, math.pi / 2, fo)) ** 2
        trimmed = os.path.join(tmpdir, f"{line_id}.trim.wav")
        write_wav_f32(trimmed, y)
        out_mp3 = os.path.join(ROOT, "public", "audio", "vo", f"{line_id}.mp3")
        gain_db, chain, lstats = loudness_chain(trimmed, out_mp3, target_i, max_tp)
        ln = loudness(out_mp3)
        dur = probe(out_mp3)["duration"]
        out_words = []
        for w, (a, b) in zip(words, times):
            a2 = min(max(0.0, a - shift), dur)
            b2 = min(max(a2, b - shift), dur)
            out_words.append({"text": w, "start": round(a2, 3), "end": round(b2, 3)})
        clip = {"id": line_id, "file": f"audio/vo/{line_id}.mp3", "durationSec": round(dur, 3), "words": out_words}
        with open(os.path.join(ROOT, "src", "data", "vo", f"{line_id}.json"), "w") as fh:
            json.dump(clip, fh, indent=2)
            fh.write("\n")
        dec = decode(out_mp3)
        report.append({
            "id": line_id, "take": os.path.basename(take_path), "shift": round(shift, 4),
            "duration": round(dur, 3), "words": len(out_words), "syllables": qa["syllables"],
            "first_word_at": out_words[0]["start"], "last_word_end": out_words[-1]["end"],
            "wps_clip": round(len(out_words) / dur, 2), "wps_span": qa["wps_span"], "sps_span": qa["sps_span"],
            "pauses": qa["pauses"], "stt_offset": diag["stt_offset_median"], "anchors": diag["anchors"],
            "gain_db": round(gain_db, 2), "dynamics": lstats, "chain": chain, "I": ln["I"], "TP": ln["TP"], "LRA": ln["LRA"],
            "sample_peak_dbfs": round(dbfs(np.abs(dec).max()), 2), "f0": qa["f0"],
        })
        print(json.dumps({k: report[-1][k] for k in ("id", "take", "duration", "wps_span", "sps_span", "I", "TP",
                                                       "sample_peak_dbfs", "first_word_at", "stt_offset", "dynamics")}))
    write_vo_data()
    with open(VO_REPORT, "w") as fh:
        json.dump(report, fh, indent=2)
    return report


def loudness_chain(src_wav, dst_mp3, target_i, max_tp, ref_i=-24.0):
    """Voice chain with a FIXED operating point, then measured make-up gain:
      HPF 70 Hz -> pre-gain to ref_i LUFS -> compressor 2.5:1 above -18 dBFS (8 ms / 120 ms, 6 dB knee; at that
      reference only the loudest syllables are touched: ~2-3 dB of loudness, vs ~7 dB for a -26 dBFS threshold,
      which flattened every vowel) -> make-up gain g1 -> 4x-oversampled lookahead limiter (3 ms / 40 ms) that
      only meets isolated transients (TTS peaks are glottal/plosive spikes: >1 dB GR on <=2 % of speech blocks).
    Only g1 (and, if needed, the limiter ceiling) is iterated, so the compression amount never grows with the
    target. Stops when the encoded mp3 reads target_i +- 0.2 LUFS with true peak <= max_tp dBTP.
    Returns (g1_db, chain, stats) with the peak-to-loudness ratio before/after compression and at the output."""
    ln_in = loudness(src_wav)
    g0 = ref_i - ln_in["I"]
    comp = (f"highpass=f=70:poles=2,volume={g0:.2f}dB,"
            "acompressor=threshold=-18dB:ratio=2.5:attack=8:release=120:knee=6:detection=rms:makeup=1")
    tmp_c = dst_mp3 + ".comp.wav"
    p = run(["ffmpeg", "-v", "error", "-y", "-i", src_wav, "-af", comp, "-c:a", "pcm_f32le", tmp_c])
    if p.returncode:
        raise RuntimeError(p.stderr[-800:])
    ln_c = loudness(tmp_c)
    g1 = target_i - ln_c["I"]
    ceiling = max_tp - 0.4
    chain = ""
    for _ in range(10):
        lim = (f"volume={g1:.2f}dB,aresample=176400,"
               f"alimiter=limit={10 ** (ceiling / 20):.4f}:attack=3:release=40:level=false:latency=true,"
               f"aresample={SR}")
        chain = f"{comp},{lim}"
        tmp_wav = dst_mp3 + ".proc.wav"
        p = run(["ffmpeg", "-v", "error", "-y", "-i", tmp_c, "-af", lim, "-c:a", "pcm_f32le", tmp_wav])
        if p.returncode:
            raise RuntimeError(p.stderr[-800:])
        encode_mp3(tmp_wav, dst_mp3)
        os.remove(tmp_wav)
        ln = loudness(dst_mp3)
        di = target_i - ln["I"]
        if abs(di) <= 0.2 and ln["TP"] <= max_tp:
            break
        if ln["TP"] > max_tp:
            ceiling -= (ln["TP"] - max_tp) + 0.05
        g1 += di
    os.remove(tmp_c)
    stats = {
        "plr_in": round(ln_in["TP"] - ln_in["I"], 1),
        "plr_after_comp": round(ln_c["TP"] - ln_c["I"], 1),
        "plr_out": round(ln["TP"] - ln["I"], 1),
        "limiter_gr_db": round(max(0.0, (ln_c["TP"] + g1) - ceiling), 1),
        "pre_gain_db": round(g0, 2), "makeup_db": round(g1, 2), "ceiling_dbfs": round(ceiling, 2),
    }
    return g1, chain, stats


def write_vo_data():
    vo_dir = os.path.join(ROOT, "src", "data", "vo")
    ids = [l["id"] for l in LINES["lines"] if os.path.exists(os.path.join(vo_dir, f"{l['id']}.json"))]
    var = lambda i: "vo_" + i.replace("-", "_")
    lines = [
        "// Registry of generated VO alignments (written by scripts/audio-tools.py finalize-vo; do not edit by hand).",
        "// One static JSON import per clip so Remotion bundles them. Times are seconds relative to the final clip.",
        'import type { VoClip } from "./vo";',
    ]
    lines += [f'import {var(i)} from "./vo/{i}.json";' for i in ids]
    lines.append("")
    lines.append("export const VO_DATA: Partial<Record<string, VoClip>> = {")
    lines += [f'  "{i}": {var(i)},' for i in ids]
    lines.append("};")
    with open(os.path.join(ROOT, "src", "data", "vo-data.ts"), "w") as fh:
        fh.write("\n".join(lines) + "\n")


# ------------------------------------------------------------------------------------------------- SFX


def sfx_metrics(path):
    info = probe(path)
    x = decode(path, mono=False)
    mono = x.mean(axis=1)
    peak = float(np.abs(x).max())
    t, db, hop = envelope(mono, win_ms=5, hop_ms=1)
    pk = db.max()
    above = np.where(db > pk - 30)[0]
    onset = float(t[above[0]] - 0.0025) if len(above) else 0.0
    above60 = np.where(db > pk - 50)[0]
    end = float(t[above60[-1]]) if len(above60) else 0.0
    t_peak = float(t[int(np.argmax(db))])
    rms = float(np.sqrt((mono ** 2).mean()))
    # energy-weighted spectral centroid / flatness (frames above pk-40)
    win = 2048
    hopn = 512
    frames = [mono[i:i + win] for i in range(0, max(1, len(mono) - win), hopn)]
    cents, flats, ws = [], [], []
    freqs = np.fft.rfftfreq(win, 1 / SR)
    hann = np.hanning(win)
    for f in frames:
        if len(f) < win:
            continue
        S = np.abs(np.fft.rfft(f * hann)) + 1e-12
        e = float((S ** 2).sum())
        if 10 * math.log10(e + 1e-20) < 10 * math.log10(1e-20):
            continue
        P = S ** 2
        cents.append(float((freqs * P).sum() / P.sum()))
        band = (freqs > 100) & (freqs < 12000)
        flats.append(float(np.exp(np.mean(np.log(P[band]))) / np.mean(P[band])))
        ws.append(e)
    ws = np.array(ws) if ws else np.array([1.0])
    cent = float(np.average(cents, weights=ws)) if cents else 0.0
    flat = float(np.average(flats, weights=ws)) if flats else 0.0
    # energy concentration: time holding 90 % of the energy
    e = mono ** 2
    ce = np.cumsum(e) / max(1e-20, e.sum())
    t90 = float((np.searchsorted(ce, 0.95) - np.searchsorted(ce, 0.05)) / SR)
    return {
        "file": os.path.basename(path), "dur": round(info["duration"], 3), "ch": info["channels"],
        "onset_ms": round(onset * 1000, 1), "t_peak_ms": round(t_peak * 1000, 1), "end_50db": round(end, 3),
        "peak_dbfs": round(dbfs(peak), 2), "rms_dbfs": round(dbfs(rms), 2), "crest_db": round(dbfs(peak) - dbfs(rms), 1),
        "centroid_hz": round(cent), "flatness": round(flat, 3), "t90_s": round(t90, 3),
    }


def sfx_process(name, raw, out, spec):
    """Trim silence before the attack (onset <= ~5 ms), cut to spec['max'] seconds, fade the tail, peak -3 dBFS."""
    x = decode(raw, mono=False)
    mono = np.abs(x).max(axis=1)
    n = len(mono)
    pk = mono.max()
    gate_db = spec.get("gate_db", -40.0)  # onset threshold relative to the peak
    above = np.where(mono > pk * 10 ** (gate_db / 20))[0]
    i0 = max(0, int(above[0]) - int(0.002 * SR)) if len(above) else 0
    y = x[i0:].astype(np.float64)
    # tail: end where the envelope stays below -60 dB re peak, or at spec max
    env = np.abs(y).max(axis=1)
    k = int(0.005 * SR)
    sm = np.convolve(env, np.ones(k) / k, mode="same")
    alive = np.where(sm > pk * 10 ** (-60 / 20))[0]
    i_end = int(alive[-1]) + 1 if len(alive) else len(y)
    if spec.get("max"):
        i_end = min(i_end, int(spec["max"] * SR))
    i_end = max(i_end, int(0.03 * SR))
    y = y[:i_end]
    fi = int(spec.get("fade_in_ms", 1.5) / 1000 * SR)
    if fi > 0:
        y[:fi] *= np.linspace(0, 1, fi)[:, None]
    fo = min(len(y) // 2, int(spec.get("fade_out", spec.get("fade", 0.05)) * SR))
    if fo > 0:
        y[-fo:] *= (np.cos(np.linspace(0, math.pi / 2, fo)) ** 2)[:, None]
    target = 10 ** (-3.0 / 20)
    y = y / np.abs(y).max() * target
    tmp = out + ".proc.wav"
    write_wav_f32(tmp, y.astype(np.float32))
    encode_mp3(tmp, out, bitrate="192k")
    # mp3 moves peaks (overshoot on transients; on bright transients the decoded peak jumps by up to +-0.7 dB
    # between encodes of slightly rescaled input). Try a few scales, keep the attempt whose DECODED peak is
    # closest to -3.0 dBFS without exceeding -2.7, and re-encode exactly that one (LAME is deterministic).
    attempts = []
    for _ in range(5):
        dec_db = dbfs(float(np.abs(decode(out, mono=False)).max()))
        attempts.append((abs(dec_db + 3.0) + (10.0 if dec_db > -2.7 else 0.0), y.copy()))
        if abs(dec_db + 3.0) <= 0.15:
            break
        y = y * 10 ** ((-3.0 - dec_db) / 20)
        write_wav_f32(tmp, y.astype(np.float32))
        encode_mp3(tmp, out, bitrate="192k")
    best = min(range(len(attempts)), key=lambda i: attempts[i][0])
    if best != len(attempts) - 1 or attempts[-1][0] > 0.15:
        write_wav_f32(tmp, attempts[best][1].astype(np.float32))
        encode_mp3(tmp, out, bitrate="192k")
    os.remove(tmp)
    return sfx_metrics(out)


# ------------------------------------------------------------------------------------------- SFX build

# Chosen raw variant per name (public/audio/sfx/_raw/<name>.v<N>.mp3), picked from measured metrics; v3/v4 are the
# one-time regenerations. "composite" = built from generated material (see SFX_COMPOSITES).
SFX_PICK = {
    "whoosh-fast": 2, "whoosh-long": 1, "swoosh-up": 1, "pop": 1, "pop-soft": 1, "tap": 3, "click": 4,
    "keypad": 2, "typing": 2, "notif": 1, "buzz": 2, "blips": "composite", "success": "composite", "burst": 2,
    "riser": 2, "impact": "composite", "thud": 2, "scribble": 1, "paper": 1, "tick": 1, "swipe": 2,
    "sparkle": 2, "stamp": 2, "glitch": 2,
}


def raw_sfx(name, v):
    return os.path.join(ROOT, "public", "audio", "sfx", "_raw", f"{name}.v{v}.mp3")


def onset_trim(x, gate_db=-35.0, pre_ms=2.0):
    a = np.abs(x).max(axis=1)
    idx = np.where(a > a.max() * 10 ** (gate_db / 20))[0]
    i0 = max(0, int(idx[0]) - int(pre_ms / 1000 * SR)) if len(idx) else 0
    return x[i0:]


def pitch_shift(x, semitones):
    """Resample-style pitch shift (duration scales by 1/ratio), via ffmpeg asetrate + aresample."""
    ratio = 2 ** (semitones / 12)
    tmp = os.path.join(TMP, "ps-in.wav")
    os.makedirs(os.path.dirname(tmp), exist_ok=True)
    write_wav_f32(tmp, x)
    ch = x.shape[1]
    p = subprocess.run(["ffmpeg", "-v", "error", "-i", tmp, "-af", f"asetrate={round(SR * ratio)},aresample={SR}",
                        "-ac", str(ch), "-f", "f32le", "-"], capture_output=True, check=True)
    os.remove(tmp)
    return np.frombuffer(p.stdout, dtype=np.float32).reshape(-1, ch).astype(np.float64)


def fade_out(x, sec):
    n = min(len(x), int(sec * SR))
    if n > 0:
        x[-n:] *= (np.cos(np.linspace(0, math.pi / 2, n)) ** 2)[:, None]
    return x


def place(buf, x, at_s, gain=1.0):
    i = int(round(at_s * SR))
    need = i + len(x)
    if need > len(buf):
        buf = np.concatenate([buf, np.zeros((need - len(buf), buf.shape[1]))])
    buf[i:i + len(x)] += gain * x
    return buf


def stereo(x):
    return x if x.shape[1] == 2 else np.repeat(x, 2, axis=1)


def composite_blips():
    """Three soft, rounded blips 150 ms apart (the motion kit's typing-dots stagger), rising as a major triad
    (517 -> 651 -> 775 Hz), each an 80 ms slice of the generated 'notif' v1 first tone (a clean 517 Hz sine-like
    tone) with a 40 ms cos^2 release, pitch-shifted 0 / +4 / +7 semitones. The four direct generations gave a
    continuous glide or 8-10 kHz ticks, never three blips; a 'pop-soft' grain was too click-like (2.7 dB tonality)."""
    g = onset_trim(decode(raw_sfx("notif", 1), mono=False).astype(np.float64), -35)[: int(0.08 * SR)].copy()
    g[: int(0.003 * SR)] *= np.linspace(0, 1, int(0.003 * SR))[:, None]
    g = fade_out(g, 0.04)
    buf = np.zeros((1, g.shape[1]))
    for k, (st, gain) in enumerate([(0, 0.8), (4, 0.9), (7, 1.0)]):
        buf = place(buf, pitch_shift(g, st), 0.150 * k, gain)
    return buf


def composite_success():
    """Two-note rising chime (G5 -> C6, a perfect fourth, 110 ms apart) made from the generated 'success' v2 bell
    (1055 Hz, clean single note): note 1 = the bell shifted down 5 semitones and damped after 0.25 s, note 2 = the
    bell itself with its natural decay. All four direct generations were single-pitch chimes."""
    b = onset_trim(decode(raw_sfx("success", 2), mono=False).astype(np.float64), -35)
    n1 = pitch_shift(b, -5)[: int(0.30 * SR)].copy()
    n1 = fade_out(n1, 0.18)
    buf = np.zeros((1, b.shape[1]))
    buf = place(buf, n1, 0.0, 0.85)
    buf = place(buf, b[: int(0.95 * SR)], 0.11, 1.0)
    return buf


def composite_impact():
    """Logo-reveal hit: the generated sub boom ('impact' v3, ~43 Hz) high-passed at 30 Hz and given a real decay
    (flat 0.1 s, then -40 dB by ~1.4 s), layered with the generated 'thud' v2 transient at 0 ms so the hit reads on
    phone/laptop speakers (a 43 Hz sine alone is inaudible there). Direct generations: sustained sub tones."""
    sub = onset_trim(decode(raw_sfx("impact", 3), mono=False).astype(np.float64), -35)[: int(1.8 * SR)].copy()
    tmp = os.path.join(TMP, "hp-in.wav")
    write_wav_f32(tmp, sub)
    p = subprocess.run(["ffmpeg", "-v", "error", "-i", tmp, "-af", "highpass=f=30:poles=2", "-ac", str(sub.shape[1]),
                        "-f", "f32le", "-"], capture_output=True, check=True)
    os.remove(tmp)
    sub = np.frombuffer(p.stdout, dtype=np.float32).reshape(-1, sub.shape[1]).astype(np.float64)
    t = np.arange(len(sub)) / SR
    env = np.where(t < 0.10, 1.0, np.exp(-(t - 0.10) / 0.28))
    sub = sub * env[:, None]
    thud = onset_trim(decode(raw_sfx("thud", 2), mono=False).astype(np.float64), -35)[: int(0.4 * SR)].copy()
    thud = fade_out(thud, 0.1)
    sub, thud = stereo(sub), stereo(thud)
    buf = np.zeros((1, 2))
    buf = place(buf, sub / np.abs(sub).max(), 0.0, 1.0)
    buf = place(buf, thud / np.abs(thud).max(), 0.0, 0.8)
    return buf


SFX_COMPOSITES = {"blips": composite_blips, "success": composite_success, "impact": composite_impact}
# processing overrides for composites (their grains already carry their own fades)
SFX_COMPOSITE_PROC = {"blips": {"max": 0.6, "fade_out": 0.02}, "success": {"max": 1.1, "fade_out": 0.25},
                      "impact": {"max": 1.8, "fade_out": 0.3}}


def local_flatness(path):
    """Spectral flatness in a band around the energy centroid ([c/4, 4c]): ~0 = tonal, >~0.1 = noise-like."""
    x = decode(path)
    win, hop = 2048, 512
    f = np.fft.rfftfreq(win, 1 / SR)
    hann = np.hanning(win)
    P_sum = np.zeros(len(f))
    for i in range(0, max(1, len(x) - win), hop):
        P_sum += np.abs(np.fft.rfft(x[i:i + win] * hann)) ** 2
    c = float((f * P_sum).sum() / max(P_sum.sum(), 1e-20))
    band = (f >= max(40, c / 4)) & (f <= min(18000, c * 4))
    flats = []
    for i in range(0, max(1, len(x) - win), hop):
        P = np.abs(np.fft.rfft(x[i:i + win] * hann)) ** 2 + 1e-20
        if P[band].sum() > 1e-3 * P_sum[band].sum() / max(1, (len(x) - win) / hop):
            flats.append(float(np.exp(np.mean(np.log(P[band]))) / np.mean(P[band])))
    return round(float(np.median(flats)) if flats else 0.0, 3)


def tonality_db(path):
    """How far the strongest spectral line stands above its local median (Welch-averaged spectrum, 80 Hz-16 kHz):
    pitched sounds read ~20-40 dB, broadband noise ~5-12 dB."""
    x = decode(path)
    win, hop = 2048, 512
    hann = np.hanning(win)
    frames = [x[i:i + win] for i in range(0, max(1, len(x) - win), hop)]
    if not frames or len(frames[0]) < win:
        frames = [np.pad(x, (0, max(0, win - len(x))))[:win]]
    E = np.array([float((fr ** 2).sum()) for fr in frames])
    keep = E > E.max() * 1e-4
    P = np.mean([np.abs(np.fft.rfft(fr * hann)) ** 2 for fr, k in zip(frames, keep) if k], axis=0) + 1e-20
    f = np.fft.rfftfreq(win, 1 / SR)
    db = 10 * np.log10(P)
    k = 15
    med = np.array([np.median(db[max(0, i - k): i + k + 1]) for i in range(len(db))])
    band = (f >= 80) & (f <= 16000)
    return round(float((db - med)[band].max()), 1)


def sfx_check(name, kind, m):
    """Return a list of problems for the measured file against its expected profile."""
    bad = []
    if m["peak_dbfs"] > -2.5 or m["peak_dbfs"] < -3.5:
        bad.append(f"peak {m['peak_dbfs']}")
    if m["onset_ms"] > 10 and kind not in ("riser",) and not m.get("swell"):
        bad.append(f"onset {m['onset_ms']} ms")
    if m["rms_dbfs"] < -45:
        bad.append("near-silent")
    if kind == "transient" and m["t90_s"] > 0.2:
        bad.append(f"not a short transient (t90 {m['t90_s']})")
    if kind == "noise" and m["tonality_db"] > 18:
        bad.append(f"tonal for a noise sound (tonality {m['tonality_db']} dB)")
    if kind == "tonal" and m["tonality_db"] < 15:
        bad.append(f"noisy for a tonal sound (tonality {m['tonality_db']} dB)")
    if kind == "low" and m["centroid_hz"] > 1200:
        bad.append(f"not low (centroid {m['centroid_hz']})")
    if kind == "riser" and m["t_peak_ms"] < 0.7 * m["dur"] * 1000:
        bad.append(f"peak too early for a riser ({m['t_peak_ms']} ms)")
    if kind == "buzz" and m["centroid_hz"] > 600:
        bad.append(f"buzz too bright ({m['centroid_hz']})")
    return bad


def sfx_build():
    spec = json.load(open(os.path.join(ROOT, "scripts", "audio-sfx.json")))["sounds"]
    out_dir = os.path.join(ROOT, "public", "audio", "sfx")
    alt_dir = os.path.join(out_dir, "_alt")
    tmp_dir = TMP
    os.makedirs(alt_dir, exist_ok=True)
    os.makedirs(tmp_dir, exist_ok=True)
    report = []
    for name, s in spec.items():
        pick = SFX_PICK[name]
        proc = {"gate_db": s["gate_db"], "max": s["max"], "fade_out": max(s["fade"], 0.01)}
        if pick == "composite":
            proc.update(SFX_COMPOSITE_PROC.get(name, {}))
            src = os.path.join(tmp_dir, f"{name}.composite.wav")
            write_wav_f32(src, SFX_COMPOSITES[name]().astype(np.float32))
            source = "composite"
        else:
            src, source = raw_sfx(name, pick), f"v{pick}"
        m = sfx_process(name, src, os.path.join(out_dir, f"{name}.mp3"), proc)
        m["local_flatness"] = local_flatness(os.path.join(out_dir, f"{name}.mp3"))
        m["tonality_db"] = tonality_db(os.path.join(out_dir, f"{name}.mp3"))
        m["swell"] = s["gate_db"] <= -45
        m["problems"] = sfx_check(name, s["kind"], m)
        alts = []
        for v in (1, 2, 3, 4):
            if pick == v or not os.path.exists(raw_sfx(name, v)):
                continue
            sfx_process(name, raw_sfx(name, v), os.path.join(alt_dir, f"{name}.v{v}.mp3"), proc)
            alts.append(f"_alt/{name}.v{v}.mp3")
        report.append({"name": name, "source": source, "kind": s["kind"], "alts": alts, **m,
                       "prompt": s.get("regen_prompt") if source in ("v3", "v4") else s["prompt"]})
        print(f"{name:12s} {source:9s} dur {m['dur']:5.3f} onset {m['onset_ms']:4.1f}ms peak@{m['t_peak_ms']:6.1f}ms "
              f"pk {m['peak_dbfs']:5.2f} rms {m['rms_dbfs']:6.1f} cent {m['centroid_hz']:5d} tonal {m['tonality_db']:4.1f}dB "
              f"t90 {m['t90_s']:.3f} {'PROBLEMS ' + str(m['problems']) if m['problems'] else 'ok'}")
    with open(SFX_REPORT, "w") as fh:
        json.dump(report, fh, indent=2)
    return report


# ----------------------------------------------------------------------------------------------- music

MUSIC_SECTIONS = [("Problem", 0, 12), ("Build", 12, 18), ("Reveal", 18, 24), ("Product A", 24, 44),
                  ("Product B", 44, 64), ("Under the hood", 64, 78), ("Outro", 78, 84)]
MSR = 48000


def onset_envelope(x, sr=MSR, hop=240, win=2048, band=None):
    """Spectral-flux onset strength (log magnitude, positive differences), one value per hop (5 ms at 48 kHz).
    band=(lo, hi) Hz restricts the bins (e.g. the kick band)."""
    n = 1 + max(0, (len(x) - win) // hop)
    f = np.fft.rfftfreq(win, 1 / sr)
    sel = np.ones(len(f), bool) if band is None else (f >= band[0]) & (f < band[1])
    hann = np.hanning(win).astype(np.float32)
    prev = None
    out = np.zeros(n, np.float32)
    for b0 in range(0, n, 2048):
        idx = (np.arange(b0, min(n, b0 + 2048)) * hop)[:, None] + np.arange(win)[None, :]
        S = np.log1p(100 * np.abs(np.fft.rfft(x[idx] * hann, axis=1))[:, sel]).astype(np.float32)
        if prev is not None:
            S = np.vstack([prev[None, :], S])
            d = np.maximum(0, np.diff(S, axis=0)).sum(axis=1)
            out[b0:b0 + len(d)] = d
        else:
            d = np.maximum(0, np.diff(S, axis=0)).sum(axis=1)
            out[b0 + 1:b0 + 1 + len(d)] = d
        prev = S[-1]
    t = (np.arange(n) * hop + win / 2) / sr
    return t, out


def fold_score(t, ose, T, bins=100):
    ph = ((t % T) / T * bins).astype(int) % bins
    prof = np.bincount(ph, weights=ose, minlength=bins)
    prof = np.convolve(np.concatenate([prof[-2:], prof, prof[:2]]), np.ones(5) / 5, mode="valid")
    k = int(np.argmax(prof))
    return prof[k] / max(prof.mean(), 1e-9), (k + 0.5) / bins * T


def tempo_grid(t, ose, lo=0.49, hi=0.51, step=0.00002):
    best = (0, None, None)
    for T in np.arange(lo, hi, step):
        sc, ph = fold_score(t, ose, T)
        if sc > best[0]:
            best = (sc, T, ph)
    return best  # (score, beat period s, beat phase s)


def music_check(path):
    x = decode(path, sr=MSR)
    dur = len(x) / MSR
    t, ose = onset_envelope(x)
    _, kick = onset_envelope(x, band=(30, 160))
    sc, T, ph = tempo_grid(t, ose)
    bpm = 60 / T
    # per-section beat phase relative to the global grid (catches grid jumps at chunk boundaries)
    sec_phase = []
    for name, a, b in MUSIC_SECTIONS:
        m = (t >= a) & (t < b)
        s2, p2 = fold_score(t[m], ose[m], T)
        d = ((p2 - ph + T / 2) % T) - T / 2
        sec_phase.append((name, round(d * 1000, 1), round(s2, 2)))
    # bar phase: the beat (of 4) carrying the strongest kick onsets at the section starts + overall
    beat0 = ph % T
    cand = [beat0 + i * T for i in range(4)]

    def strength_at(tt, env):
        i = int(round((tt - t[0]) / (t[1] - t[0])))
        return float(env[max(0, i - 2): i + 3].max()) if 0 <= i < len(env) else 0.0

    bar_scores = []
    for c in cand:
        hits = [strength_at(c + k * 4 * T, kick) for k in range(int(dur / (4 * T)))]
        bar_scores.append(np.mean(hits))
    bar_phase = cand[int(np.argmax(bar_scores))] % (4 * T)
    # transients near 18.000 and 78.000 (raw clock and on the aligned clock)
    med = float(np.median(ose[ose > 0]))
    trans = {}
    for target in (18.0, 24.0, 64.0, 78.0):
        for label, shift in (("raw", 0.0), ("aligned", bar_phase if bar_phase < 1.0 else bar_phase - 4 * T)):
            tt = target + shift
            m = (t >= tt - 0.15) & (t <= tt + 0.15)
            i = int(np.argmax(ose[m]))
            trans[f"{label}@{target:g}"] = {"at_s": round(float(t[m][i]) - shift, 4),
                                            "off_ms": round((float(t[m][i]) - tt) * 1000, 1),
                                            "strength_x_median": round(float(ose[m][i]) / med, 1)}
    # pre-reveal dropout: level of the last 500 ms before the reveal hit vs the bar before it
    hit = 18.0 + (bar_phase if bar_phase < 1.0 else bar_phase - 4 * T)
    def seg_db(a, b):
        s = x[int(a * MSR):int(b * MSR)]
        return round(20 * math.log10(float(np.sqrt((s ** 2).mean())) + 1e-12), 1)
    dropout = {"last_500ms_db": seg_db(hit - 0.5, hit - 0.02), "bar_before_db": seg_db(hit - 2.5, hit - 0.5),
               "last_250ms_db": seg_db(hit - 0.25, hit - 0.02)}
    # loudness per section (integrated over the section) and short-term max
    sec_loud = []
    for name, a, b in MUSIC_SECTIONS:
        p = run(["ffmpeg", "-nostats", "-v", "info", "-ss", str(a), "-t", str(b - a), "-i", path, "-af", "ebur128=peak=true",
                 "-f", "null", "-"])
        summ = p.stderr[p.stderr.rfind("Summary:"):]
        I = re.search(r"I:\s+(-?[\d.]+) LUFS", summ)
        Ss = [float(v) for v in re.findall(r"S:\s*(-?[\d.]+)", p.stderr) if v not in ("-inf",)]
        sec_loud.append((name, float(I.group(1)) if I else None, round(max(Ss), 1) if Ss else None))
    drift_ms = (dur / T - dur / 0.5) * 0.5 * 1000  # how far the grid is off at the end of the file
    res = {"file": os.path.basename(path), "dur": round(dur, 3), "bpm": round(bpm, 3), "beat_s": round(T, 5),
           "fold_score": round(sc, 2), "beat_phase_ms": round(ph * 1000, 1), "bar_phase_ms": round(bar_phase * 1000, 1),
           "bar_beat_scores": [round(v, 1) for v in bar_scores],
           "drift_at_84s_ms": round((84 / T - 84 / 0.5) * -T * 1000, 1),
           "section_phase_ms": sec_phase, "transients": trans, "dropout": dropout, "loudness": loudness(path),
           "section_loudness": sec_loud}
    return res


def music_build(raw, out, trim_ms=0.0, length_s=84.0, target_i=-16.0, max_tp=-1.5, fade_s=0.3, bitrate="256k"):
    """Align + normalise a music candidate: trim trim_ms from the start (bar lines on multiples of 2.000 s; a
    negative value pads silence), cut/pad to exactly length_s, cos^2 fade over the last fade_s, gain to target_i LUFS
    (true peak checked <= max_tp; a 4x-oversampled limiter only if needed), LAME 44.1 kHz CBR (so its render delay
    matches the VO/SFX: 1105 samples = 25.06 ms, corrected by scripts/audio-master.py)."""
    x = decode(raw, sr=SR, mono=False).astype(np.float64)
    n_trim = int(round(trim_ms / 1000 * SR))
    if n_trim >= 0:
        x = x[n_trim:]
    else:
        x = np.concatenate([np.zeros((-n_trim, x.shape[1])), x])
    n = int(round(length_s * SR))
    x = x[:n] if len(x) >= n else np.concatenate([x, np.zeros((n - len(x), x.shape[1]))])
    fo = int(fade_s * SR)
    x[-fo:] *= (np.cos(np.linspace(0, math.pi / 2, fo)) ** 2)[:, None]
    os.makedirs(os.path.dirname(out), exist_ok=True)
    tmp = out + ".tmp.wav"
    write_wav_f32(tmp, x.astype(np.float32))
    ln = loudness(tmp)
    gain = target_i - ln["I"]
    af = f"volume={gain:.2f}dB"
    if ln["TP"] + gain > max_tp:
        af += (f",aresample={SR * 4},alimiter=limit={10 ** ((max_tp - 0.3) / 20):.4f}:attack=3:release=60:"
               f"level=false:latency=true,aresample={SR}")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    p = run(["ffmpeg", "-v", "error", "-y", "-i", tmp, "-af", af, "-c:a", "libmp3lame", "-b:a", bitrate, "-ar", str(SR),
             out + ".part.mp3"])
    if p.returncode:
        raise RuntimeError(p.stderr[-800:])
    os.replace(out + ".part.mp3", out)
    os.remove(tmp)
    return {"out": out, "trim_ms": trim_ms, "gain_db": round(gain, 2), "limited": "alimiter" in af,
            "duration": probe(out)["duration"], "loudness": loudness(out)}


# ------------------------------------------------------------------------------------------------- cli


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return
    cmd, args = sys.argv[1], sys.argv[2:]
    if cmd == "analyze":
        for p in args:
            analyze_take(p)
    elif cmd == "finalize-vo":
        finalize_vo(args)
    elif cmd == "write-vo-data":
        write_vo_data()
    elif cmd == "music-build":
        raw, out = args[0], args[1]
        trim = float(args[2]) if len(args) > 2 else 0.0
        print(json.dumps(music_build(raw, out, trim_ms=trim), indent=1))
    elif cmd == "music-check":
        for p in args:
            print(json.dumps(music_check(p), indent=1))
    elif cmd == "sfx-build":
        sfx_build()
    elif cmd == "sfx-analyze":
        for p in args:
            print(json.dumps(sfx_metrics(p)))
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
