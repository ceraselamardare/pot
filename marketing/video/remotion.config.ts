import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(95);
Config.setOverwriteOutput(true);
Config.setConcurrency(8);
// ANGLE GL: ~10× faster headless renders for our 3D/blur-heavy frames (measured by the motion kit: 62 fps vs 5.9 fps).
Config.setChromiumOpenGlRenderer("angle");
