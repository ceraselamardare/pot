"use client"
// Glossary terms (05 §6.4). A term is `ink` text with a 1 px dotted `line-strong` underline. Without JS (and in the
// server HTML) it is a link to the chapter's glossary <dl> (#g-<id>); once hydrated it becomes a button that opens a
// Base UI Popover (max 320 px, surface, line edge, shadow-card) with the term and its one-or-two-sentence meaning.
// Opened from the Night "Under the hood" panel, the popup takes the panel's Night tokens too (it is portalled).
import { Popover } from "@base-ui/react/popover"
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import { cn } from "@/lib/client/cn"
import { tk } from "./copy"

const noop = () => () => {}
/** false in the server HTML and on the hydration pass, true after. */
export function useHydrated(): boolean {
  return useSyncExternalStore(noop, () => true, () => false)
}

const TERM = "rounded-xs text-ink underline decoration-line-strong decoration-dotted decoration-1 underline-offset-[0.2em]"

export function GlossaryTerm({ id, children, anchorPrefix = "" }: { id: string; children: ReactNode; anchorPrefix?: string }) {
  const hydrated = useHydrated()
  const [night, setNight] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  if (!hydrated) {
    return (
      <a href={`#${anchorPrefix}g-${id}`} className={TERM} data-glossary-term={id}>
        {children}
      </a>
    )
  }
  return (
    <Popover.Root
      onOpenChange={(open) => {
        if (open) setNight(!!ref.current?.closest('[data-theme="night"]'))
      }}
    >
      <Popover.Trigger ref={ref} className={cn(TERM, "cursor-help font-[inherit]")} data-glossary-term={id}>
        {children}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} collisionPadding={16} className="z-50">
          <Popover.Popup
            data-theme={night ? "night" : undefined}
            data-glossary-popup={id}
            className="max-w-80 origin-(--transform-origin) rounded-md border border-line bg-surface p-4 text-ink shadow-card outline-none transition-[opacity,scale] duration-120 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none"
          >
            <Popover.Title className="text-label text-ink">{tk(`demo.g.${id}.term`)}</Popover.Title>
            <Popover.Description className="mt-1 text-body-sm text-ink-muted">{tk(`demo.g.${id}`)}</Popover.Description>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

/**
 * Opens the collapsed glossary (cards/Misc GlossaryList) when the URL fragment points at one of its terms (#g-<id>,
 * the terms' no-JS link or a shared deep link), then brings the term into view. Chromium expands a closed <details>
 * on fragment navigation by itself; Safari and Firefox don't reliably. Every closed <details> around the term opens,
 * so a term inside the tour's closed "Under the hood" disclosure is reached too (with JS the tour itself opens that
 * part's sheet first: TourPlayer). Renders nothing.
 */
export function GlossaryHashOpen() {
  useEffect(() => {
    const open = () => {
      const id = decodeURIComponent(window.location.hash.slice(1))
      if (!id) return
      const term = document.getElementById(id)
      if (!term?.closest("details[data-glossary-details]")) return
      for (let d = term.closest("details"); d; d = d.parentElement?.closest("details") ?? null) d.open = true
      requestAnimationFrame(() => term.scrollIntoView({ block: "start" }))
    }
    open()
    window.addEventListener("hashchange", open)
    return () => window.removeEventListener("hashchange", open)
  }, [])
  return null
}
