"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api, type ApiEnvelope } from "@/lib/axios"
import type { AiJobInput } from "@/features/ai/lib/contract"
import type { AiJobDTO } from "@/features/ai/schemas/job"
import { aiKeys } from "./query-keys"

export function useCreateAiJob() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: AiJobInput) => {
      const res = await api.post<ApiEnvelope<AiJobDTO>>("/ai/routines", input)
      return res.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiKeys.all })
    },
  })
}
