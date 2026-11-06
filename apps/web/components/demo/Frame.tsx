// Every /demo page's frame: the `data-demo` scope (demo.css), a sticky header with the lockup (home) and the
// "Simulation" pill (05 §4.2), and the page body. The header is 56 px (64 px from lg), solid `ground`. The Testnet
// badge (testnet builds only) rides after the lockup, like the site header's (from 360 px: below, the row is the
// lockup and the Simulation pill).
import "./demo.css"
import Link from "next/link"
import type { ReactNode } from "react"
import { Lockup } from "@/components/brand/Lockup"
import { NetworkBadge } from "@/components/brand/NetworkBadge"
import { t } from "@/i18n/t"
import { SimPill } from "./Bits"
import { JsMark } from "./JsMark"

export function DemoFrame({ children }: { children: ReactNode }) {
  return (
    <div data-demo className="min-h-dvh bg-ground">
      <JsMark />
      <header className="sticky top-0 z-40 border-b border-line bg-ground">
        <div className="mx-auto flex h-14 w-full max-w-app items-center justify-between gap-3 px-4 md:px-6 lg:h-16">
          <div className="flex min-w-0 items-center gap-2">
            <Link href="/" aria-label={t("home.nav.home")} className="-ml-1 inline-flex min-h-11 shrink-0 items-center rounded-md px-1">
              <Lockup className="h-9 w-auto lg:h-10" />
            </Link>
            <NetworkBadge place="demo" className="max-xs:hidden" />
          </div>
          <SimPill />
        </div>
      </header>
      {children}
    </div>
  )
}
