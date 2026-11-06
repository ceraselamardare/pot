"use client"
// /group-gift's "Wording to send": copies one ready-made message to the clipboard. A tiny island: the message itself
// is server-rendered text right above it (selectable without JS), and every string comes in as a prop, so this
// imports neither en.json nor anything else heavy. Hidden until hydrated: without JS there is nothing to copy with.
// "Copied" for 2 s, announced through its own polite status; if the browser refuses, it says so and the text stays
// selectable. A secondary button (the hero's [Start a Pot] is the page's one marigold).
import { Check, Copy } from "lucide-react"
import { useState, useSyncExternalStore } from "react"

const noop = () => () => {}

export function CopyMessage({
  text,
  label,
  done,
  failed,
  describedBy,
}: {
  /** the message to copy */
  text: string
  /** "Copy message" */
  label: string
  /** "Copied" */
  done: string
  /** "Couldn't copy. Select the text instead." */
  failed: string
  /** the id of the message's heading, so the button says which message it copies */
  describedBy: string
}) {
  const hydrated = useSyncExternalStore(noop, () => true, () => false)
  const [state, setState] = useState<"idle" | "done" | "failed">("idle")
  if (!hydrated) return null
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setState("done")
    } catch {
      setState("failed")
    }
    setTimeout(() => setState("idle"), 2000)
  }
  return (
    <button
      type="button"
      onClick={copy}
      aria-describedby={describedBy}
      className="inline-flex min-h-11 items-center gap-2 rounded-md border border-line-strong bg-surface px-4 text-label text-ink transition-[background-color] duration-120 hover:bg-surface-sunken"
      data-copy-message
    >
      {state === "done" ? <Check aria-hidden className="size-4 text-approved" strokeWidth={2} /> : <Copy aria-hidden className="size-4" strokeWidth={2} />}
      <span aria-live="polite">{state === "done" ? done : state === "failed" ? failed : label}</span>
    </button>
  )
}
