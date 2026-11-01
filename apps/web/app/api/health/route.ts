// GET /api/health (B-03 minimal; api-spec §2.10): relayer level, RPC and DB status; cached 15 s.
import { sql } from "drizzle-orm"
import { getDb } from "@/db/client"
import { relayerAvailable, sponsorLevel } from "@/server/chain/balance"
import { block } from "@/server/chain/near"
import { getConfig } from "@/server/config"
import { getRpc } from "@/server/deps"
import { route } from "@/server/http/context"

export const maxDuration = 10

export const GET = route("GET /api/health", async (ctx) => {
  void ctx.req.headers.get("host") // request-time route (Cache Components)
  const cfg = getConfig()
  const [rpc, db, relayer] = await Promise.all([
    block(getRpc(), { finality: "final" }).then(
      () => "ok" as const,
      () => "down" as const,
    ),
    getDb()
      .execute(sql`select 1`)
      .then(
        () => "ok" as const,
        () => "down" as const,
      ),
    cfg.relayerAccountId
      ? relayerAvailable(getRpc(), cfg.relayerAccountId).then(
          (a) => sponsorLevel(a, cfg.relayerThresholds),
          () => "unknown" as const,
        )
      : Promise.resolve("unknown" as const),
  ])
  ctx.cacheControl = "public, s-maxage=15"
  return ctx.json({
    network: cfg.network,
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
    relayer: relayer === "ok" ? "ok" : relayer === "low" ? "low" : relayer === "unknown" ? "ok" : "critical",
    rpc,
    db,
    features: {
      nearAuth: cfg.flags.nearAuth,
      oneClick: process.env.ONECLICK_MODE === "real" ? "real" : "simulated",
      push: process.env.FLAG_PUSH === "true",
      email: process.env.FLAG_EMAIL === "true",
      telegram: process.env.FLAG_TELEGRAM === "true",
    },
  })
})
