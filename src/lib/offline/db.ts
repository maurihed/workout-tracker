import { openDB, type DBSchema, type IDBPDatabase } from "idb"

export type SyncOp = "upsert" | "complete" | "abandon"
export type OutboxStatus = "pending" | "syncing" | "error"

export type OutboxRecord = {
  sessionId: string
  op: SyncOp
  payload: unknown
  updatedAt: number
  status: OutboxStatus
  lastError?: string
}

export type ActiveSessionRecord = {
  id: "active"
  value: unknown
  updatedAt: number
}

interface GymDB extends DBSchema {
  outbox: { key: string; value: OutboxRecord }
  activeSession: { key: string; value: ActiveSessionRecord }
}

const DB_NAME = "gym-offline"
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<GymDB>> | null = null

export function getDb(): Promise<IDBPDatabase<GymDB>> {
  if (!dbPromise) {
    dbPromise = openDB<GymDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore("outbox", { keyPath: "sessionId" })
        db.createObjectStore("activeSession", { keyPath: "id" })
      },
    })
  }
  return dbPromise
}

/** Closes and drops the cached handle (used by tests between cases). */
export async function closeDb(): Promise<void> {
  if (!dbPromise) return
  const db = await dbPromise
  db.close()
  dbPromise = null
}

export async function putOutbox(record: OutboxRecord): Promise<void> {
  await (await getDb()).put("outbox", record)
}

export async function getOutbox(sessionId: string): Promise<OutboxRecord | undefined> {
  return (await getDb()).get("outbox", sessionId)
}

export async function listOutbox(): Promise<OutboxRecord[]> {
  return (await getDb()).getAll("outbox")
}

export async function deleteOutbox(sessionId: string): Promise<void> {
  await (await getDb()).delete("outbox", sessionId)
}

export async function putActiveSession(record: ActiveSessionRecord): Promise<void> {
  await (await getDb()).put("activeSession", record)
}

export async function getActiveSession(): Promise<ActiveSessionRecord | undefined> {
  return (await getDb()).get("activeSession", "active")
}

export async function deleteActiveSession(): Promise<void> {
  await (await getDb()).delete("activeSession", "active")
}
