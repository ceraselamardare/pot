#!/usr/bin/env python3
"""Master the rendered film's audio. No API calls; numpy + ffmpeg only.

  python3 scripts/audio-master.py out/pot-demo.mp4 [out/pot-demo.master.mp4] [--lufs -14] [--tp -1.0] [--no-shift]

Why: src/audio/Soundtrack.tsx mixes with ~12 dB of headroom (Remotion sums tracks with no master limiter), so the
raw render sits around -26..-28 LUFS. This script:
  1. shifts the audio 25.06 ms earlier: a Remotion 4.0.537 render plays every MP3 1105 samples late (the LAME encoder
     delay is not dropped), uniformly for VO, SFX and music (measured; see MP3_DECODER_DELAY_SEC);
  2. applies make-up gain to the target integrated loudness, through a 4x-oversampled lookahead limiter for the
     true-peak ceiling, iterating on the ENCODED AAC so the delivered file meets both numbers;
  3. re-muxes with the original video stream copied (AAC 320 kbps, +faststart).
"""
import importlib.util
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("audio_tools", os.path.join(HERE, "audio-tools.py"))
at = importlib.util.module_from_spec(spec)
spec.loader.exec_module(at)

DELAY = 1105 / 44100  # s, see Soundtrack.tsx MP3_DECODER_DELAY_SEC


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return

    def opt(name, dflt):
        if f"--{name}" in args:
            i = args.index(f"--{name}")
            v = args[i + 1]
            del args[i:i + 2]
            return float(v)
        return dflt

    target = opt("lufs", -14.0)
    max_tp = opt("tp", -1.0)
    shift = "--no-shift" not in args
    args = [a for a in args if a != "--no-shift"]
    src = args[0]
    dst = args[1] if len(args) > 1 else os.path.splitext(src)[0] + ".master.mp4"
    tmp = os.path.splitext(dst)[0] + ".master-tmp"
    os.makedirs(os.path.dirname(os.path.abspath(dst)), exist_ok=True)

    p = at.run(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=sample_rate,channels",
                "-of", "json", src])
    st = json.loads(p.stdout)["streams"][0]
    sr, ch = int(st["sample_rate"]), int(st["channels"])

    raw = tmp + ".raw.wav"
    shift_af = f"atrim=start={DELAY:.6f},asetpts=PTS-STARTPTS,apad=pad_dur={DELAY:.6f}," if shift else ""
    p = at.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-vn", "-af", f"{shift_af}anull", "-ac", str(ch),
                "-ar", str(sr), "-c:a", "pcm_f32le", raw])
    if p.returncode:
        raise SystemExit(p.stderr[-800:])
    before = at.loudness(raw)
    gain = target - before["I"]
    ceiling = max_tp - 0.5
    m4a = tmp + ".m4a"
    after = None
    for _ in range(8):
        af = (f"volume={gain:.2f}dB,aresample={sr * 4},"
              f"alimiter=limit={10 ** (ceiling / 20):.4f}:attack=3:release=50:level=false:latency=true,aresample={sr}")
        p = at.run(["ffmpeg", "-v", "error", "-y", "-i", raw, "-af", af, "-c:a", "aac", "-b:a", "320k", m4a])
        if p.returncode:
            raise SystemExit(p.stderr[-800:])
        after = at.loudness(m4a)
        di = target - after["I"]
        if abs(di) <= 0.3 and after["TP"] <= max_tp:
            break
        if after["TP"] > max_tp:
            ceiling -= (after["TP"] - max_tp) + 0.1
        gain += di
    p = at.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-i", m4a, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy",
                "-c:a", "copy", "-movflags", "+faststart", dst])
    if p.returncode:
        raise SystemExit(p.stderr[-800:])
    for f in (raw, m4a):
        os.remove(f)
    print(json.dumps({"in": src, "out": dst, "shift_ms": round(DELAY * 1000, 2) if shift else 0,
                      "before": before, "gain_db": round(gain, 2), "limiter_ceiling_dbfs": round(ceiling, 2),
                      "after": at.loudness(dst)}, indent=2))


if __name__ == "__main__":
    main()
