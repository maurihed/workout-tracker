"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api, type ApiEnvelope } from "@/lib/axios"
import type { RoutineInput } from "@/features/routines/schemas/routine"
import type { RoutineDTO } from "./use-active-routine"
import { routineKeys } from "./query-keys"

export function useUpdateRoutine() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: RoutineInput }) => {
      const res = await api.put<ApiEnvelope<RoutineDTO>>(`/routines/${id}`, input)
      return res.data.data
    },
    onSuccess: (_routine, { id }) => {
      queryClient.invalidateQueries({ queryKey: routineKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: routineKeys.list() })
      queryClient.invalidateQueries({ queryKey: routineKeys.active() })
    },
  })
}
