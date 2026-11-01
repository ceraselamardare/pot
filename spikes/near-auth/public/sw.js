// THROWAWAY pass-through service worker: only so Android Chrome treats the spike as installable. No caching.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
