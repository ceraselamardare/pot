# Phase 0 spikes (throwaway)

These experiments ran before the hackathon (Oct 2026) to de-risk Pot's architecture. Each one answers a specific question from the original plan (C3, Phase 0).

- **Never import or copy code from here into the product.** The hackathon gets a fresh repo on Nov 1, and everything is rewritten during the event.
- **Testnet only.** Keys are testnet keys. They live in `<spike>/.keys/` or `~/.near-credentials/testnet/` (the legacy keychain). They are gitignored and never pasted into docs.
- Each spike folder has a `RESULTS.md` covering the question, setup (accounts, contract ids), the exact commands or scripts, tx hashes as `https://testnet.nearblocks.io/txns/<hash>` links, measurements, and the conclusion.

| Folder | Question | Owner |
|---|---|---|
| `sputnik-rulebot/` | Spike 1: does a 1-of-1 `rulebot` role auto-execute transfers and joins, with bond 0? Does the member majority path work? | sputnik |
| `meta-tx/` | Spike 3 + onboarding: can a relayed NEP-366 delegate carry 1 yocto `ft_transfer(_call)`, and what does sponsored onboarding cost? | relayer |
| `oneclick/` | 1Click API: live read-only tests (tokens, dry quotes, JWT behaviour, status shapes) | intents |
| `near-auth/` | Spike 2: NEAR Auth testnet login + signing. **A manual checklist for a human** (needs a real Google/email login) | auth |
