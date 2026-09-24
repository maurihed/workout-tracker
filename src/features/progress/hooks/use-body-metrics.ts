"use client"

import { useQuery } from "@tanstack/react-query"
import { api, type ApiEnvelope } from "@/lib/axios"
import type { BodyMetricDTO } from "@/features/profile/schemas/body-metric"
import { progressKeys } from "./query-keys"

export type BodyMetricFilters = { from?: string; to?: string }

export function useBodyMetrics(filters: BodyMetricFilters = {}) {
  const key = JSON.stringify(filters)
  return useQuery({
    queryKey: progressKeys.bodyMetrics(key),
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<BodyMetricDTO[]>>("/body-metrics", { params: filters })
      return res.data.data
    },
  })
}
