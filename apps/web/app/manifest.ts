import type { MetadataRoute } from "next"

// Mirrors brand/web/site.webmanifest (name, description, colours, icons and their paths) plus the plan's
// fields (frontend-architecture §8.1, brand README §11). start_url differs on purpose: installed users land
// on their Pots. Night's #1c1424 comes from the media-matched viewport.themeColor in app/layout.tsx.
// F-23 adds `screenshots` (public/screens/pot-1170x2532.png) once the screen exists.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Pot",
    short_name: "Pot",
    description: "Group chat money that follows its own rules.",
    start_url: "/pots?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#faf9f6",
    theme_color: "#faf9f6",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    categories: ["finance", "social"],
    lang: "en-US",
    dir: "ltr",
    prefer_related_applications: false,
  }
}
