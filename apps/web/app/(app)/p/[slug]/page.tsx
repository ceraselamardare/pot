// /p/[slug]: the Pot (frontend-architecture §2.1). A static shell + <Suspense> around the client PotScreen,
// which reads useParams() and the sheet query state (?sheet, ?r, ?tab).
import { Suspense } from "react"
import { PotSkeleton } from "@/components/feedback/States"
import { PotScreen } from "@/components/pot/PotScreen"

export default function PotPage() {
  return (
    <Suspense fallback={<PotSkeleton />}>
      <PotScreen />
    </Suspense>
  )
}
