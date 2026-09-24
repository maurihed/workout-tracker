"use client"

import { useQuery } from "@tanstack/react-query"
import { api, type ApiEnvelope } from "@/lib/axios"
import type { OverviewDTO } from "@/server/services/progress.service"
import { progressKeys } from "./query-keys"

export function useAnalyticsOverview(weeks: number) {
  return useQuery({
    queryKey: progressKeys.overview(weeks),
    queryFn: async () =>
      (await api.get<ApiEnvelope<OverviewDTO>>("/analytics/overview", { params: { weeks } })).data
        .data,
  })
}
