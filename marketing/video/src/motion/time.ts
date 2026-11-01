// The video's timing grid. 60 fps, music at 120 BPM → 1 beat = 30 frames, 1 bar (4 beats) = 120 frames.
// Every helper takes an optional fps (default 60) so a 240 fps master stays possible (research §5).
export const FPS = 60;
export const BPM = 120;
export const FRAMES_PER_BEAT = (FPS * 60) / BPM; // 30

/** Seconds → frames (rounded). */
export const sec = (s: number, fps: number = FPS) => Math.round(s * fps);
/** Beats → frames (rounded). beats(1) = 30, beats(0.5) = 15. */
export const beats = (n: number, fps: number = FPS) => Math.round((n * fps * 60) / BPM);
/** Bars (4 beats) → frames. */
export const bars = (n: number, fps: number = FPS) => beats(n * 4, fps);
/** An eighth note (half beat): 15 frames at 60 fps. */
export const eighths = (n: number, fps: number = FPS) => beats(n / 2, fps);
