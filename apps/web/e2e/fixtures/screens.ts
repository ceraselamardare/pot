// Review screenshots. The PNGs in notes/screens/ are tracked in git, so specs write there only when SAVE_SCREENS=1;
// otherwise into the gitignored test-results/screens/, and running the suite leaves the working tree clean.
import { mkdirSync } from "node:fs"
import { fileURLToPath } from "node:url"

export function screensDir(): string {
  const dir =
    process.env.SAVE_SCREENS === "1"
      ? fileURLToPath(new URL("../../../../notes/screens/", import.meta.url))
      : fileURLToPath(new URL("../../test-results/screens/", import.meta.url))
  mkdirSync(dir, { recursive: true })
  return dir
}
