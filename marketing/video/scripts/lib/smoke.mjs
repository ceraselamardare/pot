// Smoke test for the helper modules: loads them and checks exports and pure helpers.
// Makes NO API calls: it removes the API keys from its own process first, so even when run
// with --env-file nothing can reach a paid endpoint.
//   node scripts/lib/smoke.mjs        (from marketing/video)

delete process.env.ELEVENLABS_API_KEY;
delete process.env.OPENAI_API_KEY;

import assert from "node:assert/strict";

const eleven = await import("./eleven.mjs");
const openai = await import("./openai-image.mjs");
const shared = await import("./_shared.mjs");

for (const fn of ["tts", "sfx", "musicPlan", "music", "credits", "wordsFromAlignment", "toVoClip"]) {
  assert.equal(typeof eleven[fn], "function", `eleven.${fn} missing`);
}
for (const fn of ["generateImage", "editImage"]) {
  assert.equal(typeof openai[fn], "function", `openai-image.${fn} missing`);
}
assert.equal(eleven.ELEVEN_DEFAULTS.ttsModel, "eleven_v4");
assert.equal(openai.IMAGE_DEFAULTS.model, "gpt-image-2.5-sunburst");

// wordsFromAlignment groups characters into words ({text,start,end} like VoWord) with 60 fps frames.
const alignment = {
  characters: [..."Meet Pot."],
  character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
  character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9],
};
const words = eleven.wordsFromAlignment(alignment);
assert.deepEqual(words.map((w) => w.text), ["Meet", "Pot."]);
assert.equal(words[1].startFrame, 30);
assert.equal(words[1].endFrame, 54);
// Clamping to the real audio duration (alignment can overshoot the audio).
assert.equal(eleven.wordsFromAlignment(alignment, 60, 0.85).at(-1).end, 0.85);
// toVoClip matches the VoClip shape in src/data/vo.ts.
assert.deepEqual(eleven.toVoClip("s06-reveal", "audio/vo/s06-reveal.mp3", { durationSec: 0.9, words }), {
  id: "s06-reveal",
  file: "audio/vo/s06-reveal.mp3",
  durationSec: 0.9,
  words: [{ text: "Meet", start: 0, end: 0.4 }, { text: "Pot.", start: 0.5, end: 0.9 }],
});

// Missing key => clear error, thrown before any network request.
await assert.rejects(
  eleven.tts({ text: "x", voiceId: "v", outPath: "/nonexistent-dir/never-written.mp3" }),
  /ELEVENLABS_API_KEY is not set/,
);
await assert.rejects(
  openai.generateImage({ prompt: "x", outPath: "/nonexistent-dir/never-written.png" }),
  /OPENAI_API_KEY is not set/,
);

// Client-side validation rejects bad requests before any network call.
await assert.rejects(eleven.sfx({ prompt: "x", durationSec: 0.35, outPath: "/nonexistent-dir/x.mp3" }), /0\.5\.\.30/);
await assert.rejects(eleven.music({ prompt: "x", compositionPlan: { chunks: [] }, outPath: "/nonexistent-dir/x.mp3" }), /exactly one/);
await assert.rejects(
  eleven.music({ compositionPlan: { sections: [] }, modelId: "music_v2_5", outPath: "/nonexistent-dir/x.mp3" }),
  /chunks\[\]/,
);
await assert.rejects(
  eleven.music({ compositionPlan: { chunks: [{ text: "[A]", duration_ms: 1000, positive_styles: [] }] }, outPath: "/nonexistent-dir/x.mp3" }),
  /3000\.\.120000/,
);

// scrub() removes secret values from strings.
process.env.OPENAI_API_KEY = "sk-test-0123456789abcdefghij";
assert.ok(!shared.scrub("oops sk-test-0123456789abcdefghij leaked").includes("0123456789abcdefghij"));
delete process.env.OPENAI_API_KEY;

console.log("smoke ok: eleven.mjs + openai-image.mjs load, exports present, no API calls made");
