// AppShell (frontend-architecture §1.2, §2.1): a static, prerendered shell. The client decides signed in or not
// (SessionGate reads the session hint; no cookies() in layouts) and draws the tab bar / top bar, banners and the
// live region. usePathname() in a dynamic segment suspends during prerender, so the bars sit in <Suspense>.
// Never indexed: the app is per person (and /pots, /p/<anything> answer 200 with an empty shell for a crawler). The
// meta tag here, the X-Robots-Tag header (next.config.ts) and robots.txt's Disallow (app/robots.ts) say it three ways.
// The Testnet badge (components/brand/NetworkBadge; testnet builds only) is in the static shell, so it is in the
// first paint and never shifts anything: on phones a slim row above every screen's own header (the screens keep
// their titles and buttons to themselves), from bp-lg in the top bar next to the lockup (TopBar).
import type { Metadata } from "next"
import { Suspense, type ReactNode } from "react"
import { NetworkBadge } from "@/components/brand/NetworkBadge"
import { LiveRegion, OfflineBanner, SessionGate, TabBar, TopBar } from "@/components/app-shell/Shell"
import { PwaHost } from "@/components/pwa/PwaHost"
import { ConfirmStepHost } from "@/components/features/devices/ConfirmStep"
import { isTestnetBuild } from "@/lib/network"

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col pb-[calc(56px+env(safe-area-inset-bottom))] lg:pb-0">
      <OfflineBanner />
      <Suspense fallback={null}>
        <TopBar />
      </Suspense>
      {isTestnetBuild() ? (
        <div className="mx-auto flex w-full max-w-flow justify-end px-4 pt-2 md:max-w-app md:px-6 lg:hidden" data-network-strip>
          <NetworkBadge place="app" />
        </div>
      ) : null}
      <SessionGate>
        {children}
        <Suspense fallback={null}>
          <PwaHost />
        </Suspense>
        <ConfirmStepHost />
      </SessionGate>
      <Suspense fallback={null}>
        <TabBar />
      </Suspense>
      <LiveRegion />
    </div>
  )
}
