// CLI-7 (security audit 2026-11-04): a link's #secret (an invite, a payment link) is a bearer secret. The page keeps a
// copy in this tab's sessionStorage (so a sign-in redirect can't lose it) and, as soon as that copy is there, takes the
// fragment out of the address bar: a failed or abandoned join no longer leaves the secret in the URL, the tab's
// history, a screenshot or a "share this page". Before this, it was stripped only after a successful join / claim.

/**
 * Remove the URL's #fragment when `secretInUrl` is exactly what `stashKey` holds in sessionStorage. Without a safe
 * copy (storage blocked) the fragment stays, so the page still works. Returns whether it stripped.
 */
export function stripStashedFragment(stashKey: string, secretInUrl: string | null): boolean {
  if (typeof window === "undefined" || !secretInUrl || window.location.hash.length <= 1) return false
  let kept: string | null = null
  try {
    kept = sessionStorage.getItem(stashKey)
  } catch {
    return false
  }
  if (kept !== secretInUrl) return false
  // keep the router's history state; only the fragment goes
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`)
  return true
}

/** Forget a stashed secret (a terminal answer: the link is used up, expired, invalid or the Pot is closed). */
export function forgetStashedSecret(stashKey: string): void {
  try {
    sessionStorage.removeItem(stashKey)
  } catch {
    /* nothing kept */
  }
}
