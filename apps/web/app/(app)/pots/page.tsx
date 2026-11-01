// /pots: Pots home (ux-spec §4.3, design-direction 02 §1). ?sheet=create opens Create Pot.
import { Suspense } from "react"
import { PotsScreen } from "@/components/pot/PotsScreen"

export default function PotsPage() {
  return (
    <Suspense fallback={null}>
      <PotsScreen />
    </Suspense>
  )
}
