#!/usr/bin/env bash
# Every keyless check in one command, for judges and reviewers (docs/judging-guide.md J-8, J-7 and J-10).
# It uses its own Postgres (container potjudge-postgres, volume potjudge-pgdata, a free port) and removes it at the
# end, so it never touches another checkout's database. Nothing is signed or sent; no keys are needed.
#   scripts/judge-check.sh           install, typecheck, lint, unit + DB tests, README drift, J-7 reads, J-10 proofs,
#                                    then the contract tests (a cold run compiles everything: about a quarter of an hour)
#   scripts/judge-check.sh --quick   the same without the contract tests
#   scripts/judge-check.sh --e2e     also the mocked UI end to end suite (Playwright Chromium; several minutes)
# Needs Node and pnpm (versions in package.json), Docker, and for the contract tests Rust via rustup
# (contracts/rust-toolchain.toml pins it) on arm64 macOS or Linux. Logs go to .judge-check/ (gitignored).
set -o pipefail # no -u: macOS bash 3.2 treats an empty array as unbound
cd "$(dirname "$0")/.."

QUICK=0 E2E=0
for a in "$@"; do
  case "$a" in
    --quick) QUICK=1 ;;
    --e2e) E2E=1 ;;
    *) echo "unknown option $a (see the header of $0)"; exit 2 ;;
  esac
done

LOGS=.judge-check
mkdir -p "$LOGS"
free_port() { # first port from $1 up that nothing listens on
  local p=$1
  while (exec 3<>"/dev/tcp/127.0.0.1/$p") 2>/dev/null; do p=$((p + 1)); done
  echo "$p"
}
export POT_DB_NAME=potjudge
export POT_DB_PORT
POT_DB_PORT=$(free_port 54349)
DB="postgres://pot:pot@localhost:$POT_DB_PORT"
export DATABASE_URL_TEST="$DB/pot_test" DATABASE_URL="$DB/pot" DATABASE_URL_UNPOOLED="$DB/pot"

cleanup() { docker compose -f infra/docker-compose.yml down -v >/dev/null 2>&1 || true; }
trap cleanup EXIT

RESULTS=()
FAILED=0
step() { # step <name> <command…>: runs it, logs to .judge-check/<n>.log, records ok/FAIL and the time
  local name=$1; shift
  local log
  log="$LOGS/$(( ${#RESULTS[@]} + 1 ))-$(tr ' /' '--' <<<"$name").log"
  local t0=$SECONDS
  printf '▶ %s … ' "$name"
  if "$@" >"$log" 2>&1; then
    RESULTS+=("ok    $name ($((SECONDS - t0)) s)")
    echo "ok ($((SECONDS - t0)) s)"
  else
    RESULTS+=("FAIL  $name ($((SECONDS - t0)) s) → $log")
    FAILED=$((FAILED + 1))
    echo "FAIL ($((SECONDS - t0)) s), see $log"
    tail -n 15 "$log" | sed 's/^/    /'
  fi
}

echo "Pot judge check · database potjudge on port $POT_DB_PORT · logs in $LOGS/"
step "install" pnpm install --frozen-lockfile
step "database (own container and volume)" pnpm db:up
step "typecheck" pnpm typecheck
step "lint (incl. the jargon lint)" pnpm lint
step "unit + DB tests" pnpm test
step "README drift check" node scripts/check-readme-steps.ts
step "J-7 contract reads (near-cli-rs, read-only)" scripts/readme-cli-check.sh
# J-7 and J-10 share FastNEAR's free tier: a pause between them, and one more try if the RPC rate-limited (exit 2)
proofs() {
  sleep 10
  node scripts/verify-proofs.mjs
  local code=$?
  if [ "$code" = 2 ]; then echo "rate limited: trying again in 60 s"; sleep 60; node scripts/verify-proofs.mjs; code=$?; fi
  return "$code"
}
step "J-10 live proofs (read-only)" proofs
if [ "$E2E" = 1 ]; then
  E2E_PORT=$(free_port 3100)
  step "Playwright Chromium" pnpm --filter web exec playwright install chromium
  step "mocked UI end to end (port $E2E_PORT)" env E2E_PORT="$E2E_PORT" NEXT_PUBLIC_DATA_SOURCE=mock pnpm --filter web exec playwright test
fi
if [ "$QUICK" = 0 ]; then
  if command -v cargo >/dev/null; then
    step "contract tests (cargo test; downloads the NEAR sandbox)" bash -c "cd contracts && cargo test"
  else
    RESULTS+=("skip  contract tests: no cargo (install Rust with rustup)")
  fi
fi

echo
echo "Summary"
printf '  %s\n' "${RESULTS[@]}"
if [ "$FAILED" = 0 ]; then echo "All checks passed."; else echo "$FAILED check(s) failed."; fi
exit "$FAILED"
