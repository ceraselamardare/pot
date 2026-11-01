# Tooling: ElevenLabs + OpenAI (verified 2026-10-22)

Owner: the AI-tooling scout.
- **Verified:** checked against the live APIs on 2026-10-22, between 08:09 and 08:55 UTC.
- **Docs:** read in the official docs but not tested.
- **Unverified:** neither of the above.

All paid tests were tiny: 1 TTS line, 1 SFX, 1 music clip of 8 s, and 1 low-quality image.

## TL;DR: use these
| Need | Use | Status |
|---|---|---|
| Voice-over | `eleven_v4`<br>`POST /v1/text-to-speech/{voice_id}/with-timestamps`<br>`mp3_44100_128` | Verified (character timings returned) |
| Narrator | **Dior** `4XLp6ou1JHGgf9xXbHCM`<br>Alternatives: **Marcus** `y0s2ExEMuum3muUnA6Zd`, **Emma** `YEENOUza6MPsbkc1De9E` | Dior verified; alternatives by docs and preview analysis |
| Sound effects | `eleven_text_to_sound_v2`<br>`POST /v1/sound-generation`<br>`mp3_44100_128`, set `duration_seconds` | Verified |
| Music | `music_v2_5` with a **composition plan** (`chunks`)<br>`POST /v1/music`, `output_format=auto` (gives mp3 48 kHz 192 kbps) | Verified: lands exactly on 120 BPM |
| Music plan | `POST /v1/music/plan` | Verified: **free** |
| Images | `gpt-image-2.5-sunburst` for finals and edits<br>`gpt-image-2.5-flare` for drafts<br>`background:"transparent"` + `png` | Verified: RGBA PNG with real alpha |
| Helpers | `scripts/lib/eleven.mjs`, `scripts/lib/openai-image.mjs` | Smoke test: `node scripts/lib/smoke.mjs` (makes no API calls) |

## 1. Accounts and quotas

### ElevenLabs (`GET /v1/user/subscription`, verified)
- **Tier:**
  - `tier: "payg"`. This is the **Free plan plus a prepaid Pay-As-You-Go balance**.
  - The docs say PAYG keeps the underlying plan's limits ("your underlying plan tier (and its limits) remains the same").
- **Credits at 08:55 UTC:**
  - `character_count` 8,642 of a `character_limit` of 33,257, so **≈24,600 credits remain**.
  - **The balance is dropping fast:** other agents are spending in parallel. It was 6,505 used at 08:09.
  - `next_character_count_reset_unix` = **2026-10-22 11:11:31 UTC** (monthly cycle). PAYG credits expire 12 months after purchase.
- **Credit value:**
  - Observed rate ≈ **2,700 credits per USD** at list API prices. So ≈24.6k credits ≈ **$9 of API usage**.
  - List prices: v4 TTS $0.08 per 1K characters; Music $0.15/min; SFX $0.12/min.
- **Concurrency:** **3 concurrent requests** (Free + PAYG = Starter level, per the docs). The helpers cap each process at 3, so don't run several generation scripts at once.
- **Voices:**
  - `voice_limit` 3 and no voice cloning. Neither matters to us.
  - **Voice Library voices work directly by `voice_id`** without saving them to My Voices. Verified with Dior, which is not saved.
- **Output-format gates (verified):**
  - `mp3_44100_192` on TTS returns **HTTP 403** `output_format_not_allowed`: "only available on the Creator tier and above". Nothing is charged.
  - The docs say SFX has the same gate, and that PCM/WAV at 44.1 kHz needs Pro. Use `mp3_44100_128` for TTS and SFX.
  - **Music `output_format=auto` returned mp3 48 kHz / 192 kbps stereo.** That works.
- **License (human decision):**
  - ElevenLabs billing docs: "If you are on the free plan, you can use the content non-commercially with attribution."
  - The pricing page says Music has "Commercial use licensing on Starter+ plans".
  - A hackathon demo is arguably non-commercial, but the human should decide. Options:
    - (a) credit ElevenLabs in the README or end card ("Voice, music & sound effects: ElevenLabs");
    - (b) upgrade to Starter **before** rendering the final audio.

### OpenAI (`GET /v1/models`, verified)
- **Image-capable models on this key:**
  - `gpt-image-2.5-sunburst`, `gpt-image-2.5-sunburst-2026-09-08`
  - `gpt-image-2.5-flare`, `gpt-image-2.5-flare-2026-09-08`
  - `gpt-image-2`, `gpt-image-2-2026-04-21`
  - `gpt-image-1.5`, `chatgpt-image-latest`, `gpt-image-1`, `gpt-image-1-mini`
  - Also `sora-2` and `sora-2-pro` (video).
  - `dall-e-2` / `dall-e-3` were retired on 2026-05-12 and are not listed.
- **"OpenAI image 2.5"** is **GPT Image 2.5**, which ships as two variants with **identical token prices**:
  - **Sunburst** is "our most capable model for image generation and editing", for when edit precision matters.
  - **Flare** is "fastest… everyday image generation".
- **Recommendation:**
  - **Sunburst** for final stickers and every reference-image edit. It is the API's default for `/v1/images/edits`.
  - **Flare** for drafts.
- **Access:** no organization verification was needed; generation worked.
- **Rate limits (docs, Build tier; our usage tier is unknown):** 250k TPM and 20 images per minute. The helper retries 429s.
- **Prices (docs):**
  - Text input $5 per million tokens.
  - Image input $8 per million tokens.
  - Image output $30 per million tokens.
  - The response includes `usage`, and the helper saves it in `.meta.json`.

## 2. ElevenLabs text to speech

### Models (`GET /v1/models`, verified)
| model_id | Notes |
|---|---|
| **`eleven_v4`** | Newest (launched 2026-09-28) and the recommended model.<br>10,000 characters per request, 94 languages.<br>Audio tags.<br>Voice settings: **stability + similarity only**. No style, speed or speaker boost, and no SSML `<break>`.<br>**`/with-timestamps` works (verified).** |
| `eleven_v4_turbo` | Low-latency v4, 0.5× cost. For realtime use; not needed here. |
| `eleven_v3` | Expressive, with audio tags, 5,000 characters.<br>**Request stitching is not supported** (docs).<br>Timestamps not tested by me.<br>The docs say v4 is "a net upgrade… in almost every case". |
| `eleven_v3_conversational` | Realtime v3, 0.5× cost. |
| `eleven_multilingual_v2` | The old reliable model.<br>Supports `style`, `speed` (0.7-1.2), `use_speaker_boost` and SSML `<break time="1s"/>`.<br>Use it only if we need `speed` or `<break>`. |
| `eleven_flash_v2_5`, `eleven_turbo_v2_5`, `eleven_flash_v2`, `eleven_turbo_v2` | Low latency, 0.5× cost, weaker number reading. Don't use. |

### Endpoint
`POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps?output_format=mp3_44100_128`
- **Headers:** `xi-api-key`, `content-type: application/json`.
- **Body:**
  - `text`
  - `model_id`
  - `voice_settings`: `{stability, similarity_boost}` for v4. Older models also take `style`, `speed` and `use_speaker_boost`; `clone_strength` applies only to v4-fine-tuned professional voices.
  - `seed`: 0..4294967295, best effort.
  - `previous_text`, `next_text`
  - `previous_request_ids`, `next_request_ids`: at most 3 each, under 2 hours old, not supported on v3.
  - `language_code`
  - `apply_text_normalization`: `auto` | `on` | `off`.
  - `pronunciation_dictionary_locators`: at most 3.
  - `audio_effects`: new; adds a reverb, filter or noise bed.
- **Response:** `{ audio_base64, alignment, normalized_alignment }`.
  - Both alignments have the shape `{ characters[], character_start_times_seconds[], character_end_times_seconds[] }`.
  - **Response headers:** `request-id`, `history-item-id`, `character-cost` (the credits for that request).

### Verified test
- **Request:** `"Meet Pot. Group chat money that follows its own rules."` (54 characters).
  - Voice: Dior.
  - Model: `eleven_v4`.
  - Settings: `{stability 0.5, similarity_boost 0.75}`, `seed 7`.
- **Result:**
  - Latency **1.5 s**.
  - **3.68 s** of mono mp3, 44.1 kHz, 128 kbps.
  - `character-cost: 12`.
  - 10 words in 3.68 s = **2.7 words/s**. The script targets 2.6.
- **Alignment:**
  - It is character-level, and its characters match the input text exactly, punctuation included.
  - In practice the timings are **word timings spread evenly over each word's letters**. Use word boundaries.
  - **The last end time overshot the audio** (3.76 s against 3.68 s). The helper clamps `words` to the real duration.
- **Loudness:** −23.9 LUFS integrated, −4.1 dBTP. Quiet: normalise it in the mix.

### Prompting v4 (docs plus the script's needs)
- **Pauses:**
  - Use punctuation and "…" for pauses, and CAPS for emphasis.
  - SSML `<break>` is **not** supported on v3 or v4.
- **Audio tags:** e.g. `[excited]`, `[warmly]`, `[laughs]`, placed before the words they colour.
  - v4 can misread a vague tag as a sound effect, so describe the voice: `[bright, smiling]`.
  - Unverified: whether tags appear inside `alignment.characters`. Strip tags before matching words for captions.
- **Pace:** v4 has no `speed`. To fit the grid:
  - re-take with different punctuation;
  - or time-stretch with ffmpeg `atempo` (keep it within 0.92-1.08 for quality);
  - or use `eleven_multilingual_v2` with `speed` for that one line.
- **Numbers:** the script already spells them out ("Eighty-four dollars"). Keep doing that; normalisation of "$84" on v4 is untested.
- **"Sputnik DAO":** if the take says "dow", write `Sputnik D-A-O`.
- **Continuity:** each line is a separate clip, so pass the neighbouring lines as `previousText` / `nextText`.
  - `previousRequestIds` also works on paper (docs exclude v3 only), but it is untested on v4.

## 3. Voice shortlist
Searched with:
- `GET /v1/voices` and `/v2/voices`: 36 voices on the account (21 premade + 15 saved library voices);
- `GET /v1/shared-voices`: 571 unique library voices across 11 searches.

Valid `use_cases` filters are `advertisement`, `narrative_story`, `informative_educational`, `conversational`, `social_media`, `entertainment_tv` and `characters_animation`. `narration` returns nothing.

**Caveat:** I can't listen to audio. The ranking is built from:
- descriptions and labels;
- popularity;
- `eleven_v4` support;
- measurements of the public previews: pitch spread in semitones (more = livelier) and loudness.

**A human should audition the previews.** They are public MP3s and need no key.

**Cheapest A/B:** generate script line `s06-reveal` with the top 3 voices, ≈40 credits total.

All 8 are `eleven_v4`-verified, use the standard rate (no credit multiplier), have no live moderation, and have a **730-day notice period**. Alexandra is the exception on the last two points: she is a saved library voice that is fine-tuned for v4, and the API doesn't report her notice period or moderation.

| # | Voice | voice_id | Labels | Fit |
|---|---|---|---|---|
| **1** | **Dior**: Crisp, Confident, Modern, Global | `4XLp6ou1JHGgf9xXbHCM` | male · young · American (accent-neutral) · crisp · advertisement | Made for exactly this: "tech commercials, product launch videos, SaaS and app ads, AI and startup brand films… keynote openers"; "makes new technology feel exciting and easy to trust". **Verified on our account**: v4 with timestamps and a natural 2.7 words/s. Low exposure (1k clones), so it won't sound like "the TikTok voice". Preview pitch spread 4.4 st. |
| **2** | **Marcus**: Bright, Upbeat and Clear | `y0s2ExEMuum3muUnA6Zd` | male · young · American · upbeat · social_media | "Bright, clear delivery that hooks viewers instantly… explainers, tech content". **The most animated of the 35 previews** (5.8 st), ideal for hypermotion and a muted-first feed. Proven quality (66k clones). Risk: slightly "creator", so keep stability ≥ 0.5. |
| **3** | **Emma**: Youthful, Upbeat Commercial | `YEENOUza6MPsbkc1De9E` | female · American · upbeat · advertisement | "Friendly energy, natural conversational delivery… upbeat and engaging **without sounding pushy or overly announcer-like**… product launches, explainer videos". The brief's "not a trailer, not a radio ad" in one line. Best female option (4.2 st). |
| 4 | Adam Stone: Warm, Upbeat & Confident | `DEFpwxCUkrj3WAbTDRTZ` | male · middle-aged · **British** · upbeat | "A natural smile, bright pace and positive energy… without sounding forced or overproduced", which matches the script's "slight smile in the voice". A distinctive British option (5.2 st). |
| 5 | Killian: Clear, Warm, Upbeat & Friendly | `Whez8hBysHW6IVGRgjGA` | male · young · American · upbeat | "Bright, warm, articulate… natural pacing and crisp pronunciation". Safe and versatile. |
| 6 | Justin Case: Trustworthy Ad Narrator | `DtQLDxHbTiQTpVVanTy1` | male · middle-aged · American · confident | "A knowledgeable friend, not a pushy announcer… SaaS and app demos… finance". The most trust-forward of the set (good for a money product), slightly calmer. Preview 5.5 st. |
| 7 | Christina: Energetic Commercial | `BuaKXS4Sv1Mccaw3flfU` | female · young · American · confident | "Energetic, confident… realistic, human delivery… product launches". Very popular (129k clones). Can lean into an ad read. |
| 8 | Alexandra: Conversational and Real | `kdmDKE6EkgrWrrykO9Qt` | female · young · American · casual | Already saved in My Voices and **fine-tuned for eleven_v4**. "Youthful and authentic, conversational, relatable": the most "friend in the group chat" of the set. Lively (4.4 st), less polished. |

**Top 3:**
1. **Dior** is the default. It is the only voice in the library whose brief is literally "tech product launch / keynote opener". It is accent-neutral for a global jury, it is not over-exposed, and it is already proven end-to-end on this account.
2. **Marcus** if the director wants more punch and energy for the hypermotion cut.
3. **Emma** if a female narrator reads warmer next to Maya's story. She is the best match to "upbeat but not announcer-like".

**Fallback premade voices:** they work on every plan, but they are not v4-fine-tuned, so the v4 quality is unknown.
- Liam `TX3LPaxmHKxFdv7VOQHJ`: energetic and warm, for reels.
- Jessica `cgSgspJ2msm6clMCkdW9`: playful, bright and warm.

**Previews:** public, no key needed.
- Dior: https://storage.googleapis.com/eleven-public-prod/database/workspace/aad6c6f07ff048e19e053b5337842d65/voices/4XLp6ou1JHGgf9xXbHCM/B48exD9XzeDfRvrvnv0F.mp3
- Marcus: https://storage.googleapis.com/eleven-public-prod/database/user/user_7801kf3bd6neey8vehqngkcb0r4c/voices/y0s2ExEMuum3muUnA6Zd/5TXfB5O5rQnIoAihDhsi.mp3
- Emma: https://storage.googleapis.com/eleven-public-prod/database/workspace/f97cd766753c4b298a5d1e90b97f31ce/voices/YEENOUza6MPsbkc1De9E/DGHApLo2IMcK1lKoJI61.mp3
- Adam Stone: https://storage.googleapis.com/eleven-public-prod/database/workspace/0060d299e8fe492da206d7cd208a999c/voices/DEFpwxCUkrj3WAbTDRTZ/vrB9X6BIYuiJylNZVmoS.mp3
- Killian: https://storage.googleapis.com/eleven-public-prod/database/workspace/fad23200bdc941ddb82a019554f7f725/voices/Whez8hBysHW6IVGRgjGA/gt4WnMpNb4rLMTO4r2vW.mp3
- Justin Case: https://api.us.elevenlabs.io/v1/voices/DtQLDxHbTiQTpVVanTy1/previews/audio?payload=eyJ2b2ljZV9zb3VyY2UiOiJjdXN0b20iLCJ3b3Jrc3BhY2VfaWQiOiIyNjc3Nzk1YzNiYTY0YWJlYmIxZjdlNGEzN2QxNjlmNSIsImZpbGVuYW1lIjoiREJLb3VjWElhd1J2dEhlS2g5RDQubXAzIiwidGltZXN0YW1wIjoxNzkyNjU2MDAwMDAwMDAwfQ%3D%3D
- Christina: https://api.us.elevenlabs.io/v1/voices/BuaKXS4Sv1Mccaw3flfU/previews/audio?payload=eyJ2b2ljZV9zb3VyY2UiOiJjdXN0b20iLCJ1c2VyX2lkIjoibEhFQm9LUERSRGdVVkx3MEpLNTN0dHdJa3lYMiIsImZpbGVuYW1lIjoidHFUMUFMNG1HUDJLOGU5MWwwaTgubXAzIiwidGltZXN0YW1wIjoxNzkyNjU2MDAwMDAwMDAwfQ%3D%3D
- Alexandra: https://storage.googleapis.com/eleven-public-prod/database/workspace/1df4b21393b74964b03d3690a173eb80/voices/kdmDKE6EkgrWrrykO9Qt/yJT6XwhJHSWv3Pb05OIk.mp3

If an `api.us…previews` link stops working, refresh it with `GET /v1/shared-voices?search=<name>&language=en`.

## 4. ElevenLabs sound effects

### Endpoint
`POST /v1/sound-generation?output_format=mp3_44100_128`
- **Body:**
  - `text`: the prompt.
  - `duration_seconds`: **0.5-30** per the API reference (an overview page says 0.1, but trust the reference); omit it to let the model choose. For shorter sounds, generate 0.5 s and trim.
  - `prompt_influence`: 0-1, default 0.3; higher is more literal.
  - `loop`: bool, for seamless loops.
  - `model_id`: `eleven_text_to_sound_v2` (default, documented). `eleven_text_to_sound_v3` is in the API enum but undocumented and untested.
- **Response:** raw audio, with a `character-cost` header and no request-id.

### Verified test
- **Request:** "fast clean whoosh transition", `duration_seconds 1.0`, `prompt_influence 0.5`.
- **Result:**
  - Latency 1.7 s.
  - **1.000 s**, stereo, 44.1 kHz, 128 kbps.
  - `character-cost: 5` (the docs say 40 credits/s; this account was billed 5 for 1 s).
- **Loudness:** −11.9 LUFS with a **true peak of +1.1 dBFS (over full scale)**. Gain each SFX down or limit it in the mix.

### Prompting (docs)
- Use short, concrete descriptions ("glass shattering on concrete"). Audio terms work: "whoosh", "riser", "impact", "braam".
- Set `duration_seconds` for anything timed to the grid: 1 beat = 0.5 s, 1 bar = 2 s at 120 BPM.

## 5. ElevenLabs music

### Endpoints (docs; plan and compose verified)
| Endpoint | What |
|---|---|
| `POST /v1/music/plan` | Prompt to composition plan. **Free (no credits)**, rate-limited. Body: `prompt`, `music_length_ms` (3,000-600,000), `model_id`, `source_composition_plan`. |
| `POST /v1/music?output_format=auto` | Returns the audio file. Response header **`song-id`**; no cost header. |
| `POST /v1/music/detailed` | `multipart/mixed`: a JSON part (`composition_plan`, `song_metadata`, optional word timestamps via `with_timestamps`) plus the audio. |
| `POST /v1/music/stream` | Streamed audio. |
| `/v1/music/upload`, `/video-to-music`, `/finetunes`, inpainting | Exist (docs). Not needed. |

### Rules
- `model_id`: `music_v2_5` (best), `music_v2` or `music_v1`. **The API default is `music_v1`**, so always pass `music_v2_5`.
- `prompt` and `composition_plan` are mutually exclusive.
- `music_length_ms` and `force_instrumental` apply to **prompt mode only**. `seed` applies to **plan mode only**.
- In plan mode the length is the sum of the chunk durations. Each chunk is 3,000-120,000 ms, with at most 30 chunks; the total is 3 s to 10 min.
- On v2 / v2.5 the chunk durations are always enforced. `respect_sections_durations` applies to v1 only.
- **Instrumental in plan mode** (no `force_instrumental` there):
  - set the chunk `text` to just a section name like `"[Intro]"`;
  - add `"instrumental"` to `positive_styles`;
  - add `"vocals", "singing", "lyrics"` to `negative_styles`.
- **Copyright:** naming an artist or band gives `bad_prompt` / `bad_composition_plan`, with a suggested alternative.
- **Audio Reference** (`conditioning_ref`) is "available… on all paid plans". Assume it is **not** available to us.

### `composition_plan` schema for `music_v2` / `music_v2_5` (the one to use)
```jsonc
{
  "chunks": [                                   // 1..30, ordered
    {
      "text": "[Intro]",                        // optional [Section name] (1-100 chars) + lyric lines (<=30 lines x 200 chars)
                                                // + inline cues in curly braces, e.g. "{drum fill}"
      "duration_ms": 8000,                      // 3000..120000
      "positive_styles": ["120 BPM", "..."],    // required; English; 6-7+ in early chunks; up to 50
      "negative_styles": ["vocals", "..."],     // optional; up to 50
      "context_adherence": "high",              // "low" | "medium" | "high" (default)
      "conditioning_ref": null,                 // optional AudioRefChunk { song_id, range: { start_ms, end_ms } }
      "condition_strength": null                // "low" | "medium" | "high" | "xhigh"
    }
    // a chunk can also be an AudioRefChunk { "song_id": "...", "range": { "start_ms": 0, "end_ms": 4000 } }
  ]
}
```

### Old `music_v1` shape (for reference only; it errors on v2 and v2.5)
`{ positive_global_styles[], negative_global_styles[], sections: [{ section_name, positive_local_styles[], negative_local_styles[], duration_ms, lines[], source_from? }] }`

### Verified tests
- **Plan:** "120 BPM upbeat minimal electronic pop, instrumental only, no vocals", 8,000 ms.
  - Result: 2.8 s latency, free.
  - It returned 1 chunk, `"[Main Groove]"`, with 9 styles such as "120 BPM", "minimal kick and clap pattern", "plucky analog synth lead" and "clean sub bass with light sidechain".
- **Compose:** that plan plus instrumental styles, `seed 120`, `output_format=auto`.
  - Result: latency **2.6 s**.
  - **8.04 s**, mp3, **48 kHz, 192 kbps, stereo**.
  - `song-id` returned.
  - **55 credits** (≈6.9 credits/s, from `GET /v1/usage/character-stats?breakdown_type=model`).
  - Loudness −12.5 LUFS, −0.3 dBTP.
  - **Tempo: exact.** The strongest onsets sit within **±2 ms of a 120 BPM eighth-note grid**, and the first transient is at ≈0.14 s.

### Fitting the 120 BPM grid
- 1 beat = 500 ms = 30 frames at 60 fps; 1 bar (4/4) = 2,000 ms.
- **Make every `duration_ms` a multiple of 2,000** (e.g. 8 bars = 16,000).
- Put "120 BPM" and the key in the first chunk's styles.
- Before laying VO on the grid, detect the first downbeat; the test track's first transient was at ≈0.14 s.
- Example skeleton only (the audio agent owns the real plan, built from `src/data/timeline.ts`):
  ```js
  const BAR = 2000;
  const chunk = (name, bars, styles, neg = []) => ({ text: `[${name}]`, duration_ms: bars * BAR,
    positive_styles: styles, negative_styles: ["vocals", "singing", "lyrics", ...neg], context_adherence: "high" });
  const plan = { chunks: [
    chunk("Problem", 12, ["120 BPM", "A minor", "instrumental", "tense minimal electronic pulse", "muted plucks", "ticking hats", "polished modern production"]),
    chunk("Reveal", 4, ["riser into a bright drop", "marigold-warm synth chords", "big clean kick"]),
    chunk("Product", 20, ["upbeat minimal electronic pop", "plucky synth lead", "clean sub bass with light sidechain", "claps"]),
    chunk("Under the hood", 8, ["techier arpeggios", "filtered", "driving"]),
    chunk("End card", 4, ["resolve", "final hit then short tail"]),
  ]};
  ```

## 6. OpenAI images

### `POST /v1/images/generations` (JSON; docs plus verified validation)
- `model`
- `prompt`: up to 32,000 characters.
- `size`:
  - `1024x1024` | `1536x1024` | `1024x1536` | `auto`, or any `WxH`.
  - Width and height must be multiples of 16, with a ratio ≤ 3:1 and 655,360-8,294,400 pixels.
  - Above 2560x1440 is experimental.
  - **Verified:** `1000x1000` is rejected as "Width and height must both be divisible by 16".
- `quality`: `low` | `medium` | `high` | `xhigh` | `max` | `auto`.
  - **Gotcha:** the API's enum error text lists only low, medium, high and auto.
  - **Verified (no image was billed):** `xhigh` and `max` pass quality validation on Sunburst.
- `background`: `transparent` | `opaque` | `auto`. Transparent needs `png` or `webp`.
- `output_format`: `png` | `jpeg` | `webp`.
- `output_compression`: 0-100, for jpeg and webp only; default 100.
- `n`: 1-10.
- `moderation`: `auto` | `low`.
- `stream` + `partial_images` (0-3). Each partial image costs +100 output tokens.
- `safety_identifier`.
- **Not supported for GPT image models:** `response_format`, `style` (DALL·E only).
- **Response:** `data[].b64_json`, plus `usage` (tokens), `background`, `quality`, `size` and `output_format`.

### `POST /v1/images/edits` (reference images, for style consistency)
- **Multipart form:** `image[]` repeated, **up to 16 images**; png, jpeg or webp, under 50 MB.
  - Optional `mask` (a PNG with alpha), plus the same fields as generations.
- **JSON alternative:** `images: [{ image_url: "data:image/png;base64,…" } | { file_id }]`.
- Default model: `gpt-image-2.5-sunburst`.
- `input_fidelity` (`high` | `low`) works only on gpt-image-1 / 1.5. **Omit it for gpt-image-2 and 2.5.**
- **Verified:** a multipart request with 2 reference images reached parameter validation (it was rejected only for a deliberately bad `quality`), so the `image[]` path works.
- **Answer to `brief/04-assets.md`:** yes, the edit endpoint accepts reference images. Pass the approved tram sticker as `images[0]` for the other stickers.

### Verified test
- **Request:** `gpt-image-2.5-sunburst`, `1024x1024`, `quality low`, `background transparent`, `png`.
  - Prompt: "a single die-cut sticker of a yellow Lisbon tram, flat illustration, thick white border, no background".
- **Result:**
  - Latency **24.1 s**.
  - Usage: 26 text-input tokens + 196 image-output tokens ≈ **$0.006**.
  - Output: RGBA PNG, 1.17 MB.
  - It looks right: a clean die-cut sticker with a thick white border.
- **Alpha:**
  - The background really is transparent: 37% of pixels have alpha 0, including all four corners.
  - **The subject's alpha tops out at 253-254, not 255.**
  - A **faint matte haze** (alpha 1-15, about 2.4% of pixels) reaches almost to the canvas edges.
  - **Pixels with alpha 0 store light-grey RGB values.** This is harmless in Chrome and Remotion, but tools that ignore alpha will show a glow.
- **Text:** the model **added unprompted text** ("CARREIRA Nº 28", "573"). The style prefix in `04-assets.md` already says "No text, no letters, no numbers". Keep that.

### Sticker cleanup (tested on the sample)
Apply an alpha floor and ceiling, trim, add a 24 px margin and fit the long side to 1024 px. The resize is premultiplied, so edges don't fringe. Trim on alpha ≥ 16, **not** alpha > 0: the haze would keep the whole canvas.
```python
import numpy as np; from PIL import Image
a = np.array(Image.open(src).convert("RGBA")); al = a[..., 3]
al[al < 16] = 0; al[al >= 250] = 255; a[..., 3] = al; a[al == 0, :3] = 0
im = Image.fromarray(a); im = im.crop(im.getchannel("A").getbbox())
s = (1024 - 48) / max(im.size)
im = im.convert("RGBa").resize((round(im.width * s), round(im.height * s)), Image.LANCZOS).convert("RGBA")
out = Image.new("RGBA", (im.width + 48, im.height + 48), (0, 0, 0, 0)); out.paste(im, (24, 24)); out.save(dst, optimize=True)
```
- **Colours:** the hex codes in the prompt steer the palette but are not exact. If a sticker must sit exactly on brand tokens, recolour it in post.
- **Cost:** high quality uses many more output tokens than low. Read `usage` in the `.meta.json` before batch runs; draft at `low` first.

## 7. The helpers

Both are zero-dependency Node ESM (Node 22, global fetch).
- **Keys:** read from `process.env` **at call time** and never logged. Errors are scrubbed of key values.
- **Cache:** when `outPath` exists, the call returns the cached file and makes **no API call**. Pass `force: true` to regenerate, or change `outPath` when the inputs change.
- **Retries:** backoff on 429 and 5xx. Out-of-credit, quota and moderation errors are not retried. A client timeout is not retried either, so a finished job is never billed twice.
- **Sidecars:**
  - Every output gets `<outPath>.meta.json`: the request params, model, request id, cost headers or `usage`, latency, duration and time. No secrets.
  - TTS also writes `<outPath>.alignment.json`: `{ text, alignment, normalized_alignment, words: [{ text, start, end, startFrame, endFrame, charStart, charEnd }] }`.
- **Writes are atomic.** If the media file exists, its sidecars are complete.

### `scripts/lib/eleven.mjs`
- `tts({ text, voiceId, modelId="eleven_v4", voiceSettings, previousText, nextText, previousRequestIds, nextRequestIds, seed, languageCode, applyTextNormalization, outputFormat="mp3_44100_128", fps=60, outPath, force })`
  - Returns `{ outPath, cached, durationSec, alignment, normalizedAlignment, words, requestId }`.
- `toVoClip(id, file, ttsResult)`
  - Returns `{ id, file, durationSec, words:[{text,start,end}] }`, exactly what `src/data/vo.ts` reads from `src/data/vo/<id>.json`.
- `wordsFromAlignment(alignment, fps=60, maxSec?)`
- `sfx({ prompt, durationSec, promptInfluence=0.3, loop=false, modelId="eleven_text_to_sound_v2", outputFormat="mp3_44100_128", outPath, force })`
- `musicPlan({ prompt, lengthMs, modelId="music_v2_5", sourceCompositionPlan, outPath?, force })`
  - Free. Pass `outPath` to cache the plan JSON.
- `music({ prompt | compositionPlan, lengthMs, forceInstrumental, modelId="music_v2_5", seed, storeForInpainting, outputFormat="auto", outPath, force })`
  - Returns `{ outPath, cached, durationSec, songId, requestId }`.
- `credits()`
  - Returns `{ tier, used, limit, remaining, resetsAt }`. Free.
- Concurrency is capped at 3 per process (`ELEVENLABS_MAX_CONCURRENCY`).

### `scripts/lib/openai-image.mjs`
- `generateImage({ prompt, model="gpt-image-2.5-sunburst", size="1024x1024", quality="high", background="auto", outputFormat="png", outputCompression, moderation, n=1, outPath, force })`
- `editImage({ prompt, images:[paths], mask, model="gpt-image-2.5-sunburst", size, quality="high", background, outputFormat="png", outputCompression, inputFidelity, moderation, n=1, outPath, force })`
- Both return `{ outPath, outPaths, cached, usage, latencyMs }`.
- With `n > 1`, the files are `x.png`, `x-2.png`, … and the cache checks only `x.png`.

### How to run
Always run from `marketing/video`, and put scripts in your own `scripts/audio-*` or `scripts/images-*` files.
```bash
cd marketing/video
node scripts/lib/smoke.mjs                          # no keys needed, no API calls
node --env-file=../.env scripts/audio-vo.mjs        # your script that imports ./lib/eleven.mjs
```

**VO example** (`scripts/audio-vo.mjs`):
```js
import { mkdir, writeFile } from "node:fs/promises";
import { tts, toVoClip } from "./lib/eleven.mjs";

const VOICE = "4XLp6ou1JHGgf9xXbHCM"; // Dior
const lines = [{ id: "s06-reveal", text: "Meet Pot. … Group chat money that follows its own rules." }];
await mkdir("src/data/vo", { recursive: true });
for (const [i, { id, text }] of lines.entries()) {
  const r = await tts({
    text, voiceId: VOICE, seed: 7,
    voiceSettings: { stability: 0.5, similarity_boost: 0.75 },
    previousText: lines[i - 1]?.text, nextText: lines[i + 1]?.text,
    outPath: `public/audio/vo/${id}.mp3`,
  });
  await writeFile(`src/data/vo/${id}.json`, JSON.stringify(toVoClip(id, `audio/vo/${id}.mp3`, r), null, 2) + "\n");
  console.log(id, r.cached ? "cached" : "generated", r.durationSec, "s");
}
```

**SFX and music:**
```js
import { sfx, musicPlan, music, credits } from "./lib/eleven.mjs";
// duration_seconds must be >= 0.5 (API reference). For the 0.35 s "whoosh-fast", generate 0.5 s and trim + fade in ffmpeg.
await sfx({ prompt: "fast clean whoosh transition", durationSec: 0.5, promptInfluence: 0.5, outPath: "public/audio/sfx/_raw/whoosh-fast.mp3" });
const plan = await musicPlan({ prompt: "120 BPM upbeat minimal electronic pop, instrumental", lengthMs: 96000, outPath: "public/audio/music/pot-theme.plan.json" });
// …edit plan.chunks (durations in multiples of 2000 ms, instrumental styles), then:
await music({ compositionPlan: plan, seed: 120, outPath: "public/audio/music/pot-theme.mp3" });
console.log(await credits());
```

**Images:**
```js
import { generateImage, editImage } from "./lib/openai-image.mjs";
const STYLE = "A single glossy die-cut vinyl sticker of …"; // the prefix from brief/04-assets.md
await generateImage({ prompt: `${STYLE}`, background: "transparent", quality: "low", model: "gpt-image-2.5-flare", outPath: "out/drafts/tram-draft.png" }); // draft
await generateImage({ prompt: `${STYLE}`, background: "transparent", quality: "high", outPath: "public/images/stickers/_raw/tram.png" });  // final
await editImage({ prompt: `Same sticker style as the reference. ${STYLE}`, images: ["public/images/stickers/_raw/tram.png"],
  background: "transparent", quality: "high", outPath: "public/images/stickers/_raw/boat.png" });
```

## 8. Observed costs and latencies (2026-10-22)
| Call | Latency | Output | Cost |
|---|---|---|---|
| TTS `eleven_v4` with timestamps, 54 characters | 1.5 s | 3.68 s, mono 44.1 kHz, 128 kbps | 12 credits (≈ $0.004) |
| SFX v2, 1.0 s | 1.7 s | 1.00 s, stereo 44.1 kHz | 5 credits |
| Music plan, 8 s | 2.8 s | plan JSON | free |
| Music `music_v2_5`, 8 s from a plan | 2.6 s | 8.04 s, stereo 48 kHz, 192 kbps | 55 credits (≈ $0.02) |
| Image Sunburst, low, 1024², transparent | 24.1 s | RGBA PNG | 222 tokens (≈ $0.006) |
| Rejected requests (403 / 400 validation) | n/a | n/a | free |

**Projection for the whole video:**
- VO from `02-script.md` is 13 lines, 1,017 characters and 185 words (≈71 s at 2.6 words/s), ≈225 credits per full pass.
- 24 SFX at about 1 s each, ≈120-250 credits.
- A 96 s music take, ≈660 credits.
- That fits comfortably in the ≈24.6k credits, **if the other agents' parallel spending is watched**. 1,531 credits of `music_v1` had already been spent today by 08:55.

## 9. Gotchas (read before generating)
1. **`/v1/music` defaults to `music_v1`**, the outclassed model. Always pass `music_v2_5`; the helper does. Someone on the team has been generating `music_v1` today.
2. **v1 and v2 plans are different shapes.** `sections` is v1 and `chunks` is v2/v2.5; each errors on the other model.
3. **192 kbps MP3 is Creator-only for TTS and SFX** (403). Music at `auto` is fine at 48 kHz/192.
4. **v4 has no `speed`, `style` or SSML breaks.** Fix pacing with text, a re-take, or `atempo`, as described in §2.
5. **The alignment's last end time overshoots the audio** (by 80 ms in the test), and character times inside a word are interpolated. Use the helper's clamped `words`.
6. **Account credits are shared live with other agents.** Measure your own spend with:
   - the per-request `character-cost` header (TTS and SFX), which is saved in `.meta.json`;
   - `GET /v1/usage/character-stats?breakdown_type=model&metric=credits&aggregation_interval=cumulative&start_unix=<ms>&end_unix=<ms>` for music.
7. **Concurrency limit is 3.** Don't run parallel generation scripts.
8. **Loudness is all over the place:**
   - VO −24 LUFS, SFX −12 LUFS with peaks over 0 dBFS, music −12.5 LUFS.
   - Normalise every clip. Duck the music 8-10 dB under the VO (per the brief).
   - The X-friendly master is ≈ −14 LUFS, −1 dBTP.
9. **Images:**
   - Trim on alpha ≥ 16, and force alpha ≥ 250 to 255 (§6).
   - Always keep "No text…" in the prompt.
   - Colours are only approximately on brand.
   - Never generate coins or piggy banks (brand rule).
10. **SFX `duration_seconds` minimum is 0.5 s.** Generate 0.5 s and trim for shorter sounds; `sfx()` rejects anything else before calling the API.
11. **Cache is keyed by `outPath` only.** Changing the prompt with the same `outPath` returns the old file. Use `force: true` or a new path. Rejected requests write nothing.
12. **License:** the free plan means non-commercial use with attribution; Music's commercial licence needs Starter+. A human decides (§1).
13. **Secrets:**
    - Never `set -x`, and never print `process.env` or the `.env` file.
    - The helpers only ever send the key in a request header, never in a URL.

## 10. Test artifacts (session scratchpad, not in the repo)
`<session scratchpad>/tests/`
- `tts-4XLp6ou1JHGgf9xXbHCM-eleven_v4-mp3_44100_128.mp3`, plus its `.alignment.json` and `.meta.json`
- `sfx-whoosh-1s.mp3`, plus `.meta.json`
- `music-plan-8s.json` and `music-test-8s-auto.mp3`, each with a `.meta.json`
- `img-tram-sticker-low.png`, plus `.meta.json`, and `img-tram-clean.png` (after the cleanup snippet)
- Previews of the 35 analysed voices: `../previews/<voice_id>.mp3`
