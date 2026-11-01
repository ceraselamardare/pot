"use client"
// The optional NEAR layer of the /demo tour (06 §4.1), client side:
//  - HoodSheet: the app's Sheet (Base UI Drawer), full height on phones and a wide dialog from md, Night-scoped,
//    titled "Under the hood: <part>" with a "Simulated" chip. Its body is an empty target: the part's content is
//    portalled into it by HoodSlot.
//  - HoodSlot: wraps one part's hood content where the server rendered it (a closed <details> in the story list).
//    While that part's sheet is up, the same nodes are portalled into the sheet instead, so the content exists once.
//  - TourStory: the server's ordered story list; hidden once hydrated, because the stage plays it.
import { Layers } from "lucide-react"
import { createPortal } from "react-dom"
import type { ReactNode } from "react"
import { Sheet } from "@/components/sheets/Sheet"
import { t } from "@/i18n/t"
import { tk } from "./copy"
import { TOUR_PARTS } from "./tour"
import { useTour } from "./TourPlayer"

export function HoodSheet() {
  const { hoodPart, hoodOpen, closeHood, setHoodTarget } = useTour()
  const part = hoodPart ? TOUR_PARTS[hoodPart - 1] : null
  const name = part ? tk(part.nameKey) : ""
  const title = t("demo.near.title", { part: name })
  return (
    <Sheet
      open={hoodOpen}
      onClose={closeHood}
      title={title}
      full
      wide
      theme="night"
      className="bg-ground"
      header={
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p aria-hidden className="flex min-w-0 items-center gap-2 font-display text-heading text-balance text-ink">
            <Layers className="size-5 shrink-0" strokeWidth={2} />
            {title}
          </p>
          <span className="inline-flex h-6 shrink-0 items-center rounded-pill bg-surface-sunken px-2 text-body-sm font-semibold whitespace-nowrap text-ink">{t("demo.sim.chip")}</span>
        </div>
      }
    >
      <div ref={setHoodTarget} data-hood-sheet={hoodPart ?? undefined} className="pb-2" />
    </Sheet>
  )
}

export function HoodSlot({ part, children }: { part: number; children: ReactNode }) {
  const p = useTour()
  if (p.hydrated && p.hoodTarget && p.hoodPart === part) return createPortal(children, p.hoodTarget)
  return <>{children}</>
}

export function TourStory({ children, className }: { children: ReactNode; className?: string }) {
  const p = useTour()
  return (
    <section id="story" aria-labelledby="story-title" hidden={p.hydrated} className={className} data-tour-story>
      {children}
    </section>
  )
}
