// Prints the screen-relative rects of the UI kit's breakout cards (see src/ui/layout.ts). Run from marketing/video:
//   node src/ui/preview/measure.mjs            (PORT=3417 by default: port 3000 is often taken by the app's dev server)
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import path from "node:path";
const port = Number(process.env.PORT ?? 3417);
const entry = path.resolve("src/ui/preview/index.ts");
const serveUrl = await bundle({ entryPoint: entry });
const composition = await selectComposition({ serveUrl, id: "UiMeasure", port });
await renderStill({
  composition,
  serveUrl,
  port,
  output: path.resolve("out/stills/ui/measure.png"),
  frame: 0,
  scale: 0.25,
  onBrowserLog: (log) => {
    const t = log.text ?? "";
    if (t.includes("UIMEASURE")) console.log(t);
  },
});
