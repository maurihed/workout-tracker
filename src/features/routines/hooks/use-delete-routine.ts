"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/axios"
import { routineKeys } from "./query-keys"

export function useDeleteRoutine() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/routines/${id}`)
      return id
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: routineKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: routineKeys.list() })
      queryClient.invalidateQueries({ queryKey: routineKeys.active() })
    },
  })
}
