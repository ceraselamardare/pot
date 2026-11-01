"use client"
// ResponsiveSheet (frontend-architecture §2.2, §7.3; design-direction "Sheet"): a Base UI Drawer that is a
// bottom sheet below bp-md (768 px) and a centred 440 px dialog from bp-md. One component for both, so there
// is no viewport branching at hydration. `surface`, radius-lg (top corners on phones), shadow-sheet, the
// --pot-scrim backdrop, a grabber, a visible 44 px ✕ (WCAG 2.5.7), focus on the title when it opens.
// Enter 360 ms ease-enter, exit 280 ms ease-exit; reduced motion: a 120 ms fade.
// Multi-step sheets pass `stepKey`: when the step changes inside an open sheet (Next, Back, the browser's Back),
// focus moves to the step's heading ([data-step-heading], else the sheet title) and the live region reads it.
import { Drawer } from "@base-ui/react/drawer"
import { ChevronLeft, X } from "lucide-react"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { cn } from "@/lib/client/cn"

export function Sheet({
  open,
  onClose,
  title,
  titleHidden,
  description,
  children,
  footer,
  full,
  header,
  label,
  keyboard,
  titleClassName,
  wide,
  theme,
  className,
  stepKey,
}: {
  open: boolean
  onClose: () => void
  /** the sheet's heading; receives focus on open */
  title: string
  titleHidden?: boolean
  description?: string
  children: ReactNode
  /** sticky bottom zone (CTA + keypad), padded for the safe area */
  footer?: ReactNode
  /** full height (Create) */
  full?: boolean
  /** replaces the default title row (Approve sheet: avatar + H2) */
  header?: ReactNode
  /** dialog label when the visible title is custom */
  label?: string
  /** sheets with text inputs: keep the CTA above the software keyboard (D-41) */
  keyboard?: boolean
  /** e.g. the "You're in!" moment set at balance-hero size */
  titleClassName?: string
  /** from bp-md a wide centred dialog, min(720px, 100vw − 48px), instead of 440 px (the /demo "Under the hood") */
  wide?: boolean
  /** scope the popup to one theme (the /demo hood is Night on a Day page) */
  theme?: "night"
  /** extra classes on the popup */
  className?: string
  /** the step a multi-step sheet shows; a change moves focus to the new step's heading and announces it */
  stepKey?: string | number
}) {
  const titleRef = useRef<HTMLHeadingElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  // the step shown since this opening (null while closed: the opening itself focuses the title)
  const shownStep = useRef<string | number | null>(null)
  // the step's heading, read by the sheet's own live region (the app's region is outside the modal)
  const [stepSaid, setStepSaid] = useState("")
  useEffect(() => {
    if (!open) {
      shownStep.current = null
      return
    }
    if (stepKey === undefined) return
    if (shownStep.current === null || shownStep.current === stepKey) {
      shownStep.current = stepKey
      return
    }
    shownStep.current = stepKey
    // the new step is committed: its heading exists now (the Back button that had focus is gone)
    const target = popupRef.current?.querySelector<HTMLElement>("[data-step-heading]") ?? titleRef.current
    if (!target) return
    target.focus()
    setStepSaid(target.textContent?.trim() ?? "")
  }, [open, stepKey])
  const popup = (
    <Drawer.Popup
      ref={popupRef}
      initialFocus={titleRef}
      aria-label={label}
      data-theme={theme}
      className={cn(
        "pointer-events-auto relative flex w-full max-w-flow flex-col bg-surface text-ink shadow-sheet outline-none",
        "max-h-[92dvh] rounded-t-lg md:max-h-[88dvh] md:rounded-lg",
        full && "h-[92dvh] md:h-auto md:min-h-[36rem]",
        "[transform:translateY(var(--drawer-swipe-movement-y))] transition-[transform,opacity] duration-[360ms] ease-enter",
        "data-starting-style:[transform:translateY(100%)] data-ending-style:[transform:translateY(100%)] data-ending-style:duration-[280ms] data-ending-style:ease-exit data-swiping:transition-none",
        "md:data-starting-style:[transform:translateY(16px)] md:data-starting-style:opacity-0 md:data-ending-style:[transform:translateY(16px)] md:data-ending-style:opacity-0",
        "motion-reduce:transition-opacity motion-reduce:duration-[120ms] motion-reduce:data-starting-style:[transform:none] motion-reduce:data-starting-style:opacity-0 motion-reduce:data-ending-style:[transform:none] motion-reduce:data-ending-style:opacity-0",
        wide && "md:max-w-[min(720px,calc(100vw-48px))]",
        className,
      )}
    >
      <div aria-hidden className="mx-auto mt-2 h-1.25 w-10 shrink-0 rounded-pill bg-line-strong/60 md:hidden" />
      <div className="flex shrink-0 items-start gap-2 px-4 pt-2 md:px-6 md:pt-5">
        <div className="min-w-0 flex-1 pt-2">
          {header ?? (
            <Drawer.Title
              ref={titleRef}
              tabIndex={-1}
              className={cn("font-display text-heading text-balance text-ink outline-none", titleClassName, titleHidden && "sr-only")}
            >
              {title}
            </Drawer.Title>
          )}
          {header && (
            <Drawer.Title ref={titleRef} tabIndex={-1} className="sr-only">
              {title}
            </Drawer.Title>
          )}
          {description && <Drawer.Description className="mt-1 text-body-sm text-ink-muted">{description}</Drawer.Description>}
        </div>
        <Drawer.Close
          aria-label={t("a11y.close")}
          className="-mr-2 grid size-11 shrink-0 place-items-center rounded-pill text-ink hover:bg-surface-sunken"
        >
          <X aria-hidden className="size-6" strokeWidth={2} />
        </Drawer.Close>
      </div>
      {stepKey !== undefined && (
        <p role="status" aria-live="polite" className="sr-only" data-step-live>
          {stepSaid}
        </p>
      )}
      <ScrollBody label={label ?? title}>{children}</ScrollBody>
      {footer && (
        <div className="shrink-0 border-t border-line bg-surface px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom)+var(--drawer-keyboard-inset,0px))] md:rounded-b-lg md:px-6 md:pb-6">
          {footer}
        </div>
      )}
    </Drawer.Popup>
  )
  const portal = (
    <Drawer.Portal>
      <Drawer.Backdrop className="fixed inset-0 z-40 min-h-dvh bg-(--pot-scrim) transition-opacity duration-[360ms] ease-standard data-starting-style:opacity-0 data-ending-style:opacity-0 motion-reduce:duration-[120ms]" />
      <Drawer.Viewport className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6">
        {popup}
      </Drawer.Viewport>
    </Drawer.Portal>
  )
  return (
    <Drawer.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
    >
      {keyboard ? <Drawer.VirtualKeyboardProvider>{portal}</Drawer.VirtualKeyboardProvider> : portal}
    </Drawer.Root>
  )
}

/**
 * [Back] in a multi-step sheet (the Create flow's pattern): a ghost button under the step's primary, so the one
 * marigold stays the primary. Never shown on a sheet's first step or once money is on its way.
 */
export function SheetBack({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button variant="ghost" className="w-full" onClick={onClick} disabled={disabled} data-sheet-back>
      <ChevronLeft aria-hidden strokeWidth={2} />
      {t("sheet.back")}
    </Button>
  )
}

/**
 * The sheet's scrolling body. When its content overflows (a long refund table at 200 % zoom), it becomes a
 * focusable, named region so keyboard users can scroll it (WCAG 2.1.1; axe scrollable-region-focusable).
 */
function ScrollBody({ children, label }: { children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [scrolls, setScrolls] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === "undefined") return
    const check = () => setScrolls(el.scrollHeight > el.clientHeight + 1)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    for (const c of el.children) ro.observe(c)
    return () => ro.disconnect()
  }, [])
  return (
    <div
      ref={ref}
      tabIndex={scrolls ? 0 : undefined}
      role={scrolls ? "region" : undefined}
      aria-label={scrolls ? label : undefined}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 md:px-6"
      data-base-ui-swipe-ignore
    >
      {children}
    </div>
  )
}
