// The error taxonomy (api-spec §1.2). Reasons are stable snake_case strings: never rename one, add new ones.
// 4xx = nothing was submitted and nothing was spent, unless `txHash` is set.

import { REASON_HTTP_STATUS, type Reason as ApiReason, type ServiceUnavailableCause } from "@pot/sdk/api"

/** Default HTTP status per reason: the @pot/sdk wire table (api-spec §1.2). */
export const REASON_STATUS: Readonly<Record<ApiReason, number>> = REASON_HTTP_STATUS

export type Reason = ApiReason

export type UnavailableCause = ServiceUnavailableCause

export interface ApiErrorInit {
  status?: number
  detail?: Record<string, unknown>
  retryAfterMs?: number
  txHash?: string
  message?: string
}

export class ApiError extends Error {
  readonly reason: Reason
  readonly status: number
  readonly detail?: Record<string, unknown>
  readonly retryAfterMs?: number
  readonly txHash?: string

  constructor(reason: Reason, init: ApiErrorInit = {}) {
    super(init.message ?? reason)
    this.reason = reason
    this.status = init.status ?? REASON_STATUS[reason]
    this.detail = init.detail
    this.retryAfterMs = init.retryAfterMs
    this.txHash = init.txHash
  }
}

export const fail = (reason: Reason, init?: ApiErrorInit): never => {
  throw new ApiError(reason, init)
}

export const unavailable = (cause: UnavailableCause, retryAfterMs = 5_000, extra: Record<string, unknown> = {}) =>
  new ApiError("service_unavailable", { detail: { cause, ...extra }, retryAfterMs })

export interface ErrBody {
  ok: false
  requestId: string
  reason: Reason
  retryAfterMs?: number
  txHash?: string
  detail?: Record<string, unknown>
  message?: string
}

export function errBody(e: ApiError, requestId: string): ErrBody {
  const body: ErrBody = { ok: false, requestId, reason: e.reason }
  if (e.retryAfterMs !== undefined) body.retryAfterMs = e.retryAfterMs
  if (e.txHash) body.txHash = e.txHash
  if (e.detail) body.detail = e.detail
  if (e.message && e.message !== e.reason) body.message = e.message.slice(0, 500)
  return body
}
