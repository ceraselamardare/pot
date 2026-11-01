// Inline markup in the demo's copy (en.json `demo.*`): `[[id|words]]` = a glossary term, `[words]` = the aha
// line's brand-soft highlight (rules words only, as on the landing), `**words**` = bold. `plain()` strips it all
// (the beat bar, the live region, document titles).
import { Fragment, type ReactNode } from "react"
import { GlossaryTerm } from "./Glossary"

const TOKEN = /\[\[([a-z_0-9]+)\|([^\]]+)\]\]|\*\*([^*]+)\*\*|\[([^\]]+)\]/g

export function plain(s: string): string {
  return s.replace(TOKEN, (_m, _id, term, bold, mark) => term ?? bold ?? mark ?? "")
}

export function Rich({ text, anchorPrefix }: { text: string; anchorPrefix?: string }) {
  const out: ReactNode[] = []
  let last = 0
  let i = 0
  for (const m of text.matchAll(TOKEN)) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const [, id, term, bold, mark] = m
    if (id && term)
      out.push(
        <GlossaryTerm key={i++} id={id} anchorPrefix={anchorPrefix}>
          {term}
        </GlossaryTerm>,
      )
    else if (bold) out.push(<strong key={i++} className="font-semibold text-ink">{bold}</strong>)
    else if (mark)
      out.push(
        <mark key={i++} className="rounded-xs bg-brand-soft px-0.5 text-ink [box-decoration-break:clone]">
          {mark}
        </mark>,
      )
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return <Fragment>{out}</Fragment>
}
