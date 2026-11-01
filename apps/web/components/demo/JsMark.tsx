"use client"
// Marks the demo's root once hydrated (data-js="on"), so CSS can tell the server/no-JS frame (static marks, every
// card open) from the live player (motion). It only writes an attribute: nothing renders from it.
import { useEffect } from "react"

export function JsMark() {
  useEffect(() => {
    // every demo root on the page (Next keeps the previous page's DOM, hidden, after a client navigation)
    document.querySelectorAll<HTMLElement>("[data-demo]").forEach((root) => root.setAttribute("data-js", "on"))
  }, [])
  return null
}
