"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api, type ApiEnvelope } from "@/lib/axios"
import type {
  BodyMetricDTO,
  BodyMetricUpsertInput,
} from "@/features/profile/schemas/body-metric"
import { progressKeys } from "./query-keys"

export function useUpsertBodyMetric() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: BodyMetricUpsertInput) => {
      const res = await api.put<ApiEnvelope<BodyMetricDTO>>("/body-metrics", input)
      return res.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: progressKeys.all })
    },
  })
}
