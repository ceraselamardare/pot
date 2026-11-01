"use client"
// Push pre-prompt (F-23; D-42; ux-spec §9 "After install"; design-direction 01 §5). Shown by itself on the first
// launch from the Home Screen (and from You → Notifications), before any system dialog: two example
// notifications in the app's own voice (lock-screen safe: no note text, no balances), the reason, "Your phone
// asks next. Tap Allow.", then [Turn on notifications] (the system dialog, from this tap only) and [Not now].
import { Check, X } from "lucide-react"
import Image from "next/image"
import { toast } from "sonner"
import { Sheet } from "@/components/sheets/Sheet"
import { Button } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { announce } from "@/lib/client/browser"
import { enablePush, snoozePush, usePush } from "@/lib/client/pwa/push"

function Example({ title, body }: { title: string; body: string }) {
  return (
    <div className="pot-drop flex items-start gap-3 rounded-md bg-surface p-3 shadow-card motion-reduce:animate-none">
      <Image src="/icon-192.png" alt="" width={20} height={20} className="mt-0.5 size-5 rounded-[22%]" />
      <div className="min-w-0 flex-1">
        <p className="text-body-sm text-ink-muted">{t("push.example.app")}</p>
        <p className="text-label text-ink">{title}</p>
        <p className="text-body-sm text-ink">{body}</p>
      </div>
    </div>
  )
}

export function PushPrompt({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { status } = usePush()
  const busy = status === "requesting" || status === "subscribing"
  const turnOn = () => {
    // enablePush() calls Notification.requestPermission() first, synchronously, inside this tap (iOS)
    void enablePush().then((s) => {
      if (s === "subscribed") {
        toast(t("push.on"))
        onClose()
      } else if (s === "denied") announce(t("push.denied"))
      else if (s === "error") announce(t("push.error"))
    })
  }
  const later = () => {
    snoozePush()
    onClose()
  }
  return (
    <Sheet
      open={open}
      onClose={later}
      title={t("push.prompt.title")}
      footer={
        <div className="flex flex-col gap-2">
          {status === "denied" || status === "error" ? (
            <p role="alert" className="flex items-start gap-2 text-body-sm text-ink" data-push-error={status}>
              <X aria-hidden className="mt-0.5 size-4 shrink-0 text-declined" strokeWidth={2.5} />
              {status === "denied" ? t("push.denied") : t("push.error")}
            </p>
          ) : (
            <p className="text-body-sm text-ink-muted">{t("push.prompt.prime")}</p>
          )}
          {status === "subscribed" ? (
            <p className="flex items-center gap-2 text-body text-ink">
              <Check aria-hidden className="size-5 text-approved" strokeWidth={2.5} />
              {t("push.on")}
            </p>
          ) : status !== "denied" ? (
            <Button variant="primary" className="w-full" onClick={turnOn} disabled={busy} aria-busy={busy || undefined} data-push-on>
              {t("push.prompt.cta")}
            </Button>
          ) : null}
          <Button variant="ghost" className="min-h-11 w-full" onClick={later} data-push-later>
            {status === "denied" ? t("spend.done") : t("push.prompt.later")}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 pt-1" data-push-prompt={status}>
        <div aria-hidden className="flex flex-col gap-2 rounded-lg bg-surface-sunken p-3">
          <Example title={t("push.example.title")} body={t("push.example.body")} />
          <Example title={t("push.example.title2")} body={t("push.example.body2")} />
        </div>
        <p className="text-body text-ink-muted">{t("push.prompt.body")}</p>
        <p className="text-body-sm text-ink-muted">{t("push.prompt.settings")}</p>
      </div>
    </Sheet>
  )
}
