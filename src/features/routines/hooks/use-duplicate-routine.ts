"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useLocale } from "next-intl"
import { api, type ApiEnvelope } from "@/lib/axios"
import type { RoutineDTO } from "./use-active-routine"
import { routineKeys } from "./query-keys"

export function useDuplicateRoutine() {
  const queryClient = useQueryClient()
  const locale = useLocale()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post<ApiEnvelope<RoutineDTO>>(
        `/routines/${id}/duplicate?locale=${encodeURIComponent(locale)}`,
      )
      return res.data.data
    },
    onSuccess: (routine) => {
      queryClient.invalidateQueries({ queryKey: routineKeys.list() })
      queryClient.invalidateQueries({ queryKey: routineKeys.active() })
      queryClient.invalidateQueries({ queryKey: routineKeys.detail(routine.id) })
    },
  })
}
