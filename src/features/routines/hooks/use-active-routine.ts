"use client"

import { useQuery } from "@tanstack/react-query"
import { api, type ApiEnvelope } from "@/lib/axios"
import { routineKeys } from "./query-keys"

export type RoutineDTO = {
  id: string
  name: string
  nameEs: string | null
  description: string | null
  descriptionEs: string | null
  goal: "lose_weight" | "build_muscle" | "get_stronger" | "endurance" | "general_fitness" | null
  source: "manual" | "ai" | "template"
  isActive: boolean
  days: {
    id: string
    weekday: number
    label: string | null
    order: number
    exercises: {
      id: string
      order: number
      exerciseId: string | null
      customName: string | null
      targetSets: number
      targetReps: string
      restSeconds: number
      targetWeightKg: number | null
      timerType: "none" | "interval" | "emom" | "amrap"
      workSeconds: number | null
      rounds: number | null
      notes: string | null
      exercise: { id: string; name: string; nameEs: string | null; images: string[] } | null
    }[]
  }[]
}

export function useActiveRoutine() {
  return useQuery({
    queryKey: routineKeys.active(),
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<RoutineDTO | null>>("/routines/active")
      return res.data.data
    },
  })
}
