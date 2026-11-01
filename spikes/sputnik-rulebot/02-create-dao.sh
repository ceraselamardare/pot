#!/bin/bash
# Spike 1 step 2: create the DAO via the testnet factory with a given deposit. Usage: ./02-create-dao.sh '5.40642 NEAR'
# As run on 2026-10-21: '0.01 NEAR', '0.1 NEAR', '1 NEAR' (ERR_NOT_ENOUGH_DEPOSIT), '5.39679 NEAR' (LackBalanceForState, refunded),
# '5.40642 NEAR' (OK). create-call.json = {"name": "$DAO_NAME", "args": base64(create-args.json)}; create-args.json = {config, policy.json}.
#   jq -c '{config: {name: "potspike-dao-svuw", purpose: "Pot Phase 0 spike 1 (throwaway test DAO)", metadata: ""}, policy: .}' policy.json > create-args.json
#   jq -nc --arg n "$DAO_NAME" --arg a "$(base64 < create-args.json | tr -d '\n')" '{name:$n, args:$a}' > create-call.json
source "$(dirname "$0")/env.sh"
AMT=${1:-5.40642 NEAR}
tx "02-create-${AMT% NEAR}" $PARENT $FACTORY create "$(cat create-call.json)" "$AMT" '300 Tgas'
