// CLI-1 / APP-5 (security audit 2026-11-04): the CSP has no 'unsafe-eval' (lib/security/csp.ts). Zod 4 probes for
// eval with `Function("")` the first time it parses an object (to JIT-compile its parsers); under our policy the probe
// fails (Zod falls back) but the browser still reports a violation. Jitless mode skips the probe and never compiles
// code from strings. Imported first thing by app/providers.tsx, before any schema parses in the browser.
import { config } from "zod/v4/core"

config({ jitless: true })
