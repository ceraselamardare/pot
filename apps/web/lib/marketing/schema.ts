// schema.org JSON-LD for the marketing pages, rendered by components/seo/JsonLd.tsx. One `@graph` per page; the site's
// nodes have stable `@id`s (#org, #website, #webapp) so a page's nodes can point at them.
// Rules (technical SEO notes, 2026-11-06):
//  - the markup says only what the page shows: descriptions come from the same en.json strings as the visible copy;
//  - no ratings or reviews, ever (Pot has none; inventing them breaks Google's spam policy and this project's rules);
//  - no network: the Testnet badge (and /llms.txt's status line) says where Pot runs; never claim real money or mainnet;
//  - FAQPage only mirrors a FAQ that is visible on the same page (Google shows no FAQ result any more; Bing and AI
//    answer engines still read it).
import { t } from "@/i18n/t"
import { absoluteUrl, SITE } from "./site"

export type JsonLdNode = { "@type": string; "@id"?: string } & Record<string, unknown>
export interface JsonLdGraph {
  "@context": "https://schema.org"
  "@graph": JsonLdNode[]
}

/** The stable ids of the site-wide nodes. */
export const SCHEMA_ID = {
  org: () => absoluteUrl("/#org"),
  website: () => absoluteUrl("/#website"),
  webapp: () => absoluteUrl("/#webapp"),
} as const

const ref = (id: string) => ({ "@id": id })

/** Wrap nodes into one JSON-LD document. */
export function graph(...nodes: JsonLdNode[]): JsonLdGraph {
  return { "@context": "https://schema.org", "@graph": nodes }
}

/** Pot as an organization: name, logo, the founder and the source repo. */
export function organization(): JsonLdNode {
  return {
    "@type": "Organization",
    "@id": SCHEMA_ID.org(),
    name: SITE.name,
    alternateName: [...SITE.orgAlternateNames],
    url: absoluteUrl("/"),
    logo: { "@type": "ImageObject", url: absoluteUrl(SITE.logo), width: 512, height: 512 },
    founder: { "@type": "Person", name: SITE.founder },
    sameAs: [SITE.repo],
  }
}

/** The site, for the site name shown in results ("Pot" is an ambiguous word; alternateName helps). No SearchAction. */
export function website(): JsonLdNode {
  return {
    "@type": "WebSite",
    "@id": SCHEMA_ID.website(),
    name: SITE.name,
    alternateName: [...SITE.alternateNames],
    url: absoluteUrl("/"),
    inLanguage: SITE.language,
    publisher: ref(SCHEMA_ID.org()),
  }
}

/**
 * The app itself. For entity understanding only: without ratings it earns no rich result, and that's fine.
 * `free`: free to use (Pot covers the running costs); adds a $0 offer.
 */
export function webApplication(o: { description: string; free: boolean }): JsonLdNode {
  return {
    "@type": "WebApplication",
    "@id": SCHEMA_ID.webapp(),
    name: SITE.name,
    url: absoluteUrl("/"),
    description: o.description,
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    inLanguage: SITE.language,
    publisher: ref(SCHEMA_ID.org()),
    ...(o.free ? { isAccessibleForFree: true, offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } } : {}),
  }
}

/**
 * A free tool on the site (the group trip cost calculator): its own WebApplication, free to use (a $0 offer), made by
 * #org, on the page at `path` (`@id` = the page URL + #tool). No ratings.
 */
export function toolApplication(o: { path: string; name: string; description: string; category: "TravelApplication" | "UtilitiesApplication" }): JsonLdNode {
  return {
    "@type": "WebApplication",
    "@id": `${absoluteUrl(o.path)}#tool`,
    name: o.name,
    url: absoluteUrl(o.path),
    description: o.description,
    applicationCategory: o.category,
    operatingSystem: "Web",
    inLanguage: SITE.language,
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    publisher: ref(SCHEMA_ID.org()),
    isPartOf: ref(SCHEMA_ID.website()),
  }
}

/** One page of the site (a use-case page, the demo): part of #website, about #webapp, with its real dates. */
export function webPage(o: { path: string; name: string; description: string; dateModified: string; datePublished?: string }): JsonLdNode {
  return {
    "@type": "WebPage",
    "@id": `${absoluteUrl(o.path)}#page`,
    url: absoluteUrl(o.path),
    name: o.name,
    description: o.description,
    inLanguage: SITE.language,
    isPartOf: ref(SCHEMA_ID.website()),
    about: ref(SCHEMA_ID.webapp()),
    dateModified: o.dateModified,
    ...(o.datePublished ? { datePublished: o.datePublished } : {}),
  }
}

/** Home > … > this page. Each crumb is a visible page title and its path (absolute URLs are filled in). */
export function breadcrumbs(items: readonly { name: string; path: string }[]): JsonLdNode {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: absoluteUrl(it.path) })),
  }
}

/** The first crumb of every trail. */
export const homeCrumb = () => ({ name: t("app.name"), path: "/" })

/** A visible FAQ, question by question; each answer a standalone 1-2 sentence string (plain text). */
export function faqPage(o: { path: string; items: readonly { question: string; answer: string }[] }): JsonLdNode {
  return {
    "@type": "FAQPage",
    "@id": `${absoluteUrl(o.path)}#faq`,
    mainEntity: o.items.map((q) => ({
      "@type": "Question",
      name: q.question,
      acceptedAnswer: { "@type": "Answer", text: q.answer },
    })),
  }
}

/**
 * JSON for a `<script type="application/ld+json">`: `<`, `>` and `&` become \u escapes, so no string in the data can
 * close the script element or open a comment. Still valid JSON (and the same value once parsed).
 */
export function serializeJsonLd(data: JsonLdGraph | JsonLdNode): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
}
