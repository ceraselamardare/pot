// near-cli-rs 0.30.1 wrapper for the steps signed by the custody keys (root, hub, token, reserve, the
// recovery keys of the relayer and treasury). Those keys stay in the near-cli-rs legacy keychain
// (~/.near-credentials/testnet); scripts never read them. Always non-interactive, never the macOS keychain.
// Arguments are passed as an argv array (no shell), so nothing is word-split or silently dropped.
import { spawnSync } from "node:child_process"

const CLI = ["-y", "near-cli-rs@0.30.1"]

export interface CliResult {
  ok: boolean
  txHash: string | null
  out: string
}

export function nearCli(args: string[], opts: { quiet?: boolean } = {}): CliResult {
  const r = spawnSync("npx", [...CLI, ...args], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`
  const m = out.match(/Transaction ID: ([1-9A-HJ-NP-Za-km-z]{43,44})/)
  const ok = r.status === 0 && !/\bError\b|panicked/.test(out)
  if (!opts.quiet) console.log(`  near ${args.slice(0, 4).join(" ")} … → ${ok ? "ok" : "FAILED"}${m ? ` tx ${m[1]}` : ""}`)
  if (!ok && !opts.quiet) console.log(out.split("\n").filter((l) => /Error|panicked|error/.test(l)).slice(0, 6).join("\n"))
  return { ok, txHash: m?.[1] ?? null, out }
}

const SIGN = ["network-config", "testnet", "sign-with-legacy-keychain", "send"]

/** A function call signed by `signer` (legacy keychain). */
export function cliCall(contract: string, method: string, args: unknown, signer: string, gasTgas: number, deposit: string): CliResult {
  return nearCli([
    "contract", "call-function", "as-transaction", contract, method, "json-args", JSON.stringify(args),
    "prepaid-gas", `${gasTgas}.0 Tgas`, "attached-deposit", deposit, "sign-as", signer, ...SIGN,
  ])
}

/** A sub-account funded by its parent, with a fresh key saved to the legacy keychain. */
export function cliCreateAccount(id: string, amount: string, parent: string): CliResult {
  return nearCli(["account", "create-account", "fund-myself", id, amount, "autogenerate-new-keypair", "save-to-legacy-keychain", "sign-as", parent, ...SIGN])
}

/** AddKey(FullAccess) on `account`, signed by its own legacy-keychain key. */
export function cliAddFullAccessKey(account: string, publicKey: string): CliResult {
  return nearCli(["account", "add-key", account, "grant-full-access", "use-manually-provided-public-key", publicKey, ...SIGN])
}

export function cliDeleteKeys(account: string, publicKeys: string[]): CliResult {
  return nearCli(["account", "delete-keys", account, "public-keys", publicKeys.join(","), ...SIGN])
}

export function cliDeploy(account: string, wasm: string, init: { method: string; args: unknown } | null): CliResult {
  const tail = init
    ? ["with-init-call", init.method, "json-args", JSON.stringify(init.args), "prepaid-gas", "100.0 Tgas", "attached-deposit", "0 NEAR"]
    : ["without-init-call"]
  return nearCli(["contract", "deploy", account, "use-file", wasm, ...tail, ...SIGN])
}
