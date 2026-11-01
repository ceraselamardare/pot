"use client"
// shadcn's sonner wrapper, pointed at lib/theme instead of next-themes (frontend-architecture §7.1, §7.5):
// top-center, below the safe area, rounded-md, shadow-card, brand surface/ink colours.
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { useTheme } from "@/lib/theme/useTheme"

export function Toaster(props: ToasterProps) {
  const { theme } = useTheme()
  return (
    <Sonner
      theme={theme === "night" ? "dark" : "light"}
      position="top-center"
      mobileOffset={{ top: "calc(env(safe-area-inset-top) + 8px)" }}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--pot-surface)",
          "--normal-text": "var(--pot-ink)",
          "--normal-border": "var(--pot-line)",
          "--border-radius": "var(--pot-radius-md)",
        } as React.CSSProperties
      }
      toastOptions={{ classNames: { toast: "shadow-card font-sans" } }}
      {...props}
    />
  )
}
