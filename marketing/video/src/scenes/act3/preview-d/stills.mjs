// Builder D: render many stills of one composition with a single bundle. Run from marketing/video:
//   node src/scenes/act3/preview-d/stills.mjs S09Instant out/stills/s09-instant 0.5 0,120,352 [prefix]
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import path from "node:path";
import fs from "node:fs";

const [id, outDir, scaleArg = "0.5", framesArg = "0", prefix = "f"] = process.argv.slice(2);
const frames = framesArg.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
fs.mkdirSync(outDir, { recursive: true });
const serveUrl = await bundle({ entryPoint: path.resolve("src/scenes/act3/preview-d/index.ts") });
const composition = await selectComposition({ serveUrl, id });
for (const frame of frames) {
  const output = path.resolve(outDir, `${prefix}${String(frame).padStart(3, "0")}.png`);
  await renderStill({ composition, serveUrl, output, frame, scale: Number(scaleArg), chromiumOptions: { gl: "angle" } });
  console.log(output);
}
