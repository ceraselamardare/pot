// Builder D, dev only: render the neighbours' handoff frames (C s08 last, E s11 first). Run from marketing/video:
//   node src/scenes/act3/preview-d/neighbours/render.mjs
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../../../../", import.meta.url));
const serveUrl = await bundle({ entryPoint: path.join(root, "src/scenes/act3/preview-d/neighbours/index.tsx") });
for (const [id, frame, out] of [["N-S08Join", 509, "out/stills/s09-instant/dev/neighbour-s08-last.png"], ["N-S11Close", 0, "out/stills/s10-group/dev/neighbour-s11-first.png"]]) {
  const composition = await selectComposition({ serveUrl, id });
  await renderStill({ composition, serveUrl, output: path.join(root, out), frame, scale: 1, chromiumOptions: { gl: "angle" } });
  console.log(out);
}
