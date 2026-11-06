// The use-case pages and tools (components/marketing/MarketingShell.tsx has the how-to). Static: no request APIs.
// The landing's stylesheets: every rule is scoped under [data-landing], which the shell sets, so nothing reaches the app.
import "@/components/landing/home/motion/landing-motion.css"
import "@/components/landing/home/top.css"
import { MarketingShell } from "@/components/marketing/MarketingShell"

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <MarketingShell>{children}</MarketingShell>
}
