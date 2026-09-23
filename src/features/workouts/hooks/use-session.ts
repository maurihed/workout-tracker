"use client"

import { useQuery } from "@tanstack/react-query"
import { api, type ApiEnvelope } from "@/lib/axios"
import type { SessionDTO } from "./use-active-session"
import { sessionKeys } from "./query-keys"

export function useSession(id: string) {
  return useQuery({
    queryKey: sessionKeys.detail(id),
    enabled: Boolean(id),
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<SessionDTO>>(`/sessions/${id}`)
      return res.data.data
    },
  })
}
