// /llms.txt: the Markdown summary from lib/marketing/llms.ts. No request APIs, so it's prerendered at build like
// sitemap.xml (Cache Components).
import { llmsTxt } from "@/lib/marketing/llms"

export function GET() {
  return new Response(llmsTxt(), { headers: { "Content-Type": "text/plain; charset=utf-8" } })
}
