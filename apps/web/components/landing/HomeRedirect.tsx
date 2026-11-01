"use client"
// "/" sends a signed-in visitor to their Pots (frontend-architecture §2.1). On testnet it reads the pot_hint
// cookie; the mock reads its session.
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { useMe } from "@/lib/client/data"

export function HomeRedirect() {
  const me = useMe()
  const router = useRouter()
  useEffect(() => {
    if (me) router.replace("/pots")
  }, [me, router])
  return null
}
