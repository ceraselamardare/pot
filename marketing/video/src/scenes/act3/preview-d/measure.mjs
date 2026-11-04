// Builder D: print the screen-relative rects used by s09/s10 (see Measure.tsx). Run from marketing/video:
//   node src/scenes/act3/preview-d/measure.mjs
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import path from "node:path";
const entry = path.resolve("src/scenes/act3/preview-d/index.ts");
const serveUrl = await bundle({ entryPoint: entry });
const PORT = Number(process.env.PORT ?? 3473); // builder D's own port (3000 is the app's dev server; 3417 = the CLI)
const composition = await selectComposition({ serveUrl, id: "DMeasure", port: PORT });
await renderStill({
  composition,
  serveUrl,
  output: path.resolve("out/stills/s09-instant/measure.png"),
  frame: 0,
  scale: 0.25,
  port: PORT,
  onBrowserLog: (log) => {
    const t = log.text ?? "";
    if (t.includes("DMEASURE")) console.log(t);
  },
});
