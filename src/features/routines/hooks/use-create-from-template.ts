"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api, type ApiEnvelope } from "@/lib/axios"
import type { RoutineDTO } from "./use-active-routine"
import { routineKeys } from "./query-keys"

export function useCreateFromTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (slug: string) => {
      const res = await api.post<ApiEnvelope<RoutineDTO>>("/routines/from-template", { slug })
      return res.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: routineKeys.active() })
      queryClient.invalidateQueries({ queryKey: ["profile"] })
    },
  })
}
