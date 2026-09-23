"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api, type ApiEnvelope } from "@/lib/axios"
import type { SessionDTO } from "./use-active-session"
import { sessionKeys } from "./query-keys"

export function useCompleteSession(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (activeSeconds: number) => {
      const res = await api.post<ApiEnvelope<SessionDTO>>(`/sessions/${id}/complete`, {
        activeSeconds,
      })
      return res.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.active() })
    },
  })
}
