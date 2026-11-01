"use client"
// Landing motion toolkit: the React side of the sequence engine (sequence.ts).
//  - <Sequences />: a marker for server components. Drop it once inside a section; after hydration it arms every
//    [data-sequence] container in its closest <section> (or its parent, with scope="parent"). Renders a hidden span.
//  - useSequences(ref): the same for a client component's own subtree.
// Both arm once on mount and, on unmount, put anything still pending back in its final state.
import { useEffect, useRef, type RefObject } from "react"
import { armSequencesIn, type SequenceOptions } from "./sequence"

export function useSequences(ref: RefObject<Element | null>, { threshold, stagger, startLine }: SequenceOptions = {}) {
  useEffect(() => armSequencesIn(ref.current, { threshold, stagger, startLine }), [ref, threshold, stagger, startLine])
}

export function Sequences({
  threshold,
  stagger,
  startLine,
  scope = "section",
}: SequenceOptions & {
  /** where to look for [data-sequence]: the closest <section> (default) or the marker's parent element */
  scope?: "section" | "parent"
}) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const marker = ref.current
    const root = scope === "parent" ? marker?.parentElement : (marker?.closest("section") ?? marker?.parentElement)
    return armSequencesIn(root, { threshold, stagger, startLine })
  }, [scope, threshold, stagger, startLine])
  return <span ref={ref} hidden data-sequences />
}
