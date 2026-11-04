import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(95);
Config.setOverwriteOutput(true);
Config.setConcurrency(8);
// ANGLE GL: ~10× faster headless renders for our 3D/blur-heavy frames (measured by the motion kit: 62 fps vs 5.9 fps).
Config.setChromiumOpenGlRenderer("angle");
// The app's Next.js dev server often holds port 3000; pin Remotion's bundle server elsewhere so renders never hit it.
Config.setPort(3417);
