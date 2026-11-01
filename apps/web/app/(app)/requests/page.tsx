// /requests: everything waiting on you across Pots (ux-spec §4.11, design-direction 02 §5b).
import { Suspense } from "react"
import { RequestsScreen } from "@/components/pot/RequestsScreen"

export default function RequestsPage() {
  return (
    <Suspense fallback={null}>
      <RequestsScreen />
    </Suspense>
  )
}
