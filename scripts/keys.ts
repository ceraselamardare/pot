// Hot key pools for the preview environment (runbook §3.6). Testnet only.
//   scripts/run keys init      → writes apps/web/.keys/preview.env (gitignored, 0600) if missing; prints PUBLIC keys only
//   scripts/run keys onchain   → adds the missing pool public keys to users.<root> / treasury.<root> (signed by
//                                each account's recovery key in the near-cli-rs legacy keychain), then verifies
//   scripts/run keys show      → public keys + what is on chain
//   scripts/run keys init-live → appends the LIVE-TEST pools (RELAYER_KEYS_LIVE ×4, TREASURY_KEYS_LIVE ×2) if missing;
//                                then `scripts/with-testnet-lock.sh scripts/run keys onchain` adds them on chain
// Pools: RELAYER_KEYS ×4 (users.<root>), TREASURY_KEYS ×2 (treasury.<root>), DEMO_PERSONA_KEY ×1 (personas),
// plus APP_HMAC_SECRET. Secret halves never leave the file.
// Wave 3 (frontend request 4): servers (next dev/start, scripts, Playwright) use RELAYER_KEYS / TREASURY_KEYS and
// coordinate through the dev DB's lease rows; the live tests (own pot_test schemas, so own lease rows) use ONLY
// the *_LIVE pools (server/live/harness.ts), split per test file. scripts/run env never copies *_LIVE into .env.local.
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { randomBytes } from "node:crypto"
import { KeyPair, type KeyPairString } from "near-api-js"
import { accessKeys, eventually, IDS, KEYS_FILE, parseEnvFile } from "./lib/env.ts"
import { cliAddFullAccessKey } from "./lib/near-cli.ts"

const pub = (sk: string) => KeyPair.fromString(sk as KeyPairString).getPublicKey().toString()
const fresh = () => KeyPair.fromRandom("ed25519").toString()

function read(): Record<string, string> {
  return existsSync(KEYS_FILE) ? parseEnvFile(readFileSync(KEYS_FILE, "utf8")) : {}
}

function init() {
  const e = read()
  if (e.RELAYER_KEYS) {
    console.log(`${KEYS_FILE.pathname} exists; not overwriting`)
    return
  }
  const lines = [
    "# PREVIEW testnet hot keys (gitignored; never commit, never print). Written by scripts/run keys init.",
    `RELAYER_ACCOUNT_ID=${IDS.relayer}`,
    `TREASURY_ACCOUNT_ID=${IDS.treasury}`,
    `RELAYER_KEYS=${Array.from({ length: 4 }, fresh).join(",")}`,
    `TREASURY_KEYS=${Array.from({ length: 2 }, fresh).join(",")}`,
    `DEMO_PERSONA_KEY=${fresh()}`,
    `APP_HMAC_SECRET=${randomBytes(36).toString("base64url")}`,
    "",
  ]
  writeFileSync(KEYS_FILE, lines.join("\n"), { mode: 0o600 })
  console.log(`wrote ${KEYS_FILE.pathname}`)
}

const list = (v: string | undefined) => (v ?? "").split(",").filter(Boolean).map(pub)
function pools(e: Record<string, string>) {
  return [
    { account: IDS.relayer, keys: [...list(e.RELAYER_KEYS), ...list(e.RELAYER_KEYS_LIVE)] },
    { account: IDS.treasury, keys: [...list(e.TREASURY_KEYS), ...list(e.TREASURY_KEYS_LIVE)] },
  ]
}

function initLive() {
  const e = read()
  if (!e.RELAYER_KEYS) throw new Error("run scripts/run keys init first")
  const add: string[] = []
  if (!e.RELAYER_KEYS_LIVE) add.push(`RELAYER_KEYS_LIVE=${Array.from({ length: 4 }, fresh).join(",")}`)
  if (!e.TREASURY_KEYS_LIVE) add.push(`TREASURY_KEYS_LIVE=${Array.from({ length: 2 }, fresh).join(",")}`)
  if (add.length === 0) {
    console.log("live pools exist; not overwriting")
    return
  }
  const text = readFileSync(KEYS_FILE, "utf8")
  writeFileSync(KEYS_FILE, `${text.replace(/\n*$/, "\n")}# live-test pools (server/live only; never in .env.local)\n${add.join("\n")}\n`, { mode: 0o600 })
  const after = read()
  console.log(`appended live pools: relayer ${list(after.RELAYER_KEYS_LIVE).join(" ")}; treasury ${list(after.TREASURY_KEYS_LIVE).join(" ")}`)
}

async function show() {
  const e = read()
  for (const p of pools(e)) {
    const have = new Set((await accessKeys(p.account)).map((k) => k.public_key))
    console.log(`${p.account}: ${p.keys.length} pool keys, ${p.keys.filter((k) => have.has(k)).length} on chain; ${have.size} keys on chain in total`)
    for (const k of p.keys) console.log(`  ${have.has(k) ? "✓" : "✗"} ${k}`)
  }
  if (e.DEMO_PERSONA_KEY) console.log(`DEMO_PERSONA_KEY public: ${pub(e.DEMO_PERSONA_KEY)}`)
}

async function onchain() {
  const e = read()
  for (const p of pools(e)) {
    const have = new Set((await accessKeys(p.account)).map((k) => k.public_key))
    for (const k of p.keys.filter((x) => !have.has(x))) {
      const r = cliAddFullAccessKey(p.account, k)
      if (!r.ok) throw new Error(`add-key ${p.account} failed`)
    }
    const after = await eventually(
      () => accessKeys(p.account),
      (ks) => p.keys.every((k) => ks.some((x) => x.public_key === k)),
    )
    console.log(`${p.account}: ${after.length} keys on chain (${p.keys.length} pool + recovery)`)
  }
}

const mode = process.argv[2]
if (mode === "init") init()
else if (mode === "init-live") initLive()
else if (mode === "onchain") await onchain()
else if (mode === "show") await show()
else {
  console.log("usage: scripts/run keys init | init-live | onchain | show")
  process.exit(1)
}
