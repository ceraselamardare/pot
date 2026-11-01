// /demo/1 … /demo/6 (the landing links /demo/4): the same tour as /demo, opened at the old chapter's first step
// (06 §3.8: 1 → 1, 2 → 3, 3 → 4, 4 → 6, 5 → 8, 6 → 12), with /demo as the canonical. Static: every param is listed in
// generateStaticParams, so the top-level `await params` prerenders. A legacy #beat-k maps to the nearest step.
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { TourPage } from "@/components/demo/TourPage"
import { TOUR_CHAPTER_START, type TourChapter } from "@/components/demo/tour"
import { t } from "@/i18n/t"

export function generateStaticParams() {
  return ["1", "2", "3", "4", "5", "6"].map((chapter) => ({ chapter }))
}

export const metadata: Metadata = {
  title: t("tour.meta.title"),
  description: t("tour.meta.description"),
  alternates: { canonical: "/demo" },
  robots: { index: true, follow: true },
}

export default async function DemoChapterPage({ params }: PageProps<"/demo/[chapter]">) {
  const { chapter } = await params
  if (!/^[1-6]$/.test(chapter)) notFound()
  const n = Number(chapter) as TourChapter
  return <TourPage initial={TOUR_CHAPTER_START[n]} chapter={n} />
}
