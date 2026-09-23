"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { RoutineDTO } from "@/features/routines/hooks/use-active-routine"
import {
  buildLocalSession, toUpsertPayload, type LocalSession,
} from "@/features/workouts/lib/build-local-session"
import { saveActiveSession } from "@/features/workouts/lib/session-persistence"
import { useSessionStore } from "@/features/workouts/stores/session-store"
import { enqueue } from "@/lib/offline/sync"
import { sessionKeys } from "./query-keys"

export type StartSessionArgs = { routine: RoutineDTO; dayId: string }

export function useStartSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ routine, dayId }: StartSessionArgs): Promise<LocalSession> => {
      const day = routine.days.find((candidate) => candidate.id === dayId)
      if (!day) throw new Error("Routine day not found")
      const local = buildLocalSession(routine, day)
      useSessionStore.getState().hydrate(local.source, {
        snapshot: local.snapshot,
        routineDayId: local.routineDayId,
      })
      await saveActiveSession({
        source: local.source,
        snapshot: local.snapshot,
        routineDayId: local.routineDayId,
        timer: null,
        paused: false,
      })
      await enqueue("upsert", local.source.id, {
        state: toUpsertPayload(local, 0),
        activeSeconds: 0,
      })
      return local
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.active() })
    },
  })
}
