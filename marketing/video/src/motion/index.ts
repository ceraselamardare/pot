// Pot motion kit: the film's shared motion vocabulary. Import from "../motion" (or "src/motion").
// See src/motion/README.md for props, defaults and render-cost notes.

// Time grid (60 fps, 120 BPM)
export * from "./time";
export * from "./rhythm";

// Curves, springs, keyframes
export * from "./easing";

// Colour helpers (token-only)
export { alpha, blend, depthShadow, EGGPLANT } from "./color";

// Camera rig
export * from "./camera";

// Kinetic typography
export * from "./text/KineticText";
export * from "./text/marks";
export * from "./text/fit";

// Numbers
export * from "./numbers";

// Transitions
export * from "./transitions/presentations";
export * from "./transitions/wrappers";
export * from "./transitions/geometry";

// Effects
export * from "./effects/blur";
export * from "./effects/Grain";
export * from "./effects/overlays";
export * from "./effects/Burst";
export * from "./effects/pop";
export * from "./effects/hero";
export * from "./effects/press";
export * from "./effects/Orbs";

// Brand motif + sound
export * from "./dots";
export * from "./Sfx";
