// /demo/all, "How Pot works on NEAR (simulation)" (06 §5.2): the full technical read for judges and printing. The
// five parts in order, each chapter in its final state with every decoded card open, then the recap, the CLI block
// and every glossary word. Linked from each "Under the hood" sheet. Static.
// Metadata from the marketing registry (pageMeta): its own title, description, share card and canonical "/demo/all".
import type { Metadata } from "next"
import { DemoAll } from "@/components/demo/Chapter"
import { JsonLd } from "@/components/seo/JsonLd"
import { t } from "@/i18n/t"
import { pageMeta } from "@/lib/marketing/meta"
import { marketingPage } from "@/lib/marketing/pages"
import { breadcrumbs, graph, homeCrumb, webPage } from "@/lib/marketing/schema"

export const metadata: Metadata = pageMeta("/demo/all")

const page = marketingPage("/demo/all")
const tour = marketingPage("/demo")
const STRUCTURED_DATA = graph(
  webPage({ path: page.path, name: t(page.titleKey), description: t(page.descriptionKey), dateModified: page.lastModified }),
  breadcrumbs([homeCrumb(), { name: t(tour.titleKey), path: tour.path }, { name: t(page.titleKey), path: page.path }]),
)

export default function DemoAllPage() {
  return (
    <>
      <JsonLd data={STRUCTURED_DATA} />
      <DemoAll />
    </>
  )
}
