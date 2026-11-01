"use client"
// The chat's "is typing" dots on the landing (hero phone, problem chat): they pulse only while they are in view,
// for at most 4.8 s in total (WCAG 2.2.2, design-direction 04 §1-2), then rest for good.
//
// It wraps server-rendered content whose <TypingDots> are NOT `still` (ChatThread's `animateTyping`) and sets
// data-typing-pulse on itself; top.css does the rest:
//  - "idle" (the server HTML, no JS, reduced motion, before its turn): still, at the brand's still look (.6);
//  - "running": the brand's pulse (1200 ms, 150 ms apart), resting at .6, so it starts and ends on the still look;
//  - "paused": scrolled out of view mid-pulse, held where it was (the 4.8 s budget is spent only where it can be
//    seen); back in view, it continues;
//  - "done": budget spent, still again (a 200 ms settle).
// `delay` (ms): its turn. Inside a landing sequence (a [data-sequence] around or inside it), counted from the moment
// that sequence starts playing (the problem chat: Leo's dots at 1460 ms); a sequence that is skipped or was never
// armed lets it start at once. Without one, counted from page load (the hero's dots: 600 ms).
import { useEffect, useRef, useState } from "react"

const BUDGET_MS = 4800

type Pulse = "idle" | "running" | "paused" | "done"

export function TypingInView({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pulse, setPulse] = useState<Pulse>("idle")

  useEffect(() => {
    const root = ref.current
    // every set of dots inside (a layout may keep a second copy for another breakpoint: display:none never
    // intersects, so only the copy on screen counts)
    const dots = root ? [...root.querySelectorAll("[data-typing-dots]")] : []
    if (!root || dots.length === 0 || typeof IntersectionObserver === "undefined") return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const seq = root.closest<HTMLElement>("[data-sequence]") ?? root.querySelector<HTMLElement>("[data-sequence]")
    const inView = new Set<Element>()
    let playAt: number | null = null
    let spent = 0
    let since: number | null = null
    let finished = false
    let budget: ReturnType<typeof setTimeout> | undefined
    let turn: ReturnType<typeof setTimeout> | undefined

    /** the earliest moment (performance.now()) the dots may pulse, or null while their sequence is still armed */
    const startAt = (): number | null => {
      if (!seq) return delay
      const state = seq.getAttribute("data-seq-state")
      if (state === "armed") return null
      if (state === "play") return (playAt ??= performance.now()) + delay
      return playAt === null ? 0 : playAt + delay // played (its turn is past) or skipped: now
    }

    const pause = () => {
      if (since === null) return
      spent += performance.now() - since
      since = null
      clearTimeout(budget)
      setPulse("paused")
    }

    const update = () => {
      if (finished) return
      clearTimeout(turn)
      const at = startAt()
      if (inView.size === 0 || at === null) return pause()
      const wait = at - performance.now()
      if (wait > 0) {
        turn = setTimeout(update, wait)
        return pause()
      }
      if (since !== null) return
      since = performance.now()
      setPulse("running")
      budget = setTimeout(() => {
        finished = true
        setPulse("done")
        stop()
      }, BUDGET_MS - spent)
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          // fully on screen (and not clipped by the hero's crop)
          if (e.isIntersecting && e.intersectionRatio > 0.98) inView.add(e.target)
          else inView.delete(e.target)
        }
        update()
      },
      { threshold: [0, 1] },
    )
    for (const d of dots) io.observe(d)

    // its sequence: armed → play (its clock starts) → removed (final)
    const mo = new MutationObserver(() => {
      if (seq?.getAttribute("data-seq-state") === "play") playAt ??= performance.now()
      update()
    })
    if (seq) mo.observe(seq, { attributes: true, attributeFilter: ["data-seq-state"] })

    function stop() {
      io.disconnect()
      mo.disconnect()
      clearTimeout(budget)
      clearTimeout(turn)
    }
    return stop
  }, [delay])

  return (
    <div ref={ref} data-typing-pulse={pulse} className={className}>
      {children}
    </div>
  )
}
