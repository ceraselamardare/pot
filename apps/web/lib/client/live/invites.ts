// Invite secrets on this device only (frontend-architecture §5.10, D-31): IndexedDB `pot-invites` v1, store
// `invites`, one record per Pot with the link's public key and its 43-char secret. Never sent to a server; the
// Share sheet shows the link while it is valid, other devices make a new one (add_invite / rotate_invite).
export interface StoredInvite {
  pot: string
  pk: string
  secret: string
  createdAt: number
}

const DB = "pot-invites"
const STORE = "invites"
const memory = new Map<string, StoredInvite>()

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const r = indexedDB.open(DB, 1)
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: "pot" })
      }
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

export async function saveInvite(inv: StoredInvite): Promise<void> {
  memory.set(inv.pot, inv)
  const db = await open()
  if (!db) return
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite")
    tx.objectStore(STORE).put(inv)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
  db.close()
}

export async function loadInvite(pot: string): Promise<StoredInvite | null> {
  const db = await open()
  if (!db) return memory.get(pot) ?? null
  const v = await new Promise<StoredInvite | null>((resolve) => {
    const tx = db.transaction(STORE, "readonly")
    const g = tx.objectStore(STORE).get(pot)
    g.onsuccess = () => resolve((g.result as StoredInvite | undefined) ?? null)
    g.onerror = () => resolve(null)
  })
  db.close()
  return v ?? memory.get(pot) ?? null
}

/**
 * CLI-6 (security audit 2026-11-04): sign-out deletes this device's invite secrets (the whole `pot-invites` database
 * and the in-memory copies). Members make a fresh link from Share on their next visit (add_invite / rotate_invite).
 */
export async function forgetAllInvites(): Promise<void> {
  memory.clear()
  await new Promise<void>((resolve) => {
    try {
      const r = indexedDB.deleteDatabase(DB)
      r.onsuccess = r.onerror = r.onblocked = () => resolve()
    } catch {
      resolve()
    }
  })
}
