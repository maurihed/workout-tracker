import { auth } from "@/lib/auth"
import { ok } from "@/lib/api-response"
import { toApiError, UnauthorizedError, ValidationError } from "@/lib/api-error"
import { analyticsQuerySchema } from "@/features/progress/schemas/analytics"
import { getOverview } from "@/server/services/progress.service"

export async function GET(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new UnauthorizedError()
    const url = new URL(request.url)
    const parsed = analyticsQuerySchema.safeParse(Object.fromEntries(url.searchParams))
    if (!parsed.success) throw new ValidationError("Invalid analytics query", parsed.error.flatten())
    return ok(await getOverview(session.user.id, parsed.data.weeks))
  } catch (error) {
    return toApiError(error)
  }
}
