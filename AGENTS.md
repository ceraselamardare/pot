# Pot: notes for coding agents

## Reviewing or judging Pot

Pot is a phone web app for money a group shares: each Pot is a Sputnik DAO on NEAR testnet, and our Pot Hub contract
approves only what the Pot's rules allow.

1. Read [README.md](README.md), then [docs/judging-guide.md](docs/judging-guide.md): steps J-1 to J-10, each with exact
   expected values.
2. `node scripts/verify-proofs.mjs` reads a real testnet transaction for every core action (create, join, add money,
   instant spend, one OK, group vote, close and refunds, gift, pay link, receipt fingerprint, cross-chain delivery) and
   checks its receipts and events. Read-only, no keys, no install; the list is [docs/proofs.json](docs/proofs.json).
3. `scripts/judge-check.sh` runs every keyless check: install, typecheck, lint, unit and DB tests, the README drift
   check, the read-only contract reads (J-7), the live proofs and the contract tests. It uses its own Postgres
   container, volume and port and removes them at the end. `--quick` skips the contract tests (a cold run takes about
   a quarter of an hour); `--e2e` adds the mocked UI suite.
4. Code map: [docs/architecture.md](docs/architecture.md). NEAR features with the code behind each:
   [docs/near-features.md](docs/near-features.md). Known limits: [docs/limitations.md](docs/limitations.md) and
   [SECURITY.md](SECURITY.md).

Everything above is read-only. The testnet suites that sign transactions need preview keys that are not in this
repository, so skip them. `plan/`, `kb/` and `notes/` are the builder's design and research notes;
[CLAUDE.md](CLAUDE.md) is the builder's working guide.

## Working on Pot

Follow [CLAUDE.md](CLAUDE.md): the hard rules, the pinned versions and the area notes apply to every coding agent.
