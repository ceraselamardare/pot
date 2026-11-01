// AppShell (frontend-architecture §1.2, §2.1): a static, prerendered shell. The client decides signed in or not
// (SessionGate reads the session hint; no cookies() in layouts) and draws the tab bar / top bar, banners and the
// live region. usePathname() in a dynamic segment suspends during prerender, so the bars sit in <Suspense>.
import { Suspense, type ReactNode } from "react"
import { DemoBanner, LiveRegion, OfflineBanner, SessionGate, TabBar, TopBar } from "@/components/app-shell/Shell"
import { PwaHost } from "@/components/pwa/PwaHost"
import { ConfirmStepHost } from "@/components/features/devices/ConfirmStep"

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col pb-[calc(56px+env(safe-area-inset-bottom))] lg:pb-0">
      <OfflineBanner />
      <DemoBanner />
      <Suspense fallback={null}>
        <TopBar />
      </Suspense>
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
