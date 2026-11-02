"use client"
// The QR-first way to share a link (mobile first): a lazy QR on a white plate, dark in Night too (scanners fail on
// inverted codes; surface #fff / ink #2b1b3a), with the scan hint under it. The raw link is never shown: the sheet's
// [Share] and [Copy link] carry it. A hidden copy stays in the DOM under `dataAttr` for tests and tooling.
// Used by the invite ShareSheet, the payment-link card and the Pot record's share sheet.
import dynamic from "next/dynamic"

const QR = dynamic(() => import("qrcode.react").then((m) => m.QRCodeSVG), { ssr: false })

export function QrPlate({ link, alt, hint, size = 216, dataAttr }: { link: string; alt: string; hint: string; size?: number; dataAttr: string }) {
  return (
    <div className="flex flex-col items-center gap-3" data-qr-view>
      <div role="img" aria-label={alt} className="rounded-lg bg-white p-4 shadow-card">
        <QR value={link} size={size} level="M" bgColor="#ffffff" fgColor="#2b1b3a" aria-hidden />
      </div>
      <span hidden {...{ [dataAttr]: link }}>
        {link}
      </span>
      <p className="text-center text-body text-ink">{hint}</p>
    </div>
  )
}
