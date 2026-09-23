"use client"

import { useQuery } from "@tanstack/react-query"
import { api, type ApiEnvelope } from "@/lib/axios"
import type { RoutineDTO } from "./use-active-routine"
import { routineKeys } from "./query-keys"

export function useRoutine(id: string) {
  return useQuery({
    queryKey: routineKeys.detail(id),
    enabled: Boolean(id),
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<RoutineDTO>>(`/routines/${id}`)
      return res.data.data
    },
  })
}
