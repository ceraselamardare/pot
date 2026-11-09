#!/usr/bin/env bash
# E-11 (test-plan §5.3): the judging guide's J-7 read-only commands (docs/judging-guide.md, linked from the README),
# run as written, with the values the guide promises.
# No keys, no signing, read-only RPC (near-cli-rs's default testnet config is FastNEAR's archival RPC).
#   scripts/readme-cli-check.sh                         # against the preview root potprev.testnet
#   ROOT=<root>.testnet scripts/readme-cli-check.sh     # another deployment
#   EXPECT_HUB_LOCKED=1 scripts/readme-cli-check.sh     # after the hub's key is deleted (D-13 lock)
# Every `near …` line of the guide's J-7 block must appear verbatim below (scripts/check-readme-steps.ts).
set -uo pipefail
near() { npx -y near-cli-rs@0.30.1 "$@"; }
ROOT=${ROOT:-potprev.testnet}; HUB=pots.$ROOT; POT=reference-trip-2gzw.$HUB
fail=0
strip() { sed 's/\x1b\[[0-9;]*m//g'; }
# list-keys with up to 3 tries: the free RPC rate-limits bursts, and then the CLI prints no key table at all
keys() { local out i; for i in 1 2 3; do out=$(near account list-keys "$1" network-config testnet now 2>&1 | strip); grep -qF "| Public Key" <<<"$out" && break; sleep 10; done; printf '%s' "$out"; }
expect() { # expect <label> <output> <substring>…
  local label=$1 out=$2; shift 2
  for s in "$@"; do
    if ! grep -qF -- "$s" <<<"$out"; then echo "FAIL $label: missing $s"; fail=1; return; fi
  done
  echo "ok   $label"
}
expect_absent() { # expect_absent <label> <output> <substring>
  if grep -qF -- "$3" <<<"$2"; then echo "FAIL $1: has $3"; fail=1; else echo "ok   $1"; fi
}
expect_no_keys() { # list-keys prints an empty table
  if ! grep -qF "| Public Key" <<<"$2"; then echo "FAIL $1: no key table (account missing or RPC error)"; fail=1
  elif grep -q "ed25519:" <<<"$2"; then echo "FAIL $1: has access keys"; fail=1
  else echo "ok   $1 (no access keys)"; fi
}

out=$(near contract call-function as-read-only $POT get_policy json-args '{}' network-config testnet now 2>&1 | strip)
expect "get_policy: member + rulebot, bond 0, quorum 1" "$out" '"name": "member"' '"name": "rulebot"' '"proposal_bond": "0"' '"quorum": "1"' "\"$HUB\"" '"*:VoteApprove"' '"*:VoteReject"'
expect_absent "get_policy v3: members can't file proposals" "$out" '"*:AddProposal"'
out=$(near contract call-function as-read-only $HUB get_pot json-args "{\"pot\":\"$POT\"}" network-config testnet now 2>&1 | strip)
expect "get_pot: Reference Trip, closed, 3 members, policy v3, \$599.99 in" "$out" '"name": "Reference Trip"' '"status": "closed"' '"member_count": 3' '"policy_version": 3' '"total_contributed": "599990400"'
out=$(near contract call-function as-read-only usdc.$ROOT ft_balance_of json-args "{\"account_id\":\"$POT\"}" network-config testnet now 2>&1 | strip)
expect "ft_balance_of(reference Pot) = 0 after the close" "$out" '"0"'
out=$(near account view-account-summary $POT network-config testnet now 2>&1 | strip)
expect "the Pot runs the global Sputnik code by hash, no keys" "$out" "c9a502ef08a06cef04e2fce82da60b1fbc78db3066ff41416110f4292fca39ce" "Account is locked"
out=$(near contract call-function as-read-only $POT get_factory_info json-args '{}' network-config testnet now 2>&1 | strip)
expect "get_factory_info: the hub is the factory" "$out" "\"factory_id\": \"$HUB\""
out=$(keys usdc.$ROOT) # near account list-keys usdc.$ROOT network-config testnet now
expect_no_keys "list-keys usdc (locked token)" "$out"
out=$(keys $POT) # near account list-keys $POT network-config testnet now
expect_no_keys "list-keys reference Pot" "$out"
out=$(keys $HUB) # near account list-keys $HUB network-config testnet now
if [ "${EXPECT_HUB_LOCKED:-0}" = "1" ]; then expect_no_keys "list-keys hub (locked)" "$out"
else echo "info list-keys hub: $(grep -c 'ed25519:' <<<"$out") key(s) (kept while Pot is on testnet, deleted before mainnet; set EXPECT_HUB_LOCKED=1 once it is)"; fi

out=$(near contract call-function as-read-only $HUB contract_source_metadata json-args '{}' network-config testnet now 2>&1 | strip)
expect "hub NEP-330: version 1.3.0, this repository" "$out" '"version": "1.3.0"' '"link": "https://github.com/ceraselamardare/pot"'
out=$(near account view-account-summary $HUB network-config testnet now 2>&1 | strip)
expect "hub code = contracts/scripts/build.sh's build" "$out" "fa7af2fb7f612acd8d114a791aa9c670cad5e3baeb756f78937aa8df71d5d984"

[ $fail -eq 0 ] && echo "README CLI twins: PASS" || echo "README CLI twins: FAIL"
exit $fail
