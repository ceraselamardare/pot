# test-usdc: upstream

`src/lib.rs` is vendored **byte-for-byte** from
`https://github.com/near-examples/FT` at commit `7721a49423466bcd1104369dcea50229e64282fd`
(branch `master`, 2025-10-29), file `src/lib.rs`
(sha256 `da2e1e605595f4baf7437be3eadb28697f4787b1b40eb12c78d4e8ed7881010f`).

Changes vs upstream (only `Cargo.toml`, per contracts-spec §1.1):
- package renamed `test-usdc`; `near-sdk` / `near-contract-standards` pinned to `=5.29.1` (D-12); edition 2018 kept;
- the upstream dev-dependencies (`near-workspaces 0.19`, `cargo-near-build`, `tokio`, `anyhow`) dropped: the sandbox tests live in `contracts/tests`.
- No source tweak was needed for near-sdk 5.29.1.

Metadata is passed to `new` at deploy time ("USDC (test)", symbol `USDC`, 6 decimals); the whole supply is minted
to `owner_id`, and there is no mint method (D-11).
