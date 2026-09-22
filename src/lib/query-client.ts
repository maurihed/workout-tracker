import { QueryClient } from "@tanstack/react-query"

import { notifyMutationError } from "@/lib/mutation-error"

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
      mutations: { onError: notifyMutationError },
    },
  })
}
