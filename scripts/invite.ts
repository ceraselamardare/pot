// Invite keys and join signatures (contracts-spec §3.7, D-08; notes/contracts.md O5). Uses @pot/sdk/sign.
//   scripts/run invite new                                → {"pk":"ed25519:…","pk_b58":"…","secret":"<base64url>"}
//   scripts/run invite sign <secret> <pot> <joiner>       → base64 ed25519 signature over pot-join:v1:<pot>:<joiner>
//   scripts/run invite link <slug> <secret> [appUrl]      → /j/<slug>?i=<b58>#<secret>
//   scripts/run invite verify <pk> <pot> <joiner> <sig>   → true | false
// The secret is the 43-char base64url seed (the link fragment). Never log it anywhere shared.
import { buildInviteLink, secretToSeed } from "@pot/sdk"
import { generateInvite, inviteKeyFromSeed, signJoin, verifyJoin } from "@pot/sdk/sign"

const [mode, a, b, c, d] = process.argv.slice(2)
if (mode === "new") {
  const k = generateInvite()
  console.log(JSON.stringify({ pk: k.publicKey, pk_b58: k.publicKey.slice("ed25519:".length), secret: k.secret }))
} else if (mode === "sign" && a && b && c) {
  console.log(signJoin(a, b, c).signature)
} else if (mode === "link" && a && b) {
  const k = inviteKeyFromSeed(secretToSeed(b))
  console.log(buildInviteLink({ origin: c ?? "http://localhost:3000", slug: a, invitePk: k.publicKey, secret: k.secret }))
} else if (mode === "verify" && a && b && c && d) {
  console.log(verifyJoin(a, b, c, d))
} else {
  console.log("usage: scripts/run invite new | sign <secret> <pot> <joiner> | link <slug> <secret> [appUrl] | verify <pk> <pot> <joiner> <sig>")
  process.exit(1)
}
