// The group's "about $X each" (Create's "about how much each?"): off chain on the Pot's row, so every member sees the
// same aim on every device (it used to live in the creator's browser only). Members only, like all off-chain group
// data; any member may change or clear it (Settings), as anyone in the group could say "let's aim for $X each".
import { eq } from "drizzle-orm"
import type { Db } from "@/db/client"
import { pot } from "@/db/schema"
import type { Config } from "@/server/config"
import type { HubReader } from "@/server/chain/hub"
import { ApiError } from "@/server/http/errors"
import type { SessionCtx } from "@/server/session/store"
import { resolvePotId } from "./feed"
import { ensurePot, isMember } from "./notes"

export async function putGoalEach(
  deps: { db: Db; hub: HubReader; cfg: Config },
  s: SessionCtx,
  potParam: string,
  body: { goalEach: string | null },
): Promise<{ goalEach: string | null }> {
  const potId = resolvePotId(potParam, deps.cfg.hubId)
  await ensurePot(deps.db, deps.hub, deps.cfg, potId)
  if (!(await isMember(deps.hub, potId, s.user.nearAccount))) throw new ApiError("not_a_member")
  await deps.db.update(pot).set({ goalEach: body.goalEach }).where(eq(pot.daoId, potId))
  return { goalEach: body.goalEach }
}
