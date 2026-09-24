import { auth } from "@/lib/auth"
import { ok } from "@/lib/api-response"
import { toApiError, UnauthorizedError, ValidationError } from "@/lib/api-error"
import {
  bodyMetricQuerySchema,
  bodyMetricUpsertSchema,
} from "@/features/profile/schemas/body-metric"
import { listBodyMetrics, upsertBodyMetric } from "@/server/services/body-metric.service"

export async function GET(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new UnauthorizedError()
    const url = new URL(request.url)
    const parsed = bodyMetricQuerySchema.safeParse(Object.fromEntries(url.searchParams))
    if (!parsed.success) {
      throw new ValidationError("Invalid body metric query", parsed.error.flatten())
    }
    return ok(await listBodyMetrics(session.user.id, parsed.data))
  } catch (error) {
    return toApiError(error)
  }
}

export async function PUT(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new UnauthorizedError()
    const parsed = bodyMetricUpsertSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      throw new ValidationError("Invalid body metric", parsed.error.flatten())
    }
    return ok(await upsertBodyMetric(session.user.id, parsed.data))
  } catch (error) {
    return toApiError(error)
  }
}
