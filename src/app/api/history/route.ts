import { auth } from "@/lib/auth"
import { ok } from "@/lib/api-response"
import { toApiError, UnauthorizedError, ValidationError } from "@/lib/api-error"
import { historyQuerySchema } from "@/features/history/schemas/history"
import { listHistory } from "@/server/services/history.service"

export async function GET(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new UnauthorizedError()
    const url = new URL(request.url)
    const parsed = historyQuerySchema.safeParse(Object.fromEntries(url.searchParams))
    if (!parsed.success) throw new ValidationError("Invalid history query", parsed.error.flatten())
    return ok(await listHistory(session.user.id, parsed.data))
  } catch (error) {
    return toApiError(error)
  }
}
