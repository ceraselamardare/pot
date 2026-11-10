# Limitations

- **Testnet only.** Test dollars, test NEAR, contracts under `potprev.testnet`, the app at https://usepot.xyz. The hub,
  the token and every Pot have no access keys ([judging guide](judging-guide.md), J-7), so nobody can change their code
  or sign for them. The flip side: a bug in the hub can't be patched in place. A fix would be a new hub (`pots-v2`) for
  new Pots, while existing Pots keep the rules of this one. The hub's owner account (`potprev.testnet`) can still
  pause new activity (closing and refunds always work), tune limits within ranges fixed in the code, and choose whose
  costs the hub sponsors. It can't move money. See [SECURITY.md](../SECURITY.md).
- **NEAR Auth origin.** The shared testnet NEAR Auth client only accepts `http://localhost:3000`, so Google sign-in
  works only on a local run. A hosted build offers "Continue with a NEAR wallet" (NEAR Connect).
- **Trezu is mainnet-only**, so testnet Pots can't be opened there. On mainnet, Trezu's approval count would be wrong
  for Pot's two-role policy and its balance view stays empty for DAOs outside `*.sputnik-dao.near`.
- **`/demo` is a simulation.** It signs and sends nothing; its ids, keys and hashes are made up (generated from the
  same MockChain the tests use) and each chapter links to a real testnet transaction. To do it for real, sign in with
  Google/email (NEAR Auth) or a NEAR wallet; there is no test-account or server-signed sign-in.
- **The 1Click deposit is a simulator on testnet**: a labeled "do not send" address; on success the server sends test
  dollars to the member, who adds them to the Pot with one tap. Real cross-chain deposits need mainnet. Refunds land
  in the member's NEAR Intents balance and getting them out is not built.
- New Pots (policy v3): members can only vote on what the hub proposes, so every money move goes through
  Pot's rules and shows in the app. Older Pots (policy v1/v2) still let a majority file any Sputnik proposal. No
  minority can take funds. See [SECURITY.md](../SECURITY.md) for the trust model and the audit.
- Invite links are bearer passes: anyone holding one can join and vote. Links expire after 7 days and 10 joins by
  default, and a new member can't spend without asking before putting money in.
- Refunds are pro rata to everything a member ever put in, so money added late subsidizes earlier spending.
- There is no cash-out from Pot dollars yet: after a close, refunds stay in the member's Pot account.
- Pot names, amounts, members and requests are public on chain.
- A device key is a full-access key; "Sign out" deletes it in the browser but not on chain.
- A web app trusts the JavaScript it is served; the hub's rules cap what a compromised page could do.
- Members can't leave before close. At most 40 members. Requests expire after 7 days.
