// CLI-3 (security audit 2026-11-04): "Goes to" on the Approve sheet. Before anyone approves, the sheet says who gets
// the money: a member by name (with a short Pot-account hint when two people share that name), anyone else by the
// account hint only, never a name they chose, with "Not in this Pot" and a plain line that the money leaves the group.
// Membership is icon + word + colour (UserCheck "In this Pot" / UserX "Not in this Pot"), never colour alone.
// The rules behind it are lib/client/receiver.ts.
import { UserCheck, UserX } from "lucide-react"
import { Avatar } from "@/components/pot/Avatar"
import { chipClass, chipIconClass } from "@/components/pot/StatusChip"
import { t } from "@/i18n/t"
import { cn } from "@/lib/client/cn"
import type { PotVM, RequestVM } from "@/lib/client/mock/types"
import { receiverInfo } from "@/lib/client/receiver"

export function ApproveReceiver({
  pot,
  r,
  me,
}: {
  pot: Pick<PotVM, "members">
  r: Pick<RequestVM, "id" | "receiver" | "requester" | "link">
  me: string | null
}) {
  const info = receiverInfo(pot, r, me)
  if (info.kind === "link") return null
  const outsider = info.kind === "outsider"
  const id = `receiver-${r.id}`
  return (
    <section
      aria-labelledby={id}
      className={cn("flex items-start gap-3 rounded-md border p-3", outsider ? "border-declined" : "border-line")}
      data-receiver={info.kind}
      data-receiver-same-name={info.sameName || undefined}
    >
      {outsider ? (
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-pill bg-surface-sunken text-declined">
          <UserX className="size-5" strokeWidth={2} />
        </span>
      ) : (
        <Avatar person={r.receiver} size="md" />
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <h3 id={id} className="text-body-sm text-ink-muted">
          {t("approve.receiver.label")}
        </h3>
        <p className={cn("text-label text-ink", outsider && "font-mono break-all")} data-receiver-name>
          {info.isMe ? t("feed.you") : info.label}
        </p>
        {!outsider && info.sameName && info.hint && (
          <p className="font-mono text-body-sm break-all text-ink-muted" data-receiver-hint>
            {t("approve.receiver.account", { hint: info.hint })}
          </p>
        )}
        <span className={cn(chipClass("sm"), "self-start", outsider ? "text-declined" : "text-approved")} data-receiver-badge>
          {outsider ? (
            <UserX aria-hidden className={chipIconClass("sm")} strokeWidth={2} />
          ) : (
            <UserCheck aria-hidden className={chipIconClass("sm")} strokeWidth={2} />
          )}
          <span>{outsider ? t("approve.receiver.outsider") : t("approve.receiver.member")}</span>
        </span>
        {outsider && <p className="text-body-sm text-ink">{t("approve.receiver.outsider_body")}</p>}
        {!outsider && info.sameName && <p className="text-body-sm text-ink">{t("approve.receiver.same_name", { name: info.label })}</p>}
      </div>
    </section>
  )
}
