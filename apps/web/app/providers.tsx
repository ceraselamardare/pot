"use client"
// Client providers for the whole app: TanStack Query (one browser singleton per tab, shared with the actions in
// lib/client so they can invalidate and settle it) + the toaster. Chain/API data is fetched client-side; don't
// prefetch user data in RSC (Cache Components, KB).
import { QueryClientProvider } from "@tanstack/react-query"
import { useState, type ReactNode } from "react"
import { SwBridge } from "@/components/pwa/SwBridge"
import { Toaster } from "@/components/ui/sonner"
import { queryClient } from "@/lib/client/query"

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(queryClient)
  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster />
      <SwBridge />
    </QueryClientProvider>
  )
}
