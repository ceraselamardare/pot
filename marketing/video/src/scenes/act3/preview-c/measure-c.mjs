// Prints the rects logged by the CMeasure composition (the CLI doesn't forward browser logs; the renderer API does).
//   node src/scenes/act3/preview-c/measure-c.mjs      (PORT=3417 by default: the app's dev server holds 3000)
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import path from "node:path";
const port = Number(process.env.PORT ?? 3417);
const serveUrl = await bundle({ entryPoint: path.resolve("src/scenes/act3/preview-c/index.ts") });
const composition = await selectComposition({ serveUrl, id: "CMeasure", port });
await renderStill({
  composition,
  serveUrl,
  port,
  output: path.resolve("out/stills/s07-create/measure.png"),
  frame: 0,
  scale: 0.25,
  onBrowserLog: (log) => {
    const t = log.text ?? "";
    if (t.includes("CMEASURE")) console.log(t);
  },
});
