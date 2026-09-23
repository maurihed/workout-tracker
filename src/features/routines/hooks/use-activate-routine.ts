"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api, type ApiEnvelope } from "@/lib/axios"
import type { RoutineDTO } from "./use-active-routine"
import { routineKeys } from "./query-keys"

export function useActivateRoutine() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post<ApiEnvelope<RoutineDTO>>(`/routines/${id}/activate`)
      return res.data.data
    },
    onSuccess: (routine) => {
      queryClient.invalidateQueries({ queryKey: routineKeys.detail(routine.id) })
      queryClient.invalidateQueries({ queryKey: routineKeys.list() })
      queryClient.invalidateQueries({ queryKey: routineKeys.active() })
    },
  })
}
