// TanStack Query client (frontend-architecture §3.2): one singleton per tab, so actions (outside React) can
// invalidate and settle the same cache the hooks read. Never used on the server (no RSC prefetch of user data).
import { QueryClient } from "@tanstack/react-query"

const isTransient = (e: unknown): boolean => {
  const name = (e as { name?: string } | null)?.name ?? ""
  return name === "TypeError" || name === "AbortError" || name === "RpcTransportError" || name === "TimeoutError"
}

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 2_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        // the 3 s heartbeat pauses while the tab is hidden (D-32 budget, §3.3)
        refetchIntervalInBackground: false,
        retry: (n, e) => n < 2 && isTransient(e),
        networkMode: "online",
      },
      mutations: { retry: 0, networkMode: "online" },
    },
  })
}

let browserClient: QueryClient | null = null

/** The browser's QueryClient (created on first use). */
export function queryClient(): QueryClient {
  if (typeof window === "undefined") return makeQueryClient()
  browserClient ??= makeQueryClient()
  return browserClient
}
