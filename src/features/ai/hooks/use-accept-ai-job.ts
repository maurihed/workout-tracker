"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api, type ApiEnvelope } from "@/lib/axios"
import { routineKeys } from "@/features/routines/hooks/query-keys"
import { aiKeys } from "./query-keys"

export function useAcceptAiJob() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post<ApiEnvelope<{ routineId: string }>>(`/ai/routines/${id}/accept`)
      return res.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: routineKeys.all })
      queryClient.invalidateQueries({ queryKey: aiKeys.all })
    },
  })
}
