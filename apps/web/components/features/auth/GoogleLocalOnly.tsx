"use client"
// Google sign-in, switched off, on a hosted build without NEAR Auth (lib/client/signin.ts googleLocalOnly): NEAR
// Auth's shared testnet client accepts only http://localhost:3000, so Google works on a local run only for now. The
// button stays where it would be, disabled and never the marigold, and a "!" beside it opens why: hover with a mouse,
// tap, or the keyboard (a native popover like the Testnet badge's: Esc and light dismiss for free, placed by CSS
// anchor positioning in globals.css .pot-netpop). The disabled button is described by that text too.
import { CircleAlert } from "lucide-react"
import { useId, useRef, useSyncExternalStore, type CSSProperties, type PointerEvent } from "react"
import { Button } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { isLocalHost } from "@/lib/client/host"
import { googleLocalOnly } from "@/lib/client/signin"
import { GoogleMark } from "./GoogleMark"

const noSubscribe = () => () => {}

/** Whether to show Google switched off here. On the server (and the first client render) the page counts as hosted. */
export function useGoogleLocalOnly(inApp: string | null): boolean {
  const local = useSyncExternalStore(noSubscribe, isLocalHost, () => false)
  return googleLocalOnly(inApp, local)
}

export function GoogleLocalOnly({ label = "signin.google" }: { label?: "signin.google" | "landing.cta.google" }) {
  const id = `google-local-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`
  const anchor = { "--pot-netpop-anchor": `--${id}` } as CSSProperties
  const pop = useRef<HTMLDivElement>(null)
  // a mouse shows it on hover; a tap or a click shows it (popoverTargetAction "show") and a tap elsewhere closes it
  const hover = (open: boolean) => (e: PointerEvent) => {
    const el = pop.current
    if (e.pointerType !== "mouse" || !el?.showPopover) return
    try {
      if (open) el.showPopover()
      else el.hidePopover()
    } catch {
      // already in that state
    }
  }
  return (
    <div className="relative w-full" data-google-local-only>
      <Button variant="secondary" className="w-full pr-12" disabled aria-describedby={`${id}-body`} data-near-auth="google" data-google-off>
        <GoogleMark />
        {t(label)}
      </Button>
      <button
        type="button"
        popoverTarget={id}
        popoverTargetAction="show"
        aria-label={t("signin.google.local_only.why")}
        style={anchor}
        onPointerEnter={hover(true)}
        onPointerLeave={hover(false)}
        className="pot-anchor absolute top-1/2 right-1 grid size-11 -translate-y-1/2 place-items-center rounded-pill text-ink transition-[background-color] duration-120 ease-standard hover:bg-surface-sunken"
        data-google-local-why
      >
        <CircleAlert aria-hidden className="size-5" strokeWidth={2} />
      </button>
      <div
        id={id}
        ref={pop}
        popover="auto"
        style={anchor}
        className="pot-netpop w-[min(20rem,calc(100vw-2rem))] rounded-md border border-line bg-surface p-4 text-left text-ink shadow-card"
        data-google-local-pop
      >
        <p className="flex items-center gap-2 text-label text-ink">
          <CircleAlert aria-hidden className="size-4 shrink-0" strokeWidth={2} />
          {t("signin.google.local_only.title")}
        </p>
        <p id={`${id}-body`} className="mt-1 text-body-sm text-ink-muted">
          {t("signin.google.local_only.body")}
        </p>
      </div>
    </div>
  )
}
