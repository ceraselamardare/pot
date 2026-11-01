// /demo: the simple tour (plan/design-direction/06): a cover, 14 steps in 5 parts and an end screen that leads to a
// real Pot. Static: the server HTML is the cover plus the whole story as an ordered list with each part's closed
// "Under the hood" (no JS needed to read it). It signs and sends nothing.
import type { Metadata } from "next"
import { TourPage } from "@/components/demo/TourPage"
import { t } from "@/i18n/t"

export const metadata: Metadata = {
  title: t("tour.meta.title"),
  description: t("tour.meta.description"),
  robots: { index: true, follow: true },
}

export default function DemoPage() {
  return <TourPage initial={0} chapter={null} />
}
