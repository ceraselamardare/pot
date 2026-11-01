// Testnet setup for the backend's live relay test (never mainnet). Run from apps/web with Node 22:
//   node server/scripts/testnet-setup.ts keys        → writes .keys/testnet.env (gitignored), prints PUBLIC keys only
//   node server/scripts/testnet-setup.ts post-create → adds the extra relayer keys, wraps a little NEAR for the treasury
// Account creation itself is done with near-cli-rs (fund-myself from the holding account), see notes/backend.md.
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { Account, actions, JsonRpcProvider, KeyPair, KeyPairSigner, PublicKey, type KeyPairString } from "near-api-js"

const FILE = new URL("../../.keys/testnet.env", import.meta.url)
const RPC = "https://rpc.testnet.fastnear.com"
const RELAYER = process.env.RELAYER_ACCOUNT_ID ?? "relay-dev.pot-funds-65k8.testnet"
const TREASURY = process.env.TREASURY_ACCOUNT_ID ?? "treasury-dev.pot-funds-65k8.testnet"
const TOKEN = "wrap.testnet"
const TGAS = 1_000_000_000_000n

function readEnv(): Record<string, string> {
  if (!existsSync(FILE)) return {}
  return Object.fromEntries(
    readFileSync(FILE, "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  )
}

const mode = process.argv[2]
if (mode === "keys") {
  const env = readEnv()
  if (!env.RELAYER_KEYS) {
    const relayer = Array.from({ length: 3 }, () => KeyPair.fromRandom("ed25519").toString())
    const treasury = [KeyPair.fromRandom("ed25519").toString()]
    writeFileSync(
      FILE,
      [
        "# testnet-only throwaway keys for the backend live test (gitignored; never commit, never print)",
        `RELAYER_ACCOUNT_ID=${RELAYER}`,
        `TREASURY_ACCOUNT_ID=${TREASURY}`,
        `RELAYER_KEYS=${relayer.join(",")}`,
        `TREASURY_KEYS=${treasury.join(",")}`,
        "",
      ].join("\n"),
      { mode: 0o600 },
    )
  }
  const e = readEnv()
  const pub = (sk: string) => KeyPair.fromString(sk as KeyPairString).getPublicKey().toString()
  console.log("relayer public keys:", e.RELAYER_KEYS!.split(",").map(pub).join(" "))
  console.log("treasury public key:", e.TREASURY_KEYS!.split(",").map(pub).join(" "))
} else if (mode === "post-create") {
  const e = readEnv()
  const provider = new JsonRpcProvider({ url: RPC })
  const rk = e.RELAYER_KEYS!.split(",") as KeyPairString[]
  const relayer = new Account(RELAYER, provider, KeyPairSigner.fromSecretKey(rk[0]!))
  const have = new Set((await provider.viewAccessKeyList({ accountId: RELAYER })).keys.map((k) => k.public_key))
  const missing = rk.slice(1).map((sk) => KeyPair.fromString(sk).getPublicKey().toString()).filter((pk) => !have.has(pk))
  if (missing.length) {
    const r = await relayer.signAndSendTransaction({
      receiverId: RELAYER,
      actions: missing.map((pk) => actions.addFullAccessKey(PublicKey.from(pk))),
      waitUntil: "EXECUTED_OPTIMISTIC",
    })
    console.log("relayer add keys tx:", r.transaction_outcome.id)
  } else console.log("relayer keys already present")
  const tk = e.TREASURY_KEYS!.split(",")[0] as KeyPairString
  const treasury = new Account(TREASURY, provider, KeyPairSigner.fromSecretKey(tk))
  const bal = await provider.callFunction({ contractId: TOKEN, method: "ft_balance_of", args: { account_id: TREASURY } }).catch(() => "0")
  if (BigInt(String(bal ?? "0")) === 0n) {
    const r = await treasury.signAndSendTransaction({
      receiverId: TOKEN,
      actions: [
        actions.functionCall("storage_deposit", { account_id: TREASURY, registration_only: true }, 30n * TGAS, 1_250_000_000_000_000_000_000n),
        actions.functionCall("near_deposit", {}, 30n * TGAS, 50_000_000_000_000_000_000_000n),
      ],
      waitUntil: "EXECUTED_OPTIMISTIC",
    })
    console.log("treasury wrap tx:", r.transaction_outcome.id)
  } else console.log("treasury wNEAR balance:", String(bal))
} else {
  console.log("usage: node server/scripts/testnet-setup.ts keys | post-create")
  process.exit(1)
}
