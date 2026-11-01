// The requester's link secrets, on this device only (like invites, D-31): localStorage `pot.paylinks.v1`, keyed
// `<slug>:<request id>`, so the Share card can show the link again later. Never sent to a server. A link made on
// another device (or after clearing this browser) can't be shared from here: it can still be cancelled, and it goes
// back to the Pot by itself after its date.
//  - Before request_spend we keep the secret under its request_ref (`ref:<slug>:<ref>`), so a crash between the relay
//    and the answer can't lose it; adoptPending() moves it under the request id once the hub gave one.
const KEY = "pot.paylinks.v1"

export interface StoredLink {
  secret: string
  /** who it's for (the requester's own words) */
  label?: string
  createdAt: number
}

type Table = Record<string, StoredLink>

function readAll(): Table {
  try {
    const raw = localStorage.getItem(KEY)
    const v = raw ? (JSON.parse(raw) as unknown) : null
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Table) : {}
  } catch {
    return {}
  }
}

function writeAll(t: Table) {
  try {
    localStorage.setItem(KEY, JSON.stringify(t))
  } catch {
    /* private mode: the link lasts for this page only (the card says so when it's gone) */
  }
}

const idKey = (slug: string, id: number) => `${slug}:${id}`
const refKey = (slug: string, ref: string) => `ref:${slug}:${ref}`

export function saveLinkSecret(slug: string, id: number, link: StoredLink): void {
  writeAll({ ...readAll(), [idKey(slug, id)]: link })
}

/** Before the request exists: keep it under its request_ref. */
export function savePendingLink(slug: string, ref: string, link: StoredLink): void {
  writeAll({ ...readAll(), [refKey(slug, ref)]: link })
}

/** The hub answered with the request id: move the pending secret under it. */
export function adoptPending(slug: string, ref: string, id: number): StoredLink | null {
  const all = readAll()
  const v = all[refKey(slug, ref)]
  if (!v) return null
  delete all[refKey(slug, ref)]
  all[idKey(slug, id)] = v
  writeAll(all)
  return v
}

export function dropPending(slug: string, ref: string): void {
  const all = readAll()
  delete all[refKey(slug, ref)]
  writeAll(all)
}

export function loadLinkSecret(slug: string, id: number): StoredLink | null {
  return readAll()[idKey(slug, id)] ?? null
}

/** Once a link is claimed or back in the Pot its secret is worthless: forget it. */
export function forgetLinkSecret(slug: string, id: number): void {
  const all = readAll()
  if (!(idKey(slug, id) in all)) return
  delete all[idKey(slug, id)]
  writeAll(all)
}
