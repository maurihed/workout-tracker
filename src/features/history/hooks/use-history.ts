"use client"
import { useInfiniteQuery } from "@tanstack/react-query"
import { api, type ApiEnvelope } from "@/lib/axios"
import type { HistoryItemDTO } from "@/server/services/history.service"
import { historyKeys } from "./query-keys"

export type HistoryFilters = { from?: string; to?: string; routineId?: string }

export function useHistory(filters: HistoryFilters) {
  const key = JSON.stringify(filters)
  return useInfiniteQuery({
    queryKey: historyKeys.list(key),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const res = await api.get<ApiEnvelope<{ items: HistoryItemDTO[]; nextCursor: string | null }>>("/history", {
        params: { ...filters, cursor: pageParam ?? undefined },
      })
      return res.data.data
    },
    getNextPageParam: (last) => last.nextCursor,
  })
}
