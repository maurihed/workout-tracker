"use client"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/axios"

export function useSaveOnboardingStep() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      await api.patch("/profile", patch)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profile"] }),
  })
}
