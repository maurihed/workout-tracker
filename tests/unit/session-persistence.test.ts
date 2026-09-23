import { afterEach, describe, expect, it } from "vitest"
import { closeDb } from "@/lib/offline/db"
import {
  clearActiveSession, loadActiveSession, saveActiveSession, type PersistedSession,
} from "@/features/workouts/lib/session-persistence"

afterEach(async () => { await closeDb() })

const value: PersistedSession = {
  source: { id: "s1", name: "Push", status: "in_progress", startedAt: "2026-01-01T00:00:00.000Z", activeSeconds: 3, exercises: [] },
  snapshot: null, routineDayId: "d1", timer: null, paused: false,
}

describe("session persistence", () => {
  it("round-trips and clears the active session", async () => {
    await saveActiveSession(value)
    expect(await loadActiveSession()).toEqual(value)
    await clearActiveSession()
    expect(await loadActiveSession()).toBeUndefined()
  })
})
