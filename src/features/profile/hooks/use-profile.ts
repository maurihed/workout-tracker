"use client"

import { useQuery } from "@tanstack/react-query"
import { api, type ApiEnvelope } from "@/lib/axios"
import type { ProfileDTO } from "@/features/profile/schemas/profile"

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<ProfileDTO>>("/profile")
      return res.data.data
    },
  })
}
