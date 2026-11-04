# Audio notes (audio agent)

Status 2026-10-22: done and verified in Remotion renders. **Update v2 on 2026-11-03:** s10 replaced and s10b added (next section).
- The VO (13 lines) and the SFX library (24 names).
- The music bed `pot-theme.mp3`, 84.000 s at 120 BPM, on locked timeline v1.
- `src/audio/Soundtrack.tsx`, with `musicVolumeAt()`.
- The post-render master script.

## Update v2 (2026-11-03): two new VO lines (brief/06-update-v2.md §4)
Same voice (Dior), `eleven_v4`, same settings (stability 0.45, similarity 0.75, seeds 7/2026) and the same post-processing as the original 13 lines. previous/next text came from the line order: s09 → **s10** → **s10b** → s11.

**Finalized (main text for both):**

| Line | Take | Duration | Words/s | F0 median / SD | LUFS / dBTP | Pauses inside the line (after word @ s, length) |
|---|---|---|---|---|---|---|
| **s10-group** "Bigger spends need one OK. Leo taps it, right from a notification." | main t1 | **4.985 s** | 2.51 | 151 Hz / 4.72 st | −16.1 / −2.1 | "OK." @2.05 (0.60); "it," @3.34 (0.33) |
| **s10b-more** "Plus: trust that grows, all-or-nothing goals, and links to pay in, or pay out." | main t2 | **4.893 s** | 2.99 | 154 Hz / 4.41 st | −16.2 / −2.2 | "Plus" @0.50 (0.22); "grows" @1.71 (0.26); "goals" @2.94 (0.15) |

- **Neighbour match:** s09 is 153 Hz / 4.80 st and s11 is 154 Hz / 4.58 st.
- **s10b t2** keeps the director's words but was spoken from tighter punctuation: "Plus, trust that grows, all-or-nothing goals and links to pay in or pay out." That cut about 0.43 s to meet ≤ 4.9 s, with the same pitch.
- **"OK" is heard as "okay"** in every s10 take:
  - Scribe writes "okay." with logprob −0.02 to −0.04;
  - the ElevenLabs alignment gives "OK" 0.32-0.40 s, and the final word lasts 0.52 s, i.e. two syllables, "oh-kay".
- **QA:**
  - All 8 takes are word-perfect by Scribe.
  - Both chosen takes give identical transcripts on 2 more seeded runs.
  - Word starts sit within 0-3 ms of onsets re-measured on the final MP3s.
  - The limiter touches only isolated transients: over 1 dB on 2.1-2.2% of speech blocks.

**All 8 takes**, as durations after the same trim (50 ms lead, about 150 ms tail):

| Take | Duration | Words/s | F0 median | Scribe | Pauses (after word @ s, length) |
|---|---|---|---|---|---|
| s10 main t1 ✔ | 4.985 | 2.51 | 151 Hz | "Bigger spends need one okay. Leo taps it right from a notification" | OK @2.05 (0.60); it @3.34 (0.33) |
| s10 main t2 | 4.826 | 2.60 | 161 Hz | same | OK @1.93 (0.56); it @3.17 (0.32) |
| s10 fallback t1 | 5.187 | 3.01 | 171 Hz | "…one okay from the group. Leo taps it…" | group @2.28 (0.63); it @3.59 (0.32) |
| s10 fallback t2 | 5.240 | 2.98 | 160 Hz | same | group @2.35 (0.54); it @3.57 (0.33) |
| s10b main t1 | 5.327 | 2.74 | 155 Hz | "Plus trust that grows all or nothing goals and links to pay in or pay out" | Plus @0.48 (0.34); grows @1.83 (0.30); goals @3.16 (0.18); in @4.45 (0.15) |
| s10b main t2 ✔ | 4.893 | 2.99 | 154 Hz | same | Plus @0.50 (0.22); grows @1.71 (0.26); goals @2.94 (0.15) |
| s10b fallback t1 | 4.372 | 2.16 | 161 Hz | "Plus trust that grows, all or nothing goals and payment links" | Plus @0.48 (0.35); grows @1.83 (0.31); goals @3.17 (0.18) |
| s10b fallback t2 | 4.348 | 2.15 | 159 Hz | same | Plus @0.47 (0.41); grows @1.85 (0.29); goals @3.19 (0.18) |

**Why s10 is main t1 and not t2.** t2 is 0.16 s shorter and paced at 2.60 words/s, but it sits 0.9 st above the neighbouring lines. t1 matches their pitch within 0.2 st and still lands under 5.2 s. If you prefer t2's pace, it is one command to finalize instead.

**Key sync words** (seconds/frames from the clip start):

| Line | Words |
|---|---|
| s10 | Bigger 0.05/f3 · spends 0.43/f26 · need 0.87/f52 · one 1.25/f75 · **OK 1.53/f92** · **Leo 2.65/f159** · taps 2.91/f175 · it 3.21/f193 · right 3.67/f220 · notification 4.07/f244 |
| s10b | Plus 0.05/f3 · **trust 0.72/f43** · grows 1.21/f73 · **all-or-nothing 1.97/f118** · goals 2.55/f153 · **links 3.25/f195** · pay 3.67/f220 · in 3.91/f235 · **or 4.19/f251** · pay 4.35/f261 · out 4.57/f274 |

**Notes for the director and scene builders:**
- **The v1 s10 is archived** as `public/audio/vo/_takes/s10-group-v1-2of3.mp3` with `s10-group-v1-2of3.json` next to it (its `file` points at the archive).
  - Old s10 anchors ("group", "two", "three-hundred-dollar", "approves") no longer exist.
  - `voWord()` falls back to its default frame for them, so scene D must re-key s10.
- **s10b's second "pay"** is `voWord("s10b-more", "pay", fb, 1)`.
- **Onset fix:** the onset detector now needs 25 ms of continuous speech. A mouth click 60-100 ms before "trust" had been read as the onset. Re-checking the 12 unchanged lines with the new rule moves no word by more than 15 ms.
- **Registry and line list:**
  - `src/data/vo-data.ts` has the new `s10b-more` import and key.
  - `scripts/audio-lines.json` is at v3, with `fallback` fields; the old s10 text is kept as `v1_text`.
  - The finalize report now merges per line instead of overwriting.
- **Credits: 140** (8 TTS takes 128, STT 12), against a cap of 600. The account has 26,619 left.

## TL;DR for the director
- **Voice: Dior** (`4XLp6ou1JHGgf9xXbHCM`), `eleven_v4`. Emma was ruled out on pace (§1).
- **VO total: 66.18 s** over 14 clips (182 words) after update v2 (63.97 s over 13 clips before). Every line is word-perfect by Scribe v2 speech-to-text, and every chosen take passed 2 more seeded transcriptions.
- **Word timings are measured, not ElevenLabs'.** The JSON start times are real speech onsets (0-17 ms on 41 anchor words). ElevenLabs' own alignment runs up to 400 ms late after pauses (§2.3).
- **Music:** `public/audio/music/pot-theme.mp3`.
  - 120.005 BPM; bar lines on multiples of 2.000 s (±4 ms); grid drift −3.4 ms at 84 s.
  - Section transients at **17.996 s and 78.001 s**, both within ±1 frame.
  - Exactly 84.000 s, −16.0 LUFS, instrumental (Scribe hears 0 words).
  - Its own loudness arc is flat, so `<Soundtrack>` shapes it (`MUSIC_ARC_DB`). There is no natural dropout before 0:18; `REVEAL_CLEAR` makes one (§5).
- **Remotion quirk (measured): every MP3 renders exactly 25.06 ms (1.5 frames) late** (the LAME encoder delay is not dropped).
  - It hits VO, SFX and music alike, so relative sync holds.
  - `scripts/audio-master.py` shifts it back. Tested: 0.0 ms error on all 13 VO clips.
- **Levels.**
  - Files: VO −16 LUFS / −2.1 dBTP, music −16 LUFS / −3.6 dBTP, SFX peaks −3 dBFS.
  - `<Soundtrack>` mixes at `MASTER_DB = −12`, which puts VO peaks at about −14 dBFS (research: −16 to −12). The VO + music render reads −26.2 LUFS / −12.8 dBTP, so nothing can clip in Remotion's summing.
  - **Master after rendering:** `python3 scripts/audio-master.py out/pot-demo.mp4` gives **−14.0 LUFS / −1.1 dBTP** (tested on VO + music).
- **Action items**
  1. **Wire `SFX_MASTER` into `<Sfx>`** (`src/motion/Sfx.tsx`, owned by the motion kit): multiply the cue volume by it. Without this, SFX play about 12 dB too loud against VO and music.
  2. Put `<Soundtrack />` once at the root of the master composition. It plays the VO and the music, ducked, arced and dipped.
  3. Two clips are shorter than when you locked timeline v1, because I trimmed a trailing breath: **s04 is 4.881 s (was 5.318)** and **s08 is 7.235 s (was 7.470)**. Word starts are unchanged, and both still fit.
  4. Put an **`impact` cue at frame 1080** (the reveal). The music's 0:18 change is a strong spectral onset (about 13× the median onset strength), not a level jump. A low `impact` (about 0.4) at 4680 helps the end-card hit the same way.
  5. After the final render, run `scripts/audio-master.py`.
- **Credits: 1,796 of the 7,000 cap in the first round, plus 140 for update v2 (cap 600).** Voice test 85, VO 267, SFX 262, music 1,182 (≤ 2,000). The account had 20,714 left at 10:05 UTC.

## 1. Voice choice (Task 1)
I generated the test line s09-instant (18 words, with "?" and "…" pauses) with all three voices.
- Settings: `eleven_v4`, stability 0.45, similarity 0.75, seed 7, previous/next text = s08/s10.
- I measured each take from the audio:
  - **Accuracy:** Scribe v2 transcript against the script.
  - **Pace:** energy-measured speech span. "Articulation" excludes pauses of 100 ms or more.
  - **F0:** YIN on 1 kHz low-passed audio. It was validated on a synthetic 7-semitone glide (it reads 6.1 st), and the stats are stable to ±0.3 st across variants.

| Voice | Accuracy | Speech span | Words/s (span) | Words/s (articulation) | F0 median | F0 SD | F0 p10-p90 | Pauses (themselves · groceries? · rules… · approved,) |
|---|---|---|---|---|---|---|---|---|
| Emma | 0 errors | 8.83 s | **2.04** | 2.45 | 264 Hz | 5.39 st | 15.4 st | 0.45 · 0.42 · 0.36 · 0.25 s |
| **Dior** | 0 errors | 7.96 s | **2.26** | 2.70 | 153 Hz | 4.80 st | 12.4 st | 0.39 · 0.37 · 0.30 · 0.23 s |
| Marcus | 0 errors | 8.06 s | 2.23 | 2.79 | 176 Hz | 5.47 st | 14.5 st | 0.42 · 0.47 · 0.35 · 0.37 s |

**Decision: Dior.**
- **Emma fails the pace rule.** Her 2.04 words/s is below the 2.3 gate, and she is 10-12% slower than both others on every measure. At her rate the VO would run about 6 s longer.
- **Dior and Marcus are effectively at the gate.** This line has four designed pauses, so all three voices fall under 2.3 over the span.
- **Dior is next in the preference order.** He is accurate and the fastest overall, with the shortest, most even pauses, and fits "crisp, modern, product launch".
- **Dior's caveat:** his pitch range is the narrowest of the three (SD −0.6 st). It is still lively in absolute terms; neutral read speech is about 2-3 st.
- **Marcus** is the more animated alternative.

Audition files: `public/audio/vo/_takes/s09-instant.{emma,dior,marcus}.t1.mp3`.

## 2. VO (Task 2)

### 2.1 Generation and QA
- **Generation:**
  - `eleven_v4`, `mp3_44100_128`, stability 0.45, similarity 0.75.
  - previous/next text = the neighbouring lines (v2 texts).
  - Seeds: 7 for take 1 and 2026 for take 2.
- **Pronunciation:**
  - The TTS text says "Sputnik **D-A-O**". The take's "DAO" lasts 0.54 s, i.e. three letters, not "dow".
  - It says "**Near**", not "NEAR", so v4 never spells the word out.
  - The JSON keeps the script spellings (DAO, NEAR).
- **QA on every take:**
  - Scribe v2 transcript against the script. Numbers, "$84" and "DAO"/"dow" are normalised; audio events and low-confidence words are flagged.
  - Expected pauses ("…", "?", sentence breaks) are checked on the audio.
  - Pace, F0 and loudness are measured too.
- **Chosen takes were re-transcribed twice more with seeds.**
  - This caught one real problem: **s13 take 2** ("[warm, smiling]" tag) was heard as "**But**, built at NEAR Hackathon" on 3 of 3 runs, and take 3 as "Hot".
  - s13 therefore uses take 1, whose "Pot" is recognised every time.
- **Retakes.** Each kept the script's words and changed only punctuation:
  - **s01:** t1 was 3.43 words/s. t2 = "Every group trip… has a money problem." gives 2.76 words/s with a breath beat after "trip", which matches the storyboard's split.
  - **s05:** t1 was rushed at 4.91 words/s (5.4 syllables/s). t2 = "What if… the money lived right in the group chat?" gives 3.65 words/s and a livelier read (F0 SD 4.25 → 4.82 st).
  - **s07:** t1 was 4.01 words/s with only a 0.13 s comma pause. t2 = "Start a Pot for the trip. And set the rules in plain words." gives 3.52 words/s and a 0.55 s beat before the rules.
- **Pace note.** Lines with 3+ words/s are monosyllable-heavy. Their syllable rate is a normal 3.4-4.3 syllables/s, so words/s overstates their speed.

### 2.2 Final clips
Files are `public/audio/vo/<id>.mp3` (192 kbps, mono, 44.1 kHz) and `src/data/vo/<id>.json` (VoClip shape). Raw takes and their sidecars are in `public/audio/vo/_takes/`: `.alignment.json`, `.meta.json`, `.stt.json` and `.qa.json`.

Pauses are "after word @ end of that word (pause length)", in seconds from the clip start.

| ID | Take | Duration | Words | Words/s | Syllables/s | F0 SD | LUFS / dBTP | Natural pauses inside the line |
|---|---|---|---|---|---|---|---|---|
| s01-hook | t2 | 2.745 | 7 | 2.76 | 3.94 | 4.90 | −16.1 / −2.2 | "trip" @1.22 (0.22) |
| s02-front | t1 | 1.578 | 5 | 3.69 | 3.69 | 4.35 | −16.0 / −2.2 | none (trails off on "all…") |
| s03-chase | t1 | 2.893 | 8 | 3.03 | 4.17 | 4.23 | −16.0 / −2.1 | "spends" @0.53 (0.22) |
| s04-options | t1 | **4.881** | 13 | 2.79 | 3.44 | 4.86 | −16.1 / −2.2 | "apps" @0.61 (0.16); "score" @1.72 (0.53) |
| s05-pivot | t2 | 2.960 | 10 | 3.65 | 4.02 | 4.82 | −16.1 / −2.1 | "if" @0.76 (0.18); "lived" @1.57 (0.20) |
| s06-reveal | t1 | 3.751 | 10 | 2.82 | 3.39 | 4.85 | −16.2 / −2.1 | "Meet" @0.18 (0.20); "Pot" @0.73 (**0.58**) |
| s07-create | t2 | 3.903 | 13 | 3.52 | 3.52 | 4.76 | −16.2 / −2.1 | "trip" @1.30 (0.55) |
| s08-join | t1 | **7.235** | 22 | 3.13 | 3.42 | 4.22 | −16.1 / −2.2 | "chat" @1.07 (0.60); "Google" @2.63 (0.16); "share" @3.83 (0.50); "wallet" @4.92 (0.28); "phrase" @6.15 (0.18) |
| s09-instant | t1 | 8.158 | 18 | 2.26 | 3.40 | 4.80 | −16.2 / −2.1 | "themselves" @1.98 (0.42); "dollars" @2.81 (0.34); "groceries?" @3.90 (0.39); "rules…" @5.28 (0.40); "approved," @6.17 (0.34) |
| s10-group (v2) | main t1 | 4.985 | 12 | 2.51 | 3.98 | 4.72 | −16.1 / −2.1 | "OK." @2.05 (0.60); "it," @3.34 (0.33) |
| s10b-more (v2) | main t2 | 4.893 | 14 | 2.99 | 3.63 | 4.41 | −16.2 / −2.2 | "Plus" @0.50 (0.22); "grows" @1.71 (0.26); "goals" @2.94 (0.15) |
| s11-close | t1 | 4.327 | 13 | 3.19 | 3.92 | 4.58 | −16.1 / −2.1 | "over" @0.99 (0.27); "Pot" @1.94 (0.58) |
| s12-tech | t1 | 11.323 | 32 | 2.88 | 4.05 | 4.77 | −16.1 / −2.1 | "hood" @0.71 (0.32); "NEAR" @3.52 (0.49); "on-chain" @5.78 (0.22); "person" @6.89 (0.59); "gasless" @9.03 (0.38) |
| s13-end | t1 | 2.548 | 5 | 2.15 | 3.01 | 3.45 | −16.2 / −2.2 | "Pot." @0.43 (0.46) |
| **Total** | | **66.180** | 182 | | | | | |

Every clip starts its first word at 0.050 s and ends 0.15-0.21 s after its last word.

**Key sync words** (word start in seconds and frames, relative to the clip; add `voAt`; `voWord()` does this for you):

| Line | Words |
|---|---|
| s01 | Every 0.05 s/f3 · trip 0.63/f38 · money 1.79/f108 · problem 2.07/f124 |
| s02 | friend 0.31/f19 · fronts 0.67/f40 · all 1.09/f65 |
| s03 | weeks 0.75/f45 · chasing 1.15/f69 · pay 2.23/f134 · up 2.47/f148 |
| s04 | Split 0.05/f3 · score 1.25/f75 · Shared 2.24/f135 · money 4.35/f261 |
| s05 | money 1.07/f64 · group 2.21/f133 · chat 2.45/f147 |
| s06 | Meet 0.05/f3 · **Pot 0.38/f23** · Group 1.31/f78 · rules 3.14/f188 |
| s07 | Start 0.05/f3 · trip 0.95/f57 · rules 2.31/f139 · words 3.23/f194 |
| s08 | Drop 0.05/f3 · Friends 1.67/f100 · Google 2.35/f141 · share 3.46/f207 · No 4.33/f260 · No 5.20/f312 · No 6.33/f380 · gas 6.54/f392 |
| s09 | Small 0.05/f3 · approve 0.91/f54 · Eighty-four 2.39/f144 · groceries 3.29/f197 · Pot 4.29/f258 · rules 4.88/f293 · **approved 5.68/f341** · seconds 7.49/f449 |
| s10 (v2) | Bigger 0.05/f3 · one 1.25/f75 · OK 1.53/f92 · Leo 2.65/f159 · taps 2.91/f175 · right 3.67/f220 · notification 4.07/f244 |
| s10b (v2) | Plus 0.05/f3 · trust 0.72/f43 · grows 1.21/f73 · all-or-nothing 1.97/f118 · goals 2.55/f153 · links 3.25/f195 · in 3.91/f235 · or 4.19/f251 · out 4.57/f274 |
| s11 | close 1.26/f76 · Pot 1.70/f102 · Everyone 2.52/f151 · fair 3.36/f202 · back 3.82/f229 |
| s12 | hood 0.37/f22 · Sputnik 2.07/f124 · DAO 2.41/f145 · NEAR 3.19/f191 · enforced 4.69/f281 · person 6.45/f387 · gasless 8.39/f503 · alone 10.75/f645 |
| s13 | Pot 0.05/f3 · Built 0.89/f53 · Hackathon 1.73/f104 |

### 2.3 Word timing: method and measured offsets
I measured on 41 anchor words: each line's first word, plus every word that follows a silence.
- **ElevenLabs alignment minus the real onset:**
  - First words: median −15 ms (range −53 to +83 ms).
  - **Words after a pause: median +68 ms, up to +402 ms late.** Examples: "approved" in s09 +402, "Everyone" in s11 +185, "Its"/"not" in s12 +168/+172.
- **Scribe v2 start minus the onset:** median **+60 ms** (−29 to +129 ms). Scribe marks the vowel, so it is later on s, sh and f.
- **Final JSON times:**
  1. Scribe word times are mapped onto the script words. "$84" is split back into "Eighty-four dollars" in proportion to the ElevenLabs durations.
  2. Non-anchored words are shifted earlier by the clip's median Scribe offset (15-112 ms). Erring early is safe: picture-before-sound is noticed only from 125 ms.
  3. Anchor words snap to the measured onset. Breaths are skipped: inhales sit 36-42 dB down at 2-4 kHz, while s/sh/f sit 11-31 dB down at 5-9 kHz.
  4. Words before a pause end at the last speech frame.
  5. All times shift by exactly the 50 ms lead.
- **Check on the final processed clips:** anchors fall within 0-17 ms of re-measured onsets. Three breath-adjacent words read +55-60 ms.

### 2.4 Processing and loudness
1. **Trim:** keep 50 ms before the first sound (most takes started within about 10 ms, so they are padded). Keep 150 ms after the last word's decay. Trailing inhales for the next line (s04, s08) are cut.
2. **Chain:** HPF 70 Hz → pre-gain to −24 LUFS → compressor 2.5:1 above −18 dBFS (8/120 ms, about 2-3 dB on the loudest syllables) → make-up gain → 4× oversampled lookahead limiter (3/40 ms) → MP3 192k.
3. **Gain loop:** gain is iterated on the encoded file to **−16.0 to −16.2 LUFS, −2.1/−2.2 dBTP**.
4. **Dynamics:** the peak-to-loudness ratio went from 17-23 dB to 14 dB. The limiter only meets isolated glottal or plosive spikes, over 1 dB on at most 2% of speech blocks.
5. **Timing check:** the chain is sample-accurate (1-sample lag).

## 3. SFX library (Task 3)
- **Generation:** `eleven_text_to_sound_v2`, `mp3_44100_128`, prompt influence 0.55. Two variants per name, from the spec in `scripts/audio-sfx.json`.
- **One regeneration** (v3/v4, sharper prompts) for the five clearly wrong sounds:
  - tap: several quiet taps;
  - click: hiss, or −46 dBFS;
  - blips: a glide or ticks;
  - success: a single pitch;
  - impact: a sustained ~40 Hz tone.
- **Three composites, built only from the generated audio**, because none of the four generations could do it:
  - **blips:** three 80 ms slices of the generated notif tone (517 Hz), pitch-shifted 0/+4/+7 semitones (a rising major triad), **150 ms apart** (the typing-dots stagger).
  - **success:** two notes from the generated success bell. G5 (790 Hz) then **C6 (1055 Hz) 110 ms later**.
  - **impact:** the generated sub boom (high-passed at 30 Hz, decaying to −40 dB at about 1.4 s) plus the generated **thud** at 0 ms. A 40 Hz sine alone is inaudible on phones and laptops.
- **Processing:** trim before the attack (onset at most 7 ms; swell sounds keep their soft start), cut at `max`, cos² tail fade, peak −3.0 dBFS on the decoded MP3 (±0.3), MP3 192k, stereo as delivered.
- **Checks:** every file passes the numeric profile checks.
- **Alternates:** 37 in `public/audio/sfx/_alt/`. Raw API outputs are in `public/audio/sfx/_raw/`.
- **No `available.ts`:** `<Sfx>` checks `getStaticFiles()`, so the cues sound now.

**Table columns:**
- **Peak** = time of the loudest moment; place cues so it lands on the event.
- **Cue vol** = suggested `<Sfx volume>` from the research's peak-relative levels, assuming `SFX_MASTER` is applied.

| Name | Source | Duration (s) | Peak | RMS dBFS | Centroid | Tonality (dB) | Cue vol | Character |
|---|---|---|---|---|---|---|---|---|
| `whoosh-fast` | v2 | 0.35 | 58 ms / 3.5 f | −24.4 | 8.1 kHz | 14 | 0.28 | bright, tight air burst |
| `whoosh-long` | v1 | 0.68 | 206 ms / 12 f | −24.9 | 650 Hz | 14 | 0.30 | deep swell-and-pass "whoom" |
| `swoosh-up` | v1 | 0.60 | 141 ms / 8.5 f | −17.6 | 2.8 kHz | 14 | 0.30 | rises 2 → 10 kHz |
| `pop` | v1 | 0.30 | 6 ms | −20.3 | 733 Hz | 38 | 0.45 | short tonal bubble pop |
| `pop-soft` | v1 | 0.25 | 4 ms | −20.4 | 874 Hz | 14 | 0.35 | very short, soft |
| `tap` | v3 | 0.11 | 28 ms / 2 f | −21.9 | 1.3 kHz | 23 | 0.35 | single fingertip tap |
| `click` | v4 | 0.18 | 10 ms | −26.0 | 2.2 kHz | 21 | 0.45 | crisp single click |
| `keypad` | v2 | 0.16 | 24 ms | −26.0 | 1.1 kHz | 15 | 0.30 | soft key tick |
| `typing` | v2 | 0.98 | n/a | −25.5 | 2.0 kHz | 5 | 0.22 | about 7 soft taps per second |
| `notif` | v1 | 1.00 | 4 ms | −25.4 | 2.1 kHz | 35 | 0.55 | two-tone 517 → 668 Hz chime |
| `buzz` | v2 | 0.45 | continuous | **−8.6** | 181 Hz | 38 | 0.18 | dense vibration hum, keep it low |
| `blips` | composite | 0.35 | blips at 0/150/300 ms | −19.5 | 2.6 kHz | 28 | 0.35 | three rising soft blips |
| `success` | composite | 0.85 | note 2 at 110 ms | −20.9 | 1.0 kHz | 31 | 0.70 | G5 → C6 bell |
| `burst` | v2 | 0.80 | 77 ms / 5 f | −27.4 | 11.3 kHz | 8 | 0.45 | sparkly pop-whoosh |
| `riser` | v2 | 1.83 | 1.70 s / 102 f | −22.7 | 2.7 kHz | 9 | 0.55 | rises from silence and **ends at its peak** |
| `impact` | composite | 1.34 | 28 ms / 2 f | −18.1 | 66 Hz | 17 | 0.90 | thud transient plus decaying sub |
| `thud` | v2 | 0.21 | 23 ms | −21.5 | 650 Hz | 9 | 0.55 | card slam |
| `scribble` | v1 | 0.47 | main stroke 379 ms | −22.8 | 7.1 kHz | 9 | 0.35 | 2-3 fast marker strokes |
| `paper` | v1 | 0.88 | crunch 359 ms | −33.8 | 4.4 kHz | 15 | 0.45 | receipt crumple |
| `tick` | v1 | 0.12 | 14 ms | −24.7 | 4.7 kHz | 23 | 0.15 | dry clock tick |
| `swipe` | v2 | 0.29 | 97 ms / 6 f | −26.1 | 1.7 kHz | 14 | 0.28 | soft finger swish |
| `sparkle` | v2 | 0.80 | 16 ms | −24.0 | 8.4 kHz | 12 | 0.30 | delicate decaying shimmer |
| `stamp` | v2 | 0.35 | 20 ms | −26.9 | 2.6 kHz | 14 | 0.55 | papery stamp slap |
| `glitch` | v2 | 0.45 | stutters | −14.5 | 1.2 kHz | 6 | 0.25 | choppy bit-crush stutter |

**Placement:**
- **Riser:** place it at **frame 1080 − 110 = 970** so it ends on the reveal hit.
- **Whooshes:** start them `peak` frames before the move's peak speed.
- **Blips:** to match `typingDots` pulse mode, put the cue at the dots' start plus about 14 f.
- **Success:** on "approved" (s09 f341 after `voAt`), paired with `burst`.
- **Impact:** at 1080, and low at 4680.

**Prompts** (v1/v2; full text in `scripts/audio-sfx.json`). Every prompt also carries the palette "premium, clean, modern product-video sound palette".
- **Whooshes and swipes**
  - whoosh-fast: "A very short, clean, airy whoosh for a fast UI swipe transition in a modern product video. Tight and crisp, no reverb tail."
  - whoosh-long: "A smooth, clean, airy whoosh sweeping past the camera for a zoom-through transition… Soft swell up to a peak, then a short clean tail."
  - swoosh-up: "A short rising swoosh, airy and bright, for a phone UI panel sliding up into view…"
  - swipe: "A quick, light UI swipe: a soft fast swish of a finger sliding across glass."
- **UI sounds**
  - pop: "A single short, bright, satisfying bubble pop for a chat message appearing."
  - pop-soft: "…soft, gentle, muted bubble pop…"
  - tap (v3): "One single soft tap of a fingertip on a smartphone glass screen. Isolated… Only one tap, then silence."
  - click (v4): "One single crisp click of a phone app button, like a tight plastic tick…"
  - keypad: "A single soft key tick on a phone number keypad."
  - typing: "Soft, quick typing on a phone touchscreen keyboard…"
- **Phone and status sounds**
  - notif: "A friendly, bright two-tone notification chime for a messaging app… An original sound, not any phone's default ringtone."
  - buzz: "A single short phone vibration buzz on a wooden table."
  - success (v3/v4, source of the composite: success v2): "A warm, bright two-note success chime…"
- **Celebration and reveal**
  - burst: "A sparkly pop with a quick airy whoosh, like confetti bursting out of a button."
  - sparkle: "A tiny, delicate shimmer: soft high chimes twinkling briefly."
  - riser: "A two-second rising whoosh riser building tension into a drop… louder and higher until it stops at its peak."
  - impact (v3, sub source): "One single punchy cinematic impact for a logo reveal: a sharp hit with a deep sub-bass boom that decays smoothly within one second…"
- **Physical**
  - thud: "A soft, solid thud of a card slamming down onto a table."
  - scribble: "One quick marker pen strike-through on paper."
  - paper: "A short paper receipt being crumpled in one hand."
  - tick: "A single crisp clock tick."
  - stamp: "A soft, satisfying rubber stamp pressed onto paper: one short confirm thunk."
  - glitch: "A short digital glitch stutter: a crunchy, bit-crushed electronic blip."

## 4. Soundtrack (Task 4)
`src/audio/Soundtrack.tsx` places each VO clip at `scene.from + scene.voAt` (read from `src/data/timeline.ts`), in a premounted `<Sequence>` holding an `<Audio>` from `@remotion/media`. It plays the music bed `audio/music/pot-theme.mp3` by default; `music={null}` gives VO only. Other props: `musicFrom` and `musicTrimBefore`.

**Music volume:** `musicVolumeAt(frame)` gives the linear music gain at an absolute timeline frame; reuse it anywhere. It combines four things.
1. **Ducking under the VO words:**
   - Base `MUSIC_BASE` (−16 dB) down to `MUSIC_DUCKED` (−25 dB), i.e. 9 dB, interpolated in dB.
   - Look-ahead attack of 120 ms (7 f) and release of 300 ms (18 f). Word gaps under 0.25 s stay ducked.
2. **The section arc `MUSIC_ARC_DB`** (keyframes in dB, retunable): Problem −1.5 → Build rising to +0.5 → Reveal +1.5 (frames 1080-1380) → Product −0.5 → Under the hood −2 → Outro +1.
3. **`JOKE_DIP = { from: 492, to: 525, db: −12 }`:** 3-frame ramps inside the window.
4. **`REVEAL_CLEAR = { from: 1060, to: 1080 }`:** a cos fade to silence, back to full on the hit at 1080.

**Other exports:** `MASTER_DB = −12`, `VO`, `MUSIC_BASE`, `MUSIC_DUCKED`, `SFX_MASTER` (0.251; the dB values are in `LEVELS_DB`), plus the `DUCK_*` constants, `MP3_DECODER_DELAY_SEC`, `buildDuckEnvelope()` and `musicArcDbAt()`.

**Checked in real renders.** The entry is `src/audio/preview/index.ts`, outside `Root.tsx`, with compositions `SoundtrackVO`, `SoundtrackMusicOnly`, `SoundtrackFull` and `SoundtrackBedTest`.
- **VO:** all 13 clips land at their frame plus the uniform 25.06 ms, at exactly −12.06 dB per channel.
- **Music:** the delay is the same 25.06 ms.
- **Music envelope against `musicVolumeAt()`:** 0.51 dB mean error, p95 1.3 dB.
  - The joke dip reads −12 dB in its window.
  - The reveal clear-out fades to silence and is back at full on the hit.
  - The arc per section is within 0.2 dB of plan (Problem −17.7, Build −16.7, Reveal −15.0, Product −16.6, Under the hood −18.0, Outro −15.0 dB, measured on un-ducked frames).

**Mastering:** run `python3 scripts/audio-master.py out/pot-demo.mp4 [out.mp4]`.
- It shifts the audio by −25.06 ms, applies gain into a 4× oversampled limiter, and iterates against the encoded AAC (320k) to −14 LUFS with ≤ −1 dBTP. It muxes with the video copied.
- VO + music test: −26.2 → **−14.0 LUFS, −1.1 dBTP**, with 0.0 ms VO offset.

## 5. Music (Task 5)
**Plan:**
- The plan is mine (`scripts/audio-music-plan.json`). The free `/v1/music/plan` was used only for style vocabulary.
- `music_v2_5`, 7 chunks on bar lines: Problem 12 s · Build 6 · Reveal 6 · Product A 20 · Product B 20 · Under the hood 14 · Outro 6 = 84,000 ms.
- Text is section names only. Every chunk has "120 BPM" plus its key (A minor; C major from the Reveal; A minor under the hood; C major in the Outro) and "instrumental". Negatives: vocals, singing, lyrics, etc.
- Two candidates, seeds 120 and 2026: `output_format=auto` (MP3, 48 kHz, 192k), 84.024 s each, 577 credits each.

**How it was measured:**
- **Tempo:** spectral-flux onsets folded over beat periods from 0.49 to 0.51 s in 0.02 ms steps.
- **Grid continuity:** the per-section phase of the kick band (30-160 Hz) and the hi-hat band.
- **Bar phase:** high-band onsets (>1 kHz) folded at 1 ms resolution, plus the section-start transients.
- **Loudness:** EBU R128 per section.
- **Vocals:** a Scribe v2 transcript.

| | **seed 120 (chosen)** | seed 2026 (alternate) |
|---|---|---|
| Tempo | 119.99 BPM (beat 0.50004 s) | 120.005 BPM |
| Grid drift at 84 s | +6.7 ms raw, **−3.4 ms final** | −3.4 ms |
| Grid continuity (kick phase per section) | 27-37 ms in all 7 sections. Continuous; the broadband phase only moves because off-beat hats enter at Product A. | **Jumps about 110 ms** between Problem (162 ms) and Build (52 ms) |
| First downbeat / bar phase (raw) | +13 ms (high-band onsets +15.5 ms; section hits at +11 ms) | inconsistent |
| Strong transient at 18.000 s | 18.011 s (+11 ms, 11.7× median) → **17.996 s final (−3.7 ms)** | 17.891 s (−109 ms) |
| Strong transient at 78.000 s | 78.011 s (+11 ms, 11.4×) → **78.001 s final (+1.3 ms)** | 78.141 s (+141 ms) |
| Section loudness, LUFS (P · B · R · PA · PB · H · O) | −13.9 · −13.6 · −13.5 · −13.2 · −12.8 · −12.8 · −13.8: **flat** (LRA 1.2) | −16.2 · −15.3 · −12.7 · −12.6 · −11.9 · −12.2 · −14.9: closer to the arc (LRA 4.7) |
| Dropout before 18.000 s | none (the beat continues; the last 250 ms are −5 dB) | none |
| Outro | the groove runs about 2.5 s after 78 s, then rings down to −87 dB by 84 s | |
| Vocals (Scribe) | 0 words (event: "[outro jingle]") | 0 words |
| Spectrum | sub-heavy: 86-95% of energy below 150 Hz | 74-88% below 150 Hz |

**Choice: seed 120.** On a 120 BPM film that cuts on bar lines, grid integrity wins.
- seed 120 is exactly on tempo and continuous, with its hits on the bar lines.
- seed 2026 has a better loudness arc, but its grid jumps between sections, so no trim can put its hits on 18.000 and 78.000.
- seed 120's two weaknesses are handled in the mix, not by spending another 577 credits:
  - its flat loudness arc → `MUSIC_ARC_DB`;
  - the missing dropout → `REVEAL_CLEAR`.

**Final file:**
- `public/audio/music/pot-theme.mp3` (alternate: `_alt/pot-theme.seed2026.mp3`; raw API outputs with meta in `_raw/`).
- Trimmed 13 ms, so the bar grid sits at +3.5 ms (high-band onsets).
- Exactly 84.000 s, with a 300 ms cos² end fade over a tail already at about −87 dB.
- −2.9 dB gain to **−16.0 LUFS, −3.6 dBTP** (no limiting).
- LAME 44.1 kHz 256k CBR, so its render delay matches the VO/SFX 25.06 ms.

**For the edit:**
- Bar n starts at n × 2.000 s (frame n × 120). Section starts: Problem f0, Build f720, Reveal f1080, Product A f1440, Product B f2640, Under the hood f3840, Outro f4680.
- The 0:18 and 1:18 changes are strong spectral onsets (about 13× / 11× the median onset strength), not level jumps; the sub-bass dominates the RMS. Layer `impact` at 1080 (and low at 4680) for the hit.
- Sub-heavy means thin on phone speakers. The VO, chords and SFX carry the mids there.

## 6. Credits
Measured from the per-request `character-cost` headers, plus `GET /v1/usage/character-stats` for music.

| Task | Calls | Credits |
|---|---|---|
| 1 · Voice test | 3 TTS (27 each) + 3 STT | 85 |
| 2 · VO | 17 TTS takes + 47 STT checks | 267 |
| 3 · SFX | 58 generations (3-11 each) | 262 |
| 4 · Soundtrack | none | 0 |
| 5 · Music | 2 × music_v2_5 at 84 s (577 each) + 2 STT vocal checks (14 each) | 1,182 |
| Update v2 · s10 + s10b | 8 TTS takes + 12 STT checks | 140 |
| **Total** | | **1,936** (cap 7,000; music cap 2,000; update cap 600) |

The account read used 8,642 at 09:08 UTC and 12,543 at 10:05; others spent in parallel during Tasks 1-3. **20,714 credits remain**, and the monthly counter resets at 11:11 UTC.

**Licence (human decision, tooling.md §1):** on Free + PAYG, ElevenLabs output is non-commercial use with attribution. Either credit "Voice, music & sound effects: ElevenLabs", or upgrade to Starter before the final render.

## 7. Files and commands
- `scripts/audio-lines.json`: VO lines (v2), TTS overrides, voices and settings.
- `scripts/audio-vo-take.mjs`: one take plus Scribe QA.
  ```
  node --env-file=../.env scripts/audio-vo-take.mjs --voice dior --take N --ids <id> [--text "…"] [--tag "[…]"]
  ```
- `scripts/audio-tools.py`:
  - `analyze <take>`
  - `finalize-vo id=take …`
  - `sfx-build` / `sfx-analyze`
  - `music-check <file>`
  - `music-build <raw> <out> <trim_ms>`
- `scripts/audio-sfx.json` and `scripts/audio-sfx.mjs`: SFX spec and generator (`--variant N --names a,b`).
- `scripts/audio-music-plan.json` and `scripts/audio-music.mjs`: music plan and generator (`gen <seed>`, `usage <since>`).
- `scripts/audio-master.py`: post-render mastering.
- `scripts/audio-credits.mjs`: balance check, logged to a ledger file.
- `scripts/lib/eleven.mjs` now also exports `stt()` (Scribe v2, cached) and `usage()` (free usage stats). The key is sent only in the header.
- Reports: `public/audio/vo/_takes/finalize-report.json` and `public/audio/sfx/_raw/sfx-report.json`. Scratch files go to `AUDIO_TMP` or the OS temp dir.
- Soundtrack-only render:
  ```
  npx remotion render src/audio/preview/index.ts SoundtrackFull out/audio-tmp/soundtrack.wav --codec=wav
  ```
