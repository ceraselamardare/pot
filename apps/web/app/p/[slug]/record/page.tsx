// /p/[slug]/record: the public Pot record (hub 1.1.0 get_record). Outside the (app) shell on purpose: anyone with the
// link can read it, signed in or not (no SessionGate, no tab bar). A static shell + <Suspense> around the client
// screen, which reads useParams() (Cache Components) and the record (chain views; names for members only).
import type { Metadata } from "next"
import { Suspense } from "react"
import { RecordScreen } from "@/components/record/RecordScreen"
import { t } from "@/i18n/t"

export const metadata: Metadata = {
  title: t("record.label"),
  description: t("record.intro"),
  robots: { index: false, follow: false },
}

export default function RecordPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-ground">
      <Suspense fallback={null}>
        <RecordScreen />
      </Suspense>
    </div>
  )
}
