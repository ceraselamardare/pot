"use client"
// useTheme(): a useSyncExternalStore over <html data-theme> (MutationObserver) and prefers-color-scheme
// (frontend-architecture §7.1). Backs You -> Settings -> Appearance and the sonner Toaster theme.
// No next-themes: a ThemeProvider would add a second head script.
import { useCallback, useSyncExternalStore } from "react"
import { THEME_STORAGE_KEY } from "./script"

export type Theme = "day" | "night"
export type ThemeSetting = "auto" | Theme

const GROUND = { day: "#faf9f6", night: "#1c1424" } as const // = tokens.json ground (theme-color)
const DARK_QUERY = "(prefers-color-scheme: dark)"

function readTheme(): Theme {
  return document.documentElement.dataset.theme === "night" ? "night" : "day"
}

function readSetting(): ThemeSetting {
  try {
    const t = localStorage.getItem(THEME_STORAGE_KEY)
    return t === "day" || t === "night" ? t : "auto"
  } catch {
    return "auto"
  }
}

function subscribe(onChange: () => void): () => void {
  const mo = new MutationObserver(onChange)
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] })
  const mq = matchMedia(DARK_QUERY)
  const onMedia = () => {
    if (readSetting() === "auto") apply(mq.matches ? "night" : "day", "auto")
  }
  const onStorage = (e: StorageEvent) => {
    if (e.key !== THEME_STORAGE_KEY) return
    const s = readSetting()
    apply(s === "auto" ? (mq.matches ? "night" : "day") : s, s)
  }
  mq.addEventListener("change", onMedia)
  window.addEventListener("storage", onStorage)
  return () => {
    mo.disconnect()
    mq.removeEventListener("change", onMedia)
    window.removeEventListener("storage", onStorage)
  }
}

function apply(theme: Theme, setting: ThemeSetting) {
  const d = document.documentElement
  d.dataset.theme = theme
  d.style.colorScheme = theme === "night" ? "dark" : "light"
  // Explicit choice: both media-matched theme-color metas show that theme's ground; auto restores the pair.
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
  metas.forEach((m) => {
    const media = m.getAttribute("media") ?? ""
    const own: Theme = media.includes("dark") ? "night" : "day"
    m.content = GROUND[setting === "auto" ? own : theme]
  })
}

export function useTheme() {
  const theme = useSyncExternalStore<Theme>(subscribe, readTheme, () => "day")
  const setTheme = useCallback((setting: ThemeSetting) => {
    try {
      if (setting === "auto") localStorage.removeItem(THEME_STORAGE_KEY)
      else localStorage.setItem(THEME_STORAGE_KEY, setting)
    } catch {
      /* private mode: the choice lasts for this page only */
    }
    apply(setting === "auto" ? (matchMedia(DARK_QUERY).matches ? "night" : "day") : setting, setting)
  }, [])
  return { theme, setTheme, getSetting: readSetting }
}
