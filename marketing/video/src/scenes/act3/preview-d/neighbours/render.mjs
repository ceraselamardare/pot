// Builder D, dev only: render the neighbours' handoff frames (C s08 last, B s10b first). Run from marketing/video:
//   node src/scenes/act3/preview-d/neighbours/render.mjs
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../../../../", import.meta.url));
const serveUrl = await bundle({ entryPoint: path.join(root, "src/scenes/act3/preview-d/neighbours/index.tsx") });
const PORT = Number(process.env.PORT ?? 3473);
for (const [id, frame, out] of [["N-S08Join", 479, "out/stills/s09-instant/v2/neighbour-s08-last.png"], ["N-S10bMore", 0, "out/stills/s10-group/v2/neighbour-s10b-first.png"]]) {
  const composition = await selectComposition({ serveUrl, id, port: PORT });
  await renderStill({ composition, serveUrl, output: path.join(root, out), frame, scale: 1, chromiumOptions: { gl: "angle" }, port: PORT });
  console.log(out);
}
