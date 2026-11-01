// /demo/all, "How Pot works on NEAR (simulation)" (06 §5.2): the full technical read for judges and printing. The
// five parts in order, each chapter in its final state with every decoded card open, then the recap, the CLI block
// and every glossary word. Linked from each "Under the hood" sheet. Static.
import type { Metadata } from "next"
import { DemoAll } from "@/components/demo/Chapter"
import { t } from "@/i18n/t"

export const metadata: Metadata = {
  title: t("demo.all.title"),
  description: t("demo.meta.description"),
}

export default function DemoAllPage() {
  return <DemoAll />
}
