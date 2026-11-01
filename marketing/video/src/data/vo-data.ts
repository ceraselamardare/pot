// Registry of generated VO alignments (written by scripts/audio-tools.py finalize-vo; do not edit by hand).
// One static JSON import per clip so Remotion bundles them. Times are seconds relative to the final clip.
import type { VoClip } from "./vo";
import vo_s01_hook from "./vo/s01-hook.json";
import vo_s02_front from "./vo/s02-front.json";
import vo_s03_chase from "./vo/s03-chase.json";
import vo_s04_options from "./vo/s04-options.json";
import vo_s05_pivot from "./vo/s05-pivot.json";
import vo_s06_reveal from "./vo/s06-reveal.json";
import vo_s07_create from "./vo/s07-create.json";
import vo_s08_join from "./vo/s08-join.json";
import vo_s09_instant from "./vo/s09-instant.json";
import vo_s10_group from "./vo/s10-group.json";
import vo_s11_close from "./vo/s11-close.json";
import vo_s12_tech from "./vo/s12-tech.json";
import vo_s13_end from "./vo/s13-end.json";

export const VO_DATA: Partial<Record<string, VoClip>> = {
  "s01-hook": vo_s01_hook,
  "s02-front": vo_s02_front,
  "s03-chase": vo_s03_chase,
  "s04-options": vo_s04_options,
  "s05-pivot": vo_s05_pivot,
  "s06-reveal": vo_s06_reveal,
  "s07-create": vo_s07_create,
  "s08-join": vo_s08_join,
  "s09-instant": vo_s09_instant,
  "s10-group": vo_s10_group,
  "s11-close": vo_s11_close,
  "s12-tech": vo_s12_tech,
  "s13-end": vo_s13_end,
};
