"use client"

import { useQuery } from "@tanstack/react-query"
import { api, type ApiEnvelope } from "@/lib/axios"
import { sessionKeys } from "./query-keys"

export type SessionStatus = "in_progress" | "completed" | "abandoned"
export type SessionSetType = "warmup" | "working" | "drop" | "failure"
export type SessionTimerType = "none" | "interval" | "emom" | "amrap"

type JsonValue = string | number | boolean | JsonObject | JsonArray | null
type JsonObject = { [Key in string]?: JsonValue }
type JsonArray = JsonValue[]

export type SessionSetDTO = {
  id: string
  setNumber: number
  type: SessionSetType
  reps: number | null
  weightKg: number | null
  durationSeconds: number | null
  rpe: number | null
  restSecondsLogged: number | null
  completedAt: string | null
}

export type SessionExerciseDTO = {
  id: string
  exerciseId: string | null
  order: number
  nameSnapshot: string
  targetSets: number | null
  targetReps: string | null
  restSeconds: number | null
  timerType: SessionTimerType | null
  workSeconds: number | null
  rounds: number | null
  completed: boolean
  skipped: boolean
  swappedFromId: string | null
  notes: string | null
  exercise: { id: string; name: string; nameEs: string | null; images: string[] } | null
  sets: SessionSetDTO[]
  lastPerformance: { reps: number | null; weightKg: number | null; date: string } | null
}

export type SessionDTO = {
  id: string
  userId: string
  routineId: string | null
  routineDayId: string | null
  name: string
  status: SessionStatus
  startedAt: string
  completedAt: string | null
  activeSeconds: number
  notes: string | null
  snapshot: JsonValue
  exercises: SessionExerciseDTO[]
}

export function useActiveSession() {
  return useQuery({
    queryKey: sessionKeys.active(),
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<SessionDTO | null>>("/sessions/active")
      return res.data.data
    },
  })
}
