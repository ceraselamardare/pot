// A lock-screen notification (the video's PushNotification, marketing/video/src/ui/screens/Push.tsx), generic, no
// real OS branding: a frosted `surface` card with the Pot app icon, "Pot" and "now", then the app's own push
// copy (notif.approval.*): "Maya needs your OK" / "$300 for the boat trip · Lisbon Trip".
//
// Logo: the app icon is the brand's <MarkTile> (components/brand, pot-mark.svg; 38 px, so the full mark, not the
// small cut), never recoloured, always next to the name "Pot".
//
// Width: fills its parent up to 24rem; pass a width class. Semantics: aria-hidden by default (inside a
// <PhoneFrame> or <FloatCard> that carries the label); pass `label` (home.chat.push.label) to make it one image.
import { MarkTile } from "@/components/brand/MarkTile"
import { t } from "@/i18n/t"
import { cn } from "@/lib/client/cn"
import { dollars, formatUsd } from "@/lib/client/money"
import { PEOPLE } from "@/lib/client/mock/fixtures"

export function PushCard({
  label,
  className,
  title,
  body,
}: {
  label?: string
  className?: string
  /** another notification's words (the /demo explainer's close request); default: Maya's $300 approval */
  title?: string
  body?: string
}) {
  return (
    <div
      data-push-card
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        "w-full max-w-[24rem] rounded-lg bg-surface/85 px-3.5 py-3 font-sans text-ink shadow-card backdrop-blur-xl backdrop-saturate-150",
        className,
      )}
    >
      <div aria-hidden={label ? true : undefined} className="flex items-start gap-3">
        <MarkTile className="mt-0.5 size-[2.375rem] shrink-0" />
        <div className="min-w-0 flex-1 text-[0.9375rem] leading-5">
          <p className="flex items-baseline gap-2 text-[0.8125rem] leading-[1.125rem] text-ink-muted">
            <span className="flex-1 font-semibold">{t("app.name")}</span>
            <span className="shrink-0">{t("home.chat.push.when")}</span>
          </p>
          <p className="font-bold">{title ?? t("notif.approval.title", { name: PEOPLE.maya.name })}</p>
          <p className="tabular-nums">
            {body ?? t("notif.approval.body", {
              amount: formatUsd(dollars(300), "whole"),
              reason: t("home.chat.push.reason"),
              // the Pot's name never breaks across lines ("… · Lisbon / Trip" at 390)
              potName: t("home.chat.title").replaceAll(" ", "\u00a0"),
            })}
          </p>
        </div>
      </div>
    </div>
  )
}
