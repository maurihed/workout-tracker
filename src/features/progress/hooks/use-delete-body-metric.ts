"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/axios"
import { progressKeys } from "./query-keys"

export function useDeleteBodyMetric() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/body-metrics/${id}`)
      return id
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: progressKeys.all })
    },
  })
}
