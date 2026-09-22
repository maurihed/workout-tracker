import { isAxiosError } from "axios"
import { toast } from "sonner"

import type { ApiErrorBody } from "@/lib/axios"

export function notifyMutationError(error: unknown): void {
  const message = isAxiosError(error)
    ? (error.response?.data as ApiErrorBody | undefined)?.error?.message
    : error instanceof Error
      ? error.message
      : undefined

  toast.error(message ?? "Something went wrong")
}
