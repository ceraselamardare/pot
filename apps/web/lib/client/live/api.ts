// Our API from the browser (api-spec §0.3): JSON in, JSON out, `requestId` on everything. Non-2xx bodies are
// `Err {reason}` and become ActionError with the §4.8 class. A network error is `unknown_outcome` for POSTs
// that may have reached the server (the caller retries the identical body: same idempotencyKey → replay).
import { ActionError, classOfReason } from "../errors"

export interface ApiErrBody {
  ok: false
  requestId?: string
  reason: string
  retryAfterMs?: number
  txHash?: string
}

export async function api<T>(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown, init: RequestInit = {}): Promise<{ status: number; data: T }> {
  let res: Response
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: body === undefined ? { accept: "application/json" } : { "content-type": "application/json", accept: "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      ...init,
    })
  } catch (e) {
    throw new ActionError(method === "GET" ? "offline" : "unknown_outcome", "network", { moneyMoved: method === "GET" ? "no" : "unknown", message: String(e) })
  }
  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    if (!res.ok) throw new ActionError(classOfReason("internal", res.status), "internal")
  }
  if (!res.ok || (data && (data as { ok?: boolean }).ok === false)) {
    const err = (data ?? {}) as Partial<ApiErrBody>
    const reason = err.reason ?? (res.status >= 500 ? "service_unavailable" : "bad_request")
    throw new ActionError(classOfReason(reason, res.status), reason, { requestId: err.requestId, txHash: err.txHash })
  }
  return { status: res.status, data: data as T }
}
