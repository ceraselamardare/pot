// Landing motion toolkit: the money roll (ux-spec §7.6 duration-count: 500 ms, ease-standard) and its easing.
// Pure DOM, no React: it rewrites a text node once per animation frame, so nothing re-renders, and the string always
// comes from the formatter MoneyText uses (tabular figures). When the digit count changes ($366.00 → $66.00) a ghost
// keeps the final width (amountWriter). Used by the sequence engine (`data-seq="roll"`, see RollingMoney.tsx) and by
// LiveMoney (a state change). Under reduced motion the callers never start a roll: the number swaps instantly.
import { formatSigned, formatUsd, type Micro, type MoneyStyle } from "@/lib/client/money"

/** A CSS cubic-bezier() as a function of progress (Newton's method, bisection fallback). */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (p: number) => number {
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by
  const x = (t: number) => ((ax * t + bx) * t + cx) * t
  const y = (t: number) => ((ay * t + by) * t + cy) * t
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx
  return (p) => {
    if (p <= 0) return 0
    if (p >= 1) return 1
    let t = p
    for (let i = 0; i < 8; i++) {
      const err = x(t) - p
      if (Math.abs(err) < 1e-6) return y(t)
      const d = dx(t)
      if (Math.abs(d) < 1e-6) break
      t -= err / d
      if (t < 0 || t > 1) break
    }
    let lo = 0
    let hi = 1
    t = p
    for (let i = 0; i < 40; i++) {
      const v = x(t)
      if (Math.abs(v - p) < 1e-6) break
      if (v < p) lo = t
      else hi = t
      t = (lo + hi) / 2
    }
    return y(t)
  }
}

/** `--ease-standard` (globals.css, ux-spec §7.6) */
export const easeStandard = cubicBezier(0.2, 0, 0, 1)
/** duration-count */
export const ROLL_MS = 500
const DOLLAR = 1_000_000n

/** How MoneyText renders the amount: a style ("$450.00" / "$150") or a sign ("+ $150.00" / "− $84.00"). */
export type MoneyFormat = MoneyStyle | "in" | "out"

/** The exact string MoneyText shows for `m` in this format. */
export function moneyString(m: Micro, format: MoneyFormat = "fixed"): string {
  return format === "in" || format === "out" ? formatSigned(m, format) : formatUsd(m, format)
}

/** The text node an amount lives in: [data-money]'s, else a GoalBar's sentence ([data-goal-text]), else the
 *  element's own first text node. */
export function amountTextNode(el: Element): Text | null {
  const host = el.matches("[data-money], [data-goal-text]") ? el : (el.querySelector("[data-money], [data-goal-text]") ?? el)
  const node = host.firstChild
  return node && node.nodeType === 3 ? (node as Text) : null
}

/** Where a roll writes. `text` is the final text (what the server or React rendered when the writer was made);
 *  `release()` removes a ghost (the real amount shows again) and is a no-op otherwise: it never writes, because by
 *  then React may already have rendered a newer amount into the node. */
export interface AmountWriter {
  readonly text: string
  write(s: string): void
  release(): void
}

/**
 * A writer for the amount inside `el`. With `ghost`, the real amount is hidden (visibility: hidden, so it keeps the
 * FINAL width and nothing around it moves: CLS 0 when the digit count changes, $366.00 → $66.00) and an
 * aria-hidden copy, absolutely positioned over it and aligned to its `start` or `end`, shows the rolling value.
 * `el` must be a wrapper around the amount (RollingMoney / LiveMoney render one), not the amount itself.
 */
export function amountWriter(el: Element, { ghost }: { ghost?: "start" | "end" | null } = {}): AmountWriter | null {
  const node = amountTextNode(el)
  if (!node) return null
  const text = node.nodeValue ?? ""
  const host = node.parentElement
  if (!ghost || !host || host === el || !(el instanceof HTMLElement)) {
    return {
      text,
      write: (s) => void (node.nodeValue !== s && (node.nodeValue = s)),
      release: () => {},
    }
  }
  const copy = host.cloneNode(true) as HTMLElement
  copy.removeAttribute("data-money")
  copy.removeAttribute("id")
  copy.setAttribute("aria-hidden", "true")
  copy.setAttribute("data-roll-ghost", "")
  // An end-aligned copy with only `right:0` moves its left edge (and its text node) whenever the rolling text gains
  // or loses a digit, which Chrome counts as a layout shift. Pinned to both edges and set right-to-left, its box and
  // its text's start corner stay put (CLS 0, measured by motion-story). Only for unsigned amounts: "$366.00" is all
  // European-number class and still reads left to right, but a sign ("− $84.00") could reorder under rtl.
  const pinned = ghost === "end" && !/[+−-]/.test(text)
  const align = pinned ? "left:0;right:0;direction:rtl;text-align:right" : ghost === "end" ? "right:0" : "left:0"
  copy.style.cssText += `;position:absolute;top:0;${align};white-space:nowrap;pointer-events:none`
  const copyNode = copy.firstChild as Text
  const restoreEl = keepStyle(el)
  const restoreHost = keepStyle(host)
  if (getComputedStyle(el).position === "static") el.style.position = "relative"
  // The wrapper too: when the ghost starts on a live amount (LiveMoney: React has just rendered the final, shorter
  // amount), the wrapper takes the final width at once, and an end-aligned box that narrows moves its left edge, a
  // layout shift nobody tapped for (motion-QA: the playground's $150.00 → $66.00, 0.00015). Right-to-left, its start
  // corner is its right edge, which stays put. Its only content is the amount (hidden) and the copy, so nothing reorders.
  if (pinned) el.style.direction = "rtl"
  host.style.visibility = "hidden"
  el.appendChild(copy)
  return {
    text,
    write: (s) => void (copyNode.nodeValue !== s && (copyNode.nodeValue = s)),
    release: () => {
      copy.remove()
      restoreHost()
      restoreEl()
    },
  }
}

/** Snapshot an element's inline style; the returned function puts it back exactly (no stray style=""). */
export function keepStyle(el: HTMLElement): () => void {
  const before = el.getAttribute("style")
  return () => (before === null ? el.removeAttribute("style") : el.setAttribute("style", before))
}

/** The text to show for amount `m`, given the final text: the amount itself, or the final sentence with its first
 *  copy of the final amount swapped ("$300 of $450 collected" on the way to "$450 of $450 collected"). */
export function amountText(final: string, to: Micro, format: MoneyFormat): (m: Micro) => string {
  const toStr = moneyString(to, format)
  const at = final.indexOf(toStr)
  if (final === toStr || at < 0) return (m) => moneyString(m, format)
  return (m) => final.slice(0, at) + moneyString(m, format) + final.slice(at + toStr.length)
}

export interface Roll {
  /** stop now; `jump` (default) writes the final text, `false` leaves the text as it is */
  stop(jump?: boolean): void
  /** resolves when the roll ends or is stopped */
  done: Promise<void>
}

/**
 * Rolls `w` from `from` to `to` over `ms` (ease-standard), one write per animation frame, and ends on exactly
 * `w.text`. It doesn't release the writer: the caller does (so a ghost can stay for an "armed" pose).
 */
export function rollMoney(
  w: AmountWriter,
  from: Micro,
  to: Micro,
  {
    ms = ROLL_MS,
    format = "fixed",
    onFrame,
    onEnd,
  }: { ms?: number; format?: MoneyFormat; onFrame?: (m: Micro) => void; onEnd?: () => void } = {},
): Roll {
  const render = amountText(w.text, to, format)
  let raf = 0
  let resolve = () => {}
  const done = new Promise<void>((r) => (resolve = r))
  let over = false
  const finish = (jump: boolean) => {
    if (over) return
    over = true
    cancelAnimationFrame(raf)
    if (jump) {
      w.write(w.text)
      onFrame?.(to)
    }
    onEnd?.()
    resolve()
  }
  if (from === to || ms <= 0) {
    finish(true)
    return { stop: () => {}, done }
  }
  w.write(render(from))
  const delta = Number(to - from)
  let t0 = -1
  const step = (now: number) => {
    if (t0 < 0) t0 = now
    const p = (now - t0) / ms
    if (p >= 1) return finish(true)
    let m = from + BigInt(Math.round(delta * easeStandard(p)))
    // sentences and buttons say whole dollars ("$300 of $450"), so a whole-dollar roll steps in dollars, not cents
    if (format === "whole") m = ((m + DOLLAR / 2n) / DOLLAR) * DOLLAR
    w.write(render(m))
    onFrame?.(m)
    raf = requestAnimationFrame(step)
  }
  raf = requestAnimationFrame(step)
  return { stop: (jump = true) => finish(jump), done }
}
