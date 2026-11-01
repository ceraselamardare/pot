// The landing page's section grammar (plan/design-direction/03-landing.md, "Rhythm and layout"), shared by every
// section so they line up: a full-bleed band (ground, a sunken "play area", or a Night-scoped "x-ray" band) around
// a max-w-app column, and one head style (eyebrow → H2 → intro).
//
// The Night band sets data-theme="night" on the <section>: app/tokens.css defines Night on [data-theme="night"],
// so every token (and the lockup's wordmark swap in globals.css) switches inside it, in Day and Night alike.
import { cn } from "@/lib/client/cn"

type Band = "ground" | "sunken" | "night"

const BAND: Record<Band, string> = {
  ground: "bg-ground",
  sunken: "bg-surface-sunken",
  night: "bg-ground text-ink",
}

export function Section({
  id,
  labelledBy,
  band = "ground",
  className,
  innerClassName,
  children,
}: {
  /** the anchor (#how, #rules, #tech). An anchor jump lands the band's top edge exactly under the sticky header
   *  (scroll-mt = the header's height, 56 px, 64 px from lg; its 1 px rule covers the seam), so no strip of the
   *  previous section shows and py-12 gives the heading its air (WCAG 2.4.11). Keep in step with SiteHeader. */
  id?: string
  /** the id of the section's H2 */
  labelledBy: string
  band?: Band
  className?: string
  /** classes for the max-w-app column */
  innerClassName?: string
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      data-theme={band === "night" ? "night" : undefined}
      className={cn("scroll-mt-14 overflow-x-clip py-12 lg:scroll-mt-16", BAND[band], className)}
    >
      <div className={cn("mx-auto w-full max-w-app px-4 md:px-6", innerClassName)}>{children}</div>
    </section>
  )
}

export function SectionHead({
  id,
  eyebrow,
  title,
  intro,
  align = "start",
  className,
}: {
  /** the H2's id, which the Section's labelledBy points at */
  id: string
  eyebrow?: string
  title: React.ReactNode
  intro?: React.ReactNode
  align?: "start" | "center"
  className?: string
}) {
  return (
    <div className={cn("mb-6 lg:mb-8", align === "center" && "mx-auto text-center", className)}>
      {eyebrow ? <p className="text-label text-ink-muted">{eyebrow}</p> : null}
      <h2 id={id} className={cn("font-display text-title text-balance text-ink", eyebrow && "mt-2")}>
        {title}
      </h2>
      {intro ? (
        <p className={cn("mt-3 max-w-flow text-body text-ink-muted", align === "center" && "mx-auto")}>{intro}</p>
      ) : null}
    </div>
  )
}
