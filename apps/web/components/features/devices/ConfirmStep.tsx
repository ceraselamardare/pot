"use client"
// "Confirm it's you" (D-21; ux-spec §4.17; design-direction 01 §6; frontend-architecture §5.7). A short sheet over
// whatever needed the signature: which device is being added, why, what happens next, and one button that opens
// the NEAR Auth window INSIDE the tap (the AddKey bytes are prepared when the sheet opens, CTA disabled ≤ 1 s).
// Then: "Approved" → "Adding this device" (MPC ≈ 9 s + relay ≈ 3 s) → "Done", and the original action resumes.
import { Smartphone, X } from "lucide-react"
import { useEffect, useState } from "react"
import { ProgressSteps } from "@/components/feedback/States"
import { TypingDots } from "@/components/feedback/TypingDots"
import { Sheet } from "@/components/sheets/Sheet"
import { Button } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { announce } from "@/lib/client/browser"
import { ActionError } from "@/lib/client/errors"
import { ensureLiveSession } from "@/lib/client/live/session"
import { prepareAddDevice, settleConfirmation, submitAddDevice, useConfirmOpen, type PreparedAddKey } from "@/lib/devices/confirm"
import { startNearAuthApproval } from "@/lib/signing/near-auth/client"
import { NearAuthError } from "@/lib/signing/near-auth/oidc"

type Phase = "preparing" | "ready" | "approving" | "submitting" | "done"
type ErrKey = "confirm.blocked" | "confirm.failed" | "auth.service_down" | null

/** Mounted once in the app shell; opens when the signing layer asks for it. */
export function ConfirmStepHost() {
  const open = useConfirmOpen()
  return open ? <ConfirmStep /> : null
}

/** The AddKey bytes (MPC nonce + a fresh block window), before any tap. */
async function loadPrepared(): Promise<{ prepared: PreparedAddKey | null; error: ErrKey }> {
  try {
    const s = await ensureLiveSession()
    if (!s) throw new ActionError("session", "not_signed_in")
    return { prepared: await prepareAddDevice(s), error: null }
  } catch {
    return { prepared: null, error: "confirm.failed" }
  }
}

export function ConfirmStep() {
  const [phase, setPhase] = useState<Phase>("preparing")
  const [error, setError] = useState<ErrKey>(null)
  const [prepared, setPrepared] = useState<PreparedAddKey | null>(null)

  const apply = (r: Awaited<ReturnType<typeof loadPrepared>>) => {
    setPrepared(r.prepared)
    setError(r.error)
    setPhase("ready")
  }
  /** rebuild the bytes (expired approval, used nonce, stale window); a shown error stays until the next tap */
  const prepare = (keep: ErrKey = null) => {
    setPhase("preparing")
    void loadPrepared().then((r) => apply({ ...r, error: r.error ?? keep }))
  }
  useEffect(() => {
    let off = false
    void loadPrepared().then((r) => !off && apply(r))
    return () => {
      off = true
    }
  }, [])

  const tap = () => {
    const p = prepared
    if (!p || phase !== "ready") return
    // a stale window (≈ 5 min of blocks) or an old nonce: rebuild first (the next tap opens the window)
    if (Date.now() - p.at > 4 * 60_000) {
      prepare()
      return
    }
    setError(null)
    // synchronous: the window opens inside this tap
    const approval = startNearAuthApproval(p.bytes, { devicePublicKey: p.devicePublicKey, keyKind: p.keyKind, accountId: p.accountId, connection: "google-oauth2" })
    setPhase("approving")
    void (async () => {
      let jwt: string
      try {
        jwt = await approval
      } catch (e) {
        if (e instanceof NearAuthError && e.kind === "cancelled") setError(null)
        else if (e instanceof NearAuthError && e.kind === "blocked") setError("confirm.blocked")
        else if (e instanceof NearAuthError && e.kind === "unavailable") setError("auth.service_down")
        else setError("confirm.failed")
        setPhase("ready")
        return
      }
      setPhase("submitting")
      try {
        await submitAddDevice(p, jwt)
        setPhase("done")
        announce(t("confirm.done"))
        setTimeout(() => settleConfirmation(true), 900)
      } catch (e) {
        // an expired approval (60 s) or a used nonce: rebuild and ask again
        setError("confirm.failed")
        if (e instanceof ActionError && (e.reason === "near_auth_token_expired" || e.reason === "nonce_used" || e.reason === "expired")) prepare("confirm.failed")
        else setPhase("ready")
      }
    })()
  }

  const busy = phase === "approving" || phase === "submitting" || phase === "done"
  return (
    <Sheet open onClose={() => !busy && settleConfirmation(false)} title={t("confirm.title")}>
      <div className="flex flex-col gap-4 pb-2" data-confirm-step data-phase={phase}>
        <div className="flex items-center gap-3 rounded-md bg-surface-sunken p-3">
          <Smartphone aria-hidden className="size-6 shrink-0 text-ink" strokeWidth={2} />
          <div>
            <p className="text-label text-ink">{t("confirm.device.label")}</p>
            <p className="text-body-sm text-ink-muted">{t("confirm.device.sub")}</p>
          </div>
        </div>
        <p className="text-body text-ink">{t("confirm.body.add_device")}</p>
        <p className="text-body text-ink-muted">{t("confirm.why.new_device")}</p>

        {phase === "submitting" || phase === "done" ? (
          <ProgressSteps
            steps={[
              { label: t("confirm.progress.approved"), state: "done" },
              { label: t("confirm.progress.adding"), state: phase === "done" ? "done" : "current" },
              { label: t("confirm.progress.done"), state: phase === "done" ? "done" : "next" },
            ]}
          />
        ) : (
          <p className="text-body-sm text-ink-muted">{t("confirm.next")}</p>
        )}

        {error && (
          <p role="alert" className="flex items-start gap-2 text-body-sm text-ink">
            <X aria-hidden className="mt-0.5 size-4 shrink-0 text-declined" strokeWidth={2.5} />
            {t(error)}
          </p>
        )}
        {phase === "approving" && (
          <p role="status" className="text-body-sm text-ink">
            {t("confirm.waiting")}
          </p>
        )}

        {!busy && (
          <div className="flex flex-col gap-2">
            <Button variant="primary" className="w-full" disabled={phase !== "ready" || !prepared} aria-busy={phase === "preparing" || undefined} onClick={tap} data-confirm-cta>
              {phase === "preparing" ? <TypingDots size="sm" /> : null}
              {t("confirm.cta", { provider: t("confirm.provider.google") })}
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => settleConfirmation(false)}>
              {t("confirm.later")}
            </Button>
          </div>
        )}
      </div>
    </Sheet>
  )
}
