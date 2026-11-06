// Which network this deployment runs on, for the one place the site says so: the Testnet badge
// (components/brand/NetworkBadge.tsx) and its machine-readable twin, the status line in /llms.txt.
// NEXT_PUBLIC_NETWORK is inlined at build time, so a mainnet build drops the badge without any other change.

/** Does this build show the Testnet badge? Only on an explicit `testnet` build (an unset value shows nothing). */
export function isTestnetBuild(network: string | undefined = process.env.NEXT_PUBLIC_NETWORK): boolean {
  return network === "testnet"
}
