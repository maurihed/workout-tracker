import type { SessionSnapshot } from "@/features/workouts/lib/session-snapshot"
import type { TimerState } from "@/features/workouts/lib/timer"
import type { SessionStoreSource } from "@/features/workouts/stores/session-store"
import { deleteActiveSession, getActiveSession, putActiveSession } from "@/lib/offline/db"

export type PersistedSession = {
  source: SessionStoreSource
  snapshot: SessionSnapshot | null
  routineDayId: string | null
  timer: TimerState | null
  paused: boolean
}

export async function saveActiveSession(
  value: PersistedSession,
  now: number = Date.now(),
): Promise<void> {
  await putActiveSession({ id: "active", value, updatedAt: now })
}

export async function loadActiveSession(): Promise<PersistedSession | undefined> {
  const record = await getActiveSession()
  return record?.value as PersistedSession | undefined
}

export async function clearActiveSession(): Promise<void> {
  await deleteActiveSession()
}
