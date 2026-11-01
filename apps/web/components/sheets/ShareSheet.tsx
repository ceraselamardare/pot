"use client"
// Share / Invite (ux-spec §4.13, design-direction 01 §3). Get the link into the group chat in two taps, with
// honest expectations: who can join, until when, how many more people (rev4, H-1). The link is
// `/j/<slug>?i=<pk>#<secret>`; Copy, Share and the QR all keep the #fragment. The QR (lazy) stays dark on a
// white plate in Night too, because scanners fail on inverted codes. "Link copied" swaps in place (that swap is
// the announcement; no extra toast).
import { Check, Clock, Copy, QrCode, Share2 } from "lucide-react"
import dynamic from "next/dynamic"
import { useState, useSyncExternalStore } from "react"
import { toast } from "sonner"
import { AvatarStack } from "@/components/pot/Avatar"
import { CoverTile } from "@/components/pot/CoverTile"
import { Button } from "@/components/ui/button"
import { Sheet } from "@/components/sheets/Sheet"
import { t } from "@/i18n/t"
import { generateInvite, inviteLink } from "@/lib/client/invite"
import { rotateInvite } from "@/lib/client/actions"
import type { PotVM } from "@/lib/client/mock/types"
import { formatDate } from "@/lib/client/time"

const QR = dynamic(() => import("qrcode.react").then((m) => m.QRCodeSVG), { ssr: false })

const subscribeNoop = () => () => {}
function useOrigin() {
  return useSyncExternalStore(subscribeNoop, () => window.location.origin, () => "")
}

export function ShareSheet({ pot, open, onClose }: { pot: PotVM; open: boolean; onClose: () => void }) {
  const origin = useOrigin()
  const [copied, setCopied] = useState(false)
  const [qr, setQr] = useState(false)
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
    setQr(false)
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
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={copy} aria-live="polite" data-copy-link disabled={!link}>
              {copied ? <Check aria-hidden className="text-approved" strokeWidth={2.5} /> : <Copy aria-hidden strokeWidth={2} />}
              {copied ? t("share.copied") : t("share.cta.copy")}
            </Button>
            <Button onClick={() => setQr((v) => !v)} aria-expanded={qr} disabled={!link}>
              <QrCode aria-hidden strokeWidth={2} />
              {qr ? t("share.cta.qr_hide") : t("share.cta.qr")}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4 pt-1">
        <figure className="rounded-lg bg-surface-sunken p-3">
          <div className="flex items-center gap-3 rounded-md bg-surface p-3 shadow-card">
            <CoverTile emoji={pot.emoji} cover={pot.cover} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-heading text-ink">{t("share.preview.invited", { potName: pot.name })}</p>
              <div className="mt-1 flex items-center gap-2">
                <AvatarStack people={pot.members.map((m) => m.person)} size="xs" ring="surface" />
                <span className="text-body-sm text-ink-muted">{t("members.header", { n: pot.members.length })}</span>
              </div>
            </div>
          </div>
          <figcaption className="mt-2 px-1 text-body-sm text-ink-muted">{t("share.preview_hint")}</figcaption>
        </figure>

        <p className="text-body text-ink">{t("share.body")}</p>
        {invite ? (
          <p className="flex items-start gap-2 text-body-sm text-ink-muted">
            <Clock aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
            {t("share.expiry", { date: formatDate(invite.expiresAt), usesLeft: invite.usesLeft })}
          </p>
        ) : (
          <div className="flex flex-col gap-2 rounded-md bg-surface-sunken p-3" data-invite-missing>
            <p className="text-body-sm text-ink">{t("share.other_device")}</p>
            <Button onClick={rotate} disabled={busy} aria-busy={busy || undefined}>
              {t("share.cta.rotate")}
            </Button>
          </div>
        )}

        {link && (
        <div>
          <p className="mb-1 text-body-sm text-ink-muted" id="invite-link-label">
            {t("share.link.label")}
          </p>
          <p
            aria-labelledby="invite-link-label"
            data-invite-link={link}
            className="rounded-sm border border-line-strong bg-surface-sunken p-3 font-sans text-body-sm break-all text-ink select-all"
          >
            {link}
          </p>
        </div>
        )}

        {qr && link && (
          <div className="flex flex-col items-center gap-2">
            {/* the QR stays dark on a white plate in Night too: scanners fail on inverted codes (surface #fff / ink #2b1b3a) */}
            <div role="img" aria-label={t("share.qr.alt", { potName: pot.name })} className="rounded-lg bg-white p-4 shadow-card">
              <QR value={link} size={208} level="M" bgColor="#ffffff" fgColor="#2b1b3a" aria-hidden />
            </div>
            <p className="text-body-sm text-ink-muted">{t("share.qr.hint")}</p>
          </div>
        )}

        {!invite ? null : confirmRotate ? (
          <div className="flex flex-col gap-2 rounded-md bg-surface-sunken p-3">
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
            className="-ml-1 min-h-11 self-start rounded-sm px-1 text-label text-link underline-offset-4 hover:underline"
          >
            {t("share.cta.rotate")}
          </button>
        )}
      </div>
    </Sheet>
  )
}
