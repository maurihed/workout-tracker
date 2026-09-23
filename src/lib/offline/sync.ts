import {
  deleteOutbox, getOutbox, listOutbox, putOutbox,
  type OutboxRecord, type SyncOp,
} from "./db"

export type OutboxPayload = { state: unknown; activeSeconds: number }
export type FlushResult = { synced: number; pending: number; failed: boolean }
export type SyncDeps = { fetchImpl?: typeof fetch; now?: () => number }

const listeners = new Set<() => void>()

export function onOutboxChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notify() {
  for (const listener of listeners) listener()
}

export async function enqueue(
  op: SyncOp,
  sessionId: string,
  payload: OutboxPayload,
  deps: { now?: () => number } = {},
): Promise<void> {
  const now = deps.now ?? (() => Date.now())
  const existing = await getOutbox(sessionId)
  const record: OutboxRecord = {
    sessionId,
    op: op === "upsert" && existing && existing.op !== "upsert" ? existing.op : op,
    payload,
    updatedAt: now(),
    status: "pending",
  }
  await putOutbox(record)
  notify()
}

function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 408 || status === 429
}

async function send(
  fetchImpl: typeof fetch,
  url: string,
  method: string,
  body?: unknown,
): Promise<Response> {
  return fetchImpl(url, {
    method,
    credentials: "same-origin",
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  })
}

async function flushRecord(fetchImpl: typeof fetch, record: OutboxRecord): Promise<"synced" | "retry" | "error" | "gone"> {
  const payload = record.payload as OutboxPayload
  try {
    if (record.op === "upsert") {
      const res = await send(fetchImpl, `/api/sessions/${record.sessionId}`, "PUT", payload.state)
      if (res.ok) return "synced"
      return isRetryableStatus(res.status) ? "retry" : "error"
    }
    if (record.op === "abandon") {
      const res = await send(fetchImpl, `/api/sessions/${record.sessionId}/abandon`, "POST")
      if (res.ok || res.status === 404) return "synced"
      return isRetryableStatus(res.status) ? "retry" : "error"
    }
    // complete: push the final state, then finalize.
    const put = await send(fetchImpl, `/api/sessions/${record.sessionId}`, "PUT", payload.state)
    if (!put.ok) return isRetryableStatus(put.status) ? "retry" : "error"
    const post = await send(fetchImpl, `/api/sessions/${record.sessionId}/complete`, "POST", { activeSeconds: payload.activeSeconds })
    if (post.ok) return "synced"
    return isRetryableStatus(post.status) ? "retry" : "error"
  } catch {
    return "retry"
  }
}

let inFlight: Promise<FlushResult> | null = null

export async function flushOutbox(deps: SyncDeps = {}): Promise<FlushResult> {
  if (inFlight) return inFlight
  const fetchImpl = deps.fetchImpl ?? fetch
  const now = deps.now ?? (() => Date.now())
  inFlight = (async () => {
    const rows = (await listOutbox()).sort((a, b) => a.updatedAt - b.updatedAt)
    let synced = 0
    let failed = false
    for (const row of rows) {
      await putOutbox({ ...row, status: "syncing" })
      const outcome = await flushRecord(fetchImpl, row)
      if (outcome === "synced") {
        await deleteOutbox(row.sessionId)
        synced += 1
        continue
      }
      if (outcome === "retry") {
        await putOutbox({ ...row, status: "pending", updatedAt: now() })
        failed = true
        break
      }
      await putOutbox({ ...row, status: "error" })
      failed = true
      break
    }
    const pending = (await listOutbox()).length
    notify()
    return { synced, pending, failed }
  })()
  try {
    return await inFlight
  } finally {
    inFlight = null
  }
}

export async function registerBackgroundSync(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker?.ready
    const sync = (registration as unknown as { sync?: { register: (tag: string) => Promise<void> } })?.sync
    await sync?.register("gym-session-sync")
  } catch {
    // Background Sync is a progressive enhancement.
  }
}
