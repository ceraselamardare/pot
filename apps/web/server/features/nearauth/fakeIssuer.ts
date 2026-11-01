// A local fake NEAR Auth issuer (Auth0-shaped) for tests and the integrations e2e. It never talks to the real
// tenant. It implements exactly what Pot's thin wrapper uses:
//   GET  /.well-known/jwks.json             RS256 public key
//   GET  /authorize                          Authorization Code + PKCE; `response_mode=web_message` answers with a page
//                                            that posts {type:"authorization_response", response:{code,state}} to the
//                                            opener (like Auth0), otherwise it 302s to redirect_uri?code&state.
//                                            With `audience=<signing aud>` + `delegateAction=<csv bytes>` it stores
//                                            the bytes for a signing token (the Approve form, auto-approved).
//   POST /oauth/token                        code + code_verifier → {id_token, access_token}; the id_token carries the
//                                            caller's `nonce` (Pot binds it to the device key), the access_token of a
//                                            signing request is the 60 s JWT with `fatxn`.
// `sub` comes from the `login_hint` query parameter (default "auth0|e2e-user").
import { createHash, randomBytes } from "node:crypto"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { exportJWK, generateKeyPair, SignJWT, type JWK } from "jose"

export interface FakeIssuer {
  url: string
  /** the `iss` its tokens carry (default: the real testnet issuer, so the server's iss check stays real) */
  issuer: string
  clientId: string
  signingAudience: string
  jwk: JWK
  /** sign an arbitrary token with the issuer key (unit tests) */
  sign(claims: Record<string, unknown>, opts?: { expSec?: number; aud?: string | string[] }): Promise<string>
  close(): Promise<void>
}

interface Pending {
  challenge: string
  nonce: string | null
  sub: string
  audience: string | null
  fatxn: number[] | null
  redirectUri: string
  scope: string
}

export async function startFakeIssuer(opts: {
  port?: number
  issuer?: string
  clientId?: string
  signingAudience?: string
  /** `cancel` = the popup page posts an error (the person closed/denied) */
  behaviour?: () => "approve" | "cancel"
} = {}): Promise<FakeIssuer> {
  const issuer = opts.issuer ?? "https://login.testnet.fast-auth.com/"
  const clientId = opts.clientId ?? "e2e-client"
  const signingAudience = opts.signingAudience ?? "auth0.jwt.fast-auth.testnet"
  const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true })
  const jwk = { ...(await exportJWK(publicKey)), kid: "fake-1", alg: "RS256", use: "sig" }
  const codes = new Map<string, Pending>()

  const sign = (claims: Record<string, unknown>, o: { expSec?: number; aud?: string | string[] } = {}) => {
    const now = Math.floor(Date.now() / 1000)
    return new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "fake-1", typ: "JWT" })
      .setIssuer(issuer)
      .setAudience(o.aud ?? clientId)
      .setIssuedAt(now)
      .setExpirationTime(now + (o.expSec ?? 600))
      .sign(privateKey)
  }

  const cors = (res: ServerResponse) => {
    res.setHeader("access-control-allow-origin", "*")
    res.setHeader("access-control-allow-headers", "content-type, auth0-client")
    res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS")
  }

  const handler = async (req: IncomingMessage, res: ServerResponse) => {
    cors(res)
    const u = new URL(req.url ?? "/", "http://x")
    if (req.method === "OPTIONS") return void res.writeHead(204).end()
    if (u.pathname === "/.well-known/jwks.json") {
      res.writeHead(200, { "content-type": "application/json" })
      return void res.end(JSON.stringify({ keys: [jwk] }))
    }
    if (u.pathname === "/authorize") {
      const p = u.searchParams
      const state = p.get("state") ?? ""
      const redirectUri = p.get("redirect_uri") ?? ""
      if (p.get("client_id") !== clientId || p.get("response_type") !== "code" || p.get("code_challenge_method") !== "S256")
        return void res.writeHead(400, { "content-type": "text/plain" }).end("bad authorize request")
      const outcome = opts.behaviour?.() ?? "approve"
      const code = randomBytes(16).toString("hex")
      const csv = p.get("delegateAction")
      codes.set(code, {
        challenge: p.get("code_challenge") ?? "",
        nonce: p.get("nonce"),
        sub: p.get("login_hint") || "auth0|e2e-user",
        audience: p.get("audience"),
        fatxn: csv ? csv.split(",").map(Number) : null,
        redirectUri,
        scope: p.get("scope") ?? "openid",
      })
      const response = outcome === "approve" ? { code, state } : { error: "access_denied", error_description: "User rejected the signing request", state }
      if (p.get("response_mode") === "web_message") {
        const origin = new URL(redirectUri).origin
        res.writeHead(200, { "content-type": "text/html" })
        return void res.end(
          `<!doctype html><title>Fake sign-in</title><p>Fake NEAR Auth</p><script>` +
            `setTimeout(function(){window.opener&&window.opener.postMessage(${JSON.stringify({ type: "authorization_response", response })},${JSON.stringify(origin)})},150)` +
            `</script>`,
        )
      }
      const back = new URL(redirectUri)
      for (const [k, v] of Object.entries(response)) back.searchParams.set(k, v)
      return void res.writeHead(302, { location: back.toString() }).end()
    }
    if (u.pathname === "/oauth/token" && req.method === "POST") {
      const raw = await new Promise<string>((r) => {
        let b = ""
        req.on("data", (c) => (b += c))
        req.on("end", () => r(b))
      })
      const body = (req.headers["content-type"] ?? "").includes("json") ? JSON.parse(raw || "{}") : Object.fromEntries(new URLSearchParams(raw))
      const pending = codes.get(String(body.code))
      const verifier = String(body.code_verifier ?? "")
      const expected = pending ? createHash("sha256").update(verifier).digest("base64url") : ""
      if (!pending || expected !== pending.challenge || body.client_id !== clientId || body.redirect_uri !== pending.redirectUri) {
        res.writeHead(403, { "content-type": "application/json" })
        return void res.end(JSON.stringify({ error: "invalid_grant" }))
      }
      codes.delete(String(body.code))
      const idToken = await sign({
        sub: pending.sub,
        azp: clientId,
        ...(pending.nonce ? { nonce: pending.nonce } : {}),
        email: "leo@example.com",
        email_verified: true,
        given_name: "Leo",
        name: "Leo Example",
      })
      const accessToken =
        pending.audience === signingAudience && pending.fatxn
          ? await sign(
              { sub: pending.sub, azp: clientId, scope: "openid transaction:sign", fatxn: pending.fatxn },
              { expSec: 60, aud: [signingAudience, `${issuer}userinfo`] },
            )
          : await sign({ sub: pending.sub, azp: clientId, scope: pending.scope }, { aud: `${issuer}userinfo` })
      res.writeHead(200, { "content-type": "application/json" })
      return void res.end(JSON.stringify({ id_token: idToken, access_token: accessToken, token_type: "Bearer", expires_in: 60, scope: pending.scope }))
    }
    res.writeHead(404).end()
  }

  const server: Server = createServer((req, res) => {
    handler(req, res).catch(() => {
      res.writeHead(500).end()
    })
  })
  await new Promise<void>((r) => server.listen(opts.port ?? 0, "127.0.0.1", () => r()))
  const port = (server.address() as { port: number }).port
  return {
    url: `http://127.0.0.1:${port}`,
    issuer,
    clientId,
    signingAudience,
    jwk,
    sign,
    close: () => new Promise((r) => server.close(() => r())),
  }
}
