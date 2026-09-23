"use client"

import { useQuery } from "@tanstack/react-query"
import { api, type ApiEnvelope } from "@/lib/axios"
import { routineKeys } from "./query-keys"

export type RoutineSummary = {
  id: string
  name: string
  description: string | null
  source: "manual" | "ai" | "template"
  isActive: boolean
  updatedAt: Date
  dayCount: number
  exerciseCount: number
}

export function useRoutines() {
  return useQuery({
    queryKey: routineKeys.list(),
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<RoutineSummary[]>>("/routines")
      return res.data.data
    },
  })
}
