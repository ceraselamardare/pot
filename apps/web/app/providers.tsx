"use client"
// Client providers for the whole app: TanStack Query (one browser singleton per tab, shared with the actions in
// lib/client so they can invalidate and settle it) + the toaster. Chain/API data is fetched client-side; don't
// prefetch user data in RSC (Cache Components, KB).
// The sign-in dialog's host sits here so every page can open it (`?signin=1`, components/features/auth/SignInHost);
// it reads the search params, so it has its own <Suspense> and every route stays static.
import { QueryClientProvider } from "@tanstack/react-query"
import { Suspense, useState, type ReactNode } from "react"
import { SignInHost } from "@/components/features/auth/SignInHost"
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
      <Suspense fallback={null}>
        <SignInHost />
      </Suspense>
    </QueryClientProvider>
  )
}
