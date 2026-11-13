// Plausible page analytics (cookieless). Production deployments only: preview, local and test builds render nothing.
//
// Served from our own origin through next.config.ts rewrites (/pa/script.js → the site's Plausible script, /pa/event →
// plausible.io/api/event), so the CSP (lib/security/csp.ts) stays 'self'-only: no new script-src or connect-src host,
// and an injected script gets no third-party endpoint to send data to.
//
// What leaves the page: Plausible's payload carries the full URL (`u`), and our share links keep secrets in it (the
// invite /j/<slug>?i=<key>#<secret>, the claim link /c/<slug>/<id>#<secret>, D-08). transformRequest cuts every URL
// down to origin + path + the utm_* / ref / source campaign params, so no fragment and no other query param is ever sent.
export const PLAUSIBLE_SCRIPT_SRC = "/pa/script.js"
export const PLAUSIBLE_EVENT_PATH = "/pa/event"
/** The site's script from the Plausible dashboard (the snippet's `pa-….js`). */
export const PLAUSIBLE_UPSTREAM_SCRIPT = "https://plausible.io/js/pa-euO-tFuFzrCv4hyDHOX_r.js"
export const PLAUSIBLE_UPSTREAM_EVENT = "https://plausible.io/api/event"

/** Plausible's queue stub + init (their snippet, with our endpoint and the URL filter). */
export const PLAUSIBLE_INIT_SCRIPT = `window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init({endpoint:${JSON.stringify(PLAUSIBLE_EVENT_PATH)},transformRequest:function(p){try{var l=new URL(p.u),q=new URLSearchParams();l.searchParams.forEach(function(v,k){if(/^utm_/.test(k)||k==='ref'||k==='source')q.set(k,v)});var s=q.toString();p.u=l.origin+l.pathname+(s?'?'+s:'')}catch(e){p.u=location.origin+location.pathname}return p}})`

/** On for Vercel production builds only (VERCEL_ENV is read at build time; the root layout stays static). */
export function analyticsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.VERCEL_ENV === "production"
}
