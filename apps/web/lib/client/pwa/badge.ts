// Badging API (frontend-architecture §8.5; F-23): the app icon shows how many requests wait on you.
// iOS: only for the Home Screen app with notification permission; elsewhere only when installed. Android Chrome
// has no setAppBadge (its launcher dot comes from notifications). Feature-detected and silent otherwise.

export function badgeAllowed(env: { hasApi: boolean; ios: boolean; standalone: boolean; permission: string }): boolean {
  if (!env.hasApi) return false
  return env.ios ? env.standalone && env.permission === "granted" : env.standalone
}

type BadgeNavigator = Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }

/** Set or clear the badge; never throws. */
export async function applyBadge(n: number, nav: BadgeNavigator = navigator as BadgeNavigator): Promise<void> {
  try {
    if (n > 0) await nav.setAppBadge?.(n)
    else await nav.clearAppBadge?.()
  } catch {
    /* permission or platform: silent (§8.5) */
  }
}
