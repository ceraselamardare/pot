#!/usr/bin/env bash
# Builds both contracts with cargo-near (D-12) and refreshes the checked-in ABI.
#   contracts/target/near/pot_hub/pot_hub.wasm     (+ embedded ABI)
#   contracts/target/near/test_usdc/test_usdc.wasm
#   contracts/abi/pot_hub.json                     (for packages/pot-sdk)
set -euo pipefail
cd "$(dirname "$0")/.."
CARGO_NEAR=${CARGO_NEAR:-"cargo near"}   # or: CARGO_NEAR="npx -y cargo-near@0.22.0 near"
# The hub is built with this machine's home folder remapped, so no local paths end up in the wasm and the hash doesn't
# depend on who builds it (check: strings target/near/pot_hub/pot_hub.wasm | grep /Users/ prints nothing). The test
# token keeps its original build: it is locked and can't be redeployed, so its source must keep building its code.
(cd pot-hub && $CARGO_NEAR build non-reproducible-wasm --env "RUSTFLAGS=--remap-path-prefix=$HOME=/home")
(cd test-usdc && $CARGO_NEAR build non-reproducible-wasm)
mkdir -p abi
cp target/near/pot_hub/pot_hub_abi.json abi/pot_hub.json
cp target/near/test_usdc/test_usdc_abi.json abi/test_usdc.json
shasum -a 256 target/near/pot_hub/pot_hub.wasm target/near/test_usdc/test_usdc.wasm
ls -l target/near/pot_hub/pot_hub.wasm target/near/test_usdc/test_usdc.wasm
