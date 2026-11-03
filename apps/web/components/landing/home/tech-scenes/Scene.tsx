// The stage every "Each part, up close" scene plays on (plan/design-direction/08-tech-bento.md, v2): a `ground` well of
// one fixed height, so the scenes of a row line up, with a 1 px `line` edge and overflow clipped (pills enter from
// off stage). One sentence for screen readers (`role="img"` + its label); everything inside is decorative, hidden
// and inert. The stage is its own size container, so a scene's layout and travel answer to the stage (`cqw`), never
// to the viewport.
// Motion (bento.css): the server HTML is each scene's END frame, the one that explains it. Only once SceneLoops
// (the bento's client island) marks the list with `data-scenes` do the `.sc` parts get their loop, which starts on
// that same end frame, so arming it changes nothing on screen; a scene plays only while it is on screen
// (`data-play`). No JS or reduced motion: the end frame, still.
import type { ReactNode } from "react"
import { cn } from "@/lib/client/cn"

export type SceneId = "auth" | "relayer" | "hub" | "majority" | "dao" | "money"

export function Scene({ id, label, className, children }: { id: SceneId; label: string; className?: string; children: ReactNode }) {
  return (
    <div
      role="img"
      aria-label={label}
      data-scene={id}
      data-tech-visual={id}
      className={cn("relative h-30 overflow-hidden rounded-md border border-line bg-ground", className)}
    >
      <div aria-hidden inert className="absolute inset-0">
        {children}
      </div>
    </div>
  )
}
