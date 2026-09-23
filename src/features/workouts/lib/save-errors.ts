/**
 * Error thrown by the keepalive `fetch` save path so callers can read the HTTP
 * status the same way they read an axios error's `response.status`.
 */
export class HttpError extends Error {
  readonly status: number

  constructor(status: number, message = `Request failed with status ${status}`) {
    super(message)
    this.name = "HttpError"
    this.status = status
  }
}

/**
 * HTTP status carried by a save failure, from either an axios error
 * (`response.status`) or a thrown `HttpError` (`status`). Returns `null` for
 * network errors, timeouts, and anything else without a status.
 */
export function getHttpStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null
  const candidate = error as {
    status?: unknown
    response?: { status?: unknown }
  }
  if (typeof candidate.response?.status === "number") {
    return candidate.response.status
  }
  if (typeof candidate.status === "number") return candidate.status
  return null
}

/**
 * A save is worth retrying only when it may succeed later: a network error or
 * timeout (no status), a 5xx, or an explicitly transient 408/429. Terminal 4xx
 * (e.g. a 409 "session is not in progress") must stop the retry loop so the
 * runner surfaces the error instead of retrying until unmount.
 */
export function isRetryableSaveError(error: unknown): boolean {
  const status = getHttpStatus(error)
  if (status === null) return true
  return status >= 500 || status === 408 || status === 429
}
