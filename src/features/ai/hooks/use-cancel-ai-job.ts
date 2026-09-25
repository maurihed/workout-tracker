"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api, type ApiEnvelope } from "@/lib/axios"
import type { AiJobDTO } from "@/features/ai/schemas/job"
import { aiKeys } from "./query-keys"

export function useCancelAiJob() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post<ApiEnvelope<AiJobDTO>>(`/ai/routines/${id}/cancel`)
      return res.data.data
    },
    onSuccess: (_job, id) => {
      queryClient.invalidateQueries({ queryKey: aiKeys.job(id) })
      queryClient.invalidateQueries({ queryKey: aiKeys.all })
    },
  })
}
