// Whether this page is served from the computer it's opened on (`next dev` / `next start` on localhost). NEAR Auth's
// shared testnet client accepts only http://localhost:3000 as its callback (kb/near-auth.md), so a hosted build shows
// Google switched off with the reason (components/features/auth/GoogleLocalOnly.tsx). Its own module so tests can
// stand in for a hosted page.
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"]

export function isLocalHost(): boolean {
  return typeof window !== "undefined" && LOCAL_HOSTS.includes(window.location.hostname)
}
