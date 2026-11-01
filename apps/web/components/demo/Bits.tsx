// Small shared pieces of the /demo explainer (05 §4.1-§4.2): the simulation labels, the hood card shell, the
// disclosures and the raw JSON block. Server components.
import { ChevronDown, FlaskConical, Info } from "lucide-react"
import { Fragment, type ReactNode } from "react"
import { Callout } from "@/components/feedback/States"
import { t } from "@/i18n/t"
import { cn } from "@/lib/client/cn"
import { CopyButton } from "./CopyButton"

/** Only when the PAGE is Night: the Night-scoped hood lifts one step (surface) and its cards one more (sunken). */
export const PAGE_NIGHT = {
  panel: "[html[data-theme=night]_&]:bg-surface",
  card: "[html[data-theme=night]_&]:bg-surface-sunken",
  inset: "[html[data-theme=night]_&]:bg-surface",
}

/** "Simulated": neutral ink on surface-sunken (not a state, so no state colour). */
export function SimChip({ className, label }: { className?: string; label?: string }) {
  return (
    <span
      data-sim-chip
      className={cn("inline-flex h-6 shrink-0 items-center rounded-pill bg-surface-sunken px-2 text-body-sm font-semibold whitespace-nowrap text-ink", className)}
    >
      {label ?? t("demo.sim.chip")}
    </span>
  )
}

/** The header pill on every demo page. */
export function SimPill() {
  return (
    <span className="inline-flex min-h-8 items-center gap-1.5 rounded-pill bg-surface-sunken px-3 py-1 text-label text-ink">
      <FlaskConical aria-hidden className="size-4" strokeWidth={2} />
      {t("demo.sim.pill")}
    </span>
  )
}

export function SimBanner({ className }: { className?: string }) {
  return (
    <Callout icon={<Info strokeWidth={2} />} className={className}>
      <p data-sim-banner>{t("demo.sim.banner")}</p>
    </Callout>
  )
}

const ACCOUNT = /^[a-z0-9_-]+(\.[a-z0-9_-]+)+$/

/** A NEAR account id ("lisbon-trip-7k2f.pots.potprev.testnet") breaks after its dots, never at a hyphen; anything
 *  else long (hashes, keys) breaks anywhere. Same text either way (copy-paste and search keep working). */
export function Breaks({ value }: { value: string }) {
  if (!ACCOUNT.test(value)) return <>{value}</>
  const parts = value.split(".")
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>
          <span className="whitespace-nowrap">{i < parts.length - 1 ? `${p}.` : p}</span>
          {i < parts.length - 1 ? <wbr /> : null}
        </Fragment>
      ))}
    </>
  )
}

/** An account id or hash: Figtree, tabular; account ids break at their dots, the rest anywhere inside a cell. */
export function Id({ value, short, className }: { value: string; short?: string; className?: string }) {
  return (
    <span className={cn("tabular-nums [overflow-wrap:anywhere]", className)} title={short ? value : undefined}>
      {short ?? <Breaks value={value} />}
    </span>
  )
}

/** A hood card: surface on the Night ground (sunken when the page is Night too), a heading row, then its body.
 *  `badge` is a small label chip that follows the title's last word ("Simulated values"); `meta` is a row of chips
 *  under the title (the signer's key); `aside` sits at the right edge (a status pill) and wraps under when narrow. */
export function HoodCard({
  id,
  icon,
  title,
  badge,
  meta,
  aside,
  children,
  className,
  ...rest
}: {
  id: string
  icon?: ReactNode
  title: ReactNode
  badge?: ReactNode
  meta?: ReactNode
  aside?: ReactNode
  children?: ReactNode
  className?: string
} & Omit<React.ComponentPropsWithoutRef<"section">, "title" | "id">) {
  return (
    <section
      {...rest}
      aria-labelledby={id}
      className={cn("@container/card min-w-0 rounded-md border border-line bg-surface p-4 text-ink md:p-5", PAGE_NIGHT.card, className)}
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        {icon ? <span className="grid shrink-0 place-items-center">{icon}</span> : null}
        <div className="flex min-w-[min(100%,11rem)] flex-1 flex-col gap-1.5 pt-0.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 id={id} className="font-display text-heading text-balance text-ink">
              {title}
            </h3>
            {badge ? <span className="flex shrink-0 items-center" data-card-badge>{badge}</span> : null}
          </div>
          {meta ? <div className="flex max-w-full min-w-0 flex-wrap items-center gap-2">{meta}</div> : null}
        </div>
        {aside ? <span className="flex max-w-full min-w-0 flex-wrap items-center gap-2 pt-0.5">{aside}</span> : null}
      </div>
      {children}
    </section>
  )
}

/** A round 32 px tile with one Lucide icon (the hood's non-person nodes). */
export function IconTile({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("grid size-8 shrink-0 place-items-center rounded-pill bg-surface-sunken text-ink [&_svg]:size-[1.125rem]", PAGE_NIGHT.inset, className)}>
      {children}
    </span>
  )
}

/** A disclosure in the hood: a 44 px summary row with a turning chevron. Native <details>, so it works without JS. */
export function Disclosure({ summary, children, className, ...rest }: { summary: ReactNode; children: ReactNode; className?: string } & React.ComponentPropsWithoutRef<"details">) {
  return (
    <details {...rest} className={cn("group/d mt-3 border-t border-line pt-1", className)}>
      <summary className="-mx-1 flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-sm px-1 text-label text-ink hover:bg-surface-sunken [&::-webkit-details-marker]:hidden">
        <ChevronDown aria-hidden className="size-4 shrink-0 -rotate-90 transition-transform duration-200 ease-standard group-open/d:rotate-0 motion-reduce:transition-none" strokeWidth={2} />
        {summary}
      </summary>
      <div className="pt-2 pb-1">{children}</div>
    </details>
  )
}

/** JSON keys in ink-muted, values in ink: no syntax rainbow (05 §4.1). */
function JsonLines({ json }: { json: string }) {
  return json.split("\n").map((line, i) => {
    const m = /^(\s*)("(?:[^"\\]|\\.)*")(: )(.*)$/.exec(line)
    return (
      <span key={i} className="block">
        {m ? (
          <>
            {m[1]}
            <span className="text-ink-muted">{m[2]}</span>
            {m[3]}
            {m[4]}
          </>
        ) : (
          line
        )}
      </span>
    )
  })
}

/** "Raw JSON" behind a closed disclosure: still text in the server HTML (AI judges), a scrollable, focusable region
 *  with a name, the system monospace stack (the brand has no code font; 05 open question 3), and a Copy button. */
export function RawJson({ value, label, extra }: { value: unknown; label: string; extra?: { label: string; text: string } }) {
  const json = JSON.stringify(value, null, 2)
  return (
    <Disclosure summary={t("demo.raw")} data-raw-json>
      <div data-raw className="flex flex-col gap-2">
        <div className="flex justify-end">
          <CopyButton />
        </div>
        <div
          role="region"
          tabIndex={0}
          aria-label={t("demo.raw.region", { label })}
          className="max-h-96 overflow-auto rounded-sm bg-surface-sunken p-3 [html[data-theme=night]_&]:bg-ground"
        >
          <pre className="font-mono text-[0.8125rem] leading-5 text-ink tabular-nums">
            <JsonLines json={json} />
          </pre>
        </div>
        {extra ? (
          <div className="flex flex-col gap-1">
            <p className="text-body-sm text-ink-muted">{extra.label}</p>
            <p className="rounded-sm bg-surface-sunken p-3 font-mono text-[0.8125rem] leading-5 break-all text-ink [html[data-theme=night]_&]:bg-ground">{extra.text}</p>
          </div>
        ) : null}
      </div>
    </Disclosure>
  )
}

/** A definition row: the plain name over the technical one; the value over its meaning (05 §4.4). */
export function Field({ name, tech, value, meaning, strong }: { name: string; tech?: string; value: ReactNode; meaning?: ReactNode; strong?: boolean }) {
  return (
    <div className="grid gap-x-4 gap-y-0.5 border-t border-line py-2.5 first:border-t-0 @[25rem]/card:grid-cols-[2fr_3fr]">
      <dt className="min-w-0">
        <span className="block text-body-sm text-ink">{name}</span>
        {tech ? <span className="block text-body-sm text-ink-muted [overflow-wrap:anywhere]">{tech}</span> : null}
      </dt>
      <dd className="min-w-0">
        <span className={cn("block text-body text-ink tabular-nums [overflow-wrap:anywhere]", strong && "font-semibold")}>
          {typeof value === "string" ? <Breaks value={value} /> : value}
        </span>
        {meaning ? <span className="block text-body-sm text-ink-muted">{meaning}</span> : null}
      </dd>
    </div>
  )
}
