"use client"
// The brand's one celebration (brand README §8, frontend-architecture §7.4): a 600 ms marigold burst from the
// centre of its (relative) parent, once. 12 particles, 6-8 px, `brand` and `brand-deep`, travelling 40-72 px.
// Only for "Approved by Pot rules" on the requester's own request: never on load, never for group approvals.
// aria-hidden, no pointer events; renders nothing under prefers-reduced-motion.
import { useReducedMotion } from "@/lib/client/browser"

const PARTICLES = Array.from({ length: 12 }, (_, i) => {
  const angle = (i / 12) * Math.PI * 2 + (i % 2 ? 0.18 : -0.12)
  const dist = 40 + ((i * 37) % 33) // 40-72 px, deterministic
  return {
    dx: `${Math.round(Math.cos(angle) * dist)}px`,
    dy: `${Math.round(Math.sin(angle) * dist)}px`,
    size: i % 3 === 0 ? 8 : i % 3 === 1 ? 7 : 6,
    deep: i % 4 === 0,
  }
})

export function Celebration({ play }: { play: boolean }) {
  const reduced = useReducedMotion()
  if (!play || reduced) return null
  return (
    <span aria-hidden data-celebration className="pointer-events-none absolute inset-0 z-10 overflow-visible">
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className={`pot-particle absolute top-1/2 left-1/2 rounded-pill ${p.deep ? "bg-brand-deep" : "bg-brand"}`}
          style={{ width: p.size, height: p.size, ["--dx" as string]: p.dx, ["--dy" as string]: p.dy }}
        />
      ))}
    </span>
  )
}
