"use client"
// /demo persona forms (F-15, frontend-architecture §2.6). Each is a real <form method="post"
// action="/api/demo/session"> with a hidden persona, so the page works without JavaScript (the route handler
// answers 303). With JS, the submit is handled here: the mock data source switches persona locally and opens
// the reference Pot; on testnet it's a fetch to the same route (so BotID sees the browser, rev4 H-5), which
// leases a seeded Pot for this visitor and opens it.
// ?as=maya|sam|leo auto-submits once, only when no non-demo session exists (rev4 L-5).
import { ArrowRight } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Avatar } from "@/components/pot/Avatar"
import { t } from "@/i18n/t"
import { PEOPLE, PERSONAS, type PersonaId } from "@/lib/client/mock/fixtures"
import { initialsOf } from "@/lib/client/mock/world"
import { sessionKind, signInDemo } from "@/lib/client/session"
import { cn } from "@/lib/client/cn"

const LABEL: Record<PersonaId, "demo.maya" | "demo.sam" | "demo.leo"> = { maya: "demo.maya", sam: "demo.sam", leo: "demo.leo" }
export function DemoPersonaForm({ persona, primary }: { persona: PersonaId; primary?: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const name = PEOPLE[persona].name
  return (
    <form
      method="post"
      action="/api/demo/session"
      aria-busy={busy || undefined}
      onSubmit={async (e) => {
        e.preventDefault()
        if (busy) return
        setBusy(true)
        try {
          router.push(await signInDemo(persona))
        } catch {
          toast.error(t("generic.error"))
          setBusy(false)
        }
      }}
    >
      <input type="hidden" name="persona" value={persona} />
      <button
        type="submit"
        data-persona={persona}
        className={cn(
          "flex min-h-16 w-full items-center gap-3 rounded-md border px-4 py-3 text-left transition-[background-color,transform] duration-120 ease-standard active:scale-[.98] motion-reduce:active:scale-100",
          primary
            ? "border-(--pot-brand-border) bg-brand text-on-brand active:bg-brand-deep"
            : "border-line-strong bg-surface text-ink hover:bg-surface-sunken",
        )}
      >
        <Avatar person={{ name, initials: initialsOf(name), joinIndex: PERSONAS.indexOf(persona) }} size="md" ring={primary ? undefined : "surface"} />
        <span className="flex-1 text-label">{t(LABEL[persona])}</span>
        <ArrowRight aria-hidden className="size-5" strokeWidth={2.25} />
      </button>
    </form>
  )
}

export function AutoPersona() {
  const params = useSearchParams()
  const router = useRouter()
  const done = useRef(false)
  const as = params.get("as")
  useEffect(() => {
    if (done.current || !as || !(PERSONAS as readonly string[]).includes(as)) return
    done.current = true
    void (async () => {
      // a non-demo session (a real account) blocks the auto-submit (rev4 L-5)
      const kind = await sessionKind()
      if (kind && kind !== "demo") return
      try {
        router.replace(await signInDemo(as as PersonaId))
      } catch {
        toast.error(t("generic.error"))
      }
    })()
  }, [as, router])
  return null
}

/** /demo?ro=1: a no-JS form post lands here (rev4 H-5): the interactive demo needs JavaScript. */
export function ReadonlyNotice() {
  const params = useSearchParams()
  if (params.get("ro") !== "1") return null
  return <p className="mb-6 rounded-md bg-surface-sunken p-3 text-body-sm text-ink">{t("demo.readonly")}</p>
}
