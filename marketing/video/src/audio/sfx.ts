// Sound-effect names → files under public/audio/sfx/. The audio agent generates exactly these files
// (ElevenLabs sound generation). Scenes reference SFX by name only, e.g. <Sfx name="pop" at={beats(2)} />.
// Until a file exists, <Sfx> renders nothing (see src/motion/Sfx.tsx), so scenes can be built before audio lands.

export const SFX = {
  "whoosh-fast": "audio/sfx/whoosh-fast.mp3", // 0.35 s whip for fast camera moves / whip pans
  "whoosh-long": "audio/sfx/whoosh-long.mp3", // 0.9 s sweeping move, zoom-through
  "swoosh-up": "audio/sfx/swoosh-up.mp3", // rising swoosh: element flies in / sheet slides up
  pop: "audio/sfx/pop.mp3", // bubble pop: chat bubble, sticker, card appears
  "pop-soft": "audio/sfx/pop-soft.mp3", // softer variant for rapid sequences
  tap: "audio/sfx/tap.mp3", // soft UI tap (finger on glass)
  click: "audio/sfx/click.mp3", // crisp UI button click
  keypad: "audio/sfx/keypad.mp3", // single keypad key tick
  typing: "audio/sfx/typing.mp3", // ~1 s of soft phone-keyboard typing
  notif: "audio/sfx/notif.mp3", // generic phone notification chime (not an iPhone sound)
  buzz: "audio/sfx/buzz.mp3", // phone vibration buzz
  blips: "audio/sfx/blips.mp3", // three soft rising blips: the typing dots / "Checking Pot rules…"
  success: "audio/sfx/success.mp3", // bright, warm positive chime: "Approved by Pot rules"
  burst: "audio/sfx/burst.mp3", // sparkly pop-whoosh for the marigold burst
  riser: "audio/sfx/riser.mp3", // ~2 s tension riser into the logo reveal
  impact: "audio/sfx/impact.mp3", // deep, clean bass hit for the logo reveal / big cuts
  thud: "audio/sfx/thud.mp3", // card slamming onto a surface
  scribble: "audio/sfx/scribble.mp3", // marker strike-through
  paper: "audio/sfx/paper.mp3", // paper crumple / receipt
  tick: "audio/sfx/tick.mp3", // single clock tick (repeat for the "chasing" montage)
  swipe: "audio/sfx/swipe.mp3", // UI swipe / slide
  sparkle: "audio/sfx/sparkle.mp3", // tiny shimmer for highlights
  stamp: "audio/sfx/stamp.mp3", // soft stamp / confirm thunk
  glitch: "audio/sfx/glitch.mp3", // short digital glitch (problem act only)
} as const;

export type SfxName = keyof typeof SFX;
