"use client"

import { useMutation } from "@tanstack/react-query"
import { api } from "@/lib/axios"
import type { SessionStateInput } from "@/features/workouts/schemas/session"

export type UpdateSessionArgs = {
  input: SessionStateInput
  /**
   * Uses a raw `fetch` with `keepalive` so the final push survives the tab being
   * backgrounded or closed. The server response is a lean ack, not a full DTO.
   */
  keepalive?: boolean
}

/**
 * Pushes the runner state with a `PUT`. Intentionally does not invalidate on
 * success: the runner persists frequently via a debounced push, so refetching
 * on every write would fight the local authoritative store. The response body
 * is discarded by design (see `SessionStateAck`).
 */
export function useUpdateSession(id: string) {
  return useMutation({
    mutationFn: async ({ input, keepalive }: UpdateSessionArgs) => {
      if (keepalive) {
        const res = await fetch(`/api/sessions/${id}`, {
          method: "PUT",
          keepalive: true,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        })
        if (!res.ok) throw new Error(`Session update failed: ${res.status}`)
        return
      }
      await api.put(`/sessions/${id}`, input)
    },
  })
}
