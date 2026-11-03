"use client"
// Share / Invite (ux-spec §4.13, design-direction 01 §3). Get the link into the group chat in two taps, with
// honest expectations: who can join, until when, how many more people (rev4, H-1). The link is
// `/j/<slug>?i=<pk>#<secret>`; Copy, Share and the QR all keep the #fragment. The QR (lazy) is always the sheet's
// body (the raw link is never shown: Copy and Share carry it), so it never needs a scroll on a phone. It stays dark on
// a white plate in Night too, because scanners fail on inverted codes. "Link copied" swaps in place (that swap is the
// announcement; no extra toast).
// Invites only ("pay in", 2026-11-03): pay-in links for people outside the Pot are made in Ask anyone
// (components/payin/PayInSheet.tsx), never here.
import { Check, Clock, Copy, Share2 } from "lucide-react"
import { useState, useSyncExternalStore } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Sheet } from "@/components/sheets/Sheet"
import { QrPlate } from "@/components/share/QrPlate"
import { t } from "@/i18n/t"
import { generateInvite, inviteLink } from "@/lib/client/invite"
import { rotateInvite } from "@/lib/client/actions"
import type { PotVM } from "@/lib/client/mock/types"
import { formatDate } from "@/lib/client/time"

const subscribeNoop = () => () => {}
function useOrigin() {
  return useSyncExternalStore(subscribeNoop, () => window.location.origin, () => "")
}

export function ShareSheet({ pot, open, onClose }: { pot: PotVM; open: boolean; onClose: () => void }) {
  const origin = useOrigin()
  const [copied, setCopied] = useState(false)
  const [confirmRotate, setConfirmRotate] = useState(false)
  const [busy, setBusy] = useState(false)
  const invite = pot.invite
  const link = origin && invite ? inviteLink(origin, pot.slug, invite) : ""
  const message = t("share.message", { potName: pot.name, link })

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast(t("share.copy_failed"))
    }
  }
  const share = async () => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ text: message })
        return
      } catch (e) {
        if ((e as Error).name === "AbortError") return
      }
    }
    await copy()
  }
  const rotate = async () => {
    setBusy(true)
    try {
      await rotateInvite(pot.slug, await generateInvite())
      setConfirmRotate(false)
    } catch {
      toast.error(t("generic.error"))
    } finally {
      setBusy(false)
    }
  }
  const close = () => {
    setConfirmRotate(false)
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      title={t("share.title", { potName: pot.name })}
      footer={
        <div className="flex flex-col gap-2">
          <Button variant="primary" className="w-full" onClick={share} disabled={!link}>
            <Share2 aria-hidden strokeWidth={2.25} />
            {t("share.cta.share")}
          </Button>
          <Button className="w-full" onClick={copy} aria-live="polite" data-copy-link disabled={!link}>
            {copied ? <Check aria-hidden className="text-approved" strokeWidth={2.5} /> : <Copy aria-hidden strokeWidth={2} />}
            {copied ? t("share.copied") : t("share.cta.copy")}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col items-center gap-3 pt-1 text-center" data-qr-view>
        {link ? <QrPlate link={link} alt={t("share.qr.alt", { potName: pot.name })} hint={t("share.qr.hint")} dataAttr="data-invite-link" /> : null}
        {invite ? (
          <p className="flex items-start gap-2 text-left text-body-sm text-ink-muted">
            <Clock aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
            {t("share.expiry", { date: formatDate(invite.expiresAt), usesLeft: invite.usesLeft })}
          </p>
        ) : (
          <div className="flex w-full flex-col gap-2 rounded-md bg-surface-sunken p-3 text-left" data-invite-missing>
            <p className="text-body-sm text-ink">{t("share.other_device")}</p>
            <Button onClick={rotate} disabled={busy} aria-busy={busy || undefined}>
              {t("share.cta.rotate")}
            </Button>
          </div>
        )}
        <p className="text-left text-body-sm text-ink-muted">{t("share.body")}</p>

        {!invite ? null : confirmRotate ? (
          <div className="flex w-full flex-col gap-2 rounded-md bg-surface-sunken p-3 text-left">
            <p className="text-body-sm text-ink">{t("share.rotate.confirm")}</p>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={rotate} disabled={busy} aria-busy={busy || undefined}>
                {t("share.rotate.confirm.cta")}
              </Button>
              <Button variant="ghost" onClick={() => setConfirmRotate(false)}>
                {t("share.rotate.confirm.cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmRotate(true)}
            className="min-h-11 rounded-sm px-1 text-label text-link underline-offset-4 hover:underline"
          >
            {t("share.cta.rotate")}
          </button>
        )}
      </div>
    </Sheet>
  )
}
