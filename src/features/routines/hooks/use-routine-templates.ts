"use client"

import { useQuery } from "@tanstack/react-query"
import { api, type ApiEnvelope } from "@/lib/axios"
import { routineKeys } from "./query-keys"

export type TemplateWithScore = {
  slug: string
  name: string
  nameEs: string
  description: string
  descriptionEs: string
  daysPerWeek: number
  score: number
  recommended: boolean
}

export function useRoutineTemplates() {
  return useQuery({
    queryKey: routineKeys.templates(),
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<{ templates: TemplateWithScore[] }>>(
        "/routine-templates",
      )
      return res.data.data.templates
    },
  })
}
