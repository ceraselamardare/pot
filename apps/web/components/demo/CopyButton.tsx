"use client"
// Copies the text of the <pre> in the same disclosure (so the JSON is never shipped twice). "Copied" for 2 s,
// announced through its own polite status. Hidden until hydrated: without JS there is nothing to copy with.
import { Check, Copy } from "lucide-react"
import { useRef, useState } from "react"
import { t } from "@/i18n/t"
import { useHydrated } from "./Glossary"

export function CopyButton({ label }: { label?: string }) {
  const hydrated = useHydrated()
  const ref = useRef<HTMLButtonElement>(null)
  const [done, setDone] = useState(false)
  if (!hydrated) return null
  const copy = async () => {
    const pre = ref.current?.closest("[data-raw]")?.querySelector("pre")
    if (!pre) return
    try {
      await navigator.clipboard.writeText(pre.textContent ?? "")
      setDone(true)
      setTimeout(() => setDone(false), 2000)
    } catch {
      /* clipboard refused: the text stays selectable */
    }
  }
  return (
    <button
      ref={ref}
      type="button"
      onClick={copy}
      aria-label={label ?? t("demo.copy.label")}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-sm px-2 text-label text-ink transition-[background-color] duration-120 hover:bg-surface-sunken"
    >
      {done ? <Check aria-hidden className="size-4" strokeWidth={2} /> : <Copy aria-hidden className="size-4" strokeWidth={2} />}
      <span aria-live="polite">{done ? t("demo.copied") : t("demo.copy")}</span>
    </button>
  )
}
