"use client"

import { useQuery } from "@tanstack/react-query"
import { api, type ApiEnvelope } from "@/lib/axios"
import type {
  ExerciseListInput,
  ExerciseSummary,
} from "@/features/exercises/schemas/exercise"
import { exerciseKeys } from "./query-keys"

type ExercisePage = { items: ExerciseSummary[]; nextCursor: string | null }

export function useExercises(params: Partial<ExerciseListInput> = {}) {
  return useQuery({
    queryKey: exerciseKeys.list(params),
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<ExercisePage>>("/exercises", { params })
      return res.data.data
    },
  })
}
