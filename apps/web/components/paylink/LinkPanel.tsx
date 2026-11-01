"use client"
// Pay by link inside the request sheet (?r=<id>) and the payment link sheet (?sheet=paylink&link=<id>):
//  - LinkPanel: where the link is now, who it's for; for the requester [See payment link] (this device holds the
//    secret) and "Cancel and return the money".
//  - CancelLink: the requester's cancel with a confirm step (reclaim_link: the money goes back into the Pot).
//  - PayLinkSheet: the Share card again (Share / Copy / QR) for a funded link, from this device's saved secret.
import { Undo2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Sheet } from "@/components/sheets/Sheet"
import { t } from "@/i18n/t"
import { announce, useOnline } from "@/lib/client/browser"
import { useRequest } from "@/lib/client/data"
import type { PotVM, RequestVM } from "@/lib/client/mock/types"
import { formatUsd } from "@/lib/client/money"
import { reclaimLink, useLinkSecret } from "@/lib/client/paylink/actions"
import { canCancel } from "@/lib/client/paylink/link"
import { openSheet } from "@/lib/client/sheet"
import { formatDate } from "@/lib/client/time"
import { LinkShareActions, LinkShareBody, useLinkShare } from "./LinkShare"
import { LinkStatusChip, linkStatusLine } from "./LinkStatus"

export function LinkPanel({ pot, r }: { pot: PotVM; r: RequestVM }) {
  const l = r.link!
  const me = pot.me?.person.id ?? null
  const secret = useLinkSecret(r.slug, r.id)
  const mine = r.mine
  return (
    <section aria-labelledby={`link-panel-${r.id}`} className="flex flex-col gap-3 rounded-md border border-line p-3" data-link-panel={l.status}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`link-panel-${r.id}`} className="text-label text-ink">
          {t("paylink.panel.title")}
        </h3>
        <LinkStatusChip status={l.status} />
      </div>
      {l.label && <p className="text-body-sm text-ink">{t("paylink.panel.for", { who: l.label })}</p>}
      <p className="text-body-sm text-ink-muted">{r.status === "needs" ? t("paylink.status.waiting") : linkStatusLine(l, me)}</p>
      {mine && l.status === "ready" &&
        (secret ? (
          <Button variant="primary" className="w-full" onClick={() => openSheet("paylink", { link: String(r.id) })} data-open-paylink>
            {t("paylink.share.open")}
          </Button>
        ) : secret === null ? (
          <p className="text-body-sm text-ink-muted">{t("paylink.share.missing", { potName: pot.name, date: formatDate(l.expiresAt) })}</p>
        ) : null)}
      {mine && canCancel(l.status) && <CancelLink pot={pot} r={r} />}
    </section>
  )
}

/** "Cancel and return the money" → confirm → reclaim_link. */
export function CancelLink({ pot, r, onDone }: { pot: PotVM; r: RequestVM; onDone?: () => void }) {
  const online = useOnline()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const amount = formatUsd(r.amount, "whole")
  const run = async () => {
    if (!online) return toast(t("approve.offline"))
    setBusy(true)
    try {
      const res = await reclaimLink(r.slug, r.id)
      if (res === "returned") {
        const msg = t("paylink.cancel.done", { amount, potName: pot.name })
        announce(msg)
        toast.success(msg)
        setConfirm(false)
        onDone?.()
      } else if (res === "done") toast(t("paylink.cancel.too_late"))
      else toast.error(t("paylink.cancel.error"))
    } catch {
      toast.error(t("paylink.cancel.error"))
    } finally {
      setBusy(false)
    }
  }
  if (!confirm)
    return (
      <Button className="w-full" onClick={() => setConfirm(true)} data-cancel-link>
        <Undo2 aria-hidden strokeWidth={2} />
        {t("paylink.cancel.cta")}
      </Button>
    )
  return (
    <div className="flex flex-col gap-2 rounded-md bg-surface-sunken p-3" data-cancel-confirm>
      <p className="text-body-sm text-ink">{t("paylink.cancel.confirm", { amount, potName: pot.name })}</p>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={run} disabled={busy} aria-busy={busy || undefined} data-cancel-yes>
          {t("paylink.cancel.yes")}
        </Button>
        <Button variant="ghost" onClick={() => setConfirm(false)} disabled={busy}>
          {t("paylink.cancel.no")}
        </Button>
      </div>
    </div>
  )
}

/** ?sheet=paylink&link=<id>: the Share card again, for the requester's funded link (one share state for body + footer). */
export function PayLinkSheet({ pot, id, open, onClose }: { pot: PotVM; id: number | null; open: boolean; onClose: () => void }) {
  // keep showing the last link while the sheet animates out
  const [lastId, setLastId] = useState(id)
  if (id !== null && id !== lastId) setLastId(id)
  const r = useRequest(pot.slug, id ?? lastId)
  const secret = useLinkSecret(pot.slug, r?.id ?? null)
  if (r?.link && secret && r.link.status === "ready") return <SharingSheet pot={pot} r={r} secret={secret} open={open} onClose={onClose} />
  const title = r ? t("paylink.share.title", { amount: formatUsd(r.amount, "whole") }) : t("paylink.panel.title")
  const l = r?.link
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <Button className="w-full" onClick={onClose}>
          {t("spend.done")}
        </Button>
      }
    >
      {r && l ? (
        <div className="flex flex-col gap-3 pt-1" data-paylink-sheet={l.status}>
          <LinkStatusChip status={l.status} className="self-start" />
          <p className="text-body text-ink">{r.status === "needs" ? t("paylink.status.waiting") : linkStatusLine(l, pot.me?.person.id ?? null)}</p>
          {l.status === "ready" && secret === null && <p className="text-body-sm text-ink-muted">{t("paylink.share.missing", { potName: pot.name, date: formatDate(l.expiresAt) })}</p>}
          {r.mine && canCancel(l.status) && <CancelLink pot={pot} r={r} onDone={onClose} />}
        </div>
      ) : r === null ? (
        <p className="py-6 text-body text-ink-muted">{t("approve.not_found")}</p>
      ) : null}
    </Sheet>
  )
}

function SharingSheet({ pot, r, secret, open, onClose }: { pot: PotVM; r: RequestVM; secret: string; open: boolean; onClose: () => void }) {
  const s = useLinkShare({
    slug: r.slug,
    requestId: r.id,
    secret,
    amount: r.amount,
    potName: pot.name,
    from: r.requester.name,
    label: r.link?.label ?? null,
    expiresAt: r.link?.expiresAt ?? 0,
  })
  const close = () => {
    s.setQr(false)
    onClose()
  }
  return (
    <Sheet open={open} onClose={close} title={t("paylink.share.title", { amount: formatUsd(r.amount, "whole") })} footer={<LinkShareActions s={s} />}>
      <div className="flex flex-col gap-4 pt-1" data-paylink-sheet="ready">
        <LinkShareBody s={s} />
        {!s.qr && r.mine && <CancelLink pot={pot} r={r} onDone={close} />}
      </div>
    </Sheet>
  )
}
