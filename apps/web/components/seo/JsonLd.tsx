// Structured data for a marketing page (lib/marketing/schema.ts builds it). A server component: the JSON is in the
// prerendered HTML, so the page stays static. A native <script> (not next/script): JSON-LD is data, never executed,
// so the CSP's script-src doesn't apply to it. serializeJsonLd escapes `<`, so no value can close the element.
import { serializeJsonLd, type JsonLdGraph } from "@/lib/marketing/schema"

export function JsonLd({ data }: { data: JsonLdGraph }) {
  return (
    // eslint-disable-next-line react/no-danger -- JSON-LD data block, escaped by serializeJsonLd (not executable)
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />
  )
}
