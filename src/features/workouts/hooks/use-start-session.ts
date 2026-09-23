"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api, type ApiEnvelope } from "@/lib/axios"
import type { SessionDTO } from "./use-active-session"
import { sessionKeys } from "./query-keys"

export function useStartSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (routineDayId: string) => {
      const res = await api.post<ApiEnvelope<SessionDTO>>("/sessions", { routineDayId })
      return res.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.active() })
    },
  })
}
