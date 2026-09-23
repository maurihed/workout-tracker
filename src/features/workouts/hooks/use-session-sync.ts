"use client"

import { useCallback, useEffect, useRef } from "react"
import { useSessionStore } from "@/features/workouts/stores/session-store"
import type { TimerState } from "@/features/workouts/lib/timer"
import { clearActiveSession, saveActiveSession } from "@/features/workouts/lib/session-persistence"
import { enqueue, flushOutbox, registerBackgroundSync } from "@/lib/offline/sync"
import { useSyncStatus, type SyncStatus } from "@/lib/offline/use-online"

const PUSH_DEBOUNCE_MS = 2000

export function useSessionSync(
  sessionId: string,
  getTimer: () => TimerState | null,
  getPaused: () => boolean,
): {
  status: SyncStatus
  enqueueState: () => void
  complete: (activeSeconds: number) => Promise<void>
  abandon: () => Promise<void>
} {
  const status = useSyncStatus()
  const timerRef = useRef(getTimer)
  const pausedRef = useRef(getPaused)
  const debounceRef = useRef<number | null>(null)

  useEffect(() => {
    timerRef.current = getTimer
    pausedRef.current = getPaused
  })

  const persist = useCallback(() => {
    const store = useSessionStore.getState()
    void saveActiveSession({
      source: {
        id: store.sessionId ?? sessionId,
        name: store.name,
        status: store.status ?? "in_progress",
        startedAt: store.startedAt ?? new Date().toISOString(),
        activeSeconds: store.activeSeconds,
        exercises: store.exercises,
      },
      snapshot: store.snapshot,
      routineDayId: store.routineDayId,
      timer: timerRef.current(),
      paused: pausedRef.current(),
    })
  }, [sessionId])

  const pushUpsert = useCallback(async () => {
    persist()
    const store = useSessionStore.getState()
    const payload = store.toUpsertPayload(store.activeSeconds)
    if (!payload) return
    await enqueue("upsert", sessionId, { state: payload, activeSeconds: payload.activeSeconds })
    void registerBackgroundSync()
    void flushOutbox()
  }, [persist, sessionId])

  const enqueueState = useCallback(() => {
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null
      void pushUpsert()
    }, PUSH_DEBOUNCE_MS)
  }, [pushUpsert])

  const complete = useCallback(
    async (activeSeconds: number) => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
      const payload = useSessionStore.getState().toUpsertPayload(activeSeconds)
      if (payload) {
        await enqueue("complete", sessionId, { state: payload, activeSeconds }).catch(
          () => undefined,
        )
      }
      void registerBackgroundSync()
      const store = useSessionStore.getState()
      await saveActiveSession({
        source: {
          id: store.sessionId ?? sessionId,
          name: store.name,
          status: "completed",
          startedAt: store.startedAt ?? new Date().toISOString(),
          activeSeconds,
          exercises: store.exercises,
        },
        snapshot: store.snapshot,
        routineDayId: store.routineDayId,
        timer: null,
        paused: true,
      })
      void flushOutbox()
    },
    [sessionId],
  )

  const abandon = useCallback(async () => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    await enqueue("abandon", sessionId, { state: null, activeSeconds: 0 }).catch(
      () => undefined,
    )
    void registerBackgroundSync()
    await clearActiveSession()
    void flushOutbox()
  }, [sessionId])

  useEffect(() => {
    void flushOutbox()
  }, [])

  useEffect(() => {
    const onOnline = () => void flushOutbox()
    const onVisibility = () => {
      if (document.visibilityState === "visible") void flushOutbox()
      else if (useSessionStore.getState().isDirty) void pushUpsert()
    }
    window.addEventListener("online", onOnline)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      window.removeEventListener("online", onOnline)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [pushUpsert])

  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
    }
  }, [])

  return { status, enqueueState, complete, abandon }
}
