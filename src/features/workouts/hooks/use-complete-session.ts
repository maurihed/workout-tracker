"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/axios"
import { sessionKeys } from "./query-keys"

export function useCompleteSession(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (activeSeconds: number) => {
      await api.post(`/sessions/${id}/complete`, { activeSeconds })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.active() })
    },
  })
}
