"use client"
// CLI-4 (security audit 2026-11-04): under every public page anyone can open (the public pay-in page /give, a pay-in
// link /g, a payment link /c), a quiet line that the page was made by people who use Pot, not by Pot, and "Report this
// page" (three reasons, one tap; lib/client/report.ts → POST /api/report). It never competes with the page's own
// marigold: ink-muted text, a link-style button, secondary reason buttons. The sent state is icon + word.
import { Check, Flag, Info } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { reportPage, type ReportPage, type ReportReason } from "@/lib/client/report"

const REASONS: ReportReason[] = ["impersonation", "scam", "other"]

export function PublicNotice({ page, slug }: { page: ReportPage; slug: string }) {
  const [state, setState] = useState<"idle" | "choosing" | "sending" | "sent" | "error">("idle")
  const send = async (reason: ReportReason) => {
    setState("sending")
    try {
      await reportPage(page, slug, reason)
      setState("sent")
    } catch {
      setState("error")
    }
  }
  return (
    <aside aria-label={t("public.notice.label")} className="mt-10 flex flex-col items-center gap-2 text-center" data-public-notice={page}>
      <p className="flex items-center gap-1.5 text-body-sm text-ink-muted">
        <Info aria-hidden className="size-4 shrink-0" strokeWidth={2} />
        {t("public.notice")}
      </p>
      {state === "sent" ? (
        <p role="status" className="flex items-center gap-1.5 text-body-sm text-ink" data-report-sent>
          <Check aria-hidden className="size-4 shrink-0 text-approved" strokeWidth={2} />
          {t("public.report.sent")}
        </p>
      ) : state === "idle" ? (
        <Button variant="link" size="sm" onClick={() => setState("choosing")} data-report>
          <Flag aria-hidden strokeWidth={2} />
          {t("public.report")}
        </Button>
      ) : (
        <fieldset
          className="flex w-full flex-col gap-2"
          disabled={state === "sending"}
          aria-busy={state === "sending" || undefined}
          data-report-reasons
        >
          <legend className="mb-1 w-full text-label text-ink">{t("public.report.why")}</legend>
          {REASONS.map((r) => (
            <Button key={r} size="sm" className="w-full" onClick={() => void send(r)} data-report-reason={r}>
              {t(`public.report.${r}` as "public.report.other")}
            </Button>
          ))}
          <Button variant="ghost" size="sm" className="w-full" onClick={() => setState("idle")}>
            {t("public.report.cancel")}
          </Button>
          {state === "error" && (
            <p role="alert" className="text-body-sm text-ink">
              {t("public.report.error")}
            </p>
          )}
        </fieldset>
      )}
    </aside>
  )
}
