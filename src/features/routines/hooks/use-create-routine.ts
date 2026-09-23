"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api, type ApiEnvelope } from "@/lib/axios"
import type { CreateRoutineInput } from "@/features/routines/schemas/routine"
import type { RoutineDTO } from "./use-active-routine"
import { routineKeys } from "./query-keys"

export function useCreateRoutine() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateRoutineInput) => {
      const res = await api.post<ApiEnvelope<RoutineDTO>>("/routines", input)
      return res.data.data
    },
    onSuccess: (routine) => {
      queryClient.invalidateQueries({ queryKey: routineKeys.list() })
      queryClient.invalidateQueries({ queryKey: routineKeys.active() })
      queryClient.invalidateQueries({ queryKey: routineKeys.detail(routine.id) })
    },
  })
}
