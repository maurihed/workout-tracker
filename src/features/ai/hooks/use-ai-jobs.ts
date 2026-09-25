"use client"

import { useQuery } from "@tanstack/react-query"
import { api, type ApiEnvelope } from "@/lib/axios"
import type { AiJobDTO } from "@/features/ai/schemas/job"
import { aiKeys } from "./query-keys"

const POLL_INTERVAL_MS = 2000

function isActive(status: AiJobDTO["status"] | undefined): boolean {
  return status === "queued" || status === "running"
}

export function useAiJobs() {
  return useQuery({
    queryKey: aiKeys.jobs(),
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<AiJobDTO[]>>("/ai/routines")
      return res.data.data
    },
  })
}

export function useAiJob(id: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: aiKeys.job(id),
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<AiJobDTO>>(`/ai/routines/${id}`)
      return res.data.data
    },
    enabled: options.enabled ?? id.length > 0,
    refetchInterval: (query) => (isActive(query.state.data?.status) ? POLL_INTERVAL_MS : false),
  })
}
