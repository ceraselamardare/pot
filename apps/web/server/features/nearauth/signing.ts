// The NEAR Auth signing JWT (api-spec §4.3 "Signing JWT"; kb/near-auth.md signing flow): minted by the Auth0
// Action after the person taps Approve, valid 60 s, RS256, `fatxn` = the exact NEP-461-prefixed DelegateAction
// bytes. Verified off-chain BEFORE the relayer pays ≈ 0.0045 NEAR for `fast-auth.<net>.sign`.
import "server-only"
import { errors, jwtVerify, type JWTVerifyGetKey } from "jose"
import type { Config } from "../../config"
import { ApiError } from "../../http/errors"
import { getJwks } from "../../session/idtoken"

/** The Auth0 API (guard account) a signing token is minted for. */
export const signingAudience = (cfg: Config) =>
  process.env.NEAR_AUTH_SIGNING_AUDIENCE || (cfg.network === "testnet" ? "auth0.jwt.fast-auth.testnet" : "auth0.jwt.fast-auth.near")
/** The guard id in `sign` requests: `jwt#<issuer>` (the router keys guards by issuer URL). */
export const guardIdOf = (cfg: Config) => `jwt#${cfg.nearAuth.issuer}`

export const MAX_SIGNING_JWT = 7168

export async function verifySigningJwt(
  token: string,
  cfg: Config,
  expect: { sub: string; bytes: Uint8Array },
  opts: { jwks?: JWTVerifyGetKey; nowMs?: number } = {},
): Promise<void> {
  if (token.length > MAX_SIGNING_JWT) throw new ApiError("near_auth_token_invalid", { detail: { cause: "size" } })
  if (cfg.nearAuth.acceptedAudiences.length === 0) throw new ApiError("auth_unavailable", { detail: { cause: "no_client_id" } })
  const now = opts.nowMs ?? Date.now()
  let payload: Record<string, unknown>
  try {
    const r = await jwtVerify(token, opts.jwks ?? getJwks(cfg), {
      algorithms: ["RS256"],
      issuer: cfg.nearAuth.issuer,
      audience: signingAudience(cfg),
      currentDate: new Date(now),
      clockTolerance: 5,
    })
    payload = r.payload as Record<string, unknown>
  } catch (e) {
    if (e instanceof errors.JWTExpired) throw new ApiError("near_auth_token_expired")
    if (e instanceof errors.JWKSTimeout || (e instanceof Error && !(e instanceof errors.JOSEError)))
      throw new ApiError("auth_unavailable", { retryAfterMs: 5_000 })
    throw new ApiError("near_auth_token_invalid", { detail: { cause: (e as { code?: string }).code ?? "invalid" } })
  }
  if (!cfg.nearAuth.acceptedAudiences.includes(String(payload.azp ?? "")))
    throw new ApiError("near_auth_token_invalid", { detail: { cause: "azp" } })
  const scope = String(payload.scope ?? "").split(/\s+/)
  if (!scope.includes("transaction:sign")) throw new ApiError("near_auth_token_invalid", { detail: { cause: "scope" } })
  if (payload.sub !== expect.sub) throw new ApiError("near_auth_token_invalid", { detail: { cause: "sub" } })
  // the relayer needs ≥ 15 s to land `sign` before the 60 s token dies (block time decides, not our clock)
  const exp = Number(payload.exp ?? 0) * 1000
  if (exp - now < 15_000) throw new ApiError("near_auth_token_expired")
  const fatxn = payload.fatxn
  if (!Array.isArray(fatxn) || fatxn.length !== expect.bytes.length || fatxn.some((b, i) => b !== expect.bytes[i]))
    throw new ApiError("payload_mismatch", { detail: { cause: "fatxn" } })
}
