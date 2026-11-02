"use client"
// Gift addresses and the Share / Copy pair (the invite sheet's pattern: Web Share with the message, else copy).
import { useCallback, useState, useSyncExternalStore } from "react"
import { toast } from "sonner"
import { t } from "@/i18n/t"

/** /g/<slug>/<id>: a gift link's landing. */
export const giftLinkUrl = (origin: string, slug: string, id: string) => `${origin}/g/${slug}/${id}`
/** /give/<slug>: the public gift page. */
export const giftPageUrl = (origin: string, slug: string) => `${origin}/give/${slug}`

const noop = () => () => {}
export function useOrigin(): string {
  return useSyncExternalStore(noop, () => window.location.origin, () => "")
}

/** Copy (with an in-place "Link copied" for 2 s) and Share (Web Share with `message`, else copy). */
export function useShareLink(link: string, message: string) {
  const [copied, setCopied] = useState(false)
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast(t("share.copy_failed"))
    }
  }, [link])
  const share = useCallback(async () => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ text: message })
        return
      } catch (e) {
        if ((e as Error).name === "AbortError") return
      }
    }
    await copy()
  }, [message, copy])
  return { copy, share, copied }
}
