"use client"

import { useMutation } from "@tanstack/react-query"
import { api, type ApiEnvelope } from "@/lib/axios"
import type { SessionStateInput } from "@/features/workouts/schemas/session"
import type { SessionDTO } from "./use-active-session"

/**
 * Pushes the runner state with a `PUT`. Intentionally does not invalidate on
 * success: the runner persists frequently via a debounced push, so refetching
 * on every write would fight the local authoritative store.
 */
export function useUpdateSession(id: string) {
  return useMutation({
    mutationFn: async (input: SessionStateInput) => {
      const res = await api.put<ApiEnvelope<SessionDTO>>(`/sessions/${id}`, input)
      return res.data.data
    },
  })
}
