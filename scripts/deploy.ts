// Preview deploy runbook in code (plan/accounts-and-deploy.md §3.2-3.7, adapted to the preview root of
// notes/deploy.md). Testnet only. Every step reads the chain first and is skipped when already done, so
// re-running is safe. Custody keys (root, hub, token, reserve) stay in the near-cli-rs legacy keychain.
//   scripts/run deploy status          § 3.7 smoke checks + balances (read-only; exit 1 on a failed check)
//   scripts/run deploy accounts        create + fund pots./usdc./users./treasury./reserve. under the root
//   scripts/run deploy token           deploy test-usdc (supply → reserve), register treasury + hub, $1M → treasury
//   scripts/run deploy lock-token      delete every key of usdc.<root> (S-4), then verify the empty key list
//   scripts/run deploy hub             deploy + init pot-hub (float 0.05, relayers = [users.<root>], reserve 0.5)
//   scripts/run deploy redeploy-hub    layout-compatible code update (without-init-call), then status. Hub 1.1.0 →
//                                      1.2.0 (gifts) is this one: its state is a new side prefix, no migrate
//                                      (notes/contracts-gifts.md). Refuses on a 1.0.0 hub (that needs upgrade-hub).
//   scripts/run deploy upgrade-hub     hub 1.0.0 → 1.1.0 (wave 4): DeployContract + `migrate` in ONE tx
//                                      (notes/contracts-wave4.md); refuses unless the chain runs 1.0.0
//   scripts/run deploy fund <account> <NEAR>   top up from the root (e.g. the hub or the relayer)
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { account, accessKeys, base58, DAO_CODE_HASH, IDS, NEAR, near, usd, view } from "./lib/env.ts"
import { cliCall, cliCreateAccount, cliDeleteKeys, cliDeploy, nearCli } from "./lib/near-cli.ts"

const WASM = {
  hub: new URL("../contracts/target/near/pot_hub/pot_hub.wasm", import.meta.url).pathname,
  usdc: new URL("../contracts/target/near/test_usdc/test_usdc.wasm", import.meta.url).pathname,
}
const FUNDING: [string, string][] = [
  [IDS.hub, "7 NEAR"],
  [IDS.usdc, "2 NEAR"],
  [IDS.relayer, "2.5 NEAR"],
  [IDS.treasury, "0.3 NEAR"],
  [IDS.reserve, "0.1 NEAR"],
]
const FLOAT = (5n * NEAR) / 100n
const TREASURY_FLOAT = 1_000_000_000_000n // $1,000,000 test

const fail = (m: string): never => {
  throw new Error(m)
}
const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex")

async function accounts() {
  if (!(await account(IDS.root))) fail(`${IDS.root} does not exist: create it first (faucet or the testnet registrar)`)
  for (const [id, amount] of FUNDING) {
    if (await account(id)) console.log(`✓ ${id} exists`)
    else if (!cliCreateAccount(id, amount, IDS.root).ok) fail(`create ${id}`)
  }
}

const register = (id: string) =>
  cliCall(IDS.usdc, "storage_deposit", { account_id: id, registration_only: true }, IDS.root, 30, "0.00125 NEAR")

async function token() {
  const a = await account(IDS.usdc)
  if (!a) fail(`${IDS.usdc} missing: run accounts`)
  if (a!.code_hash === "11111111111111111111111111111111") {
    const meta = { spec: "ft-1.0.0", name: "USDC (test)", symbol: "USDC", decimals: 6, icon: null, reference: null, reference_hash: null }
    if (!cliDeploy(IDS.usdc, WASM.usdc, { method: "new", args: { owner_id: IDS.reserve, total_supply: "1000000000000000", metadata: meta } }).ok) fail("token deploy")
  } else console.log(`✓ ${IDS.usdc} has code`)
  for (const id of [IDS.treasury, IDS.hub]) {
    if (await view(IDS.usdc, "storage_balance_of", { account_id: id })) console.log(`✓ ${id} registered`)
    else if (!register(id).ok) fail(`register ${id}`)
  }
  if (BigInt(await view<string>(IDS.usdc, "ft_balance_of", { account_id: IDS.treasury })) === 0n)
    cliCall(IDS.usdc, "ft_transfer", { receiver_id: IDS.treasury, amount: TREASURY_FLOAT.toString(), memo: "hot treasury float" }, IDS.reserve, 30, "1 yoctoNEAR")
}

async function lockToken() {
  const keys = (await accessKeys(IDS.usdc)).map((k) => k.public_key)
  if (keys.length && !cliDeleteKeys(IDS.usdc, keys).ok) fail("delete-keys")
  const after = await accessKeys(IDS.usdc)
  console.log(`${IDS.usdc} keys: ${after.length === 0 ? "none (locked)" : after.map((k) => k.public_key).join(", ")}`)
  if (after.length) process.exitCode = 1
}

function hubInit() {
  return {
    owner: IDS.root,
    usdc: IDS.usdc,
    dao_code_hash: DAO_CODE_HASH,
    dao_float: FLOAT.toString(),
    min_dao_float: FLOAT.toString(),
    relayers: [IDS.relayer],
    limits: {
      max_members: 40,
      max_pots_per_creator_per_day: 3,
      max_sponsored_pots_per_day: 50,
      max_pots_per_account: 100,
      max_active_invites: 20,
      max_invites_total: 100,
      max_pending_per_member: 10,
      max_requests_per_pot: 1000,
      min_hub_reserve: ((5n * NEAR) / 10n).toString(), // 0.5 NEAR, the coded minimum (preview budget)
    },
  }
}

/**
 * Wave 4: the 1.1.0 state layout appends three maps, so the new code must run `migrate` in the same
 * transaction as the deploy (near-cli-rs `with-init-call` = one tx with DeployContract + FunctionCall).
 * A deploy without it would leave every hub call failing on state deserialization.
 */
async function upgradeHub() {
  const before = await view<{ version: string }>(IDS.hub, "get_config")
  if (before.version !== "1.0.0") fail(`${IDS.hub} runs ${before.version}, not 1.0.0: nothing to migrate (use redeploy-hub for a 1.1.x code update)`)
  if (!cliDeploy(IDS.hub, WASM.hub, { method: "migrate", args: {} }).ok) fail("hub upgrade (deploy + migrate)")
  const after = await view<{ version: string }>(IDS.hub, "get_config")
  console.log(`${IDS.hub} version ${before.version} → ${after.version}`)
  if (after.version !== "1.1.0") process.exitCode = 1
  await status()
}

async function hub(redeploy: boolean) {
  const a = await account(IDS.hub)
  if (!a) fail(`${IDS.hub} missing: run accounts`)
  if (redeploy) {
    // a plain deploy is only layout-compatible from 1.1.x on: 1.0.0 state needs `migrate` (upgrade-hub)
    const before = await view<{ version: string }>(IDS.hub, "get_config")
    if (before.version === "1.0.0") fail(`${IDS.hub} runs 1.0.0: use upgrade-hub (deploy + migrate), not redeploy-hub`)
    if (!cliDeploy(IDS.hub, WASM.hub, null).ok) fail("hub redeploy")
    const after = await view<{ version: string }>(IDS.hub, "get_config")
    console.log(`${IDS.hub} version ${before.version} → ${after.version}`)
  } else if (a!.code_hash === "11111111111111111111111111111111") {
    if (!cliDeploy(IDS.hub, WASM.hub, { method: "new", args: hubInit() }).ok) fail("hub deploy")
  } else console.log(`✓ ${IDS.hub} has code (use redeploy-hub for a code update)`)
  await status()
}

async function status() {
  let bad = 0
  const check = (ok: boolean, what: string) => {
    console.log(`${ok ? "✓" : "✗"} ${what}`)
    if (!ok) bad++
  }
  const cfg = await view<Record<string, unknown> & { limits: Record<string, unknown> }>(IDS.hub, "get_config")
  check(cfg.owner === IDS.root && cfg.usdc === IDS.usdc && cfg.dao_code_hash === DAO_CODE_HASH, `get_config owner/usdc/dao_code_hash = ${cfg.owner}/${cfg.usdc}/${cfg.dao_code_hash}`)
  check(JSON.stringify(cfg.relayers) === JSON.stringify([IDS.relayer]) && cfg.paused === false, `relayers ${JSON.stringify(cfg.relayers)}, paused ${cfg.paused}, version ${cfg.version}`)
  check(cfg.dao_float === FLOAT.toString() && cfg.min_dao_float === FLOAT.toString(), `dao_float = min_dao_float = ${near(String(cfg.dao_float))} NEAR`)
  console.log(`  pot_count ${cfg.pot_count}, sponsored_today ${cfg.sponsored_today}, free_balance ${near(String(cfg.free_balance))} NEAR`)
  const meta = await view<{ name: string; decimals: number }>(IDS.usdc, "ft_metadata")
  check(meta.name === "USDC (test)" && meta.decimals === 6, `ft_metadata ${meta.name}, ${meta.decimals} decimals`)
  check((await view<string>(IDS.usdc, "ft_total_supply")) === "1000000000000000", "ft_total_supply 1000000000000000")
  check(!!(await view(IDS.usdc, "storage_balance_of", { account_id: IDS.hub })), "hub registered on the token")
  for (const id of [IDS.reserve, IDS.treasury, IDS.hub]) console.log(`  ${id}: ${usd(await view<string>(IDS.usdc, "ft_balance_of", { account_id: id }))}`)
  check((await view(IDS.hub, "get_pot", { pot: `nope.${IDS.hub}` })) === null, "get_pot(nope) = null")
  for (const [id, wasm] of [[IDS.hub, WASM.hub], [IDS.usdc, WASM.usdc]] as const) {
    const local = sha(wasm)
    const onChain = (await account(id))?.code_hash
    check(onChain === base58(Buffer.from(local, "hex")), `${id} code sha256 ${local.slice(0, 12)}… = local ${wasm.split("/").pop()}`)
  }
  check((await accessKeys(IDS.usdc)).length === 0, `${IDS.usdc} has no keys (locked)`)
  const relayerKeys = await accessKeys(IDS.relayer)
  check(relayerKeys.length >= 4, `${IDS.relayer} has ${relayerKeys.length} full-access keys (recovery + pool)`)
  for (const id of [IDS.root, IDS.hub, IDS.usdc, IDS.relayer, IDS.treasury, IDS.reserve]) {
    const a = await account(id)
    console.log(`  ${id.padEnd(26)} ${a ? `${near(a.amount)} NEAR, storage ${a.storage_usage} B` : "missing"}`)
  }
  if (bad) process.exitCode = 1
}

const [mode, x, y] = process.argv.slice(2)
switch (mode) {
  case "status":
    await status()
    break
  case "accounts":
    await accounts()
    break
  case "token":
    await token()
    break
  case "lock-token":
    await lockToken()
    break
  case "hub":
    await hub(false)
    break
  case "redeploy-hub":
    await hub(true)
    break
  case "upgrade-hub":
    await upgradeHub()
    break
  case "fund":
    if (!x || !y) fail("fund <account> <NEAR>")
    nearCli(["tokens", IDS.root, "send-near", x!, `${y} NEAR`, "network-config", "testnet", "sign-with-legacy-keychain", "send"])
    break
  default:
    console.log("usage: scripts/run deploy status | accounts | token | lock-token | hub | redeploy-hub | upgrade-hub | fund <account> <NEAR>")
    process.exit(1)
}
