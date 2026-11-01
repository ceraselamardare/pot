#!/bin/bash
# Spike 1 step 1: faucet parent + sub-accounts (run once). Keys -> ~/.near-credentials/testnet (legacy keychain)
source "$(dirname "$0")/env.sh"
# parent (faucet, 10 NEAR):
# near account create-account sponsor-by-faucet-service $PARENT autogenerate-new-keypair save-to-legacy-keychain network-config testnet create
for pair in "$MAYA:0.2" "$LEO:0.2" "$PRIYA:0.15" "$RULEBOT:0.4" "$RECV:0.1" "$NEWBIE:0.1"; do
  acc=${pair%%:*}; amt=${pair##*:}
  near account create-account fund-myself "$acc" "$amt NEAR" autogenerate-new-keypair save-to-legacy-keychain \
    sign-as $PARENT network-config testnet sign-with-legacy-keychain send
done
