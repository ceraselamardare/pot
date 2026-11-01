#!/bin/bash
# Shared env + helpers for spike 1 (throwaway). Usage: `source env.sh`
export PARENT=potspike-dao-svuw.testnet          # faucet-sponsored account (10 NEAR)
export MAYA=maya.$PARENT LEO=leo.$PARENT PRIYA=priya.$PARENT
export RULEBOT=rulebot.$PARENT RECV=recv.$PARENT NEWBIE=newbie.$PARENT RECV2=recv2.$PARENT
export FACTORY=sputnikv2.testnet
export DAO_NAME=potspike-dao-svuw
export DAO=$DAO_NAME.$FACTORY
export WNEAR=wrap.testnet
# RPCs are rotated because fastnear/near.org rate-limit bursts (HTTP -429) when several agents share one IP
rpcurl() { case $(( $1 % 3 )) in 0) echo https://rpc.testnet.fastnear.com;; 1) echo https://test.rpc.fastnear.com;; *) echo https://rpc.testnet.near.org;; esac; }
near() { npx -y near-cli-rs@0.30.1 "$@"; }

# rpcpost '<json-rpc body>'  -> retries across RPCS until a non-rate-limited answer
rpcpost() {
  local body=$1 out i
  for i in 0 1 2 3 4 5 6 7 8; do
    out=$(curl -s -m 60 -X POST "$(rpcurl $i)" -H 'Content-Type: application/json' -d "$body")
    if [ -n "$out" ] && ! echo "$out" | grep -q -E '"code": *-429|[Rr]ate limit|DEPRECATED'; then echo "$out"; return 0; fi
    sleep $((2 + i))
  done
  echo "$out"
}
# view <account> <method> '<json>'
view() {
  local B64; B64=$(printf '%s' "${3:-{\}}" | base64 | tr -d '\n')
  rpcpost "{\"jsonrpc\":\"2.0\",\"id\":\"x\",\"method\":\"query\",\"params\":{\"request_type\":\"call_function\",\"finality\":\"final\",\"account_id\":\"$1\",\"method_name\":\"$2\",\"args_base64\":\"$B64\"}}" \
  | jq -r 'if .result.result then (.result.result|implode) else (.error // .result.error) end'
}
balance() {
  rpcpost "{\"jsonrpc\":\"2.0\",\"id\":\"x\",\"method\":\"query\",\"params\":{\"request_type\":\"view_account\",\"finality\":\"final\",\"account_id\":\"$1\"}}" \
  | jq -c '.result | {amount, storage_usage, code_hash}'
}

# tx <label> <signer> <receiver> <method> '<json>' '<deposit, e.g. 0 NEAR | 1 yoctoNEAR>' '<gas, e.g. 100 Tgas>'
#   Signs OFFLINE with near-cli-rs (legacy-keychain key file, explicit nonce + block hash, `display`; no near-cli RPC calls), sends the signed tx via
#   RPC send_tx(wait_until=FINAL), saves the full outcome to logs/<label>.json and prints a one-line summary.
tx() {
  local LABEL=$1 SIGNER=$2 RCV=$3 METHOD=$4 ARGS=$5 DEP=${6:-0 NEAR} GAS=${7:-100 Tgas} SIGNED PK AK NONCE BH OUT try
  PK=$(jq -r .public_key ~/.near-credentials/testnet/$SIGNER.json)
  for try in 1 2 3 4; do
    AK=$(rpcpost "{\"jsonrpc\":\"2.0\",\"id\":\"x\",\"method\":\"query\",\"params\":{\"request_type\":\"view_access_key\",\"finality\":\"optimistic\",\"account_id\":\"$SIGNER\",\"public_key\":\"$PK\"}}")
    NONCE=$(echo "$AK" | jq -r '.result.nonce + 1' 2>/dev/null); BH=$(echo "$AK" | jq -r '.result.block_hash' 2>/dev/null)
    if [ -z "$NONCE" ] || [ "$NONCE" = "null" ] || [ "$BH" = "null" ]; then sleep 3; continue; fi
    OUT=$(near contract call-function as-transaction "$RCV" "$METHOD" json-args "$ARGS" prepaid-gas "$GAS" attached-deposit "$DEP" \
      sign-as "$SIGNER" network-config testnet sign-with-access-key-file "$HOME/.near-credentials/testnet/$SIGNER.json" --nonce "$NONCE" --block-hash "$BH" display 2>&1 \
      | sed 's/\x1b\[[0-9;]*m//g')
    SIGNED=$(echo "$OUT" | grep -A1 'serialized as base64' | tail -1 | tr -d ' ')
    [ -n "$SIGNED" ] && break
    sleep 3
  done
  if [ -z "$SIGNED" ]; then echo "{\"error\":\"signing failed\",\"detail\":$(echo "$OUT" | tail -5 | jq -Rs .)}"; return 1; fi
  rpcpost "{\"jsonrpc\":\"2.0\",\"id\":\"x\",\"method\":\"send_tx\",\"params\":{\"signed_tx_base64\":\"$SIGNED\",\"wait_until\":\"FINAL\"}}" > "logs/$LABEL.json"
  summarize "logs/$LABEL.json"
}
# One-line summary of a FinalExecutionOutcome: explorer link, status, total gas, per-receipt gas/logs/status
summarize() {
  jq -c '
    if .error then {error: .error} else .result |
    { tx: ("https://testnet.nearblocks.io/txns/" + .transaction.hash),
      status: (.status | if .SuccessValue != null then ("OK " + (.SuccessValue | @base64d)) else ("FAIL " + (.Failure|tostring)) end),
      gas_burnt_total_Tgas: (((.transaction_outcome.outcome.gas_burnt + ([.receipts_outcome[].outcome.gas_burnt]|add)) / 1e12 * 1000 | round) / 1000),
      tokens_burnt_total_NEAR: ((([.transaction_outcome.outcome.tokens_burnt] + [.receipts_outcome[].outcome.tokens_burnt] | map(tonumber) | add) / 1e24 * 1e6 | round) / 1e6),
      receipts: [.receipts_outcome[] | {to: .outcome.executor_id, gasTg: ((.outcome.gas_burnt/1e12*1000|round)/1000), logs: .outcome.logs,
                  st: (.outcome.status | if .SuccessValue != null then ("OK " + (.SuccessValue|@base64d)) elif .SuccessReceiptId then "OK->receipt" else ("FAIL " + (.Failure|tostring)) end)}] }
    end' <(tr '\n\r\t' '   ' < "$1")   # RPC may embed raw newlines (Rust assert_eq! panics) inside JSON strings
}
# sendnear <label> <sender> <receiver> '<amount NEAR>'  (plain Transfer action, same offline-sign + send_tx flow)
sendnear() {
  local LABEL=$1 SIGNER=$2 RCV=$3 AMT=$4 SIGNED PK AK NONCE BH
  PK=$(jq -r .public_key ~/.near-credentials/testnet/$SIGNER.json)
  AK=$(rpcpost "{\"jsonrpc\":\"2.0\",\"id\":\"x\",\"method\":\"query\",\"params\":{\"request_type\":\"view_access_key\",\"finality\":\"optimistic\",\"account_id\":\"$SIGNER\",\"public_key\":\"$PK\"}}")
  NONCE=$(echo "$AK" | jq -r '.result.nonce + 1'); BH=$(echo "$AK" | jq -r .result.block_hash)
  SIGNED=$(near tokens "$SIGNER" send-near "$RCV" "$AMT" network-config testnet sign-with-access-key-file "$HOME/.near-credentials/testnet/$SIGNER.json" --nonce "$NONCE" --block-hash "$BH" display 2>&1 \
    | sed 's/\x1b\[[0-9;]*m//g' | grep -A1 'serialized as base64' | tail -1 | tr -d ' ')
  if [ -z "$SIGNED" ]; then echo '{"error":"signing failed"}'; return 1; fi
  rpcpost "{\"jsonrpc\":\"2.0\",\"id\":\"x\",\"method\":\"send_tx\",\"params\":{\"signed_tx_base64\":\"$SIGNED\",\"wait_until\":\"FINAL\"}}" > "logs/$LABEL.json"
  summarize "logs/$LABEL.json"
}
# addp <label> <signer> '<add_proposal json>' -> prints summary to stderr-ish log and echoes the new proposal id (or FAIL)
addp() {
  local S; S=$(tx "$1" "$2" $DAO add_proposal "$3" '0 NEAR' '50 Tgas')
  echo "$S" | jq -c '{tx,status,gas_burnt_total_Tgas,error}' >&2
  echo "$S" | jq -r '.status // "FAIL" | if startswith("OK ") then .[3:] else "FAIL" end'
}
# txcmd <label> <signer> <near-cli-rs args up to and including "network-config testnet">
#   generic offline-sign (access-key file + explicit nonce/block hash) + send_tx(FINAL); for deploys etc.
txcmd() {
  local LABEL=$1 SIGNER=$2; shift 2
  local PK AK NONCE BH OUT SIGNED try
  PK=$(jq -r .public_key ~/.near-credentials/testnet/$SIGNER.json)
  for try in 1 2 3 4; do
    AK=$(rpcpost "{\"jsonrpc\":\"2.0\",\"id\":\"x\",\"method\":\"query\",\"params\":{\"request_type\":\"view_access_key\",\"finality\":\"optimistic\",\"account_id\":\"$SIGNER\",\"public_key\":\"$PK\"}}")
    NONCE=$(echo "$AK" | jq -r '.result.nonce + 1' 2>/dev/null); BH=$(echo "$AK" | jq -r '.result.block_hash' 2>/dev/null)
    if [ -z "$NONCE" ] || [ "$NONCE" = "null" ] || [ "$BH" = "null" ]; then sleep 3; continue; fi
    OUT=$(near "$@" sign-with-access-key-file "$HOME/.near-credentials/testnet/$SIGNER.json" --nonce "$NONCE" --block-hash "$BH" display 2>&1 | sed 's/\x1b\[[0-9;]*m//g')
    SIGNED=$(echo "$OUT" | grep -A1 'serialized as base64' | tail -1 | tr -d ' ')
    [ -n "$SIGNED" ] && break
    sleep 3
  done
  if [ -z "$SIGNED" ]; then echo "{\"error\":\"signing failed\",\"detail\":$(echo "$OUT" | tail -5 | jq -Rs .)}"; return 1; fi
  rpcpost "{\"jsonrpc\":\"2.0\",\"id\":\"x\",\"method\":\"send_tx\",\"params\":{\"signed_tx_base64\":\"$SIGNED\",\"wait_until\":\"FINAL\"}}" > "logs/$LABEL.json"
  summarize "logs/$LABEL.json"
}
