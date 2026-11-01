// A copy key that comes from the demo dataset (captionKey, labelKey, a note's key): looked up in en.json like any
// other key. Isomorphic and tiny, so client components can use it without pulling in the dataset.
import { t, type MessageKey } from "@/i18n/t"

export function tk(key: string, vars?: Record<string, string | number>): string {
  return (t as (k: MessageKey, v?: Record<string, string | number>) => string)(key as MessageKey, vars)
}
