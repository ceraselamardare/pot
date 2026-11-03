"use client"
// You → "Your instant limits" (hub 1.1.0 earned trust): per Pot with trust on, what you can spend without asking
// and how many paid spends to the next level. Hidden when no Pot of yours has trust on.
import Link from "next/link"
import { MyTrustCard } from "@/components/wave4/Trust"
import { t } from "@/i18n/t"
import { usePots } from "@/lib/client/data"

export function YourTrust() {
  const pots = usePots()
  const mine = (pots ?? []).filter((p) => p.status === "open" && p.myTrust?.enabled)
  if (mine.length === 0) return null
  return (
    <section aria-labelledby="you-trust" className="mt-6" data-you-trust>
      <h2 id="you-trust" className="mb-2 px-1 text-label text-ink-muted">
        {t("trust.you.title")}
      </h2>
      <ul className="flex flex-col gap-2">
        {mine.map((p) => (
          <li key={p.slug} className="list-none">
            <Link href={`/p/${p.slug}?tab=settings`} className="block rounded-md hover:opacity-90">
              <MyTrustCard trust={p.myTrust!} potName={p.name} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
