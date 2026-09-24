"use client"

import { useQuery } from "@tanstack/react-query"
import { api, type ApiEnvelope } from "@/lib/axios"
import type { StatsDTO } from "@/server/services/stats.service"
import { gamificationKeys } from "./query-keys"

export function useStats() {
  return useQuery({
    queryKey: gamificationKeys.stats(),
    queryFn: async () => (await api.get<ApiEnvelope<StatsDTO>>("/stats")).data.data,
  })
}
