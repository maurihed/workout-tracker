"use client"

import { useQuery } from "@tanstack/react-query"
import { api, type ApiEnvelope } from "@/lib/axios"
import type { ExerciseProgressDTO } from "@/server/services/progress.service"
import { progressKeys } from "./query-keys"

export function useExerciseProgress(exerciseId: string) {
  return useQuery({
    queryKey: progressKeys.exerciseProgress(exerciseId),
    queryFn: async () =>
      (await api.get<ApiEnvelope<ExerciseProgressDTO>>(`/analytics/exercises/${exerciseId}`)).data
        .data,
  })
}
