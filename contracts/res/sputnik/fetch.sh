#!/usr/bin/env bash
# Vendors the exact deployed Sputnik DAO wasm (third-party code, read-only RPC downloads; no keys, no txs).
#   A  = testnet global contract Ea8tHXFSQVszVwGASyzAfLq65DjcRDhkfab4FcPaRpgD (sputnikdao2@278adc7)
#   B  = mainnet global contract DtHZA1mUmGYeScEaUoUZYQGGFHSMpnjMCvkr5U9hJXuF (v3.2, sputnikdao2@2b0f34a)
#   factory = mainnet sputnik-dao.near (tests only: its owner-only store() publishes A/B as global code in the sandbox)
# Usage: ./fetch.sh   (then it verifies SHA256SUMS)
set -euo pipefail
cd "$(dirname "$0")"
python3 - <<'PY'
import json, base64, urllib.request
def q(url, params):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "query", "params": params}).encode()
    req = urllib.request.Request(url, body, {"Content-Type": "application/json"})
    r = json.load(urllib.request.urlopen(req, timeout=60))
    if "result" not in r:
        raise SystemExit(f"RPC error from {url}: {r.get('error')}")
    return r["result"]
T, M = "https://test.rpc.fastnear.com", "https://free.rpc.fastnear.com"
def gcode(url, h):
    return base64.b64decode(q(url, {"request_type": "view_global_contract_code", "finality": "final", "code_hash": h})["code_base64"])
open("sputnikdao2_testnet_global_278adc7.wasm", "wb").write(gcode(T, "Ea8tHXFSQVszVwGASyzAfLq65DjcRDhkfab4FcPaRpgD"))
open("sputnikdao2_mainnet_v3_2.wasm", "wb").write(gcode(M, "DtHZA1mUmGYeScEaUoUZYQGGFHSMpnjMCvkr5U9hJXuF"))
open("sputnikdao_factory2_mainnet.wasm", "wb").write(base64.b64decode(
    q(M, {"request_type": "view_code", "finality": "final", "account_id": "sputnik-dao.near"})["code_base64"]))
PY
shasum -a 256 -c SHA256SUMS
