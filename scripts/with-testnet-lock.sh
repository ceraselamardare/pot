#!/usr/bin/env bash
# Serialize every testnet-touching run (live tests, testnet Playwright, seeding):
# they share one IP (FastNEAR 429s), the relayer key pool and the hub's sponsorship balance.
# Usage: scripts/with-testnet-lock.sh <command...>
set -euo pipefail
LOCK="${TMPDIR:-/tmp}/pot-testnet.lock"
waited=0
until mkdir "$LOCK" 2>/dev/null; do
  owner=$(cat "$LOCK/owner" 2>/dev/null || echo "?")
  # Stale-lock recovery: remove the lock if its owning process is gone.
  if [ -f "$LOCK/pid" ] && ! kill -0 "$(cat "$LOCK/pid")" 2>/dev/null; then rm -rf "$LOCK"; continue; fi
  if [ $((waited % 60)) -eq 0 ]; then echo "[testnet-lock] waiting for: $owner" >&2; fi
  sleep 5; waited=$((waited+5))
done
echo $$ > "$LOCK/pid"; echo "$* (since $(date -u +%H:%M:%SZ))" > "$LOCK/owner"
trap 'rm -rf "$LOCK"' EXIT
"$@"
