// /demo: the simple tour (plan/design-direction/06): a cover, 14 steps in 5 parts and an end screen that leads to a
// real Pot. Static: the server HTML is the cover plus the whole story as an ordered list with each part's closed
// "Under the hood" (no JS needed to read it). It signs and sends nothing.
// Metadata from the marketing registry (pageMeta): its own title, description, share card and canonical "/demo".
import type { Metadata } from "next"
import { TourPage } from "@/components/demo/TourPage"
import { JsonLd } from "@/components/seo/JsonLd"
import { t } from "@/i18n/t"
import { pageMeta } from "@/lib/marketing/meta"
import { marketingPage } from "@/lib/marketing/pages"
import { breadcrumbs, graph, homeCrumb, webPage } from "@/lib/marketing/schema"

export const metadata: Metadata = pageMeta("/demo")

const page = marketingPage("/demo")
const STRUCTURED_DATA = graph(
  webPage({ path: page.path, name: t(page.titleKey), description: t(page.descriptionKey), dateModified: page.lastModified }),
  breadcrumbs([homeCrumb(), { name: t(page.titleKey), path: page.path }]),
)

export default function DemoPage() {
  return (
    <>
      <JsonLd data={STRUCTURED_DATA} />
      <TourPage initial={0} chapter={null} />
    </>
  )
}
